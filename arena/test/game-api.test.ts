import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { handleGameApi } from '../src/game-api.ts';
import { createBattleEngine } from '../src/battle-engine.ts';

test('Unity adapter runs real engine, materializes answers, and retains valid zero scores', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-game-'));
  const ctx = {
    arenasDir: path.join(root, 'arenas'),
    resultsDir: path.join(root, 'results'),
    modelSettingsFile: path.join(root, 'models.json'),
  };
  const bank = path.join(ctx.arenasDir, 'fixture');
  await mkdir(bank, { recursive: true });
  await writeFile(
    path.join(bank, 'arena.json'),
    JSON.stringify({
      name: 'fixture',
      title: 'Unity integration fixture',
      description: 'isolation',
      judge: { kind: 'regex', pattern: '(?!)' },
    }),
  );
  await writeFile(
    path.join(bank, 'tasks.jsonl'),
    JSON.stringify({ id: 'Q1', condition: 'test', input: 'Reply OK', target: 'IMPOSSIBLE_TARGET_FOR_THIS_FIXTURE' }) +
      '\n',
  );
  const engine = createBattleEngine(ctx);
  const server = createServer((req, res) => {
    void handleGameApi(req, res, new URL(req.url!, 'http://localhost'), engine, ctx);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const launch = { arena: 'fixture', models: ['mock:xueba-o9', 'mock:huatou-72b'], limit: 1, demo: true };
  const post = (body: unknown, extra: Record<string, string> = {}, route = '/api/game/battles') =>
    fetch(base + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...extra },
      body: JSON.stringify(body),
    });
  try {
    const catalog = await (await fetch(base + '/api/game/catalog')).json();
    assert.equal(catalog.arenas[0].id, 'fixture');
    assert.equal(catalog.arenas[0].needsJudge, false);
    assert.equal((await post(launch, { origin: 'https://outside.example' })).status, 403);
    assert.equal((await post({ ...launch, demo: false })).status, 400);
    assert.equal((await post({ ...launch, demo: true, models: ['custom:a', 'custom:b'] })).status, 400);
    assert.equal((await post({ ...launch, judge: 'custom:judge' })).status, 400);
    for (const invalid of [
      { ...launch, arena: '../private' },
      { ...launch, limit: 0 },
      { ...launch, models: ['mock:xueba-o9', 'mock:xueba-o9'] },
    ])
      assert.equal((await post(invalid)).status, 400);
    assert.equal((await post({ file: '../private.json' }, {}, '/api/game/replays')).status, 400);
    const first = await (await post(launch)).json();
    const duplicate = await (await post(launch)).json();
    assert.equal(first.battle, duplicate.battle);
    assert.equal(duplicate.created, false);
    let snapshot: any;
    const deadline = Date.now() + 15000;
    do {
      snapshot = await (await fetch(base + '/api/game/battles/' + first.battle)).json();
      if (snapshot.frames.some((f: any) => f.type === 'done')) break;
      await new Promise((r) => setTimeout(r, 80));
    } while (Date.now() < deadline);
    assert.ok(snapshot.frames.some((f: any) => f.type === 'done'));
    const answers = snapshot.frames.filter((f: any) => f.type === 'model' && f.status === 'done');
    assert.equal(answers.length, 2);
    assert.ok(answers.every((f: any) => typeof f.answer === 'string' && f.hasScore === true && f.score === 0));
    const delta = await (await fetch(base + '/api/game/battles/' + first.battle + '?after=' + snapshot.seq)).json();
    assert.deepEqual(delta.frames, []);
    assert.equal((await fetch(base + '/api/game/battles/' + first.battle + '?after=bad')).status, 400);
    assert.equal((await fetch(base + '/api/game/battles/b0000')).status, 410);
    const end = snapshot.frames.find((f: any) => f.type === 'done');
    assert.ok(end.settlement);
    assert.ok(end.reportFile);
  } finally {
    engine.dispose();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});
