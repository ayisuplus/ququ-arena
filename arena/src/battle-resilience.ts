/**
 * Match limits apply across retries; an uncooperative adapter cannot hold a slot forever.
 * 单题/裁判超时是「上限」而不是固定值：默认 60s，可用环境变量抬高以放行「慢但正确」的模型
 * （T-004 实证：硅基流动单题 27–33s 撞上 60s 钳位，答案全对却被判负、造出「假 0%」）。
 * 上限本身保留——它防的是不合作的适配器永久占槽（一个挂死的请求不许拖垮整场）。
 * 覆盖口径（毫秒、正整数）：QUQU_QUESTION_TIMEOUT_MS / QUQU_JUDGE_TIMEOUT_MS。
 */
export interface MatchLimits {
  readonly failures: number;
  readonly questionMs: number;
  readonly judgeMs: number;
}

function timeoutCap(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} 必须是正数毫秒（收到 "${raw}"）`);
  return n;
}

/** 从环境解析上限；默认 60s。抽成纯函数（吃 env）便于契约测试，不在 import 期偷读。 */
export function resolveMatchLimits(env: Record<string, string | undefined>): MatchLimits {
  return {
    failures: 3,
    questionMs: timeoutCap(env.QUQU_QUESTION_TIMEOUT_MS, 60_000, 'QUQU_QUESTION_TIMEOUT_MS'),
    judgeMs: timeoutCap(env.QUQU_JUDGE_TIMEOUT_MS, 60_000, 'QUQU_JUDGE_TIMEOUT_MS'),
  };
}

export const MATCH_LIMITS: MatchLimits = resolveMatchLimits(process.env);

export function abortable<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return run();
      })
      .then(
        (value) => {
          signal.removeEventListener('abort', abort);
          signal.aborted ? reject(signal.reason) : resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        },
      );
  });
}

export function deadline(ms: number, message: string, signals: AbortSignal[] = []) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(message)), ms);
  const signal = AbortSignal.any([controller.signal, ...signals]);
  const clear = () => clearTimeout(timer);
  signal.addEventListener('abort', clear, { once: true });
  return {
    signal,
    expired: () => controller.signal.aborted,
    cancel() {
      controller.abort(new Error('调用已结束'));
      clear();
    },
    clear() {
      clear();
      signal.removeEventListener('abort', clear);
    },
  };
}
