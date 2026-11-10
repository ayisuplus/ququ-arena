/**
 * 弱项挖掘 —— 从战绩找出"模型集体翻车"的题/维度，驱动出题官造针对罐
 *
 * 这是 benchmark → agent 的桥：战绩不只是排名证据，还是出题的矿。
 * 弱项 = 全场均分 ≤ 阈值的题（团灭题优先）；维度弱项 = 分维度均分垫底。
 * 产出可直接喂给 inventor.inventArena 的脑洞文本（含真实翻车案例——
 * 出题官不是凭空想，是看着翻车现场出题）。
 */
import type { BattleResult } from './types.ts';
import { isAnswered } from './record-state.ts';

export interface Weakness {
  taskId: string;
  condition: string;
  avg: number;
  n: number;
  /** 团灭题时截取的前两条翻车答案（供出题官看现场） */
  samples: string[];
}

export interface MineReport {
  arena: string;
  /** 逐题弱项（均分 ≤ 阈值），按均分升序 */
  tasks: Weakness[];
  /** 维度弱项（分维度均分 ≤ 阈值），按均分升序 */
  conditions: { condition: string; avg: number }[];
  /** 参赛蛐蛐数与有效题量 */
  contestants: number;
  answered: number;
}

export function mineWeaknesses(result: BattleResult, threshold = 0.5): MineReport {
  const byTask = new Map<string, { scores: number[]; condition: string; answers: string[] }>();
  for (const r of result.records) {
    if (!isAnswered(r)) continue;
    const acc = byTask.get(r.taskId) ?? { scores: [], condition: r.condition, answers: [] };
    acc.scores.push(r.score);
    if (r.score <= threshold) acc.answers.push(r.answer);
    byTask.set(r.taskId, acc);
  }
  const tasks: Weakness[] = [...byTask.entries()]
    .map(([taskId, a]) => ({
      taskId,
      condition: a.condition,
      avg: a.scores.reduce((s, x) => s + x, 0) / a.scores.length,
      n: a.scores.length,
      samples: a.answers.slice(0, 2),
    }))
    .filter((w) => w.avg <= threshold)
    .sort((a, b) => a.avg - b.avg);

  // 维度均分按全部题聚合再按阈值过滤（此前只用已判弱的题聚合——1 题翻车 + 4 题满分的维度被谎报成 0.2 弱维度——审查实证）
  const byCondAll = new Map<string, number[]>();
  for (const [, a] of byTask) {
    const avg = a.scores.reduce((s, x) => s + x, 0) / a.scores.length;
    (byCondAll.get(a.condition) ?? byCondAll.set(a.condition, []).get(a.condition)!).push(avg);
  }
  const conditions = [...byCondAll.entries()]
    .map(([condition, avgs]) => ({ condition, avg: avgs.reduce((s, x) => s + x, 0) / avgs.length }))
    .filter((c) => c.avg <= threshold)
    .sort((a, b) => a.avg - b.avg);

  return {
    arena: result.arena.name,
    tasks,
    conditions,
    contestants: result.contestants.length,
    answered: result.records.filter(isAnswered).length,
  };
}

/** 把弱项报告写成出题官的脑洞文本（翻车现场附在题后——出题官看着翻车出题） */
export function weaknessBrief(report: MineReport, count: number): string {
  const top = report.tasks.slice(0, 6);
  const lines = top.map((w, i) => {
    const taskNote = report.conditions.find((c) => c.condition === w.condition);
    const samples = w.samples.length
      ? `；翻车现场：${w.samples.map((s) => `「${s.replace(/\s+/g, ' ').slice(0, 40)}」`).join(' ')}`
      : ''; // 翻车原文清洗换行——含换行的答案曾把伪造编号/指令文本拼进出题官 prompt（审查实证）
    return `${i + 1}. 题 ${w.taskId}（维度 ${w.condition}，均分 ${(w.avg * 100).toFixed(0)}%${taskNote ? '，该维度也弱' : ''}）${samples}`;
  });
  return `在「${report.arena}」上模型集体翻车了这些题/维度，请针对这些弱项出 ${count} 道更有区分度的新题（换换花样，别照抄原题）：\n${lines.join('\n')}`;
}
