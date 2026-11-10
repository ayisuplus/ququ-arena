import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  GameCompetitions,
  stageQuestions,
  type FightContext,
  type GameOptions,
  type GameQuestion,
  type GameCompetition,
} from '../src/game-competition.ts';
import { bracketOrder, drawPreview } from '../src/game-seeding.ts';
import { competitionFrames } from '../src/game-commentary.ts';
import { analyzeArena, gameDuelResults } from '../src/analyze.ts';
import { protocolKey } from '../src/experiment-protocol.ts';
import type { AgentEvent } from '../src/agent-session.ts';

const identity = <T>(items: T[]) => [...items];
const record = (x: FightContext, score: number) => ({
  taskId: x.round.question.task.id,
  condition: 'test',
  model: x.player.id,
  prompt: x.round.question.task.input,
  answer: 'a',
  score,
  latencyMs: 1,
});

async function fixture(options: GameOptions = {}, career?: object) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-rules-'));
  const ctx = { arenasDir: path.join(root, 'arenas'), resultsDir: path.join(root, 'results') };
  const dir = path.join(ctx.arenasDir, 'fixture');
  await mkdir(dir, { recursive: true });
  await mkdir(ctx.resultsDir, { recursive: true });
  await writeFile(
    path.join(dir, 'arena.json'),
    JSON.stringify({ name: 'fixture', title: 'fixture', description: 'test', judge: { kind: 'exact' } }),
  );
  await writeFile(
    path.join(dir, 'tasks.jsonl'),
    Array.from({ length: 40 }, (_, i) =>
      JSON.stringify({ id: 'q' + i, condition: 'test', input: `fixture question ${i}`, target: 'yes' }),
    ).join('\n'),
  );
  if (career) await writeFile(path.join(ctx.resultsDir, 'career.json'), JSON.stringify(career));
  const service = new GameCompetitions(ctx, { turnMs: 0, intervalMs: 0, ...options });
  return {
    ctx,
    service,
    close: async () => {
      service.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('种子排位：标准对阵顺序，1、2 号种子只可能在决赛相遇', () => {
  assert.deepEqual(bracketOrder(2), [0, 1]);
  assert.deepEqual(bracketOrder(4), [0, 3, 1, 2]);
  assert.deepEqual(bracketOrder(8), [0, 7, 3, 4, 1, 6, 2, 5]);
  assert.throws(() => bracketOrder(6));
  const ratings: Record<string, { r: number; rd: number; sigma: number }> = {};
  const models = Array.from({ length: 8 }, (_, i) => `m${i + 1}`);
  models.forEach((id, i) => {
    ratings[id] = { r: 1900 - i * 50, rd: 60, sigma: 0.06 };
  });
  const seeded = drawPreview([...models].reverse(), (id) => ratings[id], 'seeded', identity);
  assert.deepEqual(seeded.draw, ['m1', 'm8', 'm4', 'm5', 'm2', 'm7', 'm3', 'm6']);
  assert.ok(seeded.draw.slice(0, 4).includes('m1') && seeded.draw.slice(4).includes('m2'), '1、2 号种子分在两个半区');
  assert.ok(seeded.pairs[0]!.probability > 0.5 && seeded.pairs[0]!.probability < 1);
  assert.equal(seeded.ratings.m1!.provisional, false);
  // 没有生涯记录的新模型按默认评分排在最后，并标暂定
  const fresh = drawPreview(['m1', 'new'], (id) => ratings[id], 'seeded', identity);
  assert.deepEqual(fresh.draw, ['m1', 'new']);
  assert.equal(fresh.ratings.new!.provisional, true);
  const random = drawPreview(
    models,
    (id) => ratings[id],
    'random',
    (items) => [...items].reverse(),
  );
  assert.deepEqual(random.draw, [...models].reverse());
});

test('同轮题单：常规题照抽签顺序，加赛题按区分度从高到低，缺数据的排后', () => {
  const q = (id: string) => ({ key: id, def: {} as GameQuestion['def'], task: { id } as GameQuestion['task'] });
  const questions = ['a', 'b', 'c', 'd', 'e', 'f'].map(q);
  const ordered = stageQuestions(
    questions,
    2,
    new Map([
      ['e', 0.2],
      ['c', 0.6],
      ['f', -0.1],
    ]),
    identity,
  );
  assert.deepEqual(
    ordered.map((x) => x.key),
    ['a', 'b', 'c', 'e', 'f', 'd'],
  );
});

test('同一轮的对决共用题单；没给抽签时按生涯评分排种子', async () => {
  const career = {
    version: 1,
    entries: Object.fromEntries(
      ['test:a', 'test:b', 'test:c', 'test:d'].map((id, i) => [
        id,
        {
          id,
          name: id,
          battles: 5,
          titles: 0,
          podiums: 0,
          elo: 1500,
          answered: 10,
          scoreSum: 5,
          byCondition: {},
          lastBattleAt: '',
          glicko: { r: 1800 - i * 100, rd: 50, sigma: 0.06 },
        },
      ]),
    ),
  };
  const f = await fixture({ fight: async (x) => record(x, x.player.id === x.duel.players[0] ? 1 : 0) }, career);
  try {
    const { id } = await f.service.create({
      arena: 'fixture',
      models: ['test:d', 'test:c', 'test:b', 'test:a'],
      limit: 3,
      requestId: 'seeded-request',
    });
    await f.service.idle(id);
    const c = f.service.read(id).snapshot;
    assert.deepEqual(c.config.draw, ['test:a', 'test:d', 'test:b', 'test:c']);
    const keys = (duelId: string) => c.duels.find((d) => d.id === duelId)!.questions.map((q) => q.key);
    assert.deepEqual(keys('m1'), keys('m2'), '首轮两场同一套题');
    assert.equal(c.config.fingerprint?.length, 16, '开赛记下题库指纹');
    assert.equal(c.status, 'completed');
  } finally {
    await f.close();
  }
});

test('3D 对决答卷回流：只收已结算有效答卷，来源单独成组，体验赛不收', async () => {
  const f = await fixture({ fight: async (x) => record(x, x.player.id === 'test:p0' ? 1 : x.round.index % 2) });
  try {
    const { id } = await f.service.create({
      arena: 'fixture',
      models: ['test:p0', 'test:p1'],
      draw: ['test:p0', 'test:p1'],
      limit: 6,
      requestId: 'backflow-request',
    });
    await f.service.idle(id);
    const demo = await f.service.create({
      arena: 'fixture',
      models: ['mock:xueba-o9', 'mock:huatou-72b'],
      draw: ['mock:xueba-o9', 'mock:huatou-72b'],
      limit: 3,
      demo: true,
      requestId: 'demo-request-1',
    });
    await f.service.idle(demo.id);
    const results = await gameDuelResults(f.ctx.resultsDir, 'fixture');
    assert.equal(results.length, 1, '体验赛不回流');
    const [duel] = results;
    assert.equal(duel!.meta?.source, 'game-duel');
    assert.equal(
      duel!.records.length,
      2 * f.service.read(id).snapshot.duels[0]!.rounds.filter((r) => r.settled).length,
    );
    assert.deepEqual(await gameDuelResults(f.ctx.resultsDir, 'other'), [], '只收指定题库');
    const analysis = await analyzeArena('fixture', f.ctx.resultsDir, undefined, { includeGame: true });
    assert.equal(analysis.battles, 1);
    assert.equal(analysis.protocol, protocolKey(duel!));
    assert.equal((await analyzeArena('fixture', f.ctx.resultsDir)).battles, 0, '默认不纳入游戏数据');
  } finally {
    await f.close();
  }
});

for (const supplemental of ['extra', 'fixture'])
  test(`3D 补题回流：${supplemental === 'extra' ? '跨题库' : '同题库新版'}同题号不混算，来源随存档保存`, async () => {
    const f = await fixture({
      fight: async (x) =>
        record(x, x.round.question.task.input === 'original question' || x.player.id === 'test:p0' ? 1 : 0),
    });
    try {
      const originalTask = { id: 'q0', condition: 'test', input: 'original question', target: 'yes' };
      await writeFile(path.join(f.ctx.arenasDir, 'fixture', 'tasks.jsonl'), JSON.stringify(originalTask));
      const { id } = await f.service.create({
        arena: 'fixture',
        models: ['test:p0', 'test:p1'],
        limit: 1,
        draw: ['test:p0', 'test:p1'],
        requestId: 'supplement-request',
      });
      await f.service.idle(id);
      assert.equal(f.service.read(id).snapshot.duels[0]!.reason, 'questions');
      const originalFingerprint = f.service.read(id).snapshot.config.fingerprint;
      const extraDir = path.join(f.ctx.arenasDir, supplemental);
      await mkdir(extraDir, { recursive: true });
      await writeFile(
        path.join(extraDir, 'arena.json'),
        JSON.stringify({
          name: supplemental,
          title: supplemental,
          description: 'test',
          judge: { kind: 'exact' },
        }),
      );
      await writeFile(
        path.join(extraDir, 'tasks.jsonl'),
        JSON.stringify({ ...originalTask, input: 'supplemental question' }),
      );
      await f.service.continue(id, 'm1', supplemental);
      await f.service.idle(id);
      assert.equal(f.service.read(id).snapshot.status, 'completed');

      const originalResults = await gameDuelResults(f.ctx.resultsDir, 'fixture');
      const original = originalResults.find((r) => r.records[0]!.prompt === 'original question')!;
      assert.deepEqual(
        original.records.map((r) => r.score),
        [1, 1],
        '原题不混入补题分数',
      );
      assert.equal(original.meta?.arenaFingerprint, originalFingerprint);
      const extra = (await gameDuelResults(f.ctx.resultsDir, supplemental)).find(
        (r) => r.records[0]!.prompt === 'supplemental question',
      )!;
      assert.ok(extra, '补充题库也可以独立导出');
      assert.deepEqual(
        extra.records.map((r) => r.score),
        [1, 0],
      );
      assert.notEqual(protocolKey(original), protocolKey(extra));
      if (supplemental === 'fixture') {
        assert.equal(originalResults.length, 2);
        await assert.rejects(analyzeArena('fixture', f.ctx.resultsDir, undefined, { includeGame: true }), /--protocol/);
      }
      const analysis = await analyzeArena('fixture', f.ctx.resultsDir, protocolKey(original), { includeGame: true });
      assert.equal(analysis.tasks[0]!.mean, 1);
      assert.equal(analysis.tasks[0]!.n, 2);
      const extraAnalysis = await analyzeArena(supplemental, f.ctx.resultsDir, protocolKey(extra), {
        includeGame: true,
      });
      assert.equal(extraAnalysis.tasks[0]!.mean, 0.5);
      assert.equal(extraAnalysis.tasks[0]!.n, 2);

      // 分析只能依赖比赛时的存档，不能读后来改过的题库重建版本。
      await writeFile(
        path.join(extraDir, 'tasks.jsonl'),
        JSON.stringify({ ...originalTask, input: 'edited after match' }),
      );
      assert.deepEqual(
        await gameDuelResults(f.ctx.resultsDir, supplemental),
        supplemental === 'extra' ? [extra] : originalResults,
      );

      const file = path.join(f.ctx.resultsDir, 'game-competitions', `${id}.json`);
      const saved = JSON.parse(await readFile(file, 'utf8')) as GameCompetition;
      assert.equal(saved.duels[0]!.rounds[0]!.question.fingerprint, originalFingerprint);
      assert.equal(saved.duels[0]!.rounds[1]!.question.fingerprint, extra.meta?.arenaFingerprint);
      // 旧存档没有逐题来源指纹，不能冒用开赛时的完整题库指纹。
      for (const duel of saved.duels) for (const r of duel.rounds) delete r.question.fingerprint;
      const legacy = JSON.stringify(saved);
      await writeFile(file, legacy);
      if (supplemental === 'fixture') {
        await assert.rejects(gameDuelResults(f.ctx.resultsDir, 'fixture'), /旧赛事.*同题号/);
      } else {
        const legacyOriginal = (await gameDuelResults(f.ctx.resultsDir, 'fixture'))[0]!;
        const legacyExtra = (await gameDuelResults(f.ctx.resultsDir, 'extra'))[0]!;
        assert.match(legacyOriginal.meta!.arenaFingerprint!, /^snapshot-/);
        assert.notEqual(protocolKey(legacyOriginal), protocolKey(original));
        assert.deepEqual(
          legacyOriginal.records.map((r) => r.score),
          [1, 1],
        );
        assert.deepEqual(
          legacyExtra.records.map((r) => r.score),
          [1, 0],
        );
      }
      assert.equal(await readFile(file, 'utf8'), legacy, '读取历史数据不改写存档');
    } finally {
      await f.close();
    }
  });

test('3D 解说：复用解说席，帧含对阵与血量，结束自动收官，追问进入同一会话', async () => {
  const prompts: string[] = [];
  const session = () => ({
    async send(prompt: string, emit: (e: AgentEvent) => void) {
      prompts.push(prompt);
      emit({ type: 'text', text: `第 ${prompts.length} 条点评` });
    },
    cancel() {},
    close() {},
  });
  const f = await fixture({
    fight: async (x) => record(x, x.player.id === 'test:p0' ? 1 : 0),
    commentatorSession: session,
  });
  try {
    const { id } = await f.service.create({
      arena: 'fixture',
      models: ['test:p0', 'test:p1'],
      draw: ['test:p0', 'test:p1'],
      limit: 3,
      requestId: 'commentary-request',
    });
    f.service.commentary(id, 'claude', true);
    await f.service.idle(id);
    for (let i = 0; i < 100 && !f.service.read(id).snapshot.commentary?.entries.some((e) => e.status === 'done'); i++)
      await new Promise((r) => setTimeout(r, 10));
    let c = f.service.read(id).snapshot;
    assert.equal(c.commentary?.enabled, true);
    assert.equal(c.commentary?.agentId, 'claude');
    assert.ok(c.commentary!.entries.some((e) => e.status === 'done' && e.text.includes('点评')));
    assert.match(prompts.at(-1)!, /fixture question/);
    assert.match(prompts.at(-1)!, /HP/);
    assert.match(prompts.at(-1)!, /收官/);
    assert.doesNotMatch(prompts.at(-1)!, /"(?:elo|delta)":/, '没有评级的游戏解说不伪造评级或涨跌');
    f.service.ask(id, '为什么 test:p1 输了？');
    for (let i = 0; i < 100 && prompts.length < 2; i++) await new Promise((r) => setTimeout(r, 10));
    assert.match(prompts.at(-1)!, /观众追问：为什么 test:p1 输了？/);
    const latest = f.service.read(id);
    const frames = competitionFrames({ ...latest.snapshot, events: latest.events });
    assert.equal(frames[0]!.type, 'start');
    assert.ok(
      frames.every((frame, i) => i === 0 || (frame.seq ?? 0) >= (frames[i - 1]!.seq ?? 0)),
      '帧按 seq 递增',
    );
    assert.ok(f.service.read(id).events.some((e) => e.type === 'commentator'));
    assert.throws(() => f.service.ask('c00000000-0000-0000-0000-000000000000', 'x'), /赛事不存在/);
  } finally {
    await f.close();
  }
});
