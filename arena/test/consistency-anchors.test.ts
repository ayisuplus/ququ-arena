/**
 * v3.23 契约：声明-实现一致性锚定——把审查发现的对齐漂移永久钉成机器可验的测试
 * 三轮审查的教训：这类 bug 的根治不是修，是让「注释声明」与实现之间永远有机器可验的锚。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oddsFromElo } from '../src/odds.ts';
import { glickoUpdate, DEFAULT_RATING } from '../src/glicko.ts';
import { gapCI } from '../src/stats.ts';
import { recordState, displayMark } from '../src/record-state.ts';

test('声明锚定：odds 兑现 Elo 同源——Δ400 夺冠概率比 = 10（v3.20 修复的回归锚）', () => {
  const [a, b] = oddsFromElo([
    { name: 'a', elo: 1900 },
    { name: 'b', elo: 1500 },
  ]);
  // E = 1/(1+10^(-Δ/400))：Δ400 → E=10/11 ≈ 0.909；多路 softmax 下概率比恒 10
  const ratio = a!.prob / b!.prob;
  assert.ok(Math.abs(ratio - 10) < 0.1, `Δ400 必须给 10 倍概率比（实得 ${ratio}）——odds.ts 头注释声明`);
});

test('声明锚定：glicko 与「从 Glickman 规范独立书写的参考实现」逐位一致（不押任何人记的论文常数）', () => {
  // 参考实现：直接按 glicko2.pdf 步骤书写（与本仓 src 零共享——任何一边偏离规范都会现形）
  const SCALE = 173.7178;
  const TAU = 0.5;
  const ref = (rating: { r: number; rd: number; sigma: number }, games: { rj: number; rdj: number; s: number }[]) => {
    const mu = (rating.r - 1500) / SCALE,
      phi = rating.rd / SCALE,
      sig = rating.sigma;
    const g = (p: number) => 1 / Math.sqrt(1 + (3 * p * p) / (Math.PI * Math.PI));
    const E = (m: number, mj: number, pj: number) => 1 / (1 + Math.exp(-g(pj) * (m - mj)));
    let vInv = 0,
      dSum = 0;
    for (const gm of games) {
      const mj = (gm.rj - 1500) / SCALE,
        pj = gm.rdj / SCALE,
        gg = g(pj),
        e = E(mu, mj, pj);
      vInv += gg * gg * e * (1 - e);
      dSum += gg * (gm.s - e);
    }
    const v = 1 / vInv,
      delta = v * dSum;
    const a = Math.log(sig * sig);
    const f = (x: number) =>
      (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) / (2 * (phi * phi + v + Math.exp(x)) ** 2) -
      (x - a) / (TAU * TAU);
    let A = a,
      B: number;
    if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
    else {
      let k = 1;
      while (f(a - k * TAU) < 0) k++;
      B = a - k * TAU;
    }
    let fA = f(A),
      fB = f(B);
    while (Math.abs(B - A) > 1e-6) {
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
    const sigP = Math.exp(A / 2);
    const phiStar = Math.sqrt(phi * phi + sigP * sigP);
    const phiP = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    const muP = mu + phiP * phiP * dSum;
    return { r: muP * SCALE + 1500, rd: phiP * SCALE, sigma: sigP };
  };
  const cases: { rj: number; rdj: number; s: number }[][] = [
    [
      { rj: 1400, rdj: 30, s: 1 },
      { rj: 1550, rdj: 70, s: 0 },
      { rj: 1700, rdj: 25, s: 0 },
    ],
    [{ rj: 1500, rdj: 350, s: 1 }],
    [
      { rj: 2400, rdj: 40, s: 0 },
      { rj: 1500, rdj: 200, s: 1 },
    ],
  ];
  for (const games of cases) {
    const mine = glickoUpdate(DEFAULT_RATING, games);
    const spec = ref(DEFAULT_RATING, games);
    assert.ok(Math.abs(mine.r - Math.round(spec.r)) <= 1, `r 偏离参考实现：${mine.r} vs ${spec.r.toFixed(1)}`);
    assert.ok(Math.abs(mine.rd - spec.rd) <= 1, `rd 偏离参考实现：${mine.rd} vs ${spec.rd.toFixed(1)}`);
    assert.ok(Math.abs(mine.sigma - spec.sigma) <= 0.002, `σ 偏离参考实现：${mine.sigma} vs ${spec.sigma.toFixed(4)}`);
  }
});

test('声明锚定：gapCI 零/单配对样本返回 undefined（无配对数据不做结论——v3.20 修复的回归锚）', () => {
  // 零配对：两人错题集合不相交
  const none = gapCI(
    [
      { model: 'a', taskId: 't1', score: 1 },
      { model: 'b', taskId: 't2', score: 0 },
    ],
    'a',
    'b',
  );
  assert.equal(none, undefined, '零配对必须 undefined（曾返回 {0,0} 被判含 0 误导加赛/解说）');
  // 单配对
  const one = gapCI(
    [
      { model: 'a', taskId: 't1', score: 1 },
      { model: 'b', taskId: 't1', score: 0 },
    ],
    'a',
    'b',
  );
  assert.equal(one, undefined, '单配对必须 undefined（bootstrap 恒等于该题分差，曾被报成「显著」）');
});

test('声明锚定：recordState 三态在产生点定型（弃权语义单一闸门的回归锚）', () => {
  assert.equal(recordState({}), 'answered', '无 error 即有效作答');
  assert.equal(recordState({ error: 'boom' }), 'abstain', 'error 无裁判备注 = 蛐蛐弃权');
  assert.equal(
    recordState({ error: 'boom', note: '裁判弃权（调用失败）' }),
    'judge-abstain',
    '裁判故障 = 裁判弃权（保留答案可重判）',
  );
  // displayMark 与三态的映射
  assert.equal(displayMark({ score: 1 }), '✓');
  assert.equal(displayMark({ error: 'x', score: 0 }), '💨');
  assert.equal(displayMark({ score: 0.5 }), '½');
});
