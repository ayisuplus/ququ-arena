/**
 * 排行榜 —— 平均分 + 分维度 + pairwise Elo
 */
import type { ArenaTask, BattleResult, BoardEntry } from './types.ts';
import { isAnswered } from './record-state.ts';

/** 逐题 pairwise 比较计算 Elo（同题得分高者胜，平局各 0.5） */
function computeElo(result: BattleResult): Map<string, number> {
  const K = 24;
  const elo = new Map<string, number>();
  for (const c of result.contestants) elo.set(c.id, 1500);

  const byTask = new Map<string, { model: string; score: number }[]>();
  for (const r of result.records) {
    if (!isAnswered(r)) continue;
    if (!byTask.has(r.taskId)) byTask.set(r.taskId, []);
    byTask.get(r.taskId)!.push({ model: r.model, score: r.score });
  }
  for (const fights of byTask.values()) {
    for (let i = 0; i < fights.length; i++) {
      for (let j = i + 1; j < fights.length; j++) {
        const a = fights[i];
        const b = fights[j];
        // 平局按 0.5 结算（与文件头注释及 Glicko 口径一致；v1.7 审计修复：此前跳过致 Elo 通胀）
        const sa = a.score === b.score ? 0.5 : a.score > b.score ? 1 : 0;
        const ra = elo.get(a.model)!;
        const rb = elo.get(b.model)!;
        const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
        elo.set(a.model, ra + K * (sa - ea));
        elo.set(b.model, rb + K * (1 - sa - (1 - ea)));
      }
    }
  }
  return elo;
}

export function buildLeaderboard(result: BattleResult): BoardEntry[] {
  const elo = computeElo(result);
  const nameOf = new Map(result.contestants.map((c) => [c.id, c.name]));
  const byModel = new Map<string, typeof result.records>();
  for (const c of result.contestants) byModel.set(c.id, []);
  for (const r of result.records) byModel.get(r.model)?.push(r);

  const entries: BoardEntry[] = [];
  for (const [model, recs] of byModel) {
    const ok = recs.filter(isAnswered);
    const byCond = new Map<string, number[]>();
    for (const r of ok) {
      if (!byCond.has(r.condition)) byCond.set(r.condition, []);
      byCond.get(r.condition)!.push(r.score);
    }
    entries.push({
      model,
      name: nameOf.get(model) ?? model,
      // 全弃权 = NaN（"没有成绩"），不是 0 分——0 分会被下游当成真实全败结算
      avg: ok.length ? ok.reduce((s, r) => s + r.score, 0) / ok.length : NaN,
      byCondition: Object.fromEntries([...byCond].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length])),
      answered: ok.length,
      errors: recs.length - ok.length,
      ...(result.withdrawals?.find((w) => w.modelId === model)
        ? { withdrawal: result.withdrawals.find((w) => w.modelId === model) }
        : {}),
      elo: Math.round(elo.get(model) ?? 1500),
      avgLatencyMs: ok.length ? Math.round(ok.reduce((s, r) => s + r.latencyMs, 0) / ok.length) : 0,
    });
  }
  // NaN 沉底：全弃权（avg=NaN）是"没有成绩"，不得靠差值 falsy 落入 Elo tiebreak 原位称王（会误解锁首秀夺冠成就）
  entries.sort((a, b) => {
    if (!!a.withdrawal !== !!b.withdrawal) return a.withdrawal ? 1 : -1;
    const an = Number.isNaN(a.avg),
      bn = Number.isNaN(b.avg);
    if (an !== bn) return an ? 1 : -1;
    return b.avg - a.avg || b.elo - a.elo;
  });
  return entries;
}

/** 「名场面」：全体蛐蛐集体翻车的题（平均分 ≤ 阈值） */
export function findBloodbaths(
  result: BattleResult,
  threshold = 0.4,
): {
  taskId: string;
  condition: string;
  prompt: string;
  target?: string;
  avg: number;
  answers: { name: string; answer: string; score: number }[];
}[] {
  const nameOf = new Map(result.contestants.map((c) => [c.id, c.name]));
  const byTask = new Map<string, typeof result.records>();
  for (const r of result.records) {
    if (!byTask.has(r.taskId)) byTask.set(r.taskId, []);
    byTask.get(r.taskId)!.push(r);
  }
  const out = [];
  for (const [taskId, recs] of byTask) {
    const ok = recs.filter(isAnswered);
    if (ok.length < 2) continue;
    const avg = ok.reduce((s, r) => s + r.score, 0) / ok.length;
    if (avg <= threshold) {
      out.push({
        taskId,
        condition: ok[0].condition,
        prompt: ok[0].prompt,
        target: ok[0].target,
        avg,
        answers: ok
          .map((r) => ({ name: nameOf.get(r.model) ?? r.model, answer: r.answer, score: r.score }))
          .sort((a, b) => a.score - b.score),
      });
    }
  }
  return out.sort((a, b) => a.avg - b.avg).slice(0, 10);
}

/** 加赛选题：题内跨蛐蛐方差最大的 K 题（区分度即波动），返回保持罐内原序的子集 */
export function pickPlayoffTasks(
  records: { taskId: string; score: number; error?: string }[],
  tasks: ArenaTask[],
  k: number,
): ArenaTask[] {
  const byTask = new Map<string, number[]>();
  for (const r of records) {
    if (!isAnswered(r)) continue;
    (byTask.get(r.taskId) ?? byTask.set(r.taskId, []).get(r.taskId)!).push(r.score);
  }
  const variance = (xs: number[]) => {
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  };
  const picked = new Set(
    [...byTask.entries()]
      .sort((a, b) => variance(b[1]) - variance(a[1]))
      .slice(0, k)
      .map(([id]) => id),
  );
  return tasks.filter((t) => picked.has(t.id));
}
