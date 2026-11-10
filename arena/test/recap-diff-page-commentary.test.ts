/**
 * v1.3 契约测试：赛季回顾聚合、diff 对比页渲染、解说措辞轮换确定性
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ArenaDef, BattleResult } from '../src/types.ts';
import { recapData, renderRecap } from '../src/recap.ts';
import { diffBattles, renderDiff } from '../src/diff.ts';
import { commentate } from '../src/commentary.ts';
import { buildLeaderboard } from '../src/leaderboard.ts';
import type { CareerBook } from '../src/career.ts';

test('赛季回顾：冠军/涨幅/跌幅/全勤/新秀各归其位', () => {
  const book: CareerBook = {
    version: 1,
    entries: {
      king: {
        id: 'king',
        name: '王者',
        battles: 5,
        titles: 4,
        podiums: 5,
        elo: 2000,
        answered: 50,
        scoreSum: 45,
        byCondition: {},
        lastBattleAt: '2026-09-01T00:00:00Z',
        seasons: { '2026-Q3': { battles: 5, titles: 4, elo: 2000 } },
        history: [
          { at: '2026-09-01T00:00:00Z', arena: 't', avg: 0.9, place: 1, field: 3, delta: 200, season: '2026-Q3' },
          { at: '2026-09-02T00:00:00Z', arena: 't', avg: 0.9, place: 1, field: 3, delta: 200, season: '2026-Q3' },
        ],
      },
      vet: {
        id: 'vet',
        name: '老兵',
        battles: 8,
        titles: 1,
        podiums: 4,
        elo: 1600,
        answered: 80,
        scoreSum: 56,
        byCondition: {},
        lastBattleAt: '2026-09-01T00:00:00Z',
        seasons: { '2026-Q3': { battles: 8, titles: 1, elo: 1600 } },
        history: [
          { at: '2026-09-01T00:00:00Z', arena: 't', avg: 0.7, place: 2, field: 3, delta: -50, season: '2026-Q3' },
        ],
      },
      faller: {
        id: 'faller',
        name: '倒霉蛋',
        battles: 3,
        titles: 0,
        podiums: 0,
        elo: 900,
        answered: 30,
        scoreSum: 3,
        byCondition: {},
        lastBattleAt: '2026-09-01T00:00:00Z',
        seasons: { '2026-Q3': { battles: 3, titles: 0, elo: 900 } },
        history: [
          { at: '2026-09-01T00:00:00Z', arena: 't', avg: 0.1, place: 3, field: 3, delta: -300, season: '2026-Q3' },
        ],
      },
    },
  };
  const rec = recapData(book, '2026-Q3');
  assert.equal(rec.champion!.id, 'king');
  assert.equal(rec.riser!.id, 'king', '净涨最多者');
  assert.equal(rec.faller!.id, 'faller');
  assert.equal(rec.workhorse!.id, 'vet', '场次最多者');
  // king 的首场在 Q3 → 新秀；vet/faller 也是（history[0].season 都是 Q3）——本测试三场都在 Q3
  assert.ok(rec.rookies.length === 3);
  const html = renderRecap(rec);
  for (const needle of ['赛季冠军', '最大涨幅', '最大跌幅', '全勤奖', '赛季总榜', '王者']) {
    assert.ok(html.includes(needle), `回顾页缺少 ${needle}`);
  }
  // 空赛季
  assert.equal(recapData(book, '2026-Q1').rows.length, 0);
});

function mkBattle(scores: Record<string, number[]>, fp = 'fp1'): BattleResult {
  const records = Object.entries(scores).flatMap(([model, arr]) =>
    arr.map((score, i) => ({
      taskId: `t${i}`,
      condition: 'c1',
      model,
      prompt: '',
      answer: '',
      score,
      latencyMs: 1,
    })),
  );
  return {
    arena: { name: 't', title: '测试罐', description: '', judge: { kind: 'exact' } } as ArenaDef,
    startedAt: '2026-09-10T00:00:00.000Z',
    durationMs: 1,
    contestants: Object.keys(scores).map((id) => ({ id, name: id, kind: 'mock' as const })),
    records,
    meta: { arenaFingerprint: fp, judgeModels: ['j'], toolVersion: '1.3.0' },
  };
}

test('diff 对比页：CI 区间条/判定徽章/指纹/摆动表齐全', () => {
  const a = mkBattle({ x: Array.from({ length: 12 }, () => 0) });
  const b = mkBattle({ x: Array.from({ length: 12 }, () => 1) });
  const rep = diffBattles(a, b);
  const html = renderDiff(a, b, rep);
  for (const needle of ['同 卷 对 比', 'fp1', 'cibar', '本卷得分上升', '摆动题', '不同卷的分数不可比']) {
    assert.ok(html.includes(needle), `对比页缺少 ${needle}`);
  }
});

test('解说措辞轮换：同场确定、不同场可变、关键词不变', () => {
  const b1 = mkBattle({ x: Array.from({ length: 12 }, () => 1), y: Array.from({ length: 12 }, () => 1) });
  const b2 = { ...b1, startedAt: '2026-09-11T00:00:00.000Z' };
  const l1 = commentate(b1, buildLeaderboard(b1), new Map());
  const l1again = commentate(b1, buildLeaderboard(b1), new Map());
  assert.deepEqual(l1, l1again, '同一场解说必须逐字可复现');
  // 神仙打架两种措辞都含"神仙打架"关键词（契约是判定+关键词，不是整句）
  const l2 = commentate(b2 as BattleResult, buildLeaderboard(b2 as BattleResult), new Map());
  assert.ok(
    l2.some((l) => l.includes('神仙打架')),
    '换场解说仍含判定关键词',
  );
});
