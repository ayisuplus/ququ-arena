/**
 * 宿敌复仇契约：rivals.streak（对它的连胜+/连败-）随名次翻转；
 * 复仇事件（revenged=终结连败 / avenged=连压被终结）只在 |streak|≥2 的恩怨翻转时报；
 * 游戏轨开场气势：被连压 ≥2 场一方 HP+REVENGE_HP_BONUS（哀兵必胜），恩怨不足不加成。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BattleResult, BoardEntry } from '../src/types.ts';
import type { CareerBook, CareerEntry } from '../src/career.ts';
import { settleOnBook, revengeOn, rivalriesOf } from '../src/career.ts';
import {
  GameCompetitions,
  MAX_HP,
  REVENGE_HP_BONUS,
  type FightContext,
  type GameOptions,
} from '../src/game-competition.ts';

const mk = (model: string, avg: number): BoardEntry => ({
  model,
  name: model,
  avg,
  byCondition: {},
  answered: 10,
  errors: 0,
  elo: 1500 + avg,
  avgLatencyMs: 0,
});
const battle = (at = '2026-09-25T00:00:00.000Z'): BattleResult => ({
  arena: { name: 't', title: 't', description: 'd', judge: { kind: 'exact' } },
  startedAt: at,
  durationMs: 1,
  contestants: [],
  records: [],
});
const entryOf = (id: string, rivals: Record<string, { n: number; ahead: number; streak?: number }>): CareerEntry => ({
  id,
  name: id,
  battles: 0,
  titles: 0,
  podiums: 0,
  elo: 1500,
  answered: 0,
  scoreSum: 0,
  byCondition: {},
  lastBattleAt: '',
  rivals,
});

test('rivals.streak 随名次翻转：压过连胜延伸/翻正，被压连败延伸/翻负', () => {
  const book: CareerBook = { version: 1, entries: {} };
  // 连续 3 场 me 压过 opp → streak=3 → revengeOn=dominate
  for (let i = 0; i < 3; i++) settleOnBook(battle(`2026-09-2${i}T00:00:00.000Z`), [mk('me', 1), mk('opp', 0)], book);
  assert.equal(book.entries['me']!.rivals!['opp']!.streak, 3);
  assert.equal(revengeOn(book, 'me', 'opp'), 'dominate');
  assert.equal(revengeOn(book, 'opp', 'me'), 'revenge', '对方视角 streak=-3 → 它是复仇方');
  // opp 扳回 1 场 → streak=1 → 恩怨解除（±1 不贴标签）
  settleOnBook(battle('2026-09-25T00:00:00.000Z'), [mk('opp', 1), mk('me', 0)], book);
  assert.equal(book.entries['me']!.rivals!['opp']!.streak, -1);
  assert.equal(revengeOn(book, 'me', 'opp'), undefined);
});

test('复仇事件只在 |streak|≥2 的恩怨翻转时报', () => {
  // revenged：me 被连压 2 场后终结连败
  const grudge: CareerBook = {
    version: 1,
    entries: {
      me: entryOf('me', { opp: { n: 2, ahead: 0, streak: -2 } }),
      opp: entryOf('opp', { me: { n: 2, ahead: 2, streak: 2 } }),
    },
  };
  let deltas = settleOnBook(battle(), [mk('me', 1), mk('opp', 0)], grudge);
  assert.deepEqual(deltas.find((d) => d.id === 'me')!.revenge, [{ opp: 'opp', kind: 'revenged' }]);
  assert.deepEqual(deltas.find((d) => d.id === 'opp')!.revenge, [{ opp: 'me', kind: 'avenged' }], '连压被终结=遭复仇');
  // 边界：streak=-1 的普通翻转不报
  const fresh: CareerBook = {
    version: 1,
    entries: {
      me: entryOf('me', { opp: { n: 3, ahead: 1, streak: -1 } }),
      opp: entryOf('opp', { me: { n: 3, ahead: 2, streak: 1 } }),
    },
  };
  deltas = settleOnBook(battle(), [mk('me', 1), mk('opp', 0)], fresh);
  assert.equal(deltas.find((d) => d.id === 'me')!.revenge, undefined);
  // grudge 标记：streak≤-2 才是苦主（用未结算快照判定，settle 会翻转 streak）
  const snapshot: CareerBook = {
    version: 1,
    entries: {
      me: entryOf('me', { opp: { n: 2, ahead: 0, streak: -2 } }),
      opp: entryOf('opp', { me: { n: 2, ahead: 2, streak: 2 } }),
    },
  };
  assert.equal(rivalriesOf(snapshot, 'me').find((r) => r.id === 'opp')!.grudge, true);
  assert.equal(rivalriesOf(snapshot, 'opp').find((r) => r.id === 'me')!.grudge, false, '压制方不是苦主');
});

// —— 游戏轨开场气势（battle 排名赛零加成，科学榜不发 buff）——
function record(x: FightContext, score: number) {
  return {
    taskId: x.round.question.task.id,
    condition: 'test',
    model: x.player.id,
    prompt: x.round.question.task.input,
    answer: 'saved answer',
    score,
    latencyMs: 1,
    error: undefined,
  };
}
async function fixture(options: GameOptions = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-revenge-'));
  const ctx = { arenasDir: path.join(root, 'arenas'), resultsDir: path.join(root, 'results') };
  const dir = path.join(ctx.arenasDir, 'fixture');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'arena.json'),
    JSON.stringify({ name: 'fixture', title: 'fixture', description: 'test', judge: { kind: 'exact' } }),
  );
  await writeFile(
    path.join(dir, 'tasks.jsonl'),
    Array.from({ length: 30 }, (_, i) =>
      JSON.stringify({ id: 'q' + i, condition: 'test', input: `question ${i}`, target: 'yes' }),
    ).join('\n'),
  );
  const service = new GameCompetitions(ctx, { turnMs: 0, intervalMs: 0, ...options });
  return {
    ctx,
    service,
    create: (n = 2) => {
      const models = Array.from({ length: n }, (_, i) => `test:p${i}`);
      return service.create({ arena: 'fixture', models, draw: models, limit: 10, requestId: 'revenge-test' });
    },
    close: async () => {
      service.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('复仇气势：被连压 ≥2 场一方开场 HP+REVENGE_HP_BONUS（哀兵必胜）', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const f = await fixture({
    fight: async (x) => {
      await gate;
      return record(x, 1);
    },
  });
  try {
    await mkdir(f.ctx.resultsDir, { recursive: true });
    // p0 被 p1 连压 2 场（streak=-2）→ p0 是复仇方
    await writeFile(
      path.join(f.ctx.resultsDir, 'career-game.json'),
      JSON.stringify({
        version: 1,
        entries: {
          'test:p0': entryOf('test:p0', { 'test:p1': { n: 2, ahead: 0, streak: -2 } }),
          'test:p1': entryOf('test:p1', { 'test:p0': { n: 2, ahead: 2, streak: 2 } }),
        },
      }),
    );
    const { id } = await f.create(2);
    const d = f.service.read(id).snapshot.duels[0]!;
    assert.deepEqual(d.hp, [MAX_HP + REVENGE_HP_BONUS, MAX_HP], '复仇方 p0 开场气势 +5');
  } finally {
    release();
    await f.close();
  }
});

test('恩怨不足（|streak|<2）不加成，开场就是标准满血', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const f = await fixture({
    fight: async (x) => {
      await gate;
      return record(x, 1);
    },
  });
  try {
    await mkdir(f.ctx.resultsDir, { recursive: true });
    await writeFile(
      path.join(f.ctx.resultsDir, 'career-game.json'),
      JSON.stringify({
        version: 1,
        entries: {
          'test:p0': entryOf('test:p0', { 'test:p1': { n: 2, ahead: 1, streak: -1 } }),
          'test:p1': entryOf('test:p1', { 'test:p0': { n: 2, ahead: 1, streak: 1 } }),
        },
      }),
    );
    const { id } = await f.create(2);
    assert.deepEqual(f.service.read(id).snapshot.duels[0]!.hp, [MAX_HP, MAX_HP]);
  } finally {
    release();
    await f.close();
  }
});
