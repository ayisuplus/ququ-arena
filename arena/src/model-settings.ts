/** 本机模型配置。密钥只由调用层读取；HTTP 使用 publicModelSettings。 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openRouterStatus } from './openrouter-limits.ts';
import { writeFileAtomic } from './atomic-file.ts';
import { modelLabels } from './model-labels.ts';

export const MODEL_SETTINGS_FILE =
  process.env.QUQU_MODEL_SETTINGS_FILE ?? fileURLToPath(new URL('../.local/model-settings.json', import.meta.url));
export interface CustomModel {
  id: string;
  name: string;
  modelId: string;
  baseUrl: string;
  apiKey: string;
  stream: boolean;
}
export interface CatalogModelSettings {
  name?: string;
  hidden?: boolean;
}
/** 名单来源开关：关掉的来源不再进入模型名单（配置本身保留，随时可开回来） */
export interface ModelSources {
  openrouter: boolean;
  builtin: boolean;
}
export const defaultModelSources = (): ModelSources => ({ openrouter: true, builtin: true });
export interface ModelSettings {
  version: 1;
  openrouter: { apiKey: string };
  custom: CustomModel[];
  catalog?: Record<string, CatalogModelSettings>;
  sources?: ModelSources;
}
export const emptyModelSettings = (): ModelSettings => ({
  version: 1,
  openrouter: { apiKey: '' },
  custom: [],
  catalog: {},
  sources: defaultModelSources(),
});

/** 按 id 查显示名：custom 优先，其次目录改名；都没有则回退 fallback */
export function modelDisplayName(settings: ModelSettings, id: string, fallback = ''): string {
  return settings.custom.find((m) => m.id === id)?.name || settings.catalog?.[id]?.name || fallback;
}

export async function readModelSettings(file = MODEL_SETTINGS_FILE): Promise<ModelSettings> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyModelSettings();
    throw e;
  }
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || typeof data.openrouter?.apiKey !== 'string' || !Array.isArray(data.custom))
      throw new Error();
    for (const m of data.custom)
      if (
        typeof m.id !== 'string' ||
        !m.id.startsWith('custom:') ||
        typeof m.apiKey !== 'string' ||
        typeof m.stream !== 'boolean' ||
        !m.name ||
        !m.modelId ||
        !m.baseUrl
      )
        throw new Error();
    if (
      data.catalog !== undefined &&
      (!data.catalog || typeof data.catalog !== 'object' || Array.isArray(data.catalog))
    )
      throw new Error();
    const catalog: Record<string, CatalogModelSettings> = {};
    for (const [id, value] of Object.entries(data.catalog ?? {})) {
      catalogId(id);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      const item = value as CatalogModelSettings;
      if (item.hidden !== undefined && typeof item.hidden !== 'boolean') throw new Error();
      catalog[id] = {
        ...(item.name !== undefined ? { name: catalogName(item.name) } : {}),
        ...(item.hidden !== undefined ? { hidden: item.hidden } : {}),
      };
    }
    data.catalog = catalog;
    if (
      data.sources !== undefined &&
      (!data.sources || typeof data.sources !== 'object' || Array.isArray(data.sources))
    )
      throw new Error();
    for (const key of ['openrouter', 'builtin'] as const)
      if (data.sources?.[key] !== undefined && typeof data.sources[key] !== 'boolean') throw new Error();
    data.sources = { ...defaultModelSources(), ...(data.sources ?? {}) };
    return data;
  } catch {
    throw new Error('本机模型配置格式无效，请检查 .local/model-settings.json');
  }
}

export function openRouterKey(settings: ModelSettings): string {
  return settings.openrouter.apiKey || process.env.OPENROUTER_API_KEY || '';
}

export function publicModelSettings(settings: ModelSettings) {
  return {
    openrouter: {
      configured: Boolean(openRouterKey(settings)),
      hasSavedKey: Boolean(settings.openrouter.apiKey),
      source: settings.openrouter.apiKey ? 'local' : process.env.OPENROUTER_API_KEY ? 'environment' : 'none',
      availability: openRouterStatus(openRouterKey(settings)),
    },
    custom: settings.custom.map(({ apiKey, ...m }) => ({
      ...m,
      ...modelLabels(m.modelId, undefined, m.baseUrl),
      hasApiKey: Boolean(apiKey),
    })),
    catalog: Object.fromEntries(
      Object.entries(settings.catalog ?? {}).map(([id, m]) => [
        id,
        { ...(m.name !== undefined ? { name: m.name } : {}), ...(m.hidden !== undefined ? { hidden: m.hidden } : {}) },
      ]),
    ),
    sources: settings.sources ?? defaultModelSources(),
  };
}

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\r\n\0]/.test(value))
    throw new Error(`${label}不能为空，且不能超过 ${max} 个字符`);
  return value.trim();
}
function catalogId(value: unknown): string {
  const id = requiredText(value, '模型 ID', 300);
  if (!/^[a-z][a-z0-9_-]*:[\w./:@~+-]+$/.test(id) || /^(custom|mock):/.test(id))
    throw new Error('只能管理目录中的 provider:model-id 模型');
  return id;
}
function catalogName(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length > 80 || /[\x00-\x1f\x7f,=]/.test(value))
    throw new Error('显示名称不能超过 80 个字符，且不能包含控制字符、英文逗号或等号');
  return value.trim() || undefined;
}
function keyValue(body: Record<string, unknown>, previous = ''): string {
  if (body.clearApiKey === true) return '';
  if (body.apiKey === undefined || body.apiKey === '') return previous;
  const key = requiredText(body.apiKey, 'API Key', 8192);
  if (/[^\x21-\x7e]/.test(key)) throw new Error('API Key 不能包含空格或非英文字符');
  return key;
}

/** 单个服务内串行修改，临时文件替换避免半份 JSON；不改用户环境变量。 */
export class ModelSettingsStore {
  readonly file: string;
  private pending = Promise.resolve();
  constructor(file = MODEL_SETTINGS_FILE) {
    this.file = file;
  }
  read() {
    return readModelSettings(this.file);
  }
  private change(edit: (settings: ModelSettings) => void): Promise<ModelSettings> {
    const work = this.pending.then(async () => {
      const settings = await this.read();
      edit(settings);
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFileAtomic(this.file, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
      return settings;
    });
    this.pending = work.then(
      () => {},
      () => {},
    );
    return work;
  }
  saveOpenRouter(body: Record<string, unknown>) {
    return this.change((s) => {
      s.openrouter.apiKey = keyValue(body, s.openrouter.apiKey);
    });
  }
  saveCatalog(body: Record<string, unknown>) {
    return this.change((s) => {
      const id = catalogId(body.id);
      const name = body.name === undefined ? undefined : catalogName(body.name);
      if (body.hidden !== undefined && typeof body.hidden !== 'boolean') throw new Error('隐藏选项必须为布尔值');
      const catalog = (s.catalog ??= {});
      const item = { ...catalog[id] };
      if (body.name !== undefined) {
        if (name) item.name = name;
        else delete item.name;
      }
      if (body.hidden !== undefined) {
        if (body.hidden) item.hidden = true;
        else delete item.hidden;
      }
      if (Object.keys(item).length) catalog[id] = item;
      else delete catalog[id];
    });
  }
  saveSources(body: Record<string, unknown>) {
    return this.change((s) => {
      const sources = (s.sources ??= defaultModelSources());
      for (const key of ['openrouter', 'builtin'] as const) {
        const value = body[key];
        if (value === undefined) continue;
        if (typeof value !== 'boolean') throw new Error('名单来源开关必须为布尔值');
        sources[key] = value;
      }
    });
  }
  saveCustom(body: Record<string, unknown>, id?: string) {
    return this.change((s) => {
      const previous = id ? s.custom.find((m) => m.id === id) : undefined;
      if (id && !previous) throw new Error('该自定义模型已删除，请刷新列表');
      const name = requiredText(body.name, '显示名称', 80);
      if (/[,=]/.test(name)) throw new Error('显示名称不能包含英文逗号或等号');
      const modelId = requiredText(body.modelId, '模型 ID', 200);
      if (/[\s,=]/.test(modelId)) throw new Error('模型 ID 不能包含空格、英文逗号或等号');
      let url: URL;
      try {
        url = new URL(requiredText(body.baseUrl, '接口地址', 2000));
      } catch {
        throw new Error('请填写完整的 http:// 或 https:// 接口地址');
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        throw new Error('接口地址只支持 HTTP/HTTPS，密钥请填写在 API Key 中');
      const baseUrl = url.href.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
      if (body.stream !== undefined && typeof body.stream !== 'boolean') throw new Error('流式输出选项无效');
      const model: CustomModel = {
        id: previous?.id ?? `custom:${randomUUID()}`,
        name,
        modelId,
        baseUrl,
        apiKey: keyValue(body, previous?.apiKey),
        stream: body.stream !== false,
      };
      if (previous) s.custom[s.custom.indexOf(previous)] = model;
      else s.custom.push(model);
    });
  }
  deleteCustom(id: string) {
    return this.change((s) => {
      const index = s.custom.findIndex((m) => m.id === id);
      if (index < 0) throw new Error('该自定义模型已删除，请刷新列表');
      s.custom.splice(index, 1);
    });
  }
}
