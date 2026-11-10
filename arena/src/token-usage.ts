import type { TokenUsage } from './types.ts';

export const tokenCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** OpenAI/OpenRouter totals already include cached input and reasoning output. */
export function compatibleUsage(value: any, previous?: TokenUsage): TokenUsage | undefined {
  if (!value) return previous;
  const input = tokenCount(value.prompt_tokens) ? value.prompt_tokens : previous?.input;
  const output = tokenCount(value.completion_tokens) ? value.completion_tokens : previous?.output;
  if (input === undefined || output === undefined) return previous;
  const cached = value.prompt_tokens_details?.cached_tokens ?? value.prompt_cache_hit_tokens ?? previous?.cachedInput;
  const write = value.prompt_tokens_details?.cache_write_tokens ?? previous?.cacheWrite;
  const reasoning = value.completion_tokens_details?.reasoning_tokens ?? previous?.reasoning;
  return {
    input,
    output,
    ...(tokenCount(cached) && cached <= input ? { cachedInput: cached } : {}),
    ...(tokenCount(write) && write <= input ? { cacheWrite: write } : {}),
    ...(tokenCount(reasoning) && reasoning <= output ? { reasoning } : {}),
  };
}

/** pi-ai separates uncached input, cache reads and cache writes. Its default 0 cache counters do not prove provider reporting. */
export function piUsage(value: any): TokenUsage | undefined {
  if (!value || ![value.input, value.output, value.cacheRead, value.cacheWrite].every(tokenCount)) return;
  if (value.input + value.output + value.cacheRead + value.cacheWrite === 0) return;
  return {
    input: value.input + value.cacheRead + value.cacheWrite,
    output: value.output,
    ...(value.cacheRead > 0 ? { cachedInput: value.cacheRead } : {}),
    ...(value.cacheWrite > 0 ? { cacheWrite: value.cacheWrite } : {}),
    ...(tokenCount(value.reasoning) && value.reasoning <= value.output ? { reasoning: value.reasoning } : {}),
  };
}
