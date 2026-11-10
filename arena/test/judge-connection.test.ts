import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { ModelSettingsStore, emptyModelSettings } from '../src/model-settings.ts';
import { createArenaServer } from '../src/server.ts';
import { readSse } from '../src/streams.ts';
import { openRouterCatalog, parseFreeModels } from '../src/openrouter.ts';
import { runBattle } from '../src/runner.ts';
import { buildLeaderboard } from '../src/leaderboard.ts';
import { buildSettlement } from '../src/scoring-summary.ts';
import type { ArenaDef, ArenaTask } from '../src/types.ts';

const def: ArenaDef = { name: 'judge-fixture', title: '裁判隔离验证', description: '', judge: { kind: 'exact' } };
const tasks: ArenaTask[] = [
  { id: 'Q1', condition: 'test', input: '输出四', target: '四' },
  {
    id: 'Q2',
    condition: 'test',
    input: '说明四',
    target: '四',
    judge: {
      kind: 'all',
      judges: [
        { kind: 'contains', keywords: ['四'] },
        { kind: 'llm', rubric: 'SECRET_RUBRIC', scale: 10 },
      ],
    },
  },
];

test('HTTP：实际所选主观题必须配置真实裁判，设置传递、失败弃权、新旧回放与快照', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-real-judge-'));
  const calls: { model: string; key?: string; stream?: boolean }[] = [];
  let judgeResponse: 'score' | 'failure' | 'invalid' = 'score';
  const upstream = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    calls.push({ model: body.model, key: req.headers.authorization, stream: body.stream });
    if (body.model === 'actual-judge' && judgeResponse === 'failure') {
      res.writeHead(503);
      res.end('fixture judge unavailable');
      return;
    }
    const content =
      body.model === 'actual-judge'
        ? JSON.stringify(judgeResponse === 'invalid' ? { reason: '缺少得分' } : { score: 8, reason: '测试评分依据' })
        : '四';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 5, completion_tokens: 2 } }));
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  const store = new ModelSettingsStore(path.join(dir, 'settings.json'));
  const endpoint = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1`;
  await store.saveCustom({
    name: '测试选手',
    modelId: 'actual-answerer',
    baseUrl: endpoint,
    apiKey: 'fixture-answer-key',
    stream: true,
  });
  await store.saveCustom({
    name: '测试裁判',
    modelId: 'actual-judge',
    baseUrl: endpoint,
    apiKey: 'fixture-judge-key',
    stream: true,
  });
  const settings = await store.read(),
    [answerer, judge] = settings.custom.map((m) => m.id);
  const arenasDir = path.join(dir, 'arenas'),
    arenaDir = path.join(arenasDir, def.name),
    resultsDir = path.join(dir, 'results');
  await mkdir(arenaDir, { recursive: true });
  await writeFile(path.join(arenaDir, 'arena.json'), JSON.stringify(def));
  await writeFile(path.join(arenaDir, 'tasks.jsonl'), tasks.map((t) => JSON.stringify(t)).join('\n'));
  const server = createArenaServer({ arenasDir, resultsDir, modelSettingsFile: store.file });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const collect = async (id: string) => {
    const abort = new AbortController(),
      events: any[] = [];
    const response = await fetch(`${base}/battle/stream?battle=${id}&snapshot=1`, {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
    });
    try {
      for await (const line of readSse(response.body!)) {
        const e = JSON.parse(line);
        events.push(...(e.type === 'snapshot' ? e.frames : [e]));
        if (events.some((f) => f.type === 'done' || f.type === 'error')) break;
      }
    } finally {
      abort.abort();
    }
    return events;
  };
  const open = async (route: string) => {
    const page = await (await fetch(base + route)).text();
    const id = page.match(/data-battle="(b\d+)"/)?.[1];
    assert.ok(id, '比赛页包含会话 ID');
    return { id, events: await collect(id) };
  };
  const route = (limit: number, judgeId?: string) =>
    '/battle?' +
    new URLSearchParams({
      arena: def.name,
      models: answerer!,
      pace: '0',
      limit: String(limit),
      ...(judgeId ? { judge: judgeId } : {}),
    });
  try {
    for (const judgeId of [undefined, 'mock:laoshi-k2', `${judge},mock:laoshi-k2`]) {
      const blocked = await open(route(2, judgeId));
      assert.ok(blocked.events.some((e) => e.type === 'error' && /真实裁判/.test(e.message)));
      assert.ok(!blocked.events.some((e) => e.type === 'start'));
      assert.equal(calls.length, 0);
    }
    const objective = await open(route(1));
    assert.equal(objective.events.at(-1).type, 'done');
    assert.equal(calls.length, 1);
    assert.equal(objective.events.at(-1).settlement.rows[0].avg, 1);
    const complete = await open(route(2, judge));
    const done = complete.events.find((e) => e.type === 'done');
    assert.ok(done);
    assert.equal(done.settlement.rows[0].avg, 0.9);
    assert.equal(done.settlement.rows[0].answered, 2);
    assert.ok(calls.some((c) => c.model === 'actual-judge' && c.key === 'Bearer fixture-judge-key' && !c.stream));
    const q2 = complete.events.find((e) => e.type === 'round' && e.taskId === 'Q2');
    assert.equal(q2.scoring.source, 'task-override');
    assert.ok(!JSON.stringify(q2).includes('SECRET_RUBRIC'));
    assert.ok(
      JSON.stringify(complete.events.find((e) => e.type === 'round-end' && e.taskId === 'Q2')).includes(
        'SECRET_RUBRIC',
      ),
    );
    assert.deepEqual((await collect(complete.id)).find((e) => e.type === 'done').settlement, done.settlement);
    const resultFile = decodeURIComponent(path.basename(done.reportFile))
      .replace(/^战报-/, '战绩-')
      .replace(/\.html$/, '.json');
    const resultText = await readFile(path.join(resultsDir, resultFile), 'utf8'),
      battle = JSON.parse(resultText);
    assert.ok(!resultText.includes('fixture-judge-key'));
    assert.ok(!JSON.stringify(complete.events).includes('fixture-judge-key'));
    assert.deepEqual(battle.records.find((r: any) => r.taskId === 'Q2').judge, tasks[1]!.judge);
    assert.equal(battle.meta.plannedTasks, 2);
    const careerBefore = await readFile(path.join(resultsDir, 'career.json'), 'utf8');
    const replay = await open('/replay?' + new URLSearchParams({ file: resultFile, speed: '0', pace: '0' }));
    assert.equal(replay.events.at(-1).settlement.career, 'replay');
    assert.equal(replay.events.at(-1).settlement.rows[0].avg, 0.9);
    assert.equal(await readFile(path.join(resultsDir, 'career.json'), 'utf8'), careerBefore);
    delete battle.timelineFile;
    delete battle.meta;
    for (const rec of battle.records) delete rec.judge;
    const oldFile = '战绩-legacy-fixture.json';
    await writeFile(path.join(resultsDir, oldFile), JSON.stringify(battle));
    const legacy = await open('/replay?' + new URLSearchParams({ file: oldFile, speed: '0', pace: '0' }));
    assert.equal(legacy.events.find((e) => e.type === 'round').scoring.source, 'legacy-default');
    assert.equal(legacy.events.at(-1).settlement.replay, true);
    for (const mode of ['failure', 'invalid'] as const) {
      judgeResponse = mode;
      const failed = await open(route(2, judge));
      const row = failed.events.at(-1).settlement.rows[0];
      assert.equal(row.judgeErrors, 1);
      assert.equal(row.answered, 1);
      assert.equal(row.avg, 1);
      assert.equal(row.zeroCredit, 0);
      assert.ok(failed.events.some((e) => e.type === 'model' && e.status === 'error'));
    }
    assert.ok((await readdir(resultsDir)).some((f) => f.startsWith('timeline-')));
  } finally {
    server.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([new Promise((r) => server.close(r)), new Promise((r) => upstream.close(r))]);
    await rm(dir, { recursive: true, force: true });
  }
});

test('OpenRouter 裁判继承 runBattle 的内存密钥与零价约束，无法核价时弃权', async (t) => {
  const settings = emptyModelSettings();
  settings.openrouter.apiKey = 'fixture-router-judge-key';
  let checks = 0,
    requests = 0,
    available = true;
  t.mock.method(openRouterCatalog, 'requireFree', async (id: string) => {
    checks++;
    assert.equal(id, 'lab/zero');
    if (!available) throw new Error('无法核验免费目录');
    return parseFreeModels({
      data: [
        {
          id,
          name: id,
          pricing: { prompt: '0', completion: '0' },
          architecture: { input_modalities: ['text'], output_modalities: ['text'] },
        },
      ],
    })[0]!;
  });
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests++;
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer fixture-router-judge-key');
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, 'lab/zero');
    assert.equal(body.stream, undefined);
    assert.match(body.messages[0].content, /只输出一个 JSON/);
    assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0, request: 0, image: 0 });
    return Response.json({ choices: [{ message: { content: '{"score":8,"reason":"测试"}' } }] });
  });
  const run = () =>
    runBattle(def, tasks.slice(1), [{ id: 'test:answerer', name: '选手', kind: 'pi' }], {
      modelSettings: settings,
      openRouterFreeOnly: true,
      judgeModel: 'openrouter:lab/zero',
      retries: 0,
      ask: async () => ({ text: '四', latencyMs: 1 }),
    });
  const scored = await run();
  assert.equal(scored.records[0]!.score, 0.8);
  assert.equal(checks, 1);
  assert.equal(requests, 1);
  available = false;
  const failed = await run();
  const settled = buildSettlement(failed, buildLeaderboard(failed));
  assert.equal(requests, 1);
  assert.equal(checks, 2);
  assert.equal(settled.rows[0]!.avg, null);
  assert.equal(settled.rows[0]!.judgeErrors, 1);
  assert.equal(settled.outcome, 'no-score');
  assert.equal(settled.rows[0]!.zeroCredit, 0);
});
