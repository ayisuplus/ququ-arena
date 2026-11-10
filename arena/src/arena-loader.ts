/**
 * 蛐蛐罐加载与校验
 * 一个蛐蛐罐 = 一个目录：arena.json + tasks.jsonl
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ArenaDef, ArenaTask, JudgeSpec } from './types.ts';
import { normalize } from './judge.ts';
import { readArenaFiles } from './arena-files.ts';
import { validateRubric, validateTaskMode, MODE_LABELS } from './task-mode.ts';

const JUDGE_KINDS = ['exact', 'contains', 'regex', 'llm', 'rubric', 'all', 'any', 'not'];

/** 递归收集组合裁判里的所有叶裁判（all/any/not 展开） */
function leafJudges(spec: JudgeSpec): JudgeSpec[] {
  if (spec.kind === 'all' || spec.kind === 'any') return spec.judges.flatMap(leafJudges);
  if (spec.kind === 'not') return leafJudges(spec.judge);
  return [spec];
}

/** 该评分规则是否（递归地）需要 target 参考答案 */
export function judgeNeedsTarget(spec: JudgeSpec): boolean {
  return leafJudges(spec).some((j) => j.kind === 'exact' || j.kind === 'llm');
}

function validateJudge(j: unknown, where: string): JudgeSpec {
  const spec = j as JudgeSpec;
  if (!spec || !JUDGE_KINDS.includes(spec.kind)) {
    throw new Error(`${where}: 未知评分方式 ${JSON.stringify(j)}，支持 ${JUDGE_KINDS.join('/')}`);
  }
  if (spec.kind === 'contains' && (!Array.isArray(spec.keywords) || spec.keywords.length === 0)) {
    throw new Error(`${where}: contains 裁判需要非空 keywords`);
  }
  if (spec.kind === 'regex' && !spec.pattern) throw new Error(`${where}: regex 裁判需要 pattern`);
  if (spec.kind === 'exact') {
    for (const key of ['trimPunct', 'ignoreCase', 'lenient'] as const) {
      if (spec[key] !== undefined && typeof spec[key] !== 'boolean') throw new Error(`${where}: ${key} 必须是布尔值`);
    }
    if (
      spec.alternatives !== undefined &&
      (!Array.isArray(spec.alternatives) || spec.alternatives.some((s) => typeof s !== 'string' || !s.trim()))
    ) {
      throw new Error(`${where}: alternatives 必须是非空答案字符串的数组`);
    }
  }
  if (spec.kind === 'llm' && !spec.rubric) throw new Error(`${where}: llm 裁判需要 rubric`);
  if (spec.kind === 'rubric') validateRubric(spec.dimensions, where);
  if ((spec.kind === 'all' || spec.kind === 'any') && (!Array.isArray(spec.judges) || spec.judges.length === 0)) {
    throw new Error(`${where}: ${spec.kind} 组合裁判需要非空 judges`);
  }
  if (spec.kind === 'not' && !spec.judge) throw new Error(`${where}: not 组合裁判需要 judge`);
  // 组合裁判递归校验子规则
  for (const leaf of spec.kind === 'not'
    ? [spec.judge]
    : spec.kind === 'all' || spec.kind === 'any'
      ? spec.judges
      : []) {
    validateJudge(leaf, where);
  }
  return spec;
}

export function validateArena(def: ArenaDef, tasks: ArenaTask[]): void {
  if (!Object.hasOwn(MODE_LABELS, def.mode ?? 'qa')) throw new Error('未知题库赛制');
  if (!def.name || !def.title) throw new Error('arena.json 缺少 name/title');
  validateJudge(def.judge, `arena ${def.name}`);
  const validateModeJudge = (spec: JudgeSpec) => {
    if (def.mode && def.mode !== 'qa' && spec.kind !== 'rubric') throw new Error('新赛道必须使用多维评分标准');
    if ((!def.mode || def.mode === 'qa') && leafJudges(spec).some((j) => j.kind === 'rubric'))
      throw new Error('多维评分需要选择开放评审或多轮任务赛道');
  };
  validateModeJudge(def.judge);
  if (tasks.length === 0) throw new Error(`蛐蛐罐 ${def.name} 是空的（tasks.jsonl 无题目）`);
  const ids = new Set<string>();
  for (const t of tasks) {
    if (typeof t.id !== 'string' || typeof t.input !== 'string' || typeof t.condition !== 'string')
      throw new Error(`题目 id/input/condition 必须是字符串: ${JSON.stringify(t).slice(0, 80)}`);
    if (!t.id || !t.input || !t.condition) throw new Error(`题目缺少 id/input/condition: ${JSON.stringify(t)}`);
    if (t.target !== undefined && typeof t.target !== 'string')
      throw new Error(`task ${t.id}: target 必须是字符串（收到 ${typeof t.target}——数字请写 "42" 字符串形态）`);
    if (ids.has(t.id)) throw new Error(`题目 id 重复: ${t.id}`);
    ids.add(t.id);
    if (t.judge) validateJudge(t.judge, `task ${t.id}`);
    const spec = t.judge ?? def.judge;
    validateModeJudge(spec);
    validateTaskMode(def.mode ?? 'qa', t, spec);
    if (judgeNeedsTarget(spec) && !t.target) {
      throw new Error(`task ${t.id}: 该裁判规则（含组合内的 exact/llm 叶）需要 target 参考答案`);
    }
  }
  if (def.review !== undefined) {
    const review = def.review;
    if (!review || typeof review !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(review.date))
      throw new Error('review 缺少有效审查日期');
    for (const key of ['note', 'blockedReason'] as const) {
      if (review[key] !== undefined && (typeof review[key] !== 'string' || !review[key]!.trim()))
        throw new Error(`review.${key} 必须是非空字符串`);
    }
    if (review.excluded !== undefined) {
      if (!review.excluded || typeof review.excluded !== 'object' || Array.isArray(review.excluded))
        throw new Error('review.excluded 必须是题号到原因的映射');
      for (const [id, reason] of Object.entries(review.excluded)) {
        if (!ids.has(id) || typeof reason !== 'string' || !reason.trim())
          throw new Error(`review.excluded 无效题号或原因：${id}`);
      }
    }
  }
}

/** 所有新比赛共用的题目入口；先过滤，再应用比赛题数限制。 */
export function playableTasks(def: ArenaDef, tasks: ArenaTask[]): ArenaTask[] {
  if (def.review?.blockedReason) return [];
  return tasks.filter((task) => !Object.hasOwn(def.review?.excluded ?? {}, task.id));
}

export function requirePlayableTasks(def: ArenaDef, tasks: ArenaTask[]): ArenaTask[] {
  const available = playableTasks(def, tasks);
  if (!available.length)
    throw new Error(`题库「${def.title}」暂停对战：${def.review?.blockedReason ?? '没有可用题目，等待修订'}`);
  return available;
}

export async function loadArena(dir: string): Promise<{ def: ArenaDef; tasks: ArenaTask[] }> {
  const files = await readArenaFiles(dir);
  let def: ArenaDef;
  try {
    def = JSON.parse(files.definition) as ArenaDef;
  } catch (e) {
    throw new Error(`${path.join(dir, 'arena.json')} 不是合法 JSON：${e instanceof Error ? e.message : e}`); // 批量体检时必须含路径才能定位是哪个罐
  }
  const raw = files.questions;
  const tasks: ArenaTask[] = raw
    .split(/\r?\n/)
    .map((l, i) => ({ line: l.trim(), row: i + 1 })) // 先记原始行号再过滤——空行不得顶歪报错行号（审查实证）
    .filter((x) => x.line)
    .map((x) => {
      try {
        return JSON.parse(x.line) as ArenaTask;
      } catch {
        throw new Error(`tasks.jsonl 第 ${x.row} 行不是合法 JSON`);
      }
    });
  validateArena(def, tasks);
  return { def, tasks };
}

/** 罐体检报告：validate 命令用；errors 阻断开赛，warnings 仅提示 */
export interface ArenaLint {
  errors: string[];
  warnings: string[];
}

/** 字符 bigram Jaccard 相似度（罐体检近重复 / 污染自检续写比对共用） */
export function bigramJaccard(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s: string) => {
    const g: Record<string, true> = {};
    for (let i = 0; i < s.length - 1; i++) g[s.slice(i, i + 2)] = true;
    return Object.keys(g);
  };
  const ga = new Set(grams(a));
  const gb = grams(b);
  let inter = 0;
  for (const g of gb) if (ga.has(g)) inter++;
  return inter / (ga.size + gb.length - inter);
}

/**
 * 罐体检：schema 之外的科学性问题——
 * 重复题（污染区分度）、答案泄漏在题面（白送分）、维度字典缺漏、
 * canary 缺失（下游无法过滤训练语料）。离线可检的全部在这里。
 */
export function lintArena(def: ArenaDef, tasks: ArenaTask[]): ArenaLint {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    validateArena(def, tasks);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  // 题面重复 / 近重复（O(n²)，罐规模 ≤ 几千题时无感）
  // 同 meta.family 的对子跳过：family 是出题人显式声明的受控变体（如 tg 三连：同卡片三个时间环境），
  // 换皮检测的目标是"意外重复"，已声明的变体不是意外。
  const normed = tasks.map((t) => normalize(t.input));
  const famOf = (t: ArenaTask) => (typeof t.meta?.family === 'string' ? t.meta.family : null);
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      if (normed[i] === normed[j]) {
        // 完全重复永远报错——同族也不例外（family 只豁免"近似"，不豁免"相同"）
        errors.push(`题面完全重复：${tasks[i]!.id} ≡ ${tasks[j]!.id}`);
      } else if (famOf(tasks[i]!) && famOf(tasks[i]!) === famOf(tasks[j]!)) {
        continue; // 同 meta.family 的受控变体（如 tg 三连）不算换皮
      } else if (bigramJaccard(normed[i]!, normed[j]!) >= 0.8) {
        warnings.push(`题面高度相似（Jaccard≥0.8）：${tasks[i]!.id} ≈ ${tasks[j]!.id}，请确认不是换皮题`);
      }
    }
  }

  for (const t of tasks) {
    const spec = t.judge ?? def.judge;
    const leaves = leafJudges(spec);
    // 答案泄漏：exact 叶（题面含 target）或 contains 叶（题面列全关键词即白送分）都查；前缀通道（taskPrefix/conditionPrefix 会拼进模型所见题面）一并扫；
    // meta.answerInPrompt=true 豁免：选择型题面设计上答案必在题面；大小写不敏感比对（小写提示诱导大写答案也算泄漏）
    {
      const fullPrompt = `${def.taskPrefix ?? ''}${def.conditionPrefix?.[t.condition] ?? ''}${t.input}`.toLowerCase();
      if (t.meta?.answerInPrompt !== true) {
        if (
          leaves.some((l) => l.kind === 'exact') &&
          t.target &&
          normalize(t.target).length >= 4 &&
          fullPrompt.includes(normalize(t.target).toLowerCase())
        ) {
          warnings.push(`答案泄漏：${t.id} 的题面（含前缀）包含参考答案「${t.target.slice(0, 20)}」，等于白送分`);
        }
        for (const leaf of leaves) {
          if (leaf.kind === 'contains') {
            const leaked = leaf.keywords.filter(
              (k) => normalize(k).length >= 4 && fullPrompt.includes(normalize(k).toLowerCase()),
            );
            if (leaked.length)
              warnings.push(
                `关键词泄漏：${t.id} 的题面（含前缀）直接列出 contains 关键词「${leaked[0]!.slice(0, 20)}」——照抄即得分`,
              );
          }
        }
      }
    }
    // 维度字典覆盖
    if (def.conditions && !(t.condition in def.conditions)) {
      warnings.push(`维度未登记：${t.id} 的 condition "${t.condition}" 不在 arena.json 的 conditions 字典里`);
    }
    // regex 可编译性（组合裁判的 regex 叶一并检查）
    for (const leaf of leaves) {
      if (leaf.kind === 'regex') {
        try {
          new RegExp(leaf.pattern);
        } catch {
          errors.push(`regex 无法编译：${t.id} 的 pattern "${leaf.pattern}"`);
        }
      }
    }
  }

  if (!def.canary) {
    warnings.push('缺少 canary 污染标记：科研级题库建议带 canary（invent 命令会自动生成）');
  }
  // canary 格式与未识别顶层键：schema 的装饰条款里最值得运行的两条（完整 JSON-Schema 不引依赖）
  if (def.canary && !def.canary.startsWith('ququ-arena:')) {
    warnings.push(`canary 格式不符（须 ^ququ-arena:）：${def.canary}——下游污染过滤按此前缀匹配`);
  }
  const KNOWN_KEYS = new Set([
    'mode',
    '$schema',
    'name',
    'title',
    'description',
    'author',
    'version',
    'canary',
    'judge',
    'taskPrefix',
    'conditionPrefix',
    'conditions',
    'review',
  ]);
  for (const k of Object.keys(def)) {
    if (!KNOWN_KEYS.has(k)) warnings.push(`arena.json 未识别顶层键 "${k}"（拼写错误会静默吞掉配置——如 conditons）`);
  }
  // 已评审的豁免滥用面（family 全罐共用 / answerInPrompt 全罐声明）：比例阈值无法区分「模板族受控变体」与「豁免滥用」，
  // 本仓 11 个模板族罐实测全部触发——不设比例警告，出题纪律见各罐 description 声明。
  return { errors, warnings };
}

/** 扫描 arenas 根目录下的所有蛐蛐罐（tasks 一并返回：指纹/体检都要用） */
export async function listArenas(root: string): Promise<{ def: ArenaDef; dir: string; tasks: ArenaTask[] }[]> {
  const out: { def: ArenaDef; dir: string; tasks: ArenaTask[] }[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.startsWith('.')) continue; // Editor staging and backup directories are not live banks.
    const dir = path.join(root, e);
    try {
      const { def, tasks } = await loadArena(dir);
      out.push({ def, dir, tasks });
    } catch {
      /* 不是蛐蛐罐目录，跳过 */
    }
  }
  return out;
}
