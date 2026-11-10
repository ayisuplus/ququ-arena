/** Public explanations and presentation results; never changes judge scores or career settlement. */
import type { BattleResult, BoardEntry, JudgeSpec, ContestantWithdrawal } from './types.ts';
import { recordState, isAnswered } from './record-state.ts';
import {
  RANKING_POLICY,
  EFFICIENCY_POLICY,
  PERFORMANCE_RULES,
  performanceMetrics,
  tracksEfficiency,
  type PerformanceMetrics,
  type RankingPolicy,
} from './performance.ts';
import { gapCI } from './stats.ts';
import { pct } from './theme.ts';

export interface ScoringInfo {
  kind: JudgeSpec['kind'];
  title: string;
  summary: string;
  details: string[];
  judgeModels: string[];
  aggregation: string;
  errorPolicy: string;
  tiePolicy: string;
  source: 'arena-default' | 'task-override' | 'legacy-default';
  detailsAvailable: boolean;
  dimensions?: { id: string; name: string; weight: number }[];
  performance?: string[];
}
const titles = {
  exact: '标准化精确匹配',
  contains: '全部关键词匹配',
  regex: '正则表达式匹配',
  llm: '模型裁判评分',
  rubric: '匿名多维评审',
  all: '组合评分 · 全部条件',
  any: '组合评分 · 任一条件',
  not: '反向评分',
};

export function requiresModelJudge(spec: JudgeSpec): boolean {
  if (spec.kind === 'llm' || spec.kind === 'rubric') return true;
  if (spec.kind === 'not') return requiresModelJudge(spec.judge);
  return (spec.kind === 'all' || spec.kind === 'any') && spec.judges.some(requiresModelJudge);
}

export function describeScoring(
  spec: JudgeSpec,
  judgeModels: string[] = [],
  source: ScoringInfo['source'] = 'arena-default',
  detailsAvailable = false,
  rankingPolicy?: RankingPolicy,
): ScoringInfo {
  let hasLlm = false;
  const describe = (rule: JudgeSpec, prefix = ''): string[] => {
    switch (rule.kind) {
      case 'rubric':
        hasLlm = true;
        return [
          prefix +
            '各维度按 0–10 分评审，由程序按权重计算任务总分。每项需理由与可定位的轮次证据；格式不合格保留答卷待评分。',
          ...rule.dimensions.map((d) => `${prefix}${d.name} ${d.weight}%${detailsAvailable ? '：' + d.criteria : ''}`),
          ...(detailsAvailable ? [] : ['任务结束后公开得分条件与分项证据。']),
        ];
      case 'exact':
        return [
          prefix +
            '去空白、转换全角英数和圈码数字后，与参考答案' +
            (rule.alternatives?.length ? '或明确列出的等价答案' : '') +
            '完全一致得 100%，否则得 0%。' +
            (rule.trimPunct === false ? '保留首尾标点。' : '忽略首尾标点；答案本身全为标点时保留。') +
            (rule.ignoreCase ? '英文字母不区分大小写。' : ''),
        ];
      case 'contains':
        return [
          prefix +
            `标准化后必须包含全部 ${rule.keywords.length} 个关键词；全部命中得 100%，缺少任一项得 0%，不按命中比例给分。`,
          ...(detailsAvailable ? [prefix + '关键词：' + rule.keywords.join('、')] : []),
        ];
      case 'regex':
        return [
          prefix + '在原始答案上执行区分大小写的多行正则匹配；命中得 100%，否则得 0%。',
          ...(detailsAvailable ? [prefix + '表达式：/' + rule.pattern + '/m'] : []),
        ];
      case 'llm':
        hasLlm = true;
        return [
          prefix +
            `裁判按 0–${rule.scale ?? 10} 分评分，限制在该范围后除以满分；多裁判归一化得分取均值，保留三位小数。任一裁判失败则本次评分弃权。`,
          ...(detailsAvailable ? [prefix + '评分细则：' + rule.rubric] : [prefix + '本题结束后公开完整评分细则。']),
        ];
      case 'all':
        return [
          prefix + '取全部子规则的最低得分。',
          ...rule.judges.flatMap((child, i) => describe(child, prefix + `${i + 1}. `)),
        ];
      case 'any':
        return [
          prefix + '取全部子规则的最高得分。',
          ...rule.judges.flatMap((child, i) => describe(child, prefix + `${i + 1}. `)),
        ];
      case 'not':
        return [prefix + '最终得分 = 1 − 子规则得分。', ...describe(rule.judge, prefix + '子规则：')];
    }
  };
  const details = describe(spec);
  const actualJudges = hasLlm ? judgeModels : [];
  if (actualJudges.some((id) => id.startsWith('mock:')))
    details.push('包含离线模拟裁判，使用字符重合度与确定性扰动的启发式演示评分。');
  if (source === 'legacy-default') details.push('旧战绩未保存逐题规则；这里只能确认当时保存的题库默认标准。');
  return {
    kind: spec.kind,
    title: titles[spec.kind],
    summary: details[0]!,
    details,
    judgeModels: actualJudges,
    source,
    detailsAvailable,
    ...(spec.kind === 'rubric'
      ? { dimensions: spec.dimensions.map(({ id, name, weight }) => ({ id, name, weight })) }
      : {}),
    ...(tracksEfficiency(rankingPolicy) ? { performance: PERFORMANCE_RULES } : {}),
    aggregation:
      rankingPolicy === EFFICIENCY_POLICY
        ? '答题均分单独保留；本场按答题质量、解题速度、Token效率及缓存命中折算的竞技综合分排名。'
        : rankingPolicy === RANKING_POLICY
          ? '本场按答题均分排名：有效评分之和 ÷ 有效评分题数，每题等权。速度、Token 与缓存只作效率参考，不决定名次。'
          : '本场均分 = 有效评分之和 ÷ 有效评分题数。每题等权，展示为百分比；耗时和 token 不参与评分。',
    errorPolicy: '模型调用失败、裁判失败和中止调用不作为 0 分，也不进入均分与逐题 Elo 比较。有效的 0 分仍计入。',
    tiePolicy:
      rankingPolicy === EFFICIENCY_POLICY
        ? '按未舍入的竞技综合分判断并列，Elo不打破并列；有效题集合不同或比赛中止时不判胜者。'
        : rankingPolicy === RANKING_POLICY
          ? '按未舍入的答题均分判断并列；第一名与第二名的分差 95% 置信区间含 0 时只列"暂列第一"，不判定胜者。有效题集合不同或比赛中止时不判胜者。'
          : '结算台按原始均分判断并列，不按显示值四舍五入，也不用速度或 Elo 打破并列；有效题集合不同或比赛中止时不判唯一胜者。',
  };
}

export interface SettlementRow {
  modelId: string;
  name: string;
  rank: number | null;
  avg: number | null;
  answered: number;
  errors: number;
  modelErrors: number;
  judgeErrors: number;
  missing: number | null;
  fullCredit: number;
  partialCredit: number;
  zeroCredit: number;
  avgLatencyMs: number | null;
  tokenUsage?: { input: number; output: number };
  usageComplete: boolean;
  elo: number;
  delta: number;
  performance?: PerformanceMetrics;
  withdrawal?: ContestantWithdrawal;
}
export interface SettlementInfo {
  /** inconclusive：均分暂列第一，但与第二名的差距在统计误差内（现行规则） */
  outcome: 'winner' | 'tie' | 'inconclusive' | 'no-score' | 'incomplete' | 'single';
  reason: string;
  leaderIds: string[];
  expectedTasks: number | null;
  replay: boolean;
  career: 'updated' | 'unchanged' | 'replay';
  eloBasis: 'career' | 'match';
  rows: SettlementRow[];
  warnings: string[];
  rankingPolicy?: RankingPolicy;
  performanceRules?: string[];
}
export function buildSettlement(
  result: BattleResult,
  board: BoardEntry[],
  options: {
    expectedTasks?: number;
    replay?: boolean;
    stopped?: boolean;
    deltas?: { id: string; after: number; delta: number }[];
    preElo?: Map<string, number>;
  } = {},
): SettlementInfo {
  const stopped = options.stopped || result.status === 'stopped';
  const pending = result.records.some((r) => r.gradingStatus === 'pending');
  const expectedTasks =
    options.expectedTasks ??
    result.meta?.plannedTasks ??
    (stopped ? null : new Set(result.records.map((r) => r.taskId)).size);
  const validTasks: string[] = [];
  const policy = result.meta?.rankingPolicy;
  // 旧规则按综合分排名；现行规则按均分排名、用配对置信区间判定胜者；两者都计算效率指标
  const usePerformance = policy === EFFICIENCY_POLICY;
  const performance = tracksEfficiency(policy) ? performanceMetrics(result) : undefined;
  const rows = board.map((entry): SettlementRow => {
    const records = result.records.filter((r) => r.model === entry.model),
      valid = records.filter(isAnswered);
    if (!entry.withdrawal) validTasks.push(JSON.stringify(valid.map((r) => r.taskId).sort()));
    const withUsage = records.filter((r) => r.usage);
    const delta = options.deltas?.find((d) => d.id === entry.model);
    return {
      modelId: entry.model,
      name: entry.name,
      rank: Number.isFinite(entry.avg)
        ? 1 + board.filter((other) => Number.isFinite(other.avg) && other.avg > entry.avg).length
        : null,
      avg: Number.isFinite(entry.avg) ? entry.avg : null,
      answered: entry.answered,
      errors: entry.errors,
      ...(entry.withdrawal ? { withdrawal: entry.withdrawal } : {}),
      modelErrors: records.filter((r) => recordState(r) === 'abstain').length,
      judgeErrors: records.filter((r) => recordState(r) === 'judge-abstain').length,
      missing: expectedTasks === null ? null : Math.max(0, expectedTasks - new Set(records.map((r) => r.taskId)).size),
      fullCredit: valid.filter((r) => r.score === 1).length,
      partialCredit: valid.filter((r) => r.score > 0 && r.score < 1).length,
      zeroCredit: valid.filter((r) => r.score === 0).length,
      avgLatencyMs: entry.answered ? entry.avgLatencyMs : null,
      ...(withUsage.length
        ? {
            tokenUsage: withUsage.reduce(
              (sum, r) => ({ input: sum.input + r.usage!.input, output: sum.output + r.usage!.output }),
              { input: 0, output: 0 },
            ),
          }
        : {}),
      usageComplete:
        records.length > 0 && withUsage.length === records.length && records.every((r) => r.usageComplete !== false),
      ...(performance ? { performance: performance.get(entry.model) } : {}),
      elo: delta?.after ?? (stopped && !options.replay ? (options.preElo?.get(entry.model) ?? 1500) : entry.elo),
      delta: options.replay || stopped ? 0 : (delta?.delta ?? 0),
    };
  });
  const value = (row: SettlementRow) =>
    row.withdrawal ? null : usePerformance ? (row.performance?.score ?? null) : row.avg;
  if (usePerformance || result.withdrawals?.length) {
    rows.sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1));
    for (const row of rows)
      row.rank =
        value(row) === null
          ? null
          : 1 + rows.filter((other) => value(other) !== null && value(other)! > value(row)!).length;
  }
  const active = rows.filter((row) => !row.withdrawal);
  const eligible = active.filter((row) => row.avg !== null),
    warnings: string[] = [];
  let outcome: SettlementInfo['outcome'], reason: string;
  if (pending) {
    outcome = 'incomplete';
    reason = '答卷已保存，正式评分尚未完成。请重试失败评分；当前不宣布冠军、不结算积分。';
  } else if (stopped || active.some((row) => (row.missing ?? 0) > 0)) {
    outcome = 'incomplete';
    reason = '比赛未完整完成，仅展示已保存成绩，不判定胜者。';
  } else if (!eligible.length) {
    outcome = 'no-score';
    reason = '没有有效评分；调用或裁判失败不代表答错，本场无胜者。';
  } else if (rows.length === 1) {
    outcome = 'single';
    reason = '本场仅一个参赛模型，展示测评结果，不判定对战冠军。';
  } else if (eligible.length !== active.length || new Set(validTasks).size !== 1) {
    outcome = 'incomplete';
    reason = '未退赛模型的有效评分题目不同，无法公平比较；不判定唯一胜者。';
  } else if (active.length === 1 && rows.length > 1) {
    outcome = 'winner';
    reason = '其他选手已弃权或退赛，剩余选手完成全部题目，获胜。';
  } else if (eligible.filter((row) => value(row) === value(eligible[0]!)).length > 1) {
    outcome = 'tie';
    reason = usePerformance
      ? '最高竞技综合分相同，列为并列第一；不按显示舍入值或Elo打破并列。'
      : '最高原始均分相同，列为并列第一；Elo 与速度不打破本次并列。';
  } else if (policy === RANKING_POLICY) {
    const [first, second] = [...eligible].sort((a, b) => value(b)! - value(a)!);
    const gap = gapCI(result.records, first!.modelId, second!.modelId);
    if (gap && gap.lo > 0) {
      outcome = 'winner';
      reason = `答题均分最高，与第二名的分差 95% 置信区间 [${pct(gap.lo)}, ${pct(gap.hi)}] 不含 0。`;
    } else {
      outcome = 'inconclusive';
      reason = gap
        ? `答题均分暂列第一，但与第二名的分差 95% 置信区间 [${pct(gap.lo)}, ${pct(gap.hi)}] 含 0，差距在统计误差内，不判定胜者。`
        : '答题均分暂列第一，但共同有效题太少，无法估计与第二名的差距，不判定胜者。';
    }
  } else {
    outcome = 'winner';
    reason = usePerformance
      ? '在相同有效评分题目上，答题质量与效率折算的竞技综合分最高。'
      : '在相同有效评分题目上，原始均分最高。';
  }
  if (usePerformance)
    warnings.push(
      '竞技综合分决定本场领奖；答题均分与生涯积分仍单独展示。',
      '解题速度为端到端请求耗时，包含网络与服务端等待；Token和缓存按供应商返回数据计算。',
    );
  else if (policy === RANKING_POLICY)
    warnings.push('名次按答题均分；速度、Token 与缓存只作效率参考。解题速度为端到端请求耗时，包含网络与服务端等待。');
  if (rows.some((row) => row.errors)) warnings.push('失败记录已排除出均分；请结合有效题数查看结果。');
  for (const row of rows)
    if (row.withdrawal)
      warnings.push(
        `${row.name}：${row.withdrawal.message}（${row.withdrawal.taskId}）。已退赛，不参与本场排名；已完成的有效答案保留。`,
      );
  const usesModelJudge = result.records.some((r) => requiresModelJudge(r.judge ?? result.arena.judge));
  if (usesModelJudge && result.meta?.judgeModels?.some((id) => id.startsWith('mock:')))
    warnings.push('本场包含离线模拟裁判：评分是启发式演示结果，不能视为真实模型裁判评测。');
  else if (usesModelJudge && !result.meta?.judgeModels?.length && !result.meta?.judge)
    warnings.push('旧战绩未保存裁判身份，无法确认是否使用真实模型裁判；请勿将此结果视为已核验评测。');
  if (rows.some((row) => !row.usageComplete)) warnings.push('token 仅汇总接口实际返回的用量，缺失部分未估算。');
  if (options.replay) warnings.push('回放展示历史成绩，不重复更新生涯；Elo 列为本场逐题比较值。');
  else if (stopped) warnings.push('中止比赛未更新生涯积分。');
  else
    warnings.push(
      usePerformance
        ? '生涯积分沿用答题质量的逐题比较，与本场竞技综合分分开展示。'
        : '生涯积分沿用逐题两两比较与现有结算规则，与本结算台的均分并列口径分开展示。',
    );
  return {
    outcome,
    reason,
    leaderIds: ['winner', 'tie', 'inconclusive'].includes(outcome)
      ? eligible
          .filter((row) => value(row) === Math.max(...eligible.map((x) => value(x) ?? -1)))
          .map((row) => row.modelId)
      : [],
    ...(tracksEfficiency(policy) ? { rankingPolicy: policy, performanceRules: PERFORMANCE_RULES } : {}),
    expectedTasks,
    replay: !!options.replay,
    career: options.replay ? 'replay' : stopped || pending ? 'unchanged' : 'updated',
    eloBasis: options.replay ? 'match' : 'career',
    rows,
    warnings,
  };
}
