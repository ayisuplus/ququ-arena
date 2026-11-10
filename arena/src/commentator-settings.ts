import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { MODEL_SETTINGS_FILE } from './model-settings.ts';
import { writeFileAtomic } from './atomic-file.ts';
import { resolveContestant } from './models.ts';

export interface CommentatorProfile {
  id: string;
  name: string;
  kind: 'pi' | 'command';
  modelId: string;
  prompt: string;
  command: string;
  args: string[];
}
const defaults = (): CommentatorProfile[] => [
  { id: 'pi', name: 'Pi 解说', kind: 'pi', modelId: '', prompt: '', command: '', args: [] },
];
export function modelSelection(id: unknown): string {
  if (typeof id !== 'string' || !id.trim() || id.length > 300 || /[\s\0=]/.test(id))
    throw new Error('请选择一个已配置的 LLM');
  if (resolveContestant(id).kind !== 'pi') throw new Error('请选择 API 模型；本地 Agent 请使用 Agent 入口');
  return id;
}
function profile(body: Record<string, unknown>, id: string): CommentatorProfile {
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 60)
    throw new Error('请输入 1–60 字的名称');
  if (body.kind !== 'pi' && body.kind !== 'command') throw new Error('请选择 pi 或本地 Agent');
  if (id === 'pi' && body.kind !== 'pi') throw new Error('内置 Pi 的类型不能更改');
  if (typeof body.prompt !== 'string' || body.prompt.length > 12000) throw new Error('解说提示词不能超过 12000 字');
  const value: CommentatorProfile = {
    id,
    name: body.name.trim(),
    kind: body.kind,
    modelId: '',
    prompt: body.prompt,
    command: '',
    args: [],
  };
  if (body.kind === 'pi') value.modelId = modelSelection(body.modelId);
  else {
    if (typeof body.command !== 'string' || !path.isAbsolute(body.command) || /[\r\n\0]/.test(body.command))
      throw new Error('请填写 Agent 可执行程序的绝对路径');
    if (
      !Array.isArray(body.args) ||
      body.args.length > 64 ||
      body.args.some((a) => typeof a !== 'string' || a.length > 4096 || a.includes('\0'))
    )
      throw new Error('启动参数须为 JSON 字符串数组');
    value.command = body.command;
    value.args = body.args as string[];
  }
  return value;
}
export class CommentatorSettingsStore {
  private pending = Promise.resolve();
  readonly file: string;
  constructor(
    file = process.env.QUQU_COMMENTATOR_SETTINGS_FILE ??
      path.join(path.dirname(MODEL_SETTINGS_FILE), 'commentator-settings.json'),
  ) {
    this.file = file;
  }
  async read(): Promise<CommentatorProfile[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return defaults();
      throw e;
    }
    const data = JSON.parse(raw);
    if (
      data.version !== 1 ||
      !Array.isArray(data.profiles) ||
      !data.profiles.some((p: CommentatorProfile) => p.id === 'pi')
    )
      throw new Error('解说席配置损坏，请检查本机配置文件');
    return data.profiles;
  }
  update(body: Record<string, unknown>) {
    const work = this.pending.then(async () => {
      const profiles = await this.read();
      const id = typeof body.id === 'string' && body.id ? body.id : 'commentator:' + randomUUID();
      const index = profiles.findIndex((p) => p.id === id);
      if (body.id && index < 0) throw new Error('解说配置不存在');
      if (body.action === 'delete') {
        if (id === 'pi') throw new Error('内置 Pi 不能删除');
        if (index < 0) throw new Error('解说配置不存在');
        profiles.splice(index, 1);
      } else {
        const item = profile(body, id);
        if (index < 0) profiles.push(item);
        else profiles[index] = item;
      }
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFileAtomic(this.file, JSON.stringify({ version: 1, profiles }, null, 2) + '\n', { mode: 0o600 });
      return { profiles, selected: id };
    });
    this.pending = work.then(
      () => {},
      () => {},
    );
    return work;
  }
}
export const commentatorSettings = new CommentatorSettingsStore();
export async function requireCommentator(id: unknown, enabled: boolean) {
  if (typeof id !== 'string') throw new Error('请选择解说来源');
  if (id === 'codex' || id === 'claude') return;
  if (id.startsWith('llm:')) {
    modelSelection(id.slice(4));
    return;
  }
  const p = (await commentatorSettings.read()).find((p) => p.id === id);
  if (!p) throw new Error('解说配置不存在，请重新选择');
  if (enabled && p.kind === 'pi' && !p.modelId) throw new Error('请先为 Pi 解说选择模型并保存');
}
