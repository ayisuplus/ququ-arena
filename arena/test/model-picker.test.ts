import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { ModelSettingsStore, emptyModelSettings, publicModelSettings } from '../src/model-settings.ts';
import {
  OpenRouterCatalog,
  openRouterCatalog,
  parseFreeModels,
  OPENROUTER_MODELS_URL,
  CATALOG_TTL_MS,
} from '../src/openrouter.ts';
import { askModel, resolveContestant } from '../src/models.ts';
import { createArenaServer } from '../src/server.ts';
import { readSse } from '../src/streams.ts';

const entry = (id: string, extra = {}) => ({
  id,
  name: id,
  pricing: { prompt: '0', completion: '0' },
  architecture: { input_modalities: ['text'], output_modalities: ['text'] },
  context_length: 32768,
  supported_parameters: ['reasoning'],
  ...extra,
});
const fixture = (...models: unknown[]) => ({ data: models });
const task = { id: 'test', condition: 'exact', input: '请说中文', target: '你好' };

test('免费目录：核验全部费用与文本输出，排除音乐/随机路由/缺失价格，支持新增型号', () => {
  const rows = parseFreeModels(
    fixture(
      entry('new-lab/not-in-old-catalog:free'),
      entry('lab/zero', { pricing: { prompt: '0e0', completion: 0, request: '0.00' } }),
      entry('lab/paid:free', { pricing: { prompt: '0', completion: '0.01' } }),
      entry('lab/request', { pricing: { prompt: '0', completion: '0', request: '0.1' } }),
      entry('lab/reasoning', { pricing: { prompt: '0', completion: '0', internal_reasoning: '0.1' } }),
      entry('lab/unknown', { pricing: { prompt: null, completion: '' } }),
      entry('lab/missing', { pricing: {} }),
      entry('lab/audio', { architecture: { input_modalities: ['text'], output_modalities: ['text', 'audio'] } }),
      entry('openrouter/free'),
      entry('lab/invalid,id'),
      null,
    ),
  );
  assert.deepEqual(
    rows.map((m) => m.modelId),
    ['new-lab/not-in-old-catalog:free', 'lab/zero'],
  );
  assert.equal(rows[0]!.reasoning, true);
  assert.throws(() => parseFreeModels({}), /格式/);
});

test('目录缓存：合并并发、到期刷新、上下架与变价更新、断网保留旧目录但停止免费调用', async (t) => {
  let now = Date.now(),
    calls = 0,
    fail = false,
    data = fixture(entry('lab/a:free'));
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (fail) throw new Error('offline');
    return Response.json(data);
  });
  const catalog = new OpenRouterCatalog();
  await Promise.all([catalog.get(), catalog.get(), catalog.get()]);
  assert.equal(calls, 1);
  await catalog.get();
  assert.equal(calls, 1);
  data = fixture(entry('lab/a:free', { pricing: { prompt: '1', completion: '1' } }), entry('lab/b:free'));
  now += CATALOG_TTL_MS + 1;
  assert.deepEqual(
    (await catalog.get()).models.map((m) => m.modelId),
    ['lab/b:free'],
  );
  await assert.rejects(catalog.requireFree('lab/a:free'), /不在当前免费/);
  fail = true;
  const stale = await catalog.get(true);
  assert.equal(stale.stale, true);
  assert.equal(stale.models[0]!.modelId, 'lab/b:free');
  assert.ok(stale.updatedAt);
  const previousCalls = calls;
  await assert.rejects(catalog.requireFree('lab/b:free'), /无法核验/);
  assert.equal(calls, previousCalls);
  fail = false;
  assert.equal((await catalog.get(true)).stale, false);
});

test('本机配置：并发保存不丢数据，密钥不回传，留空保留/替换/移除，坏配置不覆盖', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-model-settings-'));
  try {
    const store = new ModelSettingsStore(path.join(dir, 'settings.json'));
    await Promise.all([
      store.saveOpenRouter({ apiKey: 'sk-or-test-secret' }),
      store.saveCustom({
        name: '本地中文',
        modelId: 'qwen:test',
        baseUrl: 'http://localhost:11434/v1/chat/completions',
        apiKey: 'sk-local-secret',
      }),
    ]);
    let settings = await store.read();
    const id = settings.custom[0]!.id;
    assert.equal(settings.openrouter.apiKey, 'sk-or-test-secret');
    assert.equal(settings.custom[0]!.baseUrl, 'http://localhost:11434/v1');
    assert.ok(!JSON.stringify(publicModelSettings(settings)).includes('secret'));
    await store.saveCustom(
      { name: '新名称', modelId: 'qwen:test', baseUrl: 'http://localhost:11434/v1', apiKey: '' },
      id,
    );
    assert.equal((await store.read()).custom[0]!.apiKey, 'sk-local-secret');
    await store.saveOpenRouter({ apiKey: 'new-secret' });
    await store.saveOpenRouter({ apiKey: '' });
    assert.equal((await store.read()).openrouter.apiKey, 'new-secret');
    const before = await readFile(store.file, 'utf8');
    for (const baseUrl of ['file:///tmp/test', 'https://name:key@example.com/v1', 'https://example.com/v1?key=test'])
      await assert.rejects(store.saveCustom({ name: 'x', modelId: 'y', baseUrl }), /接口地址/);
    await assert.rejects(
      store.saveCustom({ name: 'a,b', modelId: 'x', baseUrl: 'https://example.com/v1' }),
      /显示名称/,
    );
    assert.equal(await readFile(store.file, 'utf8'), before);
    await store.saveOpenRouter({ clearApiKey: true });
    await store.deleteCustom(id);
    settings = await store.read();
    assert.equal(settings.openrouter.apiKey, '');
    assert.equal(settings.custom.length, 0);
    await writeFile(store.file, '{"apiKey":"broken-secret"');
    await assert.rejects(
      store.read(),
      (e: Error) => !e.message.includes('broken-secret') && /格式无效/.test(e.message),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('OpenRouter 动态型号直接流式调用：零价上限、固定模型、公开摘要去重、错误脱敏', async (t) => {
  const settings = emptyModelSettings();
  settings.openrouter.apiKey = 'sk-test-secret';
  let body: any,
    error = false,
    truncate = false;
  t.mock.method(openRouterCatalog, 'requireFree', async (id: string) => {
    assert.equal(id, 'lab/new:free');
    return parseFreeModels(fixture(entry(id)))[0]!;
  });
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    if (error) return new Response('rejected sk-test-secret', { status: 401 });
    const chunks = [
      {
        choices: [
          { delta: { reasoning: '公开', reasoning_details: [{ type: 'reasoning.text', text: '公开', index: 0 }] } },
        ],
      },
      { choices: [{ delta: { reasoning: '摘要', content: '你' } }] },
      {
        choices: [{ delta: { content: '好' }, ...(truncate ? {} : { finish_reason: 'stop' }) }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      },
    ];
    return new Response(chunks.map((v) => 'data: ' + JSON.stringify(v) + '\n\n').join(''), {
      headers: { 'content-type': 'text/event-stream' },
    });
  });
  const deltas: any[] = [];
  const c = resolveContestant('openrouter:lab/new:free');
  const result = await askModel(c, task, 'exact', {
    modelSettings: settings,
    onDelta: (d) => deltas.push(d),
    reasoning: 'medium',
  });
  assert.equal(result.text, '你好');
  assert.equal(result.reasoning, '公开摘要');
  assert.equal(
    deltas
      .filter((d) => d.channel === 'reasoning')
      .map((d) => d.delta)
      .join(''),
    '公开摘要',
  );
  assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0, request: 0, image: 0 });
  assert.equal(body.model, 'lab/new:free');
  assert.equal(body.models, undefined);
  assert.equal(body.reasoning.effort, 'medium');
  truncate = true;
  await assert.rejects(askModel(c, task, 'exact', { modelSettings: settings, onDelta: () => {} }), /意外中断/);
  error = true;
  await assert.rejects(
    askModel(c, task, 'exact', { modelSettings: settings }),
    (e: Error) => e.message.includes('401') && !e.message.includes('sk-test-secret'),
  );
});

test('模型 API 与比赛集成：安全读写、配置热生效、自定义 HTTP 参赛、删除后拒绝、战报不含密钥', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-model-api-'));
  let received: any;
  const upstream = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    received = { path: req.url, key: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(
      'data: ' +
        JSON.stringify({
          choices: [{ delta: { reasoning_content: '逐字还原', content: '北京是中国的首都' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 8, completion_tokens: 6 },
        }) +
        '\n\ndata: [DONE]\n\n',
    );
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  const upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  const rawFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (input: any, init?: RequestInit) =>
    String(input) === OPENROUTER_MODELS_URL
      ? Promise.resolve(Response.json(fixture(entry('lab/live:free'))))
      : rawFetch(input, init),
  );
  await openRouterCatalog.get(true);
  const server = createArenaServer({
    arenasDir: path.resolve('arenas'),
    resultsDir: path.join(dir, 'results'),
    modelSettingsFile: path.join(dir, 'config.json'),
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (route: string, body: unknown, method = 'POST', headers = {}) =>
    fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  async function collect(id: string) {
    const abort = new AbortController();
    const events: any[] = [];
    const response = await fetch(`${base}/battle/stream?battle=${id}&snapshot=1`, { signal: abort.signal });
    try {
      for await (const data of readSse(response.body!)) {
        const e = JSON.parse(data);
        events.push(...(e.type === 'snapshot' ? e.frames : [e]));
        if (events.some((f) => f.type === 'done' || f.type === 'error')) break;
      }
    } finally {
      abort.abort();
    }
    return events;
  }
  try {
    assert.equal(
      (await request('/api/model-settings/openrouter', { apiKey: 'x' }, 'PUT', { origin: 'http://untrusted.example' }))
        .status,
      403,
    );
    const badHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = http.request(
        base + '/api/model-settings/openrouter',
        { method: 'PUT', headers: { host: 'untrusted.example', 'content-type': 'application/json' } },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        },
      );
      req.on('error', reject);
      req.end('{"apiKey":"x"}');
    });
    assert.equal(badHostStatus, 403);
    const router = await request('/api/model-settings/openrouter', { apiKey: 'sk-or-config-only' }, 'PUT');
    assert.equal(router.status, 200);
    assert.ok(!(await router.text()).includes('sk-or-config-only'));
    const response = await request('/api/model-settings/custom', {
      name: '中文接口',
      modelId: 'not-in-any-catalog',
      baseUrl: upstreamUrl + '/v1',
      apiKey: 'sk-local-integration',
      stream: true,
    });
    assert.equal(response.status, 200);
    const created = (await response.json()) as any;
    const id = created.settings.custom[0].id;
    assert.ok(!JSON.stringify(created).includes('sk-local-integration'));
    const list = (await (await fetch(base + '/api/models')).json()) as any;
    assert.ok(list.models.some((m: any) => m.id === id));
    assert.equal(list.catalog.count, 1);
    const page = await (
      await fetch(`${base}/battle?arena=tongjia-pinyin&limit=1&pace=0&models=${encodeURIComponent(id)}`)
    ).text();
    const events = await collect(page.match(/data-battle="(b\d+)"/)![1]!);
    assert.ok(events.some((e) => e.type === 'done'));
    assert.equal(received.body.model, 'not-in-any-catalog');
    assert.equal(received.key, 'Bearer sk-local-integration');
    assert.equal(received.path, '/v1/chat/completions');
    const file = (await readdir(path.join(dir, 'results'))).find((f) => f.startsWith('战绩-'))!;
    const resultText = await readFile(path.join(dir, 'results', file), 'utf8');
    const result = JSON.parse(resultText);
    assert.equal(result.records[0].score, 1);
    assert.equal(result.contestants[0].name, '中文接口');
    assert.equal(result.contestants[0].modelId, 'not-in-any-catalog');
    assert.ok(!resultText.includes('sk-local-integration'));
    assert.ok(!JSON.stringify(events).includes('sk-local-integration'));
    assert.equal((await fetch(`${base}/api/model-settings/custom/${id}`, { method: 'DELETE' })).status, 200);
    assert.ok(!((await (await fetch(base + '/api/models')).json()) as any).models.some((m: any) => m.id === id));
    const nextPage = await (
      await fetch(`${base}/battle?arena=tongjia-pinyin&limit=2&pace=0&models=${encodeURIComponent(id)}`)
    ).text();
    assert.ok(
      (await collect(nextPage.match(/data-battle="(b\d+)"/)![1]!)).some(
        (e) => e.type === 'error' && /已删除/.test(e.message),
      ),
    );
  } finally {
    server.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([new Promise((r) => server.close(r)), new Promise((r) => upstream.close(r))]);
    await rm(dir, { recursive: true, force: true });
  }
});

test('公开推理：空增量不锁定来源，结束补发替换原块，加密内容不展示', async (t) => {
  const settings = emptyModelSettings();
  settings.openrouter.apiKey = 'fixture-key';
  t.mock.method(openRouterCatalog, 'requireFree', async () => parseFreeModels(fixture(entry('lab/test:free')))[0]!);
  let chunks: any[] = [
    { choices: [{ delta: { reasoning_details: [{ type: 'reasoning.text', text: '', index: 0 }] } }] },
    { choices: [{ delta: { reasoning: '公开摘要', content: '你好' }, finish_reason: 'stop' }] },
  ];
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(chunks.map((v) => 'data: ' + JSON.stringify(v) + '\n\n').join(''), {
        headers: { 'content-type': 'text/event-stream' },
      }),
  );
  const contestant = resolveContestant('openrouter:lab/test:free');
  assert.equal(
    (await askModel(contestant, task, 'exact', { modelSettings: settings, onDelta: () => {} })).reasoning,
    '公开摘要',
  );
  chunks = [
    {
      choices: [
        {
          delta: {
            reasoning_details: [
              { type: 'reasoning.encrypted', data: 'private-content', index: 0 },
              { type: 'reasoning.summary', summary: '公开', index: 1 },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          message: {
            content: '你好',
            reasoning_details: [{ type: 'reasoning.summary', summary: '公开摘要', index: 1 }],
          },
          finish_reason: 'stop',
        },
      ],
    },
  ];
  const blocks = new Map<number, string>();
  const result = await askModel(contestant, task, 'exact', {
    modelSettings: settings,
    onDelta: (d) => {
      if (d.channel === 'reasoning') blocks.set(d.block, d.replace ? d.delta : (blocks.get(d.block) ?? '') + d.delta);
    },
  });
  assert.equal(result.reasoning, '公开摘要');
  assert.deepEqual([...blocks.values()], ['公开摘要']);
  assert.equal(result.text, '你好');
  assert.ok(!JSON.stringify(result).includes('private-content'));
});
