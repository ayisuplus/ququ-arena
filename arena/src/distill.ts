/**
 * 战绩蒸馏 —— battle → 偏好数据集（闭环第一段：benchmark → 数据）
 *
 * 科学性 rationale：
 * - DPO 偏好对：同题最高分答 = chosen、最低分答 = rejected；分差（margin）
 *   是偏好强度的诚实度量——margin 太小说明"偏好"其实是噪声，默认阈值过滤。
 * - 弃权（error）记录不进数据集：失败样本无偏好信号。
 * - prompt 用战绩里落盘的完整题面（含 taskPrefix 拼接后的模型所见），
 *   不是 tasks.jsonl 的裸 input——训练分布必须与评测分布一致。
 */
import type { BattleResult } from './types.ts';
import { isAnswered } from './record-state.ts';

export interface DistillPair {
  prompt: string;
  chosen: string;
  rejected: string;
  /** chosen − rejected 的归一化分差（偏好强度） */
  margin: number;
  taskId: string;
  condition: string;
  arena: string;
}

export interface DistillOptions {
  /** 偏好强度下限：分差小于该值的题不出对（"偏好"是噪声） */
  minMargin?: number;
}

export function distillBattle(result: BattleResult, opts: DistillOptions = {}): DistillPair[] {
  const minMargin = opts.minMargin ?? 0.34;
  const byTask = new Map<string, typeof result.records>();
  for (const r of result.records) {
    if (!isAnswered(r)) continue; // 弃权无偏好信号
    (byTask.get(r.taskId) ?? byTask.set(r.taskId, []).get(r.taskId)!).push(r);
  }
  const pairs: DistillPair[] = [];
  for (const [taskId, rs] of byTask) {
    if (rs.length < 2) continue; // 单作答无偏好
    const sorted = [...rs].sort((a, b) => b.score - a.score);
    const best = sorted[0]!,
      worst = sorted[sorted.length - 1]!;
    const margin = best.score - worst.score;
    if (best.score <= 0) continue; // 全灭题：没有"好答案"可选
    if (margin < minMargin) continue; // 分差不足=噪声
    if (best.answer === worst.answer) continue;
    pairs.push({
      prompt: best.prompt,
      chosen: best.answer,
      rejected: worst.answer,
      margin: Math.round(margin * 1000) / 1000,
      taskId,
      condition: best.condition,
      arena: result.arena.name,
    });
  }
  return pairs;
}

/** DPO 标准 JSONL 行 */
export function toDPO(p: DistillPair): Record<string, unknown> {
  return {
    prompt: p.prompt,
    chosen: p.chosen,
    rejected: p.rejected,
    margin: p.margin,
    taskId: p.taskId,
    condition: p.condition,
    arena: p.arena,
  };
}

/** SFT（chosen-only）JSONL 行 */
export function toSFT(p: DistillPair): Record<string, unknown> {
  return {
    messages: [
      { role: 'user', content: p.prompt },
      { role: 'assistant', content: p.chosen },
    ],
    taskId: p.taskId,
    condition: p.condition,
    arena: p.arena,
  };
}
