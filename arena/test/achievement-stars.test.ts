/**
 * 成就星级契约：星级=纯函数从已有数据推导（count 条数 / cumulative 累计量 / once 封顶），
 * 旧档案一枚一条自动=1 星；星级只升不降；图鉴点数与藏家称号按总星数。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArenaDef, BattleResult, BoardEntry } from '../src/types.ts';
import type { CareerEntry } from '../src/career.ts';
import { checkAchievements, starsOf, codexOf, ACHIEVEMENTS, type AchievementCtx } from '../src/achievements.ts';
import { loadCareer, settleBattle } from '../src/career-store.ts';

const def: ArenaDef = { name: 't', title: '测试罐', description: 'd', judge: { kind: 'exact' } };
const mk = (model: string, avg: number, answered = 10): BoardEntry => ({
  model,
  name: model,
  avg,
  byCondition: {},
  answered,
  errors: 0,
  elo: 1500 + avg,
  avgLatencyMs: 0,
});
const result = (at = '2026-09-25T00:00:00.000Z'): BattleResult => ({
  arena: def,
  startedAt: at,
  durationMs: 1,
  contestants: [],
  records: [],
});
const entryOf = (over: Partial<CareerEntry> = {}): CareerEntry => ({
  id: 'me',
  name: 'me',
  battles: 1,
  titles: 0,
  podiums: 0,
  elo: 1500,
  answered: 10,
  scoreSum: 10,
  byCondition: {},
  lastBattleAt: '',
  ...over,
});

test('count 成就按达成次数升星 [1,3,5]，旧档案一枚一条=1 星', () => {
  const hits = (n: number) =>
    entryOf({ achievements: Array.from({ length: n }, (_, i) => ({ id: 'flawless', at: `t${i}`, arena: 't' })) });
  assert.equal(starsOf(hits(1), 'flawless'), 1);
  assert.equal(starsOf(hits(2), 'flawless'), 1);
  assert.equal(starsOf(hits(3), 'flawless'), 2);
  assert.equal(starsOf(hits(5), 'flawless'), 3);
  assert.equal(starsOf(hits(9), 'flawless'), 3, '满星封顶');
  assert.equal(starsOf(entryOf(), 'flawless'), 0);
});

test('cumulative 成就按累计量升星（三冠王 3/6/10 冠），单调只升不降', () => {
  assert.equal(starsOf(entryOf({ titles: 2 }), 'three_titles'), 0);
  assert.equal(starsOf(entryOf({ titles: 3 }), 'three_titles'), 1);
  assert.equal(starsOf(entryOf({ titles: 6 }), 'three_titles'), 2);
  assert.equal(starsOf(entryOf({ titles: 10 }), 'three_titles'), 3);
  assert.equal(starsOf(entryOf({ podiums: 5 }), 'podium_regular'), 1);
  assert.equal(starsOf(entryOf({ podiums: 25 }), 'podium_regular'), 3);
  const history = Array.from({ length: 50 }, (_, i) => ({
    at: `t${i}`,
    arena: 't',
    avg: 1,
    place: 1,
    field: 3,
    delta: 1,
  }));
  assert.equal(starsOf(entryOf({ history }), 'ten_battles'), 3);
});

test('once 成就 1 星封顶', () => {
  const e = entryOf({
    achievements: [
      { id: 'first_title', at: 't1', arena: 't' },
      { id: 'first_title', at: 't2', arena: 't' },
    ],
  });
  assert.equal(starsOf(e, 'first_title'), 1);
  assert.equal(starsOf(entryOf(), 'first_title'), 0);
});

test('万劫不复是「跌入」事件：连续低位场不重复记，回升再跌记第二次', () => {
  const board = [mk('me', 0), mk('other', 1)];
  const ctx = (elo: number, preElo: number): AchievementCtx => ({
    entry: entryOf({ elo }),
    isDebut: false,
    rankIdx: 0,
    board,
    result: result(),
    preElo: new Map([
      ['me', preElo],
      ['other', 1500],
    ]),
  });
  assert.ok(checkAchievements(ctx(950, 1500)).includes('rock_bottom'), '1500→950 首次跌入');
  assert.ok(!checkAchievements(ctx(950, 980)).includes('rock_bottom'), '连续低位不再记');
  assert.ok(checkAchievements(ctx(950, 1050)).includes('rock_bottom'), '回升后再跌=第二次');
});

test('settleOnBook 产出升星明细（starsUp from→to），count 组每次达成都入账', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'stars-'));
  try {
    // 三人场夺冠且场均 ≥99%（8 题以上）→ flawless 达成；连续 3 场 → 2 星
    for (let i = 0; i < 3; i++) {
      await settleBattle(result(`2026-09-2${i}T00:00:00.000Z`), [mk('me', 0.995, 10), mk('a', 0.5), mk('b', 0.5)], dir);
    }
    const book = await loadCareer(dir);
    const me = book.entries['me']!;
    const hits = (me.achievements ?? []).filter((a) => a.id === 'flawless');
    assert.equal(hits.length, 3, '三场达成三条记录');
    assert.equal(starsOf(me, 'flawless'), 2);
    assert.equal(starsOf(me, 'first_title'), 1, '首冠解锁新王登基');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('starsUp 只在升星时出现（满星后再达成不给明细）', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'stars2-'));
  try {
    const deltas0 = await settleBattle(
      result('2026-09-25T00:00:00.000Z'),
      [mk('me', 0.995, 10), mk('a', 0.5), mk('b', 0.5)],
      dir,
    );
    assert.deepEqual(
      deltas0
        .find((d) => d.id === 'me')!
        .starsUp!.map((s) => [s.id, s.from, s.to])
        .sort(),
      [
        ['debut_champion', 0, 1],
        ['executioner', 0, 1],
        ['first_title', 0, 1],
        ['flawless', 0, 1],
      ],
      '解锁即升到 1 星（首秀夺冠顺带天降神兵/屠杀局）',
    );
    // 预置到 5 次 flawless（满星）后第 6 次达成：newAchievements 有记录但无升星
    const book = await loadCareer(dir);
    const me = book.entries['me']!;
    me.achievements = [
      ...(me.achievements ?? []),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 'flawless', at: `x${i}`, arena: 't' })),
    ];
    const { settleOnBook } = await import('../src/career.ts');
    const board = [mk('me', 0.995, 10), mk('a', 0.5), mk('b', 0.5)];
    const deltas = settleOnBook(result('2026-09-26T00:00:00.000Z'), board, book);
    const d = deltas.find((x) => x.id === 'me')!;
    assert.equal(starsOf(book.entries['me']!, 'flawless'), 3);
    assert.ok(d.newAchievements.includes('flawless'), '满星后仍记达成');
    assert.ok(!(d.starsUp ?? []).some((s) => s.id === 'flawless'), '满星无升星明细');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('图鉴点数=总星数，藏家称号按档（纯荣誉不进竞技数值）', () => {
  const full = entryOf({
    titles: 10,
    podiums: 25,
    history: Array.from({ length: 50 }, (_, i) => ({ at: `t${i}`, arena: 't', avg: 1, place: 1, field: 3, delta: 1 })),
    achievements: Object.keys(ACHIEVEMENTS).flatMap((id) =>
      Array.from({ length: ACHIEVEMENTS[id]!.kind === 'count' ? 5 : 1 }, (_, i) => ({ id, at: `t${i}`, arena: 't' })),
    ),
  });
  const fullCodex = codexOf(full);
  assert.equal(fullCodex.score, 29, '满分 29 星（once 3 枚×1 + count 6 枚×3 + cumulative 3 枚×3）');
  assert.equal(fullCodex.title, '活体图鉴');
  assert.equal(codexOf(entryOf()).score, 0);
  assert.equal(codexOf(entryOf()).title, '未入门');
  const starter = entryOf({
    titles: 3,
    podiums: 5,
    history: Array.from({ length: 10 }, (_, i) => ({ at: `t${i}`, arena: 't', avg: 1, place: 1, field: 3, delta: 1 })),
  });
  assert.equal(codexOf(starter).score, 3, '三冠+五上台+十场=3 星');
  assert.equal(codexOf(starter).title, '图鉴学徒');
});
