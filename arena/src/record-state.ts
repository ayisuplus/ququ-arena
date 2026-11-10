/**
 * 记录三态（RecordState）——全系统唯一的弃权语义判定闸门
 *
 * 第一性原理：一条交战记录在产生点（runner.oneFight）就已定型为三种状态之一，
 * 下游（榜单/统计/报告/蒸馏/联赛/IRT）只允许消费状态，不允许各自再判定。
 * 此前 ≥15 处 `!r.error` / `Number.isNaN(avg)` 散点各自实现判定——
 * 三轮对抗式审查抓到的弃权漏判（bracket/league/report/poster）全部源于此。
 */
import type { BattleRecord } from './types.ts';

export type RecordState =
  /** 有效作答：有分数，参与均分/CI/偏好蒸馏 */
  | 'answered'
  /** 蛐蛐弃权：调用失败（限流/超时/缺 key），不进 Elo/均分，但也不是"全错" */
  | 'abstain'
  /** 裁判弃权：蛐蛐答了但裁判挂了——答案保留可离线重判，同样不进 Elo/均分 */
  | 'judge-abstain';

/** 唯一判定入口。BattleRecord.error 由 runner 在两类失败时写入；note 区分责任方 */
export function recordState(r: Pick<BattleRecord, 'error' | 'note'>): RecordState {
  if (!r.error) return 'answered';
  return (r.note ?? '').includes('裁判弃权') ? 'judge-abstain' : 'abstain';
}

/** 有效作答（参与均分/CI/蒸馏/弱项挖掘的全部样本口径） */
export const isAnswered = (r: Pick<BattleRecord, 'error' | 'note'>): boolean => recordState(r) === 'answered';

/** 实况/榜单统一标记：弃权一律 💨（详情看 note），有分按分数 */
export function displayMark(r: Pick<BattleRecord, 'error' | 'score'>): '✓' | '✗' | '½' | '💨' {
  if (r.error) return '💨';
  return r.score >= 0.99 ? '✓' : r.score <= 0.01 ? '✗' : '½';
}
