import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateArena, playableTasks } from './arena-loader.ts';
import { readArenaFiles, replaceArenaFiles, type ArenaFiles } from './arena-files.ts';
import { packArena } from './pack.ts';
import type { ArenaDef, ArenaTask, JudgeSpec } from './types.ts';

export class QuestionBankError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, field: string, required = false) => {
  if (typeof x !== 'string' || x.length > 100_000 || (required && !x.trim()))
    throw new QuestionBankError(`${field}${required ? '不能为空，且' : ''}必须是文本（最多 10 万字）`);
};

function checkRule(value: unknown, where: string, depth = 0): asserts value is JudgeSpec {
  if (!object(value) || depth > 12) throw new QuestionBankError(`${where}评分规则无效或嵌套过深`);
  switch (value.kind) {
    case 'rubric':
      break; // Dimension validation is shared with the loader.
    case 'exact':
      break; // The loader validates options and alternative answers.
    case 'contains':
      if (!Array.isArray(value.keywords) || !value.keywords.length) throw new QuestionBankError(`${where}需要关键词`);
      for (const keyword of value.keywords) text(keyword, `${where}关键词`, true);
      break;
    case 'regex':
      text(value.pattern, `${where}表达式`, true);
      try {
        new RegExp(value.pattern as string, 'm');
      } catch {
        throw new QuestionBankError(`${where}表达式格式不正确`);
      }
      break;
    case 'llm':
      text(value.rubric, `${where}评分标准`, true);
      if (
        value.scale !== undefined &&
        (typeof value.scale !== 'number' || !Number.isFinite(value.scale) || value.scale <= 0 || value.scale > 1000)
      )
        throw new QuestionBankError(`${where}满分必须大于 0 且不超过 1000`);
      break;
    case 'all':
    case 'any':
      if (!Array.isArray(value.judges) || !value.judges.length) throw new QuestionBankError(`${where}组合规则不能为空`);
      value.judges.forEach((j) => checkRule(j, where, depth + 1));
      break;
    case 'not':
      checkRule(value.judge, where, depth + 1);
      break;
    default:
      throw new QuestionBankError(`${where}评分方式不支持`);
  }
}

export function validateQuestionBank(def: unknown, tasks: unknown): asserts tasks is ArenaTask[] {
  if (!object(def) || !Array.isArray(tasks) || tasks.length > 2000)
    throw new QuestionBankError('题库格式无效，每库最多 2000 道题');
  text(def.title, '题库名称', true);
  text(def.description, '题库说明');
  for (const field of ['author', 'version', 'taskPrefix', 'canary'])
    if (def[field] !== undefined) text(def[field], field);
  for (const field of ['conditions', 'conditionPrefix'])
    if (def[field] !== undefined) {
      if (!object(def[field])) throw new QuestionBankError(`${field}必须是分组到文本的映射`);
      for (const value of Object.values(def[field])) text(value, '分组说明');
    }
  checkRule(def.judge, '题库默认');
  const inputs = new Map<string, string>();
  for (const task of tasks) {
    if (!object(task)) throw new QuestionBankError('题目格式无效');
    const where = `题目 ${task.id ?? ''}：`;
    text(task.id, '题号', true);
    text(task.condition, `${where}分组`, true);
    text(task.input, `${where}题目内容`, true);
    if (task.target !== undefined) text(task.target, `${where}参考答案`, true);
    if (task.meta !== undefined && !object(task.meta)) throw new QuestionBankError(`${where}附加信息格式无效`);
    if (task.judge !== undefined) checkRule(task.judge, where);
    const input =
      `${def.taskPrefix ?? ''}${(def.conditionPrefix as Record<string, string> | undefined)?.[task.condition as string] ?? ''}${task.input}`.trim();
    if (inputs.has(input)) throw new QuestionBankError(`${where}题面与 ${inputs.get(input)} 完全重复，请修改后保存`);
    inputs.set(input, task.id as string);
  }
  try {
    validateArena(def as unknown as ArenaDef, tasks as ArenaTask[]);
  } catch (e) {
    throw new QuestionBankError(e instanceof Error ? e.message : '题库校验失败');
  }
}

const revisionOf = (files: ArenaFiles) => createHash('sha256').update(JSON.stringify(files)).digest('hex');
function documentOf(files: ArenaFiles) {
  const def = JSON.parse(files.definition) as ArenaDef;
  const tasks = files.questions
    .split(/\r?\n/)
    .filter((s) => s.trim())
    .map((s) => JSON.parse(s) as ArenaTask);
  validateArena(def, tasks);
  return { def, tasks, revision: revisionOf(files), playable: playableTasks(def, tasks).length };
}

/** Editor persistence is independent of battle results and model credentials. */
export class QuestionBankStore {
  root: string;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(root: string) {
    this.root = path.resolve(root);
  }
  private directory(name: string) {
    if (!/^[a-z0-9][a-z0-9_-]{0,100}$/i.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name))
      throw new QuestionBankError('题库标识无效');
    return path.join(this.root, name);
  }
  private async existing(name: string) {
    const dir = this.directory(name);
    for (const file of [dir, path.join(dir, 'arena.json'), path.join(dir, 'tasks.jsonl')]) {
      const info = await lstat(file).catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') throw new QuestionBankError('找不到这个题库', 404);
        throw e;
      });
      if (info.isSymbolicLink()) throw new QuestionBankError('不支持在编辑器中修改链接指向的题库');
    }
    return dir;
  }
  async read(name: string) {
    return documentOf(await readArenaFiles(await this.existing(name)));
  }
  save(body: unknown, name?: string) {
    const work = this.pending.then(async () => {
      if (!object(body) || !object(body.def)) throw new QuestionBankError('题库内容必须是有效 JSON');
      const id = name ?? `custom-${randomUUID()}`;
      if (name && body.def.name !== name) throw new QuestionBankError('题库标识不能修改');
      const def = { ...body.def, name: id } as unknown as ArenaDef;
      const tasks = body.tasks;
      validateQuestionBank(def, tasks);
      const files = {
        definition: JSON.stringify(def, null, 2) + '\n',
        questions: tasks.map((t) => JSON.stringify(t)).join('\n') + '\n',
      };
      const dir = this.directory(id);
      if (name) {
        await this.existing(name);
        const previous = await readArenaFiles(dir);
        if (typeof body.revision !== 'string' || revisionOf(previous) !== body.revision)
          throw new QuestionBankError('题库已被修改。你的草稿仍在，请重新加载最新版本后再编辑。', 409);
        // A portable full backup allows recovery of removed questions and old rules.
        const backupDir = path.join(this.root, '.editor-backups', id);
        await mkdir(backupDir, { recursive: true });
        const old = documentOf(previous);
        await writeFile(
          path.join(backupDir, `${Date.now()}-${randomUUID()}.ququ.json`),
          JSON.stringify(packArena(old.def, old.tasks), null, 2),
          'utf8',
        );
        try {
          await replaceArenaFiles(dir, previous, files);
        } catch (e) {
          if (e instanceof Error && /另一个窗口|其他窗口/.test(e.message)) throw new QuestionBankError(e.message, 409);
          throw e;
        }
      } else {
        await mkdir(this.root, { recursive: true });
        const staging = path.join(this.root, `.new-${randomUUID()}`);
        await mkdir(staging);
        try {
          await writeFile(path.join(staging, 'arena.json'), files.definition, 'utf8');
          await writeFile(path.join(staging, 'tasks.jsonl'), files.questions, 'utf8');
          await rename(staging, dir);
        } finally {
          await rm(staging, { recursive: true, force: true });
        }
      }
      return documentOf(files);
    });
    this.pending = work.catch(() => {});
    return work;
  }
}
