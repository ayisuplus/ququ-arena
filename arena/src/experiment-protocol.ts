import { createHash } from 'node:crypto';
import type { BattleResult } from './types.ts';

/** Data identity and evaluation conditions, not the model being compared. */
export function comparisonProtocol(result: BattleResult) {
  return {
    fingerprint: result.meta?.arenaFingerprint ?? null,
    mode: result.arena.mode ?? 'qa',
    judges: result.meta?.judge ?? result.meta?.judgeModels ?? null,
    execution: result.meta?.execution ?? null,
    taskBudget: result.meta?.taskBudgetMs ?? null,
    version: result.meta?.toolVersion ?? null,
    // 只在有来源标记时加入：历史记录的协议键保持不变
    ...(result.meta?.source ? { source: result.meta.source } : {}),
  };
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
export function protocolWarnings(result: BattleResult): string[] {
  const p = comparisonProtocol(result);
  return [
    ...(!p.execution ? ['旧记录缺少执行预算，只作描述性对比，不能确认为严格回归实验'] : []),
    ...(!p.judges ? ['未记录裁判身份'] : []),
    ...(!p.version ? ['未记录工具版本'] : []),
  ];
}
export function protocolKey(result: BattleResult): string {
  const protocol = comparisonProtocol(result);
  // Old records without a fingerprint must not merge changed prompts just because task IDs match.
  const legacy = protocol.fingerprint
    ? null
    : {
        arena: result.arena,
        tasks: [...new Map(result.records.map((r) => [r.taskId, r.prompt])).entries()].sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      };
  return createHash('sha256').update(canonical({ protocol, legacy })).digest('hex').slice(0, 16);
}
export function requireComparable(a: BattleResult, b: BattleResult) {
  const left = comparisonProtocol(a),
    right = comparisonProtocol(b);
  if (!left.fingerprint || !right.fingerprint) throw new Error('缺少题库指纹，历史记录可查看，但不能作严格同卷对比');
  if (left.fingerprint !== right.fingerprint) throw new Error('两场比赛不是同一份考卷：题库指纹不同');
  if (canonical(left.judges) !== canonical(right.judges)) throw new Error('裁判身份或配置不同，不能作严格回归对比');
  if (
    left.mode !== right.mode ||
    canonical(left.execution) !== canonical(right.execution) ||
    left.taskBudget !== right.taskBudget ||
    left.version !== right.version
  )
    throw new Error('赛道、执行预算或工具版本不同，不能作严格回归对比');
  if (
    a.status === 'pending_grading' ||
    b.status === 'pending_grading' ||
    a.status === 'stopped' ||
    b.status === 'stopped'
  )
    throw new Error('评分未完成或比赛已中止，不能作严格回归对比');
}
