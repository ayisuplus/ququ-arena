import { isAnswered } from './record-state.ts';
/**
 * 统计模块 —— 让排行榜从"一串数字"变成"有误差棒的结论"
 *
 * 科学性 rationale：
 * - bootstrap 置信区间：以题为重采样单元（题间独立、题内各蛐蛐成绩相关），
 *   比逐条记录重采样更能保住"同题对比"的相关结构，CI 更诚实。
 * - 固定种子 PRNG：战报里的 CI 必须可复现——同一战绩文件重渲染结果一致。
 * - 差距显著性：top1-top2 的分差分布由 paired bootstrap 给出；
 *   95% CI 含 0 ⇒ 统计意义上的"神仙打架"，而不是解说嘴硬。
 */

/** 确定性 PRNG（mulberry32），与 mock.ts 同源：报告可复现的前提 */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 百分位 CI */
export interface CI {
  lo: number;
  hi: number;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

/**
 * 单蛐蛐均分的 bootstrap 95% CI
 * @param scores 该蛐蛐每题得分（0..1，已剔除弃权）
 * @param B      重采样次数（默认 2000，85 题规模下 <10ms）
 * @param seed   固定种子（默认 42，保证同一数据 CI 恒定）
 */
export function bootstrapCI(scores: number[], B = 2000, seed = 42): CI | undefined {
  const n = scores.length;
  if (n < 2) return undefined;
  const rand = rng(seed);
  const means: number[] = new Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += scores[Math.floor(rand() * n)];
    means[b] = s / n;
  }
  means.sort((a, b) => a - b);
  return { lo: percentile(means, 2.5), hi: percentile(means, 97.5) };
}

/**
 * paired bootstrap：两只蛐蛐同题分差（a - b）的 95% CI。
 * 按 taskId 内连接对齐——若一方弃权某题，该题对双方都剔除，
 * 保证每一次重采样比较的都是同一份考卷。仅按下标配对会在弃权后错位。
 */
export function gapCI(
  records: { model: string; taskId: string; score: number; error?: string }[],
  modelA: string,
  modelB: string,
  seed = 42,
  B = 2000,
): CI | undefined {
  const aBy = new Map<string, number>();
  const bBy = new Map<string, number>();
  for (const r of records) {
    if (!isAnswered(r)) continue;
    if (r.model === modelA) aBy.set(r.taskId, r.score);
    if (r.model === modelB) bBy.set(r.taskId, r.score);
  }
  const diffs: number[] = [];
  for (const [tid, sa] of aBy) {
    const sb = bBy.get(tid);
    if (sb !== undefined) diffs.push(sa - sb);
  }
  const n = diffs.length;
  if (n < 2) return undefined; // 零/单配对样本的退化 CI 会被下游误读成「含 0 / 显著」——无配对数据不做结论（审查实证）
  const rand = rng(seed + 1); // 与单 CI 错开流
  const means: number[] = new Array(B);
  for (let b = 0; b < B; b++) {
    let d = 0;
    for (let i = 0; i < n; i++) d += diffs[Math.floor(rand() * n)];
    means[b] = d / n;
  }
  means.sort((x, y) => x - y);
  return { lo: percentile(means, 2.5), hi: percentile(means, 97.5) };
}

/**
 * Kendall's W 协调系数：N 个排名序列（N 场比赛的名次）对同一组蛐蛐的一致性。
 * W=1 表示本次排名相同；W 接近 0 表示协调程度低，不等同于证明随机性。
 * 仅描述所观察的排名，不能证明任务覆盖、裁判有效性或总体能力。
 * 简化处理：名次即秩（1-based）；W 不经卡方校正（描述性用途）。
 */
export function kendallW(rankings: number[][]): number {
  const m = rankings.length; // 场次数
  if (m < 2) return 1;
  const n = rankings[0]!.length; // 蛐蛐数
  if (n < 2) return 1;
  const rankSum = new Array<number>(n).fill(0);
  for (const r of rankings) {
    for (let i = 0; i < n; i++) rankSum[i]! += r[i]!;
  }
  const meanR = rankSum.reduce((s, x) => s + x, 0) / n;
  const S = rankSum.reduce((s, x) => s + (x - meanR) ** 2, 0);
  return (12 * S) / (m * m * (n ** 3 - n));
}

/**
 * 裁判一致性：多裁判（k≥2）逐题给分的信度指标。
 * pearson = 所有裁判两两 Pearson r 的均值（k=2 时退化为单对 r）；
 * meanDispute = 逐题（max-min）均值。LLM-as-judge 的信度硬指标。
 */
export function judgeAgreement(
  records: { votes?: number[] }[],
): { pearson: number | null; meanDispute: number; n: number; judges: number } | undefined {
  const ballots = records.map((r) => r.votes).filter((v): v is number[] => Array.isArray(v) && v.length >= 2);
  if (!ballots.length) return undefined;
  const k = ballots[0]!.length;
  const uniform = ballots.filter((v) => v.length === k); // 只统计票型一致的观测
  if (uniform.length < 3) return undefined; // 少于 3 对观测，相关系数无意义

  const pairR: number[] = [];
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const xs = uniform.map((v) => v[i]!);
      const ys = uniform.map((v) => v[j]!);
      const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
      const my = ys.reduce((s, y) => s + y, 0) / ys.length;
      let num = 0;
      let dx = 0;
      let dy = 0;
      for (let t = 0; t < xs.length; t++) {
        num += (xs[t]! - mx) * (ys[t]! - my);
        dx += (xs[t]! - mx) ** 2;
        dy += (ys[t]! - my) ** 2;
      }
      // 任一方零方差时相关性不可定义；保留绝对分歧，不伪造 r=1。
      if (dx !== 0 && dy !== 0) pairR.push(num / Math.sqrt(dx * dy));
    }
  }
  const pearson = pairR.length ? pairR.reduce((s, x) => s + x, 0) / pairR.length : null;
  const meanDispute = uniform.reduce((s, v) => s + (Math.max(...v) - Math.min(...v)), 0) / uniform.length;
  return {
    pearson: pearson === null ? null : Math.round(pearson * 100) / 100,
    meanDispute: Math.round(meanDispute * 1000) / 1000,
    n: uniform.length,
    judges: k,
  };
}

/** 胜率矩阵：row 对 col 的胜率（胜=1 平=0.5），仅统计双方都有效作答的题 */
export function winMatrix(
  records: { model: string; taskId: string; score: number; error?: string }[],
  models: string[],
): Map<string, Map<string, number>> {
  const byTask = new Map<string, Map<string, number>>();
  for (const r of records) {
    if (!isAnswered(r)) continue;
    if (!byTask.has(r.taskId)) byTask.set(r.taskId, new Map());
    byTask.get(r.taskId)!.set(r.model, r.score);
  }
  const wins = new Map<string, Map<string, { w: number; n: number }>>();
  for (const m of models) {
    wins.set(m, new Map());
    for (const o of models) if (o !== m) wins.get(m)!.set(o, { w: 0, n: 0 });
  }
  for (const scores of byTask.values()) {
    for (const m of models) {
      const sm = scores.get(m);
      if (sm === undefined) continue;
      for (const o of models) {
        if (o === m) continue;
        const so = scores.get(o);
        if (so === undefined) continue;
        const cell = wins.get(m)!.get(o)!;
        cell.n += 1;
        cell.w += sm > so ? 1 : sm === so ? 0.5 : 0;
      }
    }
  }
  const out = new Map<string, Map<string, number>>();
  for (const m of models) {
    out.set(m, new Map());
    for (const [o, c] of wins.get(m)!) out.get(m)!.set(o, c.n ? c.w / c.n : NaN);
  }
  return out;
}

/**
 * Cronbach's α —— 本卷内部一致性信度（经典测量理论 CTT 的标配披露）。
 *
 * α = k/(k−1) · (1 − Σσ²题 / σ²总分)，σ² 取跨蛐蛐的总体方差。
 * 解读：α 高 = 各题在测同一个东西（同向区分强弱）；α 低/负 = 题目各测各的，
 * 榜单均分就成了"苹果和橘子的平均"。团灭/送分题多的卷子 α 天然低——
 * 零方差题不贡献区分度，这正是 analyze 命令题诊的整场版。
 *
 * 适用边界：m（蛐蛐数）是 α 的样本量，m<10 时 α 波动大——披露时带 m，
 * 供内部迭代参考，不供论文直接引用。弃权记录不入矩阵。
 *
 * @returns alpha 不可定义（k<2 / m<2 / 总分零方差）时为 null
 */
export function cronbachAlpha(records: { model: string; taskId: string; score: number; error?: string }[]): {
  alpha: number | null;
  k: number;
  m: number;
} {
  // 蛐蛐 × 题 得分矩阵（同对重复取均值——矩阵必须每格一个数）
  const cell = new Map<string, Map<string, { s: number; n: number }>>();
  const taskIds = new Set<string>();
  for (const r of records) {
    if (!isAnswered(r)) continue;
    taskIds.add(r.taskId);
    const row = cell.get(r.model) ?? new Map<string, { s: number; n: number }>();
    const acc = row.get(r.taskId) ?? { s: 0, n: 0 };
    acc.s += r.score;
    acc.n += 1;
    row.set(r.taskId, acc);
    cell.set(r.model, row);
  }
  const models = [...cell.keys()];
  const tasks = [...taskIds];
  const k = tasks.length;
  const m = models.length;
  if (k < 2 || m < 2) return { alpha: null, k, m };
  // 缺格（某蛐蛐缺某题）的卷子不做 α——插补会把信度算假
  for (const row of cell.values()) if (row.size < k) return { alpha: null, k, m };

  const scoreAt = (model: string, task: string) => {
    const acc = cell.get(model)!.get(task)!;
    return acc.s / acc.n;
  };
  const totals = models.map((md) => tasks.reduce((s, t) => s + scoreAt(md, t), 0));
  const meanT = totals.reduce((s, x) => s + x, 0) / m;
  const varT = totals.reduce((s, x) => s + (x - meanT) ** 2, 0) / m;
  if (varT === 0) return { alpha: null, k, m }; // 全体同分：信度不可定义
  let sumVarItem = 0;
  for (const t of tasks) {
    const xs = models.map((md) => scoreAt(md, t));
    const meanI = xs.reduce((s, x) => s + x, 0) / m;
    sumVarItem += xs.reduce((s, x) => s + (x - meanI) ** 2, 0) / m;
  }
  const alpha = (k / (k - 1)) * (1 - sumVarItem / varT);
  return { alpha: Math.round(alpha * 100) / 100, k, m };
}
