import test from 'node:test';
import assert from 'node:assert/strict';
import { stableView, type CareerBook, type CareerEntry } from '../src/career.ts';
import { conservativeRating, isProvisional, winProbability, DEFAULT_RATING } from '../src/glicko.ts';

const entry = (id: string, elo: number, glicko?: CareerEntry['glicko']): CareerEntry => ({
  id,
  name: id,
  battles: 3,
  titles: 0,
  podiums: 0,
  elo,
  answered: 10,
  scoreSum: 5,
  byCondition: {},
  lastBattleAt: '2026-09-01T00:00:00Z',
  ...(glicko ? { glicko } : {}),
});

test('总榜按 Glicko 保守估计排序，不按随场次累加的积分', () => {
  const book: CareerBook = {
    version: 1,
    entries: {
      grinder: entry('grinder', 58000, { r: 1550, rd: 60, sigma: 0.06 }), // 出场多、积分虚高，实力一般
      strong: entry('strong', 1700, { r: 1780, rd: 80, sigma: 0.06 }),
      lucky: entry('lucky', 1650, { r: 1900, rd: 320, sigma: 0.06 }), // 一场好运，不确定度大
      fresh: entry('fresh', 1500), // 旧档案无 glicko，按默认评级
      loser: entry('loser', 1149, { r: 1262, rd: 254, sigma: 0.06 }), // 真打过、输了，保守估计低于先验
      forfeit: { ...entry('forfeit', 1500, { r: 1500, rd: 350, sigma: 0.06 }), answered: 0, scoreSum: 0 }, // 全部弃权，没有观测
    },
  };
  const rows = stableView(book);
  assert.deepEqual(
    rows.map((r) => r.id),
    ['strong', 'grinder', 'lucky', 'fresh', 'loser', 'forfeit'],
    '全弃权者即使先验更高也排最后',
  );
  assert.deepEqual(
    rows.map((r) => r.provisional),
    [false, false, true, true, true, true],
  );
  assert.equal(rows[0]!.rating, 1780 - 160);
});

test('Glicko 辅助函数：保守估计、暂定阈值、对局胜率', () => {
  assert.equal(conservativeRating(), DEFAULT_RATING.r - 2 * DEFAULT_RATING.rd);
  assert.equal(isProvisional({ r: 1500, rd: 200, sigma: 0.06 }), false);
  assert.equal(isProvisional({ r: 1500, rd: 201, sigma: 0.06 }), true);
  const a = { r: 1700, rd: 50, sigma: 0.06 },
    b = { r: 1500, rd: 50, sigma: 0.06 };
  assert.ok(Math.abs(winProbability(a, b) + winProbability(b, a) - 1) < 1e-12, '对称');
  assert.ok(winProbability(a, b) > 0.7 && winProbability(a, b) < 0.8, '200 分差约 0.75');
  assert.equal(winProbability(), 0.5);
  // 不确定度越大，预测越接近五五开
  assert.ok(winProbability({ ...a, rd: 350 }, { ...b, rd: 350 }) < winProbability(a, b));
});
