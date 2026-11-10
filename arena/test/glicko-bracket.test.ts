/**
 * v1.1 契约测试：Glicko-2 评级性质、淘汰赛种子配对与平局下克上
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glickoUpdate, gamesFromBoard, DEFAULT_RATING } from '../src/glicko.ts';
import { seedPairs, decideWinner } from '../src/bracket.ts';
import type { Contestant } from '../src/types.ts';

test('Glicko：赢强手涨分、输弱手掉分、RD 随对局收窄', () => {
  const weak = { r: 1400, rd: 80, sigma: 0.06 };
  const strong = { r: 1700, rd: 80, sigma: 0.06 };
  const win = glickoUpdate(DEFAULT_RATING, [{ rj: strong.r, rdj: strong.rd, s: 1 }]);
  assert.ok(win.r > 1500, '赢强手必须涨分');
  assert.ok(win.rd < 350, '有对局后 RD 必须收窄');
  const loss = glickoUpdate(DEFAULT_RATING, [{ rj: weak.r, rdj: weak.rd, s: 0 }]);
  assert.ok(loss.r < 1500, '输弱手必须掉分');
  // 赢强手比赢弱手涨得多
  const winWeak = glickoUpdate(DEFAULT_RATING, [{ rj: weak.r, rdj: weak.rd, s: 1 }]);
  assert.ok(win.r > winWeak.r, '爆冷赢强手应比赢弱手涨得多');
});

test('Glicko：平局锚点——等强对手战平，μ 不动、RD 收窄', () => {
  const peer = { r: 1500, rd: 350, sigma: 0.06 };
  const out = glickoUpdate(DEFAULT_RATING, [{ rj: peer.r, rdj: peer.rd, s: 0.5 }]);
  assert.equal(out.r, 1500, '等强战平 μ 必须不动');
  assert.ok(out.rd < 350, '平局也提供信息：RD 收窄');
});

test('Glicko：不参赛只涨 RD（不确定性回升），μ/σ 不变', () => {
  const r = glickoUpdate(DEFAULT_RATING, []);
  assert.equal(r.r, 1500);
  assert.ok(r.rd >= 350);
  assert.equal(r.sigma, DEFAULT_RATING.sigma);
});

test('gamesFromBoard：两两对决含平局，胜者记 1、平各 0.5', () => {
  const board = [
    { model: 'a', avg: 0.9 },
    { model: 'b', avg: 0.9 },
    { model: 'c', avg: 0.2 },
  ];
  const games = gamesFromBoard(board, () => DEFAULT_RATING);
  // a 对 c 胜、b 对 c 胜、a/b 平
  assert.equal(games.get('a')!.find((g) => g.s === 0.5) !== undefined, true, 'a 与 b 之间必须有平局记录');
  assert.ok(
    games.get('a')!.some((g) => g.s === 1),
    'a 必须压过 c',
  );
  assert.ok(
    games.get('c')!.every((g) => g.s === 0),
    'c 全负',
  );
});

test('淘汰赛种子配对：1vN、2v(N-1)', () => {
  const c = (id: string): Contestant => ({ id, name: id, kind: 'mock' });
  const seeded = [c('s1'), c('s2'), c('s3'), c('s4')];
  const pairs = seedPairs(seeded);
  assert.deepEqual(
    pairs.map(([a, b]) => [a.id, b.id]),
    [
      ['s1', 's4'],
      ['s2', 's3'],
    ],
  );
});

test('平局去逆激励：avg 相同无逐题区分 → 生涯 Elo 高者晋级（低身价不再有平局优势）', () => {
  const c = (id: string): Contestant => ({ id, name: id, kind: 'mock' });
  const a = c('fav');
  const b = c('dog');
  const board = [
    { model: 'fav', name: 'fav', avg: 0.5, byCondition: {}, answered: 4, errors: 0, elo: 1500, avgLatencyMs: 0 },
    { model: 'dog', name: 'dog', avg: 0.5, byCondition: {}, answered: 4, errors: 0, elo: 1500, avgLatencyMs: 0 },
  ];
  const pre = new Map([
    ['fav', 2000],
    ['dog', 1200],
  ]);
  // 逐题完全无区分（全同分）→ 落到身价决胜：高者晋级、不报爆冷
  const flat = ['t1', 't2', 't3', 't4'].flatMap((taskId) => [
    { taskId, condition: 'c', model: 'fav', prompt: 'p', answer: 'a', score: 0.5, latencyMs: 0 },
    { taskId, condition: 'c', model: 'dog', prompt: 'p', answer: 'a', score: 0.5, latencyMs: 0 },
  ]);
  const d = decideWinner(a, b, board, pre, flat);
  assert.equal(d.winnerId, 'fav', 'avg 平且小分平 → 高身价晋级（逆激励已去）');
  assert.ok(!d.upset, '高身价晋级不得标爆冷');
  // 不同分：正常晋级
  const board2 = board.map((e) => (e.model === 'fav' ? { ...e, avg: 0.8 } : e));
  const d2 = decideWinner(a, b, board2, pre);
  assert.equal(d2.winnerId, 'fav');
  assert.ok(!d2.upset);
});

test('平局小分决胜：单题胜出数多者晋级，低身价爆冷标 upset；再平比最高单题分', () => {
  const c = (id: string): Contestant => ({ id, name: id, kind: 'mock' });
  const a = c('fav');
  const b = c('dog');
  const board = [
    { model: 'fav', name: 'fav', avg: 0.5, byCondition: {}, answered: 3, errors: 0, elo: 1500, avgLatencyMs: 0 },
    { model: 'dog', name: 'dog', avg: 0.5, byCondition: {}, answered: 3, errors: 0, elo: 1500, avgLatencyMs: 0 },
  ];
  const pre = new Map([
    ['fav', 2000],
    ['dog', 1200],
  ]);
  const rec = (model: string, taskId: string, score: number) => ({
    taskId,
    condition: 'c',
    model,
    prompt: 'p',
    answer: 'a',
    score,
    latencyMs: 0,
  });
  // 小分 2:1 → dog 晋级（低身价＝爆冷）
  const small = [
    rec('fav', 't1', 0.9),
    rec('dog', 't1', 0.3),
    rec('fav', 't2', 0.4),
    rec('dog', 't2', 0.6),
    rec('fav', 't3', 0.2),
    rec('dog', 't3', 0.7),
  ];
  const d = decideWinner(a, b, board, pre, small);
  assert.equal(d.winnerId, 'dog', '小分多者晋级');
  assert.ok(d.upset, '低身价靠小分晋级必须标爆冷');
  // 小分 1:1 → 最高单题分决胜（fav 0.9 > dog 0.8）
  const best = [rec('fav', 't1', 0.9), rec('dog', 't1', 0.3), rec('fav', 't2', 0.2), rec('dog', 't2', 0.8)];
  const d2 = decideWinner(a, b, board, pre, best);
  assert.equal(d2.winnerId, 'fav', '小分平 → 最高单题分高者晋级');
  assert.ok(!d2.upset);
});
