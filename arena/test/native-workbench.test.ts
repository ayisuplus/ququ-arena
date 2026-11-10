import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Submissions } from '../src/submissions.ts';
import { WorkspaceSettingsStore } from '../src/workspace-settings.ts';
import { createArenaServer } from '../src/server.ts';
import { runBattle } from '../src/runner.ts';
import { resolveContestant } from '../src/models.ts';
import { BattleControl } from '../src/battle-control.ts';
import type { BattleRecord } from '../src/types.ts';
import { createServer } from 'node:http';
import { emptyModelSettings } from '../src/model-settings.ts';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';

async function fixture(t: any) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-native18-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const arenasDir = path.join(root, 'arenas'),
    resultsDir = path.join(root, 'results');
  await mkdir(path.join(arenasDir, 'fixture'), { recursive: true });
  await mkdir(resultsDir, { recursive: true });
  const def = { name: 'fixture', title: '中文题', description: '隔离验证', judge: { kind: 'exact' as const } };
  const tasks = [{ id: 'Q1', input: '1+1', target: '2', condition: 'default' }];
  await writeFile(path.join(arenasDir, 'fixture', 'arena.json'), JSON.stringify(def));
  await writeFile(path.join(arenasDir, 'fixture', 'tasks.jsonl'), tasks.map((t) => JSON.stringify(t)).join('\n'));
  return { root, arenasDir, resultsDir, def, tasks };
}

test('submission receipts deduplicate concurrent requests and survive restart', async (t) => {
  const f = await fixture(t),
    store = new Submissions(f.resultsDir);
  let calls = 0;
  const work = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return { id: 'run-1' };
  };
  assert.deepEqual(
    await Promise.all(Array.from({ length: 12 }, () => store.run('request_1234', '/start', { model: 'a' }, work))),
    Array(12).fill({ id: 'run-1' }),
  );
  assert.equal(calls, 1);
  await new Submissions(f.resultsDir).run('request_1234', '/start', { model: 'a' }, work);
  assert.equal(calls, 1);
  await assert.rejects(store.run('request_1234', '/start', { model: 'b' }, work), /不同/);
});

test('workspace settings detect concurrent edits and reject connection secrets', async (t) => {
  const f = await fixture(t),
    store = new WorkspaceSettingsStore(f.resultsDir);
  const initial = await store.read();
  await store.save({ ...initial, lineups: [{ id: 'lineup-1', name: '中文阵容', models: ['a', 'b'] }] });
  await assert.rejects(store.save(initial), /新修订/);
  await assert.rejects(
    store.save({ ...(await store.read()), workspaces: { evaluation: { token: 'never-write' } } }),
    /字段/,
  );
});

test('native batch API keeps the web model-count rules, receipts, snapshots and maintenance boundary', async (t) => {
  const f = await fixture(t),
    server = createArenaServer(f, undefined, { web: false });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await server.closeWorkers();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = (route: string, body?: unknown) =>
    fetch(
      base + route,
      body
        ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : undefined,
    );
  assert.equal((await request('/')).status, 404);
  assert.equal((await request('/api/game/library/banks')).status, 200);
  const body = {
    arena: 'fixture',
    models: ['mock:xueba-o9', 'mock:huatou-72b'],
    limit: 0,
    demo: true,
    requestId: 'native_batch_test',
  };
  const first = await (await request('/api/evaluations', body)).json();
  assert.ok(first.id, JSON.stringify(first));
  const second = await (await request('/api/evaluations', body)).json();
  assert.equal(second.id, first.id);
  const snapshot = await (await request('/api/evaluations/' + first.id)).json();
  assert.ok(snapshot.seq >= 0);
  assert.ok(Array.isArray(snapshot.frames));
  assert.equal((await request('/api/evaluations/' + first.id + '?after=-1')).status, 400);
  assert.equal((await request('/api/game/library/rankings?mode=multi_turn')).status, 200);
  assert.equal((await request('/api/game/library/rankings?mode=unknown')).status, 400);
  const receipt = await (await request('/api/submissions/native_batch_test')).json();
  assert.equal(receipt.value.id, first.id);
});

test('batch resume reuses finished answer during interrupted grading', async (t) => {
  const f = await fixture(t);
  const control = new BattleControl();
  let calls = 0;
  let checkpoint: BattleRecord | undefined;
  await runBattle(f.def, f.tasks, [resolveContestant('mock:xueba-o9')], {
    control,
    ask: async () => {
      calls++;
      return { text: '2', latencyMs: 1 };
    },
    onCheckpoint: (record) => {
      checkpoint = structuredClone(record);
      control.stop();
    },
  });
  assert.equal(calls, 1);
  assert.equal(checkpoint?.answer, '2');
  const result = await runBattle(f.def, f.tasks, [resolveContestant('mock:xueba-o9')], {
    resumeRecords: [checkpoint!],
    ask: async () => {
      calls++;
      throw new Error('must not generate again');
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.records[0]!.score, 1);
  const again = await runBattle(f.def, f.tasks, [resolveContestant('mock:xueba-o9')], {
    resumeRecords: result.records,
    completedRecords: [JSON.stringify(['Q1', 'mock:xueba-o9'])],
    ask: async () => {
      calls++;
      throw new Error('must not generate again');
    },
  });
  assert.equal(calls, 1);
  assert.equal(again.records[0]!.score, 1);
});

test(
  'nine-model batch saves and resumes unfinished requests without duplicating completed answers or settlement',
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t);
    await writeFile(
      path.join(f.arenasDir, 'fixture', 'tasks.jsonl'),
      [1, 2].map((n) => JSON.stringify({ ...f.tasks[0], id: 'Q' + n, input: 'question ' + n })).join('\n'),
    );
    const counts = new Map<string, number>();
    let holding = true;
    const model = createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw),
        question = JSON.stringify(body.messages).includes('question 2') ? 'Q2' : 'Q1';
      const key = question + ':' + body.model;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (holding && question === 'Q2') return;
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          choices: [{ message: { content: '2' } }],
          usage: { prompt_tokens: 10, completion_tokens: 1 },
        }),
      );
    });
    await new Promise<void>((r) => model.listen(0, '127.0.0.1', r));
    t.after(() => {
      model.closeAllConnections();
      model.close();
    });
    const settings = emptyModelSettings();
    settings.custom = Array.from({ length: 9 }, (_, i) => ({
      id: 'custom:' + randomUUID(),
      name: 'fixture-' + i,
      modelId: 'fixture-' + i,
      baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
      apiKey: 'local-fixture',
      stream: false,
    }));
    const modelSettingsFile = path.join(f.root, 'models.json');
    await writeFile(modelSettingsFile, JSON.stringify(settings));
    const servers: ReturnType<typeof createArenaServer>[] = [];
    t.after(async () => {
      for (const server of servers) {
        await server.closeWorkers();
        server.closeAllConnections();
        await new Promise<void>((r) => server.close(() => r()));
      }
    });
    async function start() {
      const server = createArenaServer({ ...f, modelSettingsFile });
      servers.push(server);
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      return { server, url: `http://127.0.0.1:${(server.address() as any).port}` };
    }
    async function post(url: string, route: string, body: unknown) {
      const res = await fetch(url + route, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      assert.ok(res.ok, JSON.stringify(data));
      return data;
    }
    async function until(check: () => Promise<boolean> | boolean) {
      for (let i = 0; i < 300; i++) {
        if (await check()) return;
        await wait(30);
      }
      throw Error('batch timeout');
    }
    const a = await start();
    const body = {
      arena: 'fixture',
      models: settings.custom.map((m) => m.id),
      limit: 0,
      requestId: 'nine_models_resume',
    };
    const job = await post(a.url, '/api/evaluations', body);
    await until(() => [...counts.keys()].some((key) => key.startsWith('Q2:')));
    await a.server.closeWorkers();
    const checkpoint = JSON.parse(await readFile(path.join(f.resultsDir, '.evaluations', job.id + '.json'), 'utf8'));
    assert.equal(checkpoint.status, 'waiting');
    assert.equal(checkpoint.completed.length, 9);
    assert.equal((await readdir(f.resultsDir)).filter((n) => /^battle-.*\.json$/.test(n)).length, 0);
    holding = false;
    const b = await start();
    assert.equal((await post(b.url, '/api/evaluations', body)).id, job.id);
    await post(b.url, '/api/evaluations/' + job.id + '/resume', { requestId: 'resume_nine_models' });
    let snapshot: any;
    await until(async () => {
      snapshot = await (await fetch(b.url + '/api/evaluations/' + job.id)).json();
      return snapshot.status === 'completed';
    });
    const done = snapshot.frames.find((e: any) => e.type === 'done');
    assert.ok(done.resultFile);
    const result = JSON.parse(await readFile(path.join(f.resultsDir, done.resultFile), 'utf8'));
    assert.equal(result.records.length, 18);
    const replay = (await readFile(path.join(f.resultsDir, result.timelineFile), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    for (const taskId of ['Q1', 'Q2'])
      assert.ok(
        replay.some((e) => e.type === 'model' && e.taskId === taskId && e.answer === '2'),
        'resume replay lost ' + taskId,
      );
    assert.equal(new Set(result.records.map((r: any) => JSON.stringify([r.taskId, r.model]))).size, 18);
    for (const m of settings.custom) assert.equal(counts.get('Q1:' + m.modelId), 1, 'completed answer repeated');
    const cursor = await (await fetch(b.url + '/api/evaluations/' + job.id + '?after=' + snapshot.seq)).json();
    assert.deepEqual(cursor.frames, []);
  },
);
