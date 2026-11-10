import type { ArenaMode, ArenaTask, JudgeSpec, RubricDimension } from './types.ts';

export const MODE_LABELS: Record<ArenaMode, string> = { qa: '短题竞速', open: '开放评审', multi_turn: '多轮任务' };
export const TASK_LIMITS = { roundMs: 180_000, taskMs: 600_000 };
export function defaultRubric(mode: ArenaMode): Extract<JudgeSpec, { kind: 'rubric' }> {
  const dimensions: [string, string, number, string][] =
    mode === 'multi_turn'
      ? [
          ['goal', '目标完成', 40, '满足最终交付要求，结果可执行；遗漏主要交付扣分。'],
          ['constraints', '约束保持', 25, '保留未被后续替换的约束，正确识别变更与冲突；忽略关键约束扣分。'],
          ['revision', '修订质量', 20, '根据新增材料实质修订，说明变化及影响；仅复述旧答案扣分。'],
          ['evidence', '依据与核对', 15, '用给定材料核对关键结论和计算，标明假设与未知；编造依据扣分。'],
        ]
      : [
          ['correctness', '正确性', 35, '关键事实、计算与结论正确；实质性错误按影响扣分。'],
          ['evidence', '依据', 25, '结论对应给定材料，区分事实、假设与未知；编造或无依据断言扣分。'],
          ['completeness', '完整性', 25, '覆盖全部要求及主要边界条件；遗漏重要问题扣分。'],
          ['clarity', '表达清晰度', 15, '结构清楚，关键判断与行动可定位；含糊或自相矛盾扣分。'],
        ];
  return {
    kind: 'rubric',
    dimensions: dimensions.map(([id, name, weight, criteria]) => ({ id, name, weight, criteria })),
  };
}
export function validateRubric(dimensions: RubricDimension[], where: string) {
  if (!Array.isArray(dimensions) || !dimensions.length || dimensions.length > 12)
    throw new Error(`${where}需要 1–12 个评分维度`);
  const ids = new Set<string>();
  for (const d of dimensions) {
    if (!d || !/^[\w-]{1,64}$/.test(d.id) || ids.has(d.id)) throw new Error(`${where}评分维度标识无效或重复`);
    ids.add(d.id);
    if (
      typeof d.name !== 'string' ||
      !d.name.trim() ||
      typeof d.criteria !== 'string' ||
      !d.criteria.trim() ||
      d.criteria.length > 100_000
    )
      throw new Error(`${where}每个维度需要名称和得分条件`);
    if (typeof d.weight !== 'number' || !Number.isFinite(d.weight) || d.weight <= 0 || d.weight > 100)
      throw new Error(`${where}维度权重必须大于 0 且不超过 100`);
  }
  if (Math.abs(dimensions.reduce((sum, d) => sum + d.weight, 0) - 100) > 1e-8)
    throw new Error(`${where}权重合计必须为 100%`);
}
export function validateTaskMode(mode: ArenaMode, task: ArenaTask, spec: JudgeSpec) {
  if (mode !== 'qa' && spec.kind !== 'rubric') throw new Error(`task ${task.id}: 新赛道必须使用多维评分标准`);
  if (mode !== 'multi_turn') {
    if (task.rounds !== undefined) throw new Error(`task ${task.id}: 只有多轮任务赛道可以设置轮次`);
    return;
  }
  if (!Array.isArray(task.rounds) || task.rounds.length < 2 || task.rounds.length > 5)
    throw new Error(`task ${task.id}: 多轮任务需要 2–5 个轮次`);
  const ids = new Set<string>();
  for (const round of task.rounds) {
    if (!round || !/^[\w-]{1,64}$/.test(round.id) || ids.has(round.id))
      throw new Error(`task ${task.id}: 轮次标识无效或重复`);
    ids.add(round.id);
    if (
      typeof round.title !== 'string' ||
      !round.title.trim() ||
      typeof round.input !== 'string' ||
      !round.input.trim() ||
      round.input.length > 100_000
    )
      throw new Error(`task ${task.id}: 各轮需要标题和要求（最多 10 万字）`);
  }
}
