/** OpenRouter 的实时公开目录；只列能固定身份参加文本比赛的免费模型。 */
export interface FreeModel {
  id: string;
  name: string;
  modelId: string;
  contextLength: number;
  reasoning: boolean;
  inputModalities: string[];
  description: string;
  pricing: Record<string, string | number>;
}
export interface FreeCatalog {
  models: FreeModel[];
  updatedAt: string | null;
  stale: boolean;
  error?: string;
}
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
export const CATALOG_TTL_MS = 5 * 60_000;
const zero = (value: unknown) =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
  Number.isFinite(Number(value)) &&
  Number(value) === 0;

export function parseFreeModels(payload: unknown): FreeModel[] {
  if (!payload || !Array.isArray((payload as { data?: unknown }).data)) throw new Error('OpenRouter 模型目录格式无效');
  const models = new Map<string, FreeModel>();
  for (const m of (payload as { data: any[] }).data) {
    if (!m || typeof m.id !== 'string' || !/^[\w./:@~-]+$/.test(m.id) || m.id.startsWith('openrouter/')) continue;
    if (
      !m.architecture?.input_modalities?.includes('text') ||
      m.architecture?.output_modalities?.length !== 1 ||
      m.architecture.output_modalities[0] !== 'text'
    )
      continue;
    // 缺失计价不能当作免费；排除按请求/推理/其它项目收费的模型。
    if (!m.pricing || !zero(m.pricing.prompt) || !zero(m.pricing.completion) || !Object.values(m.pricing).every(zero))
      continue;
    models.set(m.id, {
      id: `openrouter:${m.id}`,
      modelId: m.id,
      name: typeof m.name === 'string' ? m.name : m.id,
      contextLength: Number.isFinite(m.context_length) ? m.context_length : 0,
      reasoning:
        Array.isArray(m.supported_parameters) &&
        m.supported_parameters.some((p: string) => ['reasoning', 'include_reasoning'].includes(p)),
      inputModalities: m.architecture.input_modalities.filter((v: unknown) => typeof v === 'string'),
      description: typeof m.description === 'string' ? m.description.slice(0, 1200) : '',
      pricing: m.pricing,
    });
  }
  return [...models.values()];
}

export class OpenRouterCatalog {
  private snapshot: FreeCatalog = { models: [], updatedAt: null, stale: true };
  private lastAttempt = 0;
  private loading?: Promise<FreeCatalog>;
  async get(refresh = false): Promise<FreeCatalog> {
    if (this.loading) return this.loading;
    const age = this.snapshot.updatedAt ? Date.now() - Date.parse(this.snapshot.updatedAt) : Infinity;
    if (
      !refresh &&
      ((!this.snapshot.stale && age < CATALOG_TTL_MS) ||
        (this.snapshot.stale && Date.now() - this.lastAttempt < 30_000))
    )
      return this.snapshot;
    this.lastAttempt = Date.now();
    this.loading = (async () => {
      try {
        const response = await fetch(OPENROUTER_MODELS_URL, {
          signal: AbortSignal.timeout(15_000),
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`OpenRouter 目录 HTTP ${response.status}`);
        this.snapshot = {
          models: parseFreeModels(await response.json()),
          updatedAt: new Date(Date.now()).toISOString(),
          stale: false,
        };
      } catch (e) {
        this.snapshot = { ...this.snapshot, stale: true, error: e instanceof Error ? e.message : '目录更新失败' };
      }
      return this.snapshot;
    })();
    try {
      return await this.loading;
    } finally {
      this.loading = undefined;
    }
  }
  async requireFree(modelId: string) {
    const catalog = await this.get();
    if (catalog.stale) throw new Error('免费目录暂时无法核验，请刷新目录后重试');
    const model = catalog.models.find((m) => m.modelId === modelId);
    if (!model) throw new Error(`模型 ${modelId} 已不在当前免费文本模型目录中，请重新选择阵容`);
    return model;
  }
}
export const openRouterCatalog = new OpenRouterCatalog();
