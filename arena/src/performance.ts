import type { BattleRecord, BattleResult } from './types.ts';
import { isAnswered } from './record-state.ts';
import { tokenCount } from './token-usage.ts';

/**
 * 现行排名规则：按答题均分排名；第一名与第二名的分差 95% 置信区间（配对 bootstrap）不含 0 才判定胜者，
 * 否则只列"暂列第一"。速度、Token 与缓存照常计算，只作效率参考，不决定名次。
 */
export const RANKING_POLICY = 'quality-ci-v1' as const;
/** 旧规则（3.34.4 及以前的战绩）：答题质量与效率折算的竞技综合分决定名次。历史战绩按当时规则解读，不重算 */
export const EFFICIENCY_POLICY = 'quality-efficiency-v1' as const;
export type RankingPolicy = typeof RANKING_POLICY | typeof EFFICIENCY_POLICY;
/** 两种规则都记录效率指标（现行规则只展示、不排名）；更早的战绩没有 */
export const tracksEfficiency = (policy?: string): policy is RankingPolicy =>
  policy === RANKING_POLICY || policy === EFFICIENCY_POLICY;
export const PERFORMANCE_RULES = [
  '竞技综合分：每题100 × 答题得分（0–1）×（70 + 15 × 速度系数 + 10 × Token效率 + 5 × 缓存命中率）÷ 当题启用权重，再逐题等权平均。满分100；答错得0。',
  '速度系数 = 同题有得分模型的最快解题耗时 ÷ 本模型耗时，上限1；解题时间包含重试及退避，不含容量排队、裁判和解说。',
  'Token效率 = 同题有得分模型的最少总Token ÷ 本模型总Token，上限1。输入含缓存，输出含推理，均不重复相加；0 Token视为最高效率。',
  '缓存命中率 = 缓存读取Token ÷ 输入Token；写入缓存不算命中。总览按Token量加权，未提供数据不当作0%。',
  '同题任一模型的某项数据缺失、用量因重试不完整或输入为0时，全体跳过对应指标并按剩余权重归一化。每项展示实际纳入题数；不同模型的Token切分和缓存服务可能不同。',
  '已退赛选手不参与综合排名和效率比较；退赛前的有效答案、答题均分与已知用量单独保留。',
];
export interface PerformanceMetrics {
  score: number | null;
  points: { quality: number; speed: number; tokens: number; cache: number };
  included: { speed: number; tokens: number; cache: number };
  scoredTasks: number;
  avgSolveMs: number | null;
  cacheHitRate: number | null;
  cacheSamples: number;
}
const duration = (r: BattleRecord) =>
  Number.isFinite(r.solveMs) && r.solveMs! >= 0 ? Math.max(1, r.solveMs!) : undefined;
const totalTokens = (r: BattleRecord) =>
  r.usageComplete !== false && r.usage && tokenCount(r.usage.input) && tokenCount(r.usage.output)
    ? r.usage.input + r.usage.output
    : undefined;
const cacheRate = (r: BattleRecord) =>
  totalTokens(r) !== undefined &&
  r.usage!.input > 0 &&
  tokenCount(r.usage!.cachedInput) &&
  r.usage!.cachedInput! <= r.usage!.input
    ? r.usage!.cachedInput! / r.usage!.input
    : undefined;

/** Per-question comparison keeps difficulty, missing data and retries out of accidental advantages. */
export function performanceMetrics(result: BattleResult): Map<string, PerformanceMetrics> {
  const valid = result.records.filter(isAnswered),
    tasks = new Map<string, BattleRecord[]>();
  const withdrawn = new Set(result.withdrawals?.map((w) => w.modelId));
  const active = result.contestants.filter((model) => !withdrawn.has(model.id));
  for (const record of valid)
    if (!withdrawn.has(record.model)) {
      const records = tasks.get(record.taskId) ?? [];
      records.push(record);
      tasks.set(record.taskId, records);
    }
  const metrics = new Map(
    result.contestants.map((model) => [
      model.id,
      {
        score: null,
        points: { quality: 0, speed: 0, tokens: 0, cache: 0 },
        included: { speed: 0, tokens: 0, cache: 0 },
        scoredTasks: 0,
        avgSolveMs: null,
        cacheHitRate: null,
        cacheSamples: 0,
      } as PerformanceMetrics,
    ]),
  );
  for (const records of tasks.values()) {
    const complete =
      records.length === active.length &&
      active.every((model) => records.filter((r) => r.model === model.id).length === 1);
    const speed = complete && records.every((r) => duration(r) !== undefined);
    const tokens = complete && records.every((r) => totalTokens(r) !== undefined);
    const cache = complete && records.every((r) => cacheRate(r) !== undefined);
    const reference = records.some((r) => r.score > 0) ? records.filter((r) => r.score > 0) : records;
    const fastest = speed ? Math.min(...reference.map((r) => duration(r)!)) : 0;
    const cheapest = tokens ? Math.min(...reference.map((r) => totalTokens(r)!)) : 0;
    const weight = 70 + (speed ? 15 : 0) + (tokens ? 10 : 0) + (cache ? 5 : 0);
    for (const record of records) {
      const item = metrics.get(record.model);
      if (!item) continue;
      const q = record.score / weight;
      item.points.quality += q * 70;
      if (speed) {
        item.points.speed += q * 15 * Math.min(1, fastest / duration(record)!);
        item.included.speed++;
      }
      if (tokens) {
        item.points.tokens += q * 10 * (totalTokens(record) === 0 ? 1 : Math.min(1, cheapest / totalTokens(record)!));
        item.included.tokens++;
      }
      if (cache) {
        item.points.cache += q * 5 * cacheRate(record)!;
        item.included.cache++;
      }
      item.scoredTasks++;
    }
  }
  for (const [id, item] of metrics) {
    const records = valid.filter((r) => r.model === id),
      times = records.filter((r) => duration(r) !== undefined),
      cached = records.filter((r) => cacheRate(r) !== undefined);
    item.avgSolveMs =
      times.length === records.length && times.length
        ? times.reduce((sum, r) => sum + r.solveMs!, 0) / times.length
        : null;
    item.cacheSamples = cached.length;
    item.cacheHitRate = cached.length
      ? cached.reduce((sum, r) => sum + r.usage!.cachedInput!, 0) / cached.reduce((sum, r) => sum + r.usage!.input, 0)
      : null;
    if (item.scoredTasks) {
      for (const key of ['quality', 'speed', 'tokens', 'cache'] as const) item.points[key] /= item.scoredTasks;
      item.score = Object.values(item.points).reduce((sum, value) => sum + value, 0);
    }
  }
  return metrics;
}
