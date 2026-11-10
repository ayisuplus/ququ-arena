import { isAnswered } from './record-state.ts';
/**
 * IRT Rasch 1PL 测量模型 —— 题目难度与蛐蛐能力的联合估计
 *
 * 模型：P(蛐蛐 m 答对题 i) = σ(θ_m − b_i)，θ=能力，b=难度，同一 logit 量纲可比。
 * 估计：交替 Newton（固定 b 求 θ、固定 θ 求 b），b 居中（均值 0）定标；
 * L2 正则（λ=0.5）向 0 收缩——全对/全错题的参数在 MLE 下发散（分离问题），
 * 正则化让它们停在有限值而不是 ±∞。
 *
 * 输入：历史战绩的逐题得分；得分离散化 score≥0.5 → 1（连续分给二值化，
 * 文献标准做法；部分给分信息损失已在方法学文档明示）。
 */
export interface RaschFit {
  /** 蛐蛐能力（logit，越大越强） */
  theta: Map<string, number>;
  /** 题目难度（logit，越大越难；均值 0 定标） */
  difficulty: Map<string, number>;
  iterations: number;
  converged: boolean;
  n: number; // 观测数
}

interface Obs {
  m: number; // 蛐蛐索引
  i: number; // 题目索引
  y: number; // 0/1
}

const L2 = 0.5;
const CLAMP = 4; // logit 截断：±4 已覆盖 98%/2% 的概率边界

const sig = (x: number) => 1 / (1 + Math.exp(-x));

/** Newton 单参数步：θ ← θ + (Σ(y−p)) / (Σp(1−p) + L2) − λθ 项并入 */
function solveTheta(obs: Obs[], theta: number[], b: number[]): void {
  const n = theta.length;
  const grad = new Array<number>(n).fill(0);
  const hess = new Array<number>(n).fill(0);
  for (const { m, i, y } of obs) {
    const p = sig(theta[m]! - b[i]!);
    grad[m]! += y - p;
    hess[m]! += p * (1 - p);
  }
  for (let m = 0; m < n; m++) {
    // L2 正则：梯度 −λθ，Hessian −λ
    const g = grad[m]! - L2 * theta[m]!;
    const h = hess[m]! + L2;
    theta[m] = clamp(theta[m]! + g / h);
  }
}

function solveB(obs: Obs[], theta: number[], b: number[]): void {
  const n = b.length;
  const grad = new Array<number>(n).fill(0);
  const hess = new Array<number>(n).fill(0);
  for (const { m, i, y } of obs) {
    const p = sig(theta[m]! - b[i]!);
    grad[i]! -= y - p; // d/db = −(y−p)
    hess[i]! += p * (1 - p);
  }
  for (let i = 0; i < n; i++) {
    const g = grad[i]! - L2 * b[i]!;
    const h = hess[i]! + L2;
    b[i] = clamp(b[i]! + g / h);
  }
  // b 居中定标（θ 平移等价，惯例固定难度均值为 0）
  const mean = b.reduce((s, x) => s + x, 0) / n;
  for (let i = 0; i < n; i++) b[i]! -= mean;
}

function clamp(x: number): number {
  return Math.max(-CLAMP, Math.min(CLAMP, x));
}

export function fitRasch(
  records: { model: string; taskId: string; score: number; error?: string }[],
  opts: { maxIter?: number; tol?: number } = {},
): RaschFit {
  const ok = records.filter(isAnswered);
  const models = [...new Set(ok.map((r) => r.model))];
  const taskIds = [...new Set(ok.map((r) => r.taskId))];
  const mIdx = new Map(models.map((m, i) => [m, i]));
  const tIdx = new Map(taskIds.map((t, i) => [t, i]));
  const obs: Obs[] = ok.map((r) => ({ m: mIdx.get(r.model)!, i: tIdx.get(r.taskId)!, y: r.score >= 0.5 ? 1 : 0 }));

  const theta = new Array<number>(models.length).fill(0);
  const b = new Array<number>(taskIds.length).fill(0);
  const maxIter = opts.maxIter ?? 200;
  const tol = opts.tol ?? 1e-3;
  let converged = false;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    const prevT = [...theta];
    const prevB = [...b];
    solveTheta(obs, theta, b);
    solveB(obs, theta, b);
    const maxDelta = Math.max(
      ...theta.map((t, i) => Math.abs(t - prevT[i]!)),
      ...b.map((x, i) => Math.abs(x - prevB[i]!)),
    );
    if (maxDelta < tol) {
      converged = true;
      break;
    }
  }
  return {
    theta: new Map(models.map((m, i) => [m, Math.round(theta[i]! * 1000) / 1000])),
    difficulty: new Map(taskIds.map((t, i) => [t, Math.round(b[i]! * 1000) / 1000])),
    iterations: obs.length ? (converged ? iter + 1 : iter) : 0, // 未收敛报实际轮数，空输入报 0（此前统一 +1 多报——审查实证）
    converged,
    n: obs.length,
  };
}
