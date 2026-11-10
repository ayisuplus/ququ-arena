/**
 * T-006 · 3D 客户端去硬编码 freeOnly —— 档位显式化与 meta.source 贯通。
 *
 * 覆盖三层证据：
 * 1) 纯函数：档位解析与映射（正式档 / 免费演示档 / 缺省）。
 * 2) 战绩落盘：runBattle 在免费档下写 meta.source='free-tier'，正式档不写。
 * 3) 3D 两条路径：
 *    - /api/game/battles（原生适配器）：正式档不再强制 freeOnly，免费/缺省仍强制。
 *    - 淘汰赛（GameCompetitions）：正式档不再强制 freeOnly，离线 stub 下可完整跑完。
 *    - 回流（gameDuelResults）：免费档标 'free-tier'，正式档/旧存档沿用 'game-duel'。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { parseTier, tierFreeOnly, tierSource } from '../src/battle-tier.ts';
import { runBattle } from '../src/runner.ts';
import { handleGameApi } from '../src/game-api.ts';
import { createBattleEngine, type BattleEngine, type ServerCtx } from '../src/battle-engine.ts';
import { GameCompetitions, type FightContext } from '../src/game-competition.ts';
import { gameDuelResults } from '../src/analyze.ts';
import type { ArenaDef, ArenaTask, BattleResult, Contestant } from '../src/types.ts';

const ruleJudge: ArenaDef = { name: 'fixture', title: 'fixture', description: 'tier test', judge: { kind: 'exact' } };
const answer = { text: 'yes', latencyMs: 1 };

async function writeBank(arenasDir: string, name: string, count = 12) {
  const dir = path.join(arenasDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'arena.json'),
    JSON.stringify({ name, title: name, description: 'tier test', judge: { kind: 'regex', pattern: '(?!)' } }),
  );
  await writeFile(
    path.join(dir, 'tasks.jsonl'),
    Array.from({ length: count }, (_, i) =>
      JSON.stringify({ id: `q${i}`, condition: 'test', input: `${name} question ${i}`, target: 'yes' }),
    ).join('\n'),
  );
}

test('档位解析：official/free/缺省，非法值明确报错而非静默退回', () => {
  assert.equal(parseTier('official'), 'official');
  assert.equal(parseTier('free'), 'free');
  assert.equal(parseTier(undefined), undefined);
  assert.equal(parseTier(null), undefined);
  assert.equal(parseTier(''), undefined); // Unity JsonUtility 未赋值 string -> ""
  assert.throws(() => parseTier('x'), /档位/);
  assert.throws(() => parseTier(5), /档位/);
  assert.throws(() => parseTier({ tier: 'official' }), /档位/);

  // 免费判定：official 关闭，其余（含缺省）都沿用旧行为「仅免费渠道」
  assert.equal(tierFreeOnly('official'), false);
  assert.equal(tierFreeOnly('free'), true);
  assert.equal(tierFreeOnly(undefined), true);
  // 来源标记：只有免费演示档写 free-tier；正式档不写（undefined）
  assert.equal(tierSource('free'), 'free-tier');
  assert.equal(tierSource('official'), undefined);
  assert.equal(tierSource(undefined), undefined);
});

test('战绩落盘：免费档标 free-tier，正式档不标来源', async () => {
  const tasks: ArenaTask[] = [{ id: 'Q1', input: 'yes?', target: 'yes', condition: 'test' }];
  const roster: Contestant[] = ['A', 'B'].map((id) => ({ id, name: id, kind: 'pi' }));
  const run = (openRouterFreeOnly: boolean) =>
    runBattle(ruleJudge, tasks, roster, { roundSync: true, openRouterFreeOnly, ask: async () => answer });
  const free = await run(true);
  const official = await run(false);
  assert.equal(free.meta?.source, 'free-tier');
  assert.equal(official.meta?.source, undefined);
});

test('/api/game/battles：档位改为显式选择后不再硬编码 freeOnly（缺省仍免费）', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-tier-api-'));
  const ctx = { arenasDir: path.join(root, 'arenas'), resultsDir: path.join(root, 'results') } as ServerCtx;
  await writeBank(ctx.arenasDir, 'fixture');
  const enqueued: URLSearchParams[] = [];
  const engine = {
    enqueue: (_route: string, q: URLSearchParams) => {
      enqueued.push(q);
      return { job: { id: 'b1' }, created: true };
    },
  } as unknown as BattleEngine;
  const server = createServer((req, res) => {
    void handleGameApi(req, res, new URL(req.url!, 'http://localhost'), engine, ctx);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (body: unknown) =>
    fetch(base + '/api/game/battles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const official = { arena: 'fixture', models: ['custom:a', 'custom:b'], limit: 1, tier: 'official' };
    assert.equal((await post(official)).status, 201);
    assert.equal(enqueued.at(-1)!.has('freeOnly'), false, '正式档不得再注入 freeOnly');

    assert.equal((await post({ ...official, tier: 'free' })).status, 201);
    assert.equal(enqueued.at(-1)!.get('freeOnly'), '1');

    assert.equal((await post({ arena: 'fixture', models: ['custom:a', 'custom:b'], limit: 1 })).status, 201);
    assert.equal(enqueued.at(-1)!.get('freeOnly'), '1', '缺省沿用旧行为：免费档');

    assert.equal((await post({ ...official, tier: 'typo' })).status, 400, '未知档位返回 400 而不是静默');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});

test('淘汰赛：正式档离线可跑完且不再强制 freeOnly；免费/缺省仍强制', async () => {
  const run = async (tier?: 'official' | 'free') => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-tier-duel-'));
    const ctx = { arenasDir: path.join(root, 'arenas'), resultsDir: path.join(root, 'results') };
    await writeBank(ctx.arenasDir, 'fixture');
    const seen: boolean[] = [];
    const service = new GameCompetitions(ctx, {
      turnMs: 0,
      intervalMs: 0,
      fight: async (x: FightContext) => {
        seen.push(x.freeOnly);
        return {
          taskId: x.round.question.task.id,
          condition: 'test',
          model: x.player.id,
          prompt: x.round.question.task.input,
          answer: 'yes',
          score: x.player.id === x.duel.players[0] ? 1 : 0,
          latencyMs: 1,
        };
      },
    });
    try {
      const { id } = await service.create({
        arena: 'fixture',
        models: ['test:p0', 'test:p1'],
        draw: ['test:p0', 'test:p1'],
        limit: 4,
        requestId: `tier-${tier ?? 'default'}`,
        ...(tier ? { tier } : {}),
      });
      await service.idle(id);
      const snapshot = service.read(id).snapshot;
      return { root, ctx, snapshot, seen, service };
    } catch (e) {
      service.dispose();
      await rm(root, { recursive: true, force: true });
      throw e;
    }
  };

  const official = await run('official');
  try {
    assert.equal(official.snapshot.config.tier, 'official');
    assert.equal(official.snapshot.status, 'completed', '正式档必须能完整跑完（离线 stub）');
    assert.ok(official.seen.length > 0);
    assert.ok(
      official.seen.every((v) => v === false),
      '正式档不得再走仅免费渠道',
    );
  } finally {
    official.service.dispose();
    await rm(official.root, { recursive: true, force: true });
  }

  for (const [label, tier] of [
    ['free', 'free'],
    ['default', undefined],
  ] as const) {
    const f = await run(tier);
    try {
      assert.equal(f.snapshot.config.tier, tier, `${label}: 档位随存档保存`);
      assert.ok(
        f.seen.every((v) => v === true),
        `${label}: 仍走仅免费渠道（不破坏默认演示入口）`,
      );
    } finally {
      f.service.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  }
});

test('淘汰赛回流：免费档标 free-tier，正式档/旧存档沿用 game-duel', async () => {
  const backflow = async (tier?: 'official' | 'free') => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-tier-back-'));
    const ctx = { arenasDir: path.join(root, 'arenas'), resultsDir: path.join(root, 'results') };
    await writeBank(ctx.arenasDir, 'fixture');
    const service = new GameCompetitions(ctx, {
      turnMs: 0,
      intervalMs: 0,
      fight: async (x: FightContext) => ({
        taskId: x.round.question.task.id,
        condition: 'test',
        model: x.player.id,
        prompt: x.round.question.task.input,
        answer: 'yes',
        score: x.player.id === 'test:p0' ? 1 : 0,
        latencyMs: 1,
      }),
    });
    try {
      const { id } = await service.create({
        arena: 'fixture',
        models: ['test:p0', 'test:p1'],
        draw: ['test:p0', 'test:p1'],
        limit: 4,
        requestId: `back-${tier ?? 'default'}`,
        ...(tier ? { tier } : {}),
      });
      await service.idle(id);
      const results: BattleResult[] = await gameDuelResults(ctx.resultsDir, 'fixture');
      return { results, service, root };
    } catch (e) {
      service.dispose();
      await rm(root, { recursive: true, force: true });
      throw e;
    }
  };

  const free = await backflow('free');
  try {
    assert.equal(free.results.length, 1);
    assert.equal(free.results[0]!.meta?.source, 'free-tier');
  } finally {
    free.service.dispose();
    await rm(free.root, { recursive: true, force: true });
  }

  for (const [label, tier] of [
    ['official', 'official'],
    ['legacy', undefined],
  ] as const) {
    const f = await backflow(tier);
    try {
      assert.equal(f.results[0]!.meta?.source, 'game-duel', `${label}: 沿用 game-duel`);
    } finally {
      f.service.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  }
});

test('端到端（真实引擎 + mock）：免费档 3D 对战落盘战绩带 meta.source=free-tier', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-tier-e2e-'));
  const ctx = {
    arenasDir: path.join(root, 'arenas'),
    resultsDir: path.join(root, 'results'),
    modelSettingsFile: path.join(root, 'models.json'),
  };
  await writeBank(ctx.arenasDir, 'fixture', 1);
  const engine = createBattleEngine(ctx);
  const server = createServer((req, res) => {
    void handleGameApi(req, res, new URL(req.url!, 'http://localhost'), engine, ctx);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const launch = { arena: 'fixture', models: ['mock:xueba-o9', 'mock:huatou-72b'], limit: 1, demo: true };
    const created = await (
      await fetch(base + '/api/game/battles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(launch),
      })
    ).json();
    let done: any;
    const deadline = Date.now() + 15000;
    do {
      const snapshot = await (await fetch(base + '/api/game/battles/' + created.battle)).json();
      done = snapshot.frames.find((f: any) => f.type === 'done');
      if (done) break;
      await new Promise((r) => setTimeout(r, 80));
    } while (Date.now() < deadline);
    assert.ok(done?.resultFile, '免费档演示入口仍能开赛并归档（不退化）');
    const saved = JSON.parse(await readFile(path.join(ctx.resultsDir, done.resultFile), 'utf8')) as BattleResult;
    assert.equal(saved.meta?.source, 'free-tier');
    await assert.rejects(readFile(path.join(ctx.resultsDir, 'career.json'), 'utf8'), { code: 'ENOENT' });
  } finally {
    engine.dispose();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});
