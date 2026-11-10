import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ModelSettingsStore } from '../src/model-settings.ts';
import { createBattleEngine } from '../src/battle-engine.ts';
import { GameCompetitions } from '../src/game-competition.ts';
import { handleGameApi } from '../src/game-api.ts';

test('competition HTTP: actual generation/judging adapters, failed judge preserves answers, retry only judge; persisted replay makes no calls', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-game-http-'));
  const calls: string[] = [];
  let fail = true;
  const upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    calls.push(body.model);
    const isA = body.model === 'judge' && body.messages.some((m: { content: string }) => m.content.includes('saved-A'));
    if (isA && fail) {
      res.writeHead(503);
      res.end('simulated judge outage');
      return;
    }
    const content =
      body.model === 'judge'
        ? JSON.stringify({ score: isA ? 10 : 0, reason: 'controlled grade' })
        : 'saved-' + body.model;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  const store = new ModelSettingsStore(path.join(root, 'settings.json'));
  const endpoint = `http://127.0.0.1:${(upstream.address() as { port: number }).port}/v1`;
  for (const model of ['A', 'B', 'judge'])
    await store.saveCustom({
      name: model,
      modelId: model,
      baseUrl: endpoint,
      apiKey: 'isolated-fixture-secret',
      stream: false,
    });
  const ids = (await store.read()).custom.map((x) => x.id);
  const ctx = {
    arenasDir: path.join(root, 'arenas'),
    resultsDir: path.join(root, 'results'),
    modelSettingsFile: store.file,
  };
  const bank = path.join(ctx.arenasDir, 'fixture');
  await mkdir(bank, { recursive: true });
  await writeFile(
    path.join(bank, 'arena.json'),
    JSON.stringify({
      name: 'fixture',
      title: 'test',
      description: '',
      judge: { kind: 'llm', rubric: 'test', scale: 10 },
    }),
  );
  await writeFile(
    path.join(bank, 'tasks.jsonl'),
    JSON.stringify({ id: 'q1', condition: 'test', input: 'answer', target: 'A' }),
  );
  const engine = createBattleEngine(ctx);
  engine.competitions = new GameCompetitions(ctx, { turnMs: 0, intervalMs: 0 });
  const server = createServer(
    (req, res) => void handleGameApi(req, res, new URL(req.url!, 'http://localhost'), engine, ctx),
  );
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/game/competitions`;
  const post = (route: string, body: unknown, headers = {}) =>
    fetch(base + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  try {
    const config = {
      arena: 'fixture',
      models: ids.slice(0, 2),
      draw: ids.slice(0, 2),
      judge: ids[2],
      limit: 1,
      requestId: 'http-game-fixture',
    };
    assert.equal((await post('', config, { origin: 'https://elsewhere.example' })).status, 403);
    assert.equal((await post('', { ...config, models: [ids[0], ids[1], ids[2]] })).status, 400);
    const response = await post('', config);
    assert.equal(response.status, 201);
    const { id } = await response.json();
    await engine.competitions.idle(id);
    let p = await (await fetch(base + '/' + id)).json();
    assert.equal(p.snapshot.status, 'waiting');
    assert.deepEqual(p.snapshot.duels[0].hp, [100, 100]);
    assert.deepEqual(calls.sort(), ['A', 'B', 'judge', 'judge']);
    assert.equal(p.snapshot.duels[0].rounds[0].records[0].answer, 'saved-A');
    assert.equal(p.snapshot.entrants[0].name, 'A');
    fail = false;
    assert.equal((await post('/' + id + '/continue', { duelId: 'm1' })).status, 200);
    await engine.competitions.idle(id);
    p = await (await fetch(base + '/' + id)).json();
    assert.equal(p.snapshot.winner, ids[0]);
    assert.equal(calls.filter((x) => x === 'judge').length, 3);
    assert.equal(calls.filter((x) => x === 'A' || x === 'B').length, 2);
    assert.equal(p.events.filter((e: { type: string }) => e.type === 'round-resolved').length, 1);
    assert.equal((await (await fetch(base + '/' + id + '?after=' + p.seq)).json()).events.length, 0);
    const saved = await readFile(path.join(ctx.resultsDir, 'game-competitions', id + '.json'), 'utf8');
    assert.ok(!saved.includes('isolated-fixture-secret'));
    engine.competitions.dispose();
    engine.competitions = new GameCompetitions(ctx, { turnMs: 0, intervalMs: 0 });
    const before = calls.length;
    const replay = await (await fetch(base + '/' + id)).json();
    assert.deepEqual(replay.events, p.events);
    assert.equal(calls.length, before);
    assert.equal((await post('/' + id + '/continue', { duelId: 'm1' })).status, 400);
  } finally {
    engine.dispose();
    server.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([new Promise((r) => server.close(r)), new Promise((r) => upstream.close(r))]);
    await rm(root, { recursive: true, force: true });
  }
});
