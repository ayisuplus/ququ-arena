/**
 * Glicko-2 评级 —— 学术标准的 μ/φ/σ（评价值/偏差/波动率）
 *
 * 与生涯 Elo 的分工：Elo 驱动段位与游戏叙事（娱乐层）；
 * Glicko 给研究者一个带不确定性（RD）的诚实评级——场次越少 φ 越大，
 * "身价不明"在数学上是"φ 还没收窄"，而不是一句文案。
 *
 * 实现依据 Glickman 规范（glicko.net/glicko/glicko2.pdf）：
 * 常数 q=ln(10)/400，量纲换算 173.7178；τ（系统波动）取 0.5（常规选择）；
 * σ 更新用 Illinois 迭代，初值 σ=0.06。
 */

const SCALE = 173.7178;
const TAU = 0.5;
const EPS = 1e-6;

export interface GlickoRating {
  /** 1500 量纲的评价值 */
  r: number;
  /** 评级偏差（越小越确定） */
  rd: number;
  /** 波动率 */
  sigma: number;
}

export const DEFAULT_RATING: GlickoRating = { r: 1500, rd: 350, sigma: 0.06 };

/** 一场比赛的对手战绩：对手当前评级 + 我对他的得分（1 胜 / 0.5 平 / 0 负） */
export interface GlickoGame {
  rj: number;
  rdj: number;
  s: number;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function eScore(mu: number, muj: number, phij: number): number {
  return 1 / (1 + Math.exp(-g(phij) * (mu - muj)));
}

/** Illinois 算法求 σ'（Glickman 规范 step 5） */
function newSigma(sigma: number, phi: number, v: number, delta: number): number {
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) ** 2;
    return num / den - (x - a) / (TAU * TAU);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    // Glickman 规范 step 5.2：B = ln(Δ²−φ²−v)，保证 f(A)·f(B)≤0 夹逼（此前 a−ln(√…) 的取法在爆冷常态下夹逼失败，σ 假收敛冻结——审查实证）
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPS) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.min(2, Math.max(0.01, Math.exp(A / 2))); // σ' 显式钳位，吸收极端 Δ 的病态输入
}

/**
 * 用一个评分期（一场比赛的全部对局）更新评级。
 * games 为空 → 只涨 RD（不参赛不确定性回升），μ/σ 不变。
 */
export function glickoUpdate(rating: GlickoRating, games: GlickoGame[]): GlickoRating {
  if (!games.length) {
    return {
      ...rating,
      rd: Math.min(350, Math.sqrt(rating.rd * rating.rd + rating.sigma * rating.sigma * SCALE * SCALE)),
    };
  }
  const mu = (rating.r - 1500) / SCALE;
  const phi = rating.rd / SCALE;

  let vInv = 0;
  let deltaSum = 0;
  for (const gm of games) {
    const muj = (gm.rj - 1500) / SCALE;
    const phij = gm.rdj / SCALE;
    const gg = g(phij);
    const E = eScore(mu, muj, phij);
    vInv += gg * gg * E * (1 - E);
    deltaSum += gg * (gm.s - E);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  const sigmaP = newSigma(rating.sigma, phi, v, delta);
  const phiStar = Math.sqrt(phi * phi + sigmaP * sigmaP);
  const phiP = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muP = mu + phiP * phiP * deltaSum;

  return {
    r: Math.round(muP * SCALE + 1500),
    rd: Math.round(phiP * SCALE * 10) / 10,
    sigma: Math.round(sigmaP * 10000) / 10000,
  };
}

/** 从排行榜构造每只蛐蛐的对局表：同场两两对决，avg 高者胜（平 0.5） */
export function gamesFromBoard(
  board: { model: string; avg: number }[],
  ratingsOf: (id: string) => GlickoRating,
): Map<string, GlickoGame[]> {
  const out = new Map<string, GlickoGame[]>();
  for (const e of board) out.set(e.model, []);
  for (let i = 0; i < board.length; i++) {
    for (let j = i + 1; j < board.length; j++) {
      const a = board[i]!;
      const b = board[j]!;
      // 全弃权（avg=NaN，没有有效作答）不构成对局——"没打"不涨不掉，只走闲置 RD 回升
      if (Number.isNaN(a.avg) || Number.isNaN(b.avg)) continue;
      const [sa, sb] = a.avg > b.avg ? [1, 0] : a.avg === b.avg ? [0.5, 0.5] : [0, 1];
      const ra = ratingsOf(a.model);
      const rb = ratingsOf(b.model);
      out.get(a.model)!.push({ rj: rb.r, rdj: rb.rd, s: sa });
      out.get(b.model)!.push({ rj: ra.r, rdj: ra.rd, s: sb });
    }
  }
  return out;
}

/** 不确定度超过此值（±2RD 超过 400 分）的评级只作参考，界面标"暂定" */
export const PROVISIONAL_RD = 200;

/** 保守估计 r − 2·RD：排序依据——场次少、不确定度大的模型不会因一两场好运排到前面 */
export function conservativeRating(rating: GlickoRating = DEFAULT_RATING): number {
  return rating.r - 2 * rating.rd;
}

export function isProvisional(rating: GlickoRating = DEFAULT_RATING): boolean {
  return rating.rd > PROVISIONAL_RD;
}

/** a 对 b 单场胜出的预期概率：双方偏差合并进 g(φ)（Glickman 对两名选手对局的预测式） */
export function winProbability(a: GlickoRating = DEFAULT_RATING, b: GlickoRating = DEFAULT_RATING): number {
  return eScore((a.r - 1500) / SCALE, (b.r - 1500) / SCALE, Math.hypot(a.rd, b.rd) / SCALE);
}
