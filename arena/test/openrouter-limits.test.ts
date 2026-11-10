import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  OpenRouterRequestError,
  recordOpenRouterError,
  openRouterStatus,
  assertOpenRouterAvailable,
  recordOpenRouterSuccess,
} from '../src/openrouter-limits.ts';
import { askModel, resolveContestant } from '../src/models.ts';
import { emptyModelSettings, ModelSettingsStore } from '../src/model-settings.ts';
import { runBattle } from '../src/runner.ts';
import { BattleControl } from '../src/battle-control.ts';
import { createArenaServer } from '../src/server.ts';

const task = { id: 'Q1', condition: 'test', input: '1+1', target: '2' };
const modelId = 'fixture/quota:free';
const freeCatalog = {
  data: [modelId, 'fixture/other:free'].map((id) => ({
    id,
    name: id,
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    pricing: { prompt: '0', completion: '0' },
  })),
};
const dailyPayload = (resetAt = Date.now() + 3600_000) => ({
  error: {
    code: 429,
    message: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day',
    metadata: {
      headers: { 'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(resetAt / 1000) },
    },
  },
});

test('429 日额度解析完整 metadata，给出真实重置时间，不重试且不泄露密钥', () => {
  const resetAt = Date.UTC(2026, 8, 13),
    error = new OpenRouterRequestError(429, dailyPayload(resetAt));
  assert.equal(error.scope, 'daily');
  assert.equal(error.retryable, false);
  assert.equal(error.limit, 50);
  assert.equal(error.remaining, 0);
  assert.equal(error.resetAt, resetAt);
  assert.match(error.message, /每日免费额度已用完.*0 \/ 50/);
  assert.match(error.message, /2026\/9\/13 08:00:00/);
  const key = 'synthetic-secret';
  assert.ok(
    !new OpenRouterRequestError(401, { error: { message: `invalid ${key}` } }, new Headers(), key).message.includes(
      key,
    ),
  );
});

test('分钟限流尊重 Retry-After 秒/HTTP 日期；上游 429 不误判为全账号日额度耗尽', () => {
  const now = Date.UTC(2026, 8, 12);
  const minute = new OpenRouterRequestError(
    429,
    { error: { message: 'free-models-per-minute' } },
    new Headers({ 'Retry-After': '60' }),
    '',
    now,
  );
  assert.equal(minute.retryable, true);
  assert.equal(minute.scope, 'minute');
  assert.equal(minute.retryAfterMs, 60_000);
  assert.equal(new OpenRouterRequestError(429, { error: { message: 'free-models-per-minute' } }).retryAfterMs, 60_000);
  const current = Date.now();
  recordOpenRouterError(
    'minute-key',
    new OpenRouterRequestError(
      429,
      { error: { message: 'free-models-per-minute' } },
      new Headers({ 'Retry-After': '10' }),
    ),
    current,
  );
  assert.throws(
    () => assertOpenRouterAvailable('minute-key'),
    (error: unknown) =>
      error instanceof OpenRouterRequestError && error.retryAfterMs! > 9000 && error.retryAfterMs! <= 10_000,
  );
  const provider = new OpenRouterRequestError(
    429,
    { error: { message: 'provider overloaded' } },
    new Headers({ 'Retry-After': new Date(now + 90_000).toUTCString() }),
    '',
    now,
  );
  assert.equal(provider.scope, 'provider');
  assert.equal(provider.retryAfterMs, 90_000);
  recordOpenRouterError('provider-key', provider, now);
  assert.equal(openRouterStatus('provider-key', now).blocked, false);
});

test('同 Key 免费模型共享冷却，换 Key 独立；迟到成功/上游错误不能清除日额度；重置后回到未检测', () => {
  const key = 'guard-key',
    now = Date.now(),
    error = new OpenRouterRequestError(429, dailyPayload(now + 60_000));
  recordOpenRouterError(key, error, now);
  assert.throws(() => assertOpenRouterAvailable(key), /每日免费额度/);
  assert.equal(openRouterStatus('another-key', now).blocked, false);
  recordOpenRouterSuccess(key);
  recordOpenRouterError(key, new OpenRouterRequestError(429, { error: { message: 'provider overloaded' } }), now);
  assert.equal(openRouterStatus(key, now).scope, 'daily');
  assert.equal(openRouterStatus(key, now + 60_001).state, 'untested');
});

test('HTTP 200 内的流式 429 也停止重试与后续免费题目，独立 Key 可正常调用', async (t) => {
  let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url: string | URL, options?: RequestInit) => {
    if (String(url).endsWith('/models')) return Response.json(freeCatalog);
    assert.equal(String(url), 'https://openrouter.ai/api/v1/chat/completions');
    posts++;
    if (new Headers(options?.headers).get('authorization') === 'Bearer clean-key')
      return Response.json({ choices: [{ message: { content: '2' } }] });
    return new Response(`data: ${JSON.stringify(dailyPayload())}\n\ndata: [DONE]\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    });
  });
  const settings = emptyModelSettings();
  settings.openrouter.apiKey = 'stream-day-key';
  const result = await runBattle(
    { name: 'quota-test', title: 'Quota test', description: '', judge: { kind: 'exact' } },
    Array.from({ length: 16 }, (_, i) => ({ ...task, id: 'Q' + i })),
    [resolveContestant('openrouter:' + modelId)],
    {
      retries: 3,
      concurrency: 1,
      roundSync: true,
      modelSettings: settings,
      openRouterFreeOnly: true,
      onModelEvent: () => {},
    },
  );
  assert.equal(posts, 1);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]!.attempts, 1);
  assert.equal(result.withdrawals?.[0]?.reason, 'unavailable');
  assert.notEqual(result.status, 'stopped', '额度耗尽是选手退赛，不是用户终止整场');
  await assert.rejects(
    askModel(resolveContestant('openrouter:fixture/other:free'), task, 'exact', { modelSettings: settings }),
    /每日免费额度/,
  );
  assert.equal(posts, 1);
  settings.openrouter.apiKey = 'clean-key';
  assert.equal(
    (await askModel(resolveContestant('openrouter:' + modelId), task, 'exact', { modelSettings: settings })).text,
    '2',
  );
  assert.equal(posts, 2);
});

test('临时 429 的重试至少等待 Retry-After；等待期间可取消', async () => {
  const times: number[] = [],
    contestant = resolveContestant('openrouter:' + modelId);
  const transient = new OpenRouterRequestError(
    429,
    { error: { message: 'provider busy' } },
    new Headers({ 'Retry-After': '2' }),
  );
  const result = await runBattle(
    { name: 'backoff-test', title: 'Backoff test', description: '', judge: { kind: 'exact' } },
    [task],
    [contestant],
    {
      retries: 1,
      ask: async () => {
        times.push(Date.now());
        if (times.length === 1) throw transient;
        return { text: '2', latencyMs: 1 };
      },
    },
  );
  assert.equal(result.records[0]!.score, 1);
  assert.ok(times[1]! - times[0]! >= 1950);
  const control = new BattleControl();
  let attempts = 0;
  const pending = runBattle(
    { name: 'cancel-test', title: 'Cancel test', description: '', judge: { kind: 'exact' } },
    [task],
    [contestant],
    {
      control,
      retries: 3,
      ask: async () => {
        attempts++;
        setTimeout(() => control.stop(), 15);
        throw transient;
      },
    },
  );
  await pending;
  assert.equal(attempts, 1);
});

test('本机检测 API 返回可用性而非密钥，日额度阻止免费开赛，自定义连接不受影响', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'arena-quota-api-')),
    settingsFile = path.join(directory, 'settings.json');
  const store = new ModelSettingsStore(settingsFile);
  await store.saveOpenRouter({ apiKey: 'api-quota-key' });
  await store.saveCustom({
    name: 'Local model',
    modelId: 'local',
    baseUrl: 'http://127.0.0.1:9/v1',
    apiKey: '',
    stream: true,
  });
  const originalFetch = globalThis.fetch;
  let posts = 0;
  t.mock.method(globalThis, 'fetch', async (url: string | URL, options?: RequestInit) => {
    if (!String(url).startsWith('https://openrouter.ai/')) return originalFetch(url, options);
    if (String(url).endsWith('/models')) return Response.json(freeCatalog);
    posts++;
    const body = JSON.parse(String(options?.body));
    assert.equal(body.max_tokens, 8);
    assert.equal(body.provider.max_price.prompt, 0);
    return Response.json(dailyPayload(), { status: 429 });
  });
  const server = createArenaServer({
    arenasDir: path.resolve('arenas'),
    resultsDir: directory,
    modelSettingsFile: settingsFile,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    endpoint = base + '/api/model-settings/openrouter/check';
  try {
    assert.equal((await fetch(endpoint)).status, 405);
    assert.equal(
      (await fetch(endpoint, { method: 'POST', headers: { origin: 'https://unrelated.invalid' } })).status,
      403,
    );
    const checked = (await (
      await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    ).json()) as any;
    assert.equal(checked.settings.openrouter.availability.blocked, true);
    assert.equal(posts, 1);
    assert.ok(!JSON.stringify(checked).includes('api-quota-key'));
    assert.match(checked.error, /每日免费额度/);
    const models = (await (await fetch(base + '/api/models')).json()) as any;
    assert.ok(models.models.filter((m: any) => m.source === 'openrouter').every((m: any) => !m.ready));
    assert.equal(models.models.find((m: any) => m.source === 'custom').ready, true);
    await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(posts, 1, '已确认的冷却期间检测不再发无效请求');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert.equal(path.dirname(directory), tmpdir());
    assert.ok(path.basename(directory).startsWith('arena-quota-api-'));
    await rm(directory, { recursive: true, force: true });
  }
});
