import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  GameCompetitions,
  settleGameRound,
  stageQuestions,
  OVERTIME_LIMIT,
  type FightContext,
  type GameOptions,
  type GameQuestion,
} from '../src/game-competition.ts';
import { HumanBridge } from '../src/human-play.ts';
import { stableView, type CareerBook } from '../src/career.ts';
import { listMockContestants } from '../src/mock.ts';

const tick = () => new Promise<void>((r) => setTimeout(r, 5));
async function until(fn: () => boolean) {
  for (let i = 0; i < 1000; i++) {
    if (fn()) return;
    await tick();
  }
  throw new Error('Timed out');
}
function record(x: FightContext, score: number, error?: string) {
  return {
    taskId: x.round.question.task.id,
    condition: 'test',
    model: x.player.id,
    prompt: x.round.question.task.input,
    answer: 'saved answer',
    score,
    latencyMs: 1,
    error,
  };
}
async function fixture(options: GameOptions = {}, count = 30) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-duel-'));
  const ctx = { arenasDir: path.join(root, 'arenas'), resultsDir: path.join(root, 'results') };
  for (const bank of ['fixture', 'extra']) {
    const dir = path.join(ctx.arenasDir, bank);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'arena.json'),
      JSON.stringify({ name: bank, title: bank, description: 'test', judge: { kind: 'exact' } }),
    );
    await writeFile(
      path.join(dir, 'tasks.jsonl'),
      Array.from({ length: count }, (_, i) =>
        JSON.stringify({ id: 'q' + i, condition: 'test', input: `${bank} question ${i}`, target: 'yes' }),
      ).join('\n'),
    );
  }
  const service = new GameCompetitions(ctx, { turnMs: 0, intervalMs: 0, ...options });
  let seq = 0;
  const create = (n = 2, limit = 10) => {
    const models = Array.from({ length: n }, (_, i) => `test:p${i}`);
    return service.create({ arena: 'fixture', models, draw: models, limit, requestId: `test-request-${++seq}` });
  };
  return {
    root,
    ctx,
    service,
    create,
    close: async () => {
      service.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('simultaneous damage: correct, wrong, partial, precision and invalid scores', () => {
  assert.deepEqual(settleGameRound([100, 100], [1, 0]).after, [100, 80]);
  assert.deepEqual(settleGameRound([100, 100], [0, 1]).after, [80, 100]);
  assert.deepEqual(settleGameRound([100, 100], [0, 0]).after, [80, 80]);
  assert.deepEqual(settleGameRound([100, 100], [1, 1]).after, [100, 100]);
  assert.deepEqual(settleGameRound([100, 100], [0.75, 0.5]).after, [95, 90]);
  assert.deepEqual(settleGameRound([10, 10], [0, 0]).after, [0, 0]);
  assert.ok(settleGameRound([100, 100], [0.999, 1]).after[0]! < 100);
  assert.throws(() => settleGameRound([100, 100], [NaN, 1]));
});

test('desktop pause exposes pending state, saves both answers, and resumes without duplicate calls or damage', async () => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let calls = 0;
  const f = await fixture({
    fight: async (x) => {
      calls++;
      await gate;
      return record(x, x.player.id === x.duel.players[0] ? 1 : 0);
    },
  });
  let restored: GameCompetitions | undefined;
  try {
    const { id } = await f.create(2, 1);
    await until(() => calls === 2);
    f.service.control(id, 'pause');
    assert.equal(f.service.read(id).snapshot.pauseState, 'pausing');
    finish();
    await until(() => f.service.read(id).snapshot.pauseState === 'paused');
    assert.ok(f.service.read(id).snapshot.duels[0]!.rounds[0]!.records.every(Boolean));
    f.service.dispose();
    await f.service.idle(id);
    restored = new GameCompetitions(f.ctx, {
      turnMs: 0,
      intervalMs: 0,
      fight: async () => {
        throw new Error('Saved answer must not be called again');
      },
    });
    assert.equal(restored.read(id).snapshot.status, 'waiting');
    await restored.continue(id);
    await restored.idle(id);
    const result = restored.read(id).snapshot;
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.duels[0]!.hp, [100, 80]);
    assert.equal(result.duels[0]!.rounds.length, 1);
    assert.equal(calls, 2);
  } finally {
    finish();
    restored?.dispose();
    await f.close();
  }
});
for (const n of [2, 4, 8])
  test(`${n} entrants finish exactly ${n - 1} duels; only winners advance; KO cancels remaining questions`, async () => {
    let calls = 0;
    const f = await fixture({
      fight: async (x) => {
        calls++;
        return record(x, x.player.id === x.duel.players[0] ? 1 : 0);
      },
    });
    try {
      const { id } = await f.create(n);
      await f.service.idle(id);
      const p = f.service.read(id);
      assert.equal(p.snapshot.status, 'completed');
      assert.equal(p.snapshot.winner, 'test:p0');
      assert.equal(p.snapshot.duels.length, n - 1);
      assert.equal(calls, (n - 1) * 10);
      for (const d of p.snapshot.duels) {
        assert.equal(d.status, 'completed');
        assert.equal(d.rounds.length, 5);
        assert.deepEqual(d.rounds[0]!.before, [100, 100]);
        if (d.sources.length)
          assert.deepEqual(
            d.players,
            d.sources.map((id) => p.snapshot.duels.find((m) => m.id === id)!.winner),
          );
      }
      assert.equal(
        new Set(
          p.events
            .filter((e) => e.type === 'round-resolved')
            .map((e) => `${e.competitionId}/${e.duelId}/${e.round!.id}`),
        ).size,
        (n - 1) * 5,
      );
      assert.deepEqual(f.service.read(id, p.seq).events, []);
      // 游戏赛回流生涯后 results 下只有游戏赛账本（career-game.json）与竞猜账本（predictions.json）；benchmark 主账不落盘
      assert.deepEqual(
        (await readdir(f.ctx.resultsDir)).filter(
          (x) => x !== 'game-competitions' && x !== 'career-game.json' && x !== 'predictions.json',
        ),
        [],
      );
    } finally {
      await f.close();
    }
  });
test('cap uses unrounded HP, including partial scores', async () => {
  const f = await fixture({ fight: async (x) => record(x, x.player.id === 'test:p0' ? 1 : 0.999) });
  try {
    const { id } = await f.create(2, 1);
    await f.service.idle(id);
    const d = f.service.read(id).snapshot.duels[0]!;
    assert.equal(d.winner, 'test:p0');
    assert.equal(d.rounds.length, 1);
    assert.ok(d.hp[1]! > 99.9);
  } finally {
    await f.close();
  }
});
test('simultaneous KO resets HP, first unequal overtime scores decide winner', async () => {
  const f = await fixture({ fight: async (x) => record(x, x.duel.overtime && x.player.id === 'test:p1' ? 1 : 0) });
  try {
    const { id } = await f.create();
    await f.service.idle(id);
    const d = f.service.read(id).snapshot.duels[0]!;
    assert.equal(d.winner, 'test:p1');
    assert.equal(d.rounds.length, 6);
    assert.deepEqual(d.rounds[5]!.before, [100, 100]);
  } finally {
    await f.close();
  }
});
test('overtime winner receives the game career title even when regular-round average is lower', async () => {
  const f = await fixture({
    fight: async (x) => {
      const score = x.duel.overtime
        ? x.player.id === 'test:p0'
          ? 0.6
          : 0.5
        : x.round.index <= 4
          ? 0
          : x.round.index === 5
            ? 0.5
            : x.player.id === 'test:p0'
              ? 0
              : 0.5;
      return record(x, score);
    },
  });
  try {
    const { id } = await f.create(2, 10);
    await f.service.idle(id);
    const duel = f.service.read(id).snapshot.duels[0]!;
    assert.equal(duel.winner, 'test:p0');
    assert.equal(duel.rounds.length, 7);
    const score = (player: number) => duel.rounds.reduce((sum, r) => sum + r.records[player]!.score, 0);
    assert.ok(score(0) < score(1), '加赛胜者的全场均分确实更低');
    const book = JSON.parse(await readFile(path.join(f.ctx.resultsDir, 'career-game.json'), 'utf8')) as CareerBook;
    assert.equal(book.entries['test:p0']!.titles, 1);
    assert.equal(book.entries['test:p1']!.titles, 0);
    assert.equal(book.entries['test:p0']!.rivals!['test:p1']!.ahead, 1);
  } finally {
    await f.close();
  }
});
test(`${OVERTIME_LIMIT} overtime ties persist, independent bracket advances, supplemental bank resumes only selected duel`, async () => {
  let resumed = false;
  const f = await fixture({
    fight: async (x) => record(x, x.duel.id === 'm1' && !resumed ? 1 : x.player.id === x.duel.players[0] ? 1 : 0),
  });
  try {
    const { id } = await f.create(4, 1);
    await f.service.idle(id);
    let p = f.service.read(id);
    assert.equal(p.snapshot.status, 'waiting');
    assert.equal(p.snapshot.winner, '');
    assert.equal(p.snapshot.duels[0]!.reason, 'tie');
    assert.equal(p.snapshot.duels[0]!.rounds.length, 1 + OVERTIME_LIMIT);
    assert.equal(p.snapshot.duels[1]!.status, 'completed');
    assert.equal(p.snapshot.duels[2]!.status, 'blocked');
    resumed = true;
    await f.service.continue(id, 'm1', 'extra');
    await f.service.idle(id);
    p = f.service.read(id);
    assert.equal(p.snapshot.status, 'completed');
    assert.equal(p.snapshot.duels[1]!.rounds.length, 1);
    assert.equal(p.snapshot.duels[0]!.rounds.length, 2 + OVERTIME_LIMIT);
    assert.deepEqual(p.snapshot.duels[0]!.rounds[1 + OVERTIME_LIMIT]!.before, [100, 100]);
    assert.equal(p.events.filter((e) => e.type === 'duel-end' && e.duelId === 'm2').length, 1);
  } finally {
    await f.close();
  }
});
test('short bank adjusts cap and waits for new overtime questions; no repeat', async () => {
  const f = await fixture({ fight: async (x) => record(x, 1) }, 1);
  try {
    const { id } = await f.create();
    await f.service.idle(id);
    let d = f.service.read(id).snapshot.duels[0]!;
    assert.equal(d.regularLimit, 1);
    assert.equal(d.reason, 'questions');
    await assert.rejects(f.service.continue(id, 'm1', 'fixture'), /新题/);
    await f.service.continue(id, 'm1', 'extra');
    await f.service.idle(id);
    d = f.service.read(id).snapshot.duels[0]!;
    assert.equal(d.rounds.length, 2);
    assert.equal(new Set(d.rounds.map((r) => r.question.key)).size, 2);
  } finally {
    await f.close();
  }
});
test('failure is not damage; preserve successful answer, retry failed side; ignore late events', async () => {
  const counts = [0, 0];
  let late: (() => void) | undefined;
  const f = await fixture({
    fight: async (x) => {
      const i = x.duel.players.indexOf(x.player.id);
      counts[i]!++;
      if (i === 0) {
        late = () => x.notify({ taskId: 'q0', modelId: x.player.id, attempt: 99, score: 0, status: 'done' });
        return record(x, 1);
      }
      return record(x, 0, counts[i] === 1 ? 'provider failed' : undefined);
    },
  });
  try {
    const { id } = await f.create(2, 1);
    await f.service.idle(id);
    let p = f.service.read(id);
    assert.deepEqual(p.snapshot.duels[0]!.hp, [100, 100]);
    assert.equal(p.events.filter((e) => e.type === 'round-resolved').length, 0);
    const seq = p.seq;
    late!();
    assert.equal(f.service.read(id).seq, seq);
    await f.service.continue(id, 'm1');
    await f.service.idle(id);
    p = f.service.read(id);
    assert.deepEqual(counts, [1, 2]);
    assert.equal(p.snapshot.winner, 'test:p0');
    assert.equal(p.events.filter((e) => e.type === 'round-resolved').length, 1);
  } finally {
    await f.close();
  }
});
test('reverse arrival order does not settle before both scores', async () => {
  let release!: () => void;
  const f = await fixture({
    fight: async (x) => {
      if (x.player.id === 'test:p0') await new Promise<void>((r) => (release = r));
      return record(x, x.player.id === 'test:p0' ? 1 : 0);
    },
  });
  try {
    const { id } = await f.create(2, 1);
    await until(() => !!release);
    await tick();
    assert.equal(f.service.read(id).events.filter((e) => e.type === 'round-resolved').length, 0);
    release();
    await f.service.idle(id);
    assert.equal(f.service.read(id).snapshot.winner, 'test:p0');
  } finally {
    await f.close();
  }
});
test('pause holds settlement and next question; stop aborts late answers and never crowns winner', async () => {
  let release!: () => void;
  let calls = 0;
  const f = await fixture({
    fight: async (x) => {
      calls++;
      if (x.player.id === 'test:p0') await new Promise<void>((r) => (release = r));
      return record(x, 0);
    },
  });
  try {
    const { id } = await f.create();
    await until(() => !!release);
    f.service.control(id, 'pause');
    release();
    await tick();
    assert.equal(f.service.read(id).events.filter((e) => e.type === 'round-resolved').length, 0);
    f.service.control(id, 'resume');
    await until(() => f.service.read(id).events.some((e) => e.type === 'round-resolved'));
    f.service.control(id, 'stop');
    const count = calls;
    release();
    await f.service.idle(id);
    await tick();
    const p = f.service.read(id);
    assert.equal(p.snapshot.status, 'stopped');
    assert.equal(p.snapshot.winner, '');
    assert.equal(calls, count);
  } finally {
    await f.close();
  }
});
test('restart saves generated answer before grading, does not auto-call, resumes missing grading only', async () => {
  let grading = false;
  let calls = 0;
  const f = await fixture({
    fight: async (x) => {
      calls++;
      if (x.player.id === 'test:p0') {
        x.notify({
          modelId: x.player.id,
          taskId: x.round.question.task.id,
          attempt: 0,
          status: 'judging',
          answer: 'persist me',
        });
        grading = true;
        await new Promise(() => {});
      }
      return record(x, 0);
    },
  });
  let restored: GameCompetitions | undefined;
  try {
    const { id } = await f.create(2, 1);
    await until(() => grading);
    await tick();
    f.service.dispose();
    await f.service.idle(id);
    let retries = 0;
    restored = new GameCompetitions(f.ctx, {
      turnMs: 0,
      intervalMs: 0,
      fight: async (x) => {
        retries++;
        assert.equal(x.previous?.answer, 'persist me');
        assert.equal(x.player.id, 'test:p0');
        return record(x, 1);
      },
    });
    assert.equal(restored.read(id).snapshot.status, 'waiting');
    assert.equal(retries, 0);
    assert.equal(calls, 2);
    await restored.continue(id);
    await restored.idle(id);
    assert.equal(retries, 1);
    assert.equal(restored.read(id).snapshot.winner, 'test:p0');
  } finally {
    restored?.dispose();
    await f.close();
  }
});
test('concurrent duplicate creation locks one draw and one set of calls', async () => {
  let calls = 0;
  const f = await fixture({
    fight: async (x) => {
      calls++;
      return record(x, x.player.id === 'test:p0' ? 1 : 0);
    },
  });
  try {
    const config = { arena: 'fixture', models: ['test:p0', 'test:p1'], limit: 1, requestId: 'same-request-123' };
    const [a, b] = await Promise.all([f.service.create(config), f.service.create(config)]);
    assert.equal(a.id, b.id);
    await f.service.idle(a.id);
    assert.equal(calls, 2);
  } finally {
    await f.close();
  }
});
test('restart after settled final blow does not ask another question or apply damage again', async () => {
  let calls = 0;
  const f = await fixture({
    turnMs: 500,
    fight: async (x) => {
      calls++;
      return record(x, x.player.id === 'test:p0' ? 1 : 0);
    },
  });
  let restored: GameCompetitions | undefined;
  try {
    const { id } = await f.create(2, 1);
    await until(() => f.service.read(id).events.some((e) => e.type === 'round-resolved'));
    f.service.dispose();
    await f.service.idle(id);
    restored = new GameCompetitions(f.ctx, {
      turnMs: 0,
      intervalMs: 0,
      fight: async () => {
        throw new Error('Must not ask after win');
      },
    });
    await restored.continue(id);
    await restored.idle(id);
    const p = restored.read(id);
    assert.equal(p.snapshot.status, 'completed');
    assert.equal(p.snapshot.winner, 'test:p0');
    assert.equal(calls, 2);
    assert.equal(p.events.filter((e) => e.type === 'round-resolved').length, 1);
  } finally {
    restored?.dispose();
    await f.close();
  }
});
test('concurrent supplemental continuation cannot rerun a completed match', async () => {
  let resumed = false,
    calls = 0;
  const f = await fixture({
    fight: async (x) => {
      calls++;
      return record(x, resumed && x.player.id === 'test:p1' ? 0 : 1);
    },
  });
  try {
    const { id } = await f.create(2, 1);
    await f.service.idle(id);
    resumed = true;
    const before = calls;
    const outcomes = await Promise.allSettled([
      f.service.continue(id, 'm1', 'extra'),
      f.service.continue(id, 'm1', 'extra'),
    ]);
    await f.service.idle(id);
    assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(calls, before + 2);
    assert.equal(f.service.read(id).snapshot.status, 'completed');
  } finally {
    await f.close();
  }
});
test('human bridge: one submit per question, invalid answers keep waiting, abort cancels', async () => {
  const bridge = new HumanBridge();
  const controller = new AbortController();
  const { question, answer } = bridge.request(
    { competitionId: 'c1', duelId: 'm1', roundId: 'r1', playerId: 'human:甲', prompt: '题面' },
    controller.signal,
  );
  assert.equal(bridge.pending().length, 1);
  assert.equal(bridge.submit(question.key, '   '), false, '空答无效');
  assert.equal(bridge.pending().length, 1, '无效交卷保留等待');
  assert.equal(bridge.submit(question.key, 'x'.repeat(20_001)), false, '超长无效');
  assert.equal(bridge.submit(question.key, '答案', '思路'), true);
  assert.equal(bridge.submit(question.key, 'again'), false, '重复交卷无效');
  const out = await answer;
  assert.equal(out.text, '答案');
  assert.equal(out.reasoning, '思路');
  assert.equal(bridge.pending().length, 0);

  const aborted = bridge.request(
    { competitionId: 'c1', duelId: 'm1', roundId: 'r2', playerId: 'human:甲', prompt: '题面2' },
    controller.signal,
  );
  controller.abort();
  await assert.rejects(aborted.answer, /中止/);
  assert.equal(bridge.pending().length, 0);
  const closing = bridge.request({
    competitionId: 'c1',
    duelId: 'm1',
    roundId: 'r3',
    playerId: 'human:甲',
    prompt: '题面3',
  });
  bridge.dispose();
  await assert.rejects(closing.answer, /服务关闭/);
});
test('免费演示档不写入正式积分：free 档对局不结算，正式档仍结算并标 game-duel', async () => {
  const settleSource = async (tier: 'free' | 'official') => {
    const f = await fixture({ fight: async (x) => record(x, x.player.id === x.duel.players[0] ? 1 : 0) });
    try {
      const models = ['test:p0', 'test:p1'];
      const { id } = await f.service.create({
        arena: 'fixture',
        models,
        draw: models,
        limit: 1,
        tier,
        requestId: `tier-${tier}`,
      });
      await f.service.idle(id);
      const settled = f.service.read(id).events.filter((e) => e.type === 'career-settled');
      const book = await readFile(path.join(f.ctx.resultsDir, 'career-game.json'), 'utf8')
        .then((raw) => JSON.parse(raw) as CareerBook)
        .catch(() => null);
      return { settled, book };
    } finally {
      await f.close();
    }
  };

  const free = await settleSource('free');
  assert.equal(free.settled.length, 0, '免费演示档不产生结算事件');
  assert.equal(free.book, null, '免费演示档不写入正式积分账本');

  const official = await settleSource('official');
  assert.equal(official.settled.length, 1, '正式档对局照常结算');
  assert.equal(official.book!.entries['test:p0']!.history![0]!.source, 'game-duel');
});
test('game duels settle into the game career track: every duel counts, only the final awards titles', async () => {
  const f = await fixture({ fight: async (x) => record(x, x.player.id === x.duel.players[0] ? 1 : 0) });
  try {
    const { id } = await f.create(4, 1);
    await f.service.idle(id);
    const book = JSON.parse(await readFile(path.join(f.ctx.resultsDir, 'career-game.json'), 'utf8')) as CareerBook;
    assert.deepEqual(Object.keys(book.entries).sort(), ['test:p0', 'test:p1', 'test:p2', 'test:p3']);
    // 抽签 [p0,p1,p2,p3]：p0 胜 m1 与决赛 m3，p2 胜 m2——每场对决都入账
    assert.equal(book.entries['test:p0']!.battles, 2);
    assert.equal(book.entries['test:p0']!.titles, 1, '只有决赛记头衔');
    assert.equal(book.entries['test:p2']!.battles, 2);
    assert.equal(book.entries['test:p2']!.titles, 0);
    assert.equal(book.entries['test:p1']!.battles, 1);
    assert.equal(book.entries['test:p1']!.history![0]!.source, 'game-duel');
    assert.ok(book.entries['test:p0']!.achievements?.some((a) => a.id === 'first_title'));
    // benchmark 科学榜零污染
    await assert.rejects(readFile(path.join(f.ctx.resultsDir, 'career.json'), 'utf8'), { code: 'ENOENT' });
    const p = f.service.read(id);
    assert.equal(p.events.filter((e) => e.type === 'career-settled').length, 3, '每个完成对决一条结算事件');
    assert.equal(p.events.find((e) => e.type === 'career-settled')!.settlement!.length, 2);
  } finally {
    await f.close();
  }
});
test('human contestants play the real fight path, grade on the same judge, settle on the human track', async () => {
  const f = await fixture(); // 不注入 fight：走真实通道（human 收卷 + 规则裁判）
  try {
    const models = ['human:甲', 'human:乙'];
    const { id } = await f.service.create({
      arena: 'fixture',
      models,
      draw: models,
      limit: 1,
      requestId: 'human-match-001',
    });
    await until(() => f.service.humanQuestions(id).length === 2);
    const questions = f.service.humanQuestions(id);
    const mine = questions.find((q) => q.playerId === 'human:甲')!;
    const theirs = questions.find((q) => q.playerId === 'human:乙')!;
    assert.ok(mine.prompt.startsWith('fixture question '), '题面来自共享题库（顺序已洗牌）');
    f.service.submitHuman(id, mine.key, 'yes'); // 甲答对
    f.service.submitHuman(id, theirs.key, 'no'); // 乙答错
    await f.service.idle(id);
    const p = f.service.read(id);
    assert.equal(p.snapshot.status, 'completed');
    assert.equal(p.snapshot.winner, 'human:甲');
    assert.deepEqual(
      p.snapshot.duels[0]!.rounds[0]!.records.map((r) => r!.score),
      [1, 0],
    );
    assert.ok(p.events.some((e) => e.type === 'human-question'));
    assert.throws(() => f.service.submitHuman(id, mine.key, 'yes'), /等待中/);
    assert.throws(() => f.service.submitHuman(id, 'bogus-key', 'yes'), /等待中/);
    const book = JSON.parse(await readFile(path.join(f.ctx.resultsDir, 'career-game.json'), 'utf8')) as CareerBook;
    assert.equal(book.entries['human:甲']!.titles, 1);
    assert.equal(book.entries['human:甲']!.history![0]!.source, 'game-duel');
    // 分轨：人类段位轨独立成榜，不与模型混排
    assert.equal(stableView(book, { kind: 'human' }).length, 2);
    assert.equal(stableView(book, { kind: 'model' }).length, 0);
  } finally {
    await f.close();
  }
});
test('demo competitions with mock contestants never settle career', async () => {
  const mocks = listMockContestants()
    .slice(0, 2)
    .map((m) => m.id);
  const f = await fixture({ fight: async (x) => record(x, x.player.id === x.duel.players[0] ? 1 : 0) });
  try {
    const { id } = await f.service.create({
      arena: 'fixture',
      models: mocks,
      draw: mocks,
      limit: 1,
      demo: true,
      requestId: 'demo-match-0001',
    });
    await f.service.idle(id);
    assert.equal(f.service.read(id).snapshot.status, 'completed');
    assert.ok(!(await readdir(f.ctx.resultsDir)).includes('career-game.json'), '演示赛（mock）不入账');
  } finally {
    await f.close();
  }
});
