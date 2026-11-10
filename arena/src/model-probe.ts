import { createHash } from 'node:crypto';
import { askModel, resolveContestant } from './models.ts';
import { openRouterKey, type ModelSettings } from './model-settings.ts';

export interface ModelProbe {
  state: 'ready' | 'rate_limited' | 'unauthorized' | 'timeout' | 'error';
  checkedAt: string;
  latencyMs: number;
  message: string;
}
// Scoped to the settings file and connection identity. Editing a connection invalidates its result.
const probes = new Map<string, ModelProbe>();
const pending = new Map<string, Promise<ModelProbe>>();
function identity(file: string, id: string, settings: ModelSettings) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        file,
        id,
        settings.custom.find((m) => m.id === id) ??
          (id.startsWith('openrouter:') ? openRouterKey(settings) : process.env),
      ]),
    )
    .digest('hex');
}
export function probeResult(file: string, id: string, settings: ModelSettings) {
  return probes.get(identity(file, id, settings));
}
export function probeModel(file: string, id: string, settings: ModelSettings, ask = askModel): Promise<ModelProbe> {
  if (typeof id !== 'string' || !/^[a-z][a-z0-9_-]*:[\w./:@~+-]+$/.test(id) || id.startsWith('mock:'))
    throw new Error('请选择真实模型');
  const key = identity(file, id, settings),
    previous = pending.get(key);
  if (previous) return previous;
  const job = (async () => {
    const started = Date.now();
    let state: ModelProbe['state'] = 'ready',
      message = '连接成功 · 已收到真实响应';
    try {
      const out = await ask(
        resolveContestant(id),
        { id: 'connection-check', condition: 'connection-check', input: 'Reply only OK.' },
        'exact',
        {
          modelSettings: settings,
          openRouterFreeOnly: id.startsWith('openrouter:'),
          maxTokens: 32,
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!out.text.trim()) {
        if (out.reasoning?.trim() || (out.usage?.output ?? 0) > 0)
          message = '连接成功 · 已返回推理或用量，检测上限内尚无最终答案';
        else throw new Error('空响应');
      }
    } catch (error) {
      const e = error as Error & { status?: number; statusCode?: number },
        code = e.status ?? e.statusCode;
      const text = e.message ?? '';
      state =
        code === 429 || /429|限流|额度/.test(text)
          ? 'rate_limited'
          : code === 401 || code === 403 || /401|403|api.?key|认证|密钥/i.test(text)
            ? 'unauthorized'
            : /timeout|timed out|超时/i.test(e.name + text)
              ? 'timeout'
              : 'error';
      // Provider bodies can contain credentials or URLs. Only safe, actionable classifications cross HTTP.
      message = {
        rate_limited: '限流或额度不足 · 稍后重试或更换渠道',
        unauthorized: '认证失败 · 请在本机检查 Key 和模型权限',
        timeout: '20 秒内未收到完整响应',
        error: '连接失败 · 接口、模型 ID 或响应异常',
      }[state];
    }
    const result = { state, checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, message };
    if (probes.size >= 1000) probes.delete(probes.keys().next().value!);
    probes.set(key, result);
    return result;
  })().finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
