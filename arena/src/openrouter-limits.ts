import { createHash } from 'node:crypto';

export class OpenRouterRequestError extends Error {
  readonly status: number;
  readonly scope: 'daily' | 'minute' | 'provider' | 'other';
  readonly retryAfterMs?: number;
  readonly resetAt?: number;
  readonly limit?: number;
  readonly remaining?: number;
  readonly retryable: boolean;
  constructor(status: number, payload: any, headers = new Headers(), key = '', now = Date.now()) {
    const error = payload?.error ?? payload;
    const clean = (text: unknown) =>
      String(text ?? '')
        .replaceAll(key || '\0', '[API Key]')
        .slice(0, 500);
    const raw = clean(typeof error === 'string' ? error : error?.message || `HTTP ${status}`);
    const nested = new Headers();
    for (const [name, value] of Object.entries(error?.metadata?.headers ?? {}))
      if (typeof value === 'string' || typeof value === 'number') {
        try {
          nested.set(name, String(value));
        } catch {}
      }
    const header = (name: string) => headers.get(name) ?? nested.get(name);
    const numeric = (value: string | null) =>
      value !== null && value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
        ? Number(value)
        : undefined;
    const stamp = numeric(header('x-ratelimit-reset'));
    const resetAt = stamp !== undefined ? (stamp < 1e12 ? stamp * 1000 : stamp) : undefined;
    const retry = header('retry-after'),
      seconds = numeric(retry);
    const retryAfterMs =
      retry === null
        ? undefined
        : seconds !== undefined
          ? seconds * 1000
          : Number.isFinite(Date.parse(retry))
            ? Math.max(0, Date.parse(retry) - now)
            : undefined;
    const scope =
      status !== 429
        ? 'other'
        : /free-models-per-day/i.test(raw)
          ? 'daily'
          : /free-models-per-min/i.test(raw)
            ? 'minute'
            : 'provider';
    const limit = numeric(header('x-ratelimit-limit')),
      remaining = numeric(header('x-ratelimit-remaining'));
    const reset =
      resetAt !== undefined
        ? ` 重置时间：${new Date(resetAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）。`
        : '';
    const quota = limit !== undefined && remaining !== undefined ? `（剩余 ${remaining} / ${limit} 次）` : '';
    super(
      scope === 'daily'
        ? `OpenRouter 每日免费额度已用完${quota}。${reset} 免费模型共用账号额度，换模型不会恢复。请等待重置或使用已配置的其他接口。`
        : scope === 'minute'
          ? `OpenRouter 免费请求过于频繁${quota}。${reset} 将按服务端要求等待后重试。`
          : `OpenRouter HTTP ${status}：${raw}`,
    );
    this.name = 'OpenRouterRequestError';
    this.status = status;
    this.scope = scope;
    this.resetAt = resetAt;
    this.limit = limit;
    this.remaining = remaining;
    this.retryAfterMs =
      retryAfterMs ?? (scope === 'minute' ? (resetAt !== undefined ? Math.max(0, resetAt - now) : 60_000) : undefined);
    this.retryable = scope !== 'daily' && (status === 429 || status >= 500);
  }
}

export interface OpenRouterStatus {
  state: 'untested' | 'available' | 'limited' | 'error';
  message: string;
  blocked: boolean;
  checkedAt?: string;
  scope?: OpenRouterRequestError['scope'];
  resetAt?: number;
  limit?: number;
  remaining?: number;
}
// Credentials never enter public status or error text; cooldowns are shared by all free models on that key.
const states = new Map<string, { status: OpenRouterStatus; expiresAt?: number }>();
const identity = (key: string) => createHash('sha256').update(key).digest('hex');
export function openRouterStatus(key: string, now = Date.now()): OpenRouterStatus {
  const id = identity(key),
    entry = states.get(id);
  if (entry?.expiresAt !== undefined && entry.expiresAt <= now) states.delete(id);
  return (
    states.get(id)?.status ?? {
      state: 'untested',
      blocked: false,
      message: key ? 'Key 已配置，尚未检测免费接口可用性。' : '请先配置 OpenRouter Key。',
    }
  );
}
export function recordOpenRouterError(key: string, error: OpenRouterRequestError, now = Date.now()) {
  const blocked = error.scope === 'daily' || error.scope === 'minute';
  const previous = openRouterStatus(key, now);
  if (previous.blocked && (!blocked || (previous.scope === 'daily' && error.scope !== 'daily'))) return;
  // If the server omitted a reset, retain a short cooldown without inventing the account's reset time.
  states.set(identity(key), {
    ...(blocked ? { expiresAt: error.resetAt ?? now + (error.retryAfterMs ?? 60_000) } : {}),
    status: {
      state: error.status === 429 ? 'limited' : 'error',
      message: error.message,
      blocked,
      checkedAt: new Date(now).toISOString(),
      scope: error.scope,
      limit: error.limit,
      remaining: error.remaining,
      ...(error.resetAt !== undefined ? { resetAt: error.resetAt } : {}),
    },
  });
}
export function recordOpenRouterSuccess(key: string) {
  if (openRouterStatus(key).blocked) return;
  states.set(identity(key), {
    status: {
      state: 'available',
      blocked: false,
      message: '最近一次免费调用成功。免费请求按账号共享额度，仍可能受到上游限流。',
      checkedAt: new Date().toISOString(),
    },
  });
}
export function assertOpenRouterAvailable(key: string) {
  const status = openRouterStatus(key);
  if (!status.blocked) return;
  const expiresAt = states.get(identity(key))?.expiresAt;
  const error = new OpenRouterRequestError(
    429,
    {
      error: {
        message: status.scope === 'daily' ? 'free-models-per-day' : 'free-models-per-minute',
        metadata: {
          headers: {
            ...(status.limit !== undefined ? { 'X-RateLimit-Limit': String(status.limit) } : {}),
            ...(status.remaining !== undefined ? { 'X-RateLimit-Remaining': String(status.remaining) } : {}),
            ...(status.resetAt !== undefined ? { 'X-RateLimit-Reset': String(status.resetAt / 1000) } : {}),
          },
        },
      },
    },
    expiresAt !== undefined
      ? new Headers({ 'Retry-After': String(Math.max(0, expiresAt - Date.now()) / 1000) })
      : new Headers(),
  );
  error.message = status.message;
  throw error;
}
