import { digest } from './extensions.ts';
import type { HarnessRun, Trial } from './types.ts';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export function usageSummary(trials: Trial[]) {
  const calls = trials.flatMap((t) => t.calls),
    known = calls.filter((c) => c.usage);
  const input = known.reduce((n, c) => n + c.usage!.input, 0),
    output = known.reduce((n, c) => n + c.usage!.output, 0);
  const cacheKnown = known.filter((c) => c.usage!.cachedInput !== undefined);
  const cacheDenominator = cacheKnown.reduce((n, c) => n + c.usage!.input, 0);
  return {
    calls: calls.length,
    knownCalls: known.length,
    input,
    output,
    total: input + output,
    complete: calls.length > 0 && known.length === calls.length,
    cacheKnownCalls: cacheKnown.length,
    cacheRate: cacheDenominator ? cacheKnown.reduce((n, c) => n + c.usage!.cachedInput!, 0) / cacheDenominator : null,
  };
}
function interval(values: number[]) {
  if (values.length < 2) return null;
  let seed = 77127;
  const samples = Array.from({ length: 2000 }, () => {
    let total = 0;
    for (let i = 0; i < values.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      total += values[seed % values.length]!;
    }
    return total / values.length;
  }).sort((a, b) => a - b);
  return [samples[49]!, samples[1949]!];
}
export function summarize(run: HarnessRun) {
  const baseline = run.trials.filter((t) => t.profileId === 'baseline');
  return run.profiles.map((profile) => {
    const trials = run.trials.filter((t) => t.profileId === profile.id),
      all = trials.every((t) => ['completed', 'failed'].includes(t.status) && t.score !== undefined);
    const tasks = run.benchmark.tasks.map((task) => {
      const rows = trials.filter((t) => t.taskId === task.id),
        base = baseline.filter((t) => t.taskId === task.id);
      const valid =
        rows.length === base.length &&
        rows.every((t) => t.score !== undefined && base.some((b) => b.repeat === t.repeat && b.score !== undefined));
      return {
        id: task.id,
        score: valid ? mean(rows.map((t) => t.score!)) : null,
        baseline: valid ? mean(base.map((t) => t.score!)) : null,
        delta: valid ? mean(rows.map((t) => t.score! - base.find((b) => b.repeat === t.repeat)!.score!)) : null,
      };
    });
    const comparable = all && tasks.every((t) => t.delta !== null),
      deltas = tasks.map((t) => t.delta!);
    const usage = usageSummary(trials),
      baseUsage = usageSummary(baseline);
    const elapsed = mean(trials.filter((t) => t.elapsedMs !== undefined).map((t) => t.elapsedMs!)),
      baseElapsed = mean(baseline.filter((t) => t.elapsedMs !== undefined).map((t) => t.elapsedMs!));
    return {
      id: profile.id,
      name: profile.name,
      planned: trials.length,
      completed: trials.filter((t) => t.status === 'completed').length,
      failures: trials.filter((t) => ['failed', 'interrupted', 'cancelled'].includes(t.status)).length,
      pending: trials.filter((t) => t.status === 'pending_grading').length,
      score: all ? mean(trials.map((t) => t.score!)) : null,
      delta: comparable ? mean(deltas) : null,
      interval: comparable ? interval(deltas) : null,
      independentTasks: comparable ? deltas.length : 0,
      elapsedMs: elapsed,
      timeDeltaMs: comparable && elapsed !== null && baseElapsed !== null ? elapsed - baseElapsed : null,
      usage,
      tokenDelta: comparable && usage.complete && baseUsage.complete ? usage.total - baseUsage.total : null,
      judgeCalls: trials.flatMap((t) => t.judgeCalls ?? []),
      tasks,
      note: '质量差值按同题、同次重复配对，先在题内平均，再按题 bootstrap；失败执行计 0，环境失败或待评分阻止完整比较。区间仅为当前任务集合的探索性描述，多配置未校正；不自动宣称提升。',
    };
  });
}
export function comparisonKey(run: HarnessRun) {
  const { repeats, ...protocol } = run.protocol;
  return digest(protocol);
}
export function publicRun(run: HarnessRun) {
  return {
    ...run,
    events: undefined,
    benchmark: { ...run.benchmark, tasks: run.benchmark.tasks.map((t) => ({ id: t.id, title: t.title })) },
    trials: run.trials.map((t) => ({
      id: t.id,
      taskId: t.taskId,
      profileId: t.profileId,
      repeat: t.repeat,
      status: t.status,
      score: t.score,
      error: t.error,
      elapsedMs: t.elapsedMs,
      usage: usageSummary([t]),
    })),
    summary: summarize(run),
    comparisonKey: comparisonKey(run),
  };
}
