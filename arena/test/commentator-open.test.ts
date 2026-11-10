import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const temp = await mkdtemp(path.join(os.tmpdir(), 'ququ-commentary-v15-'));
process.env.QUQU_MODEL_SETTINGS_FILE = path.join(temp, 'models.json');
process.env.QUQU_COMMENTATOR_SETTINGS_FILE = path.join(temp, 'commentators.json');
const { ModelSettingsStore } = await import('../src/model-settings.ts');
const { commentatorSettings, requireCommentator } = await import('../src/commentator-settings.ts');
const { OpenCommentatorSession } = await import('../src/commentator-session.ts');
const { handleGameApi } = await import('../src/game-api.ts');
const { Commentator } = await import('../src/commentator.ts');
const modelStore = new ModelSettingsStore();
const requests: any[] = [];
const upstream = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body);
  requests.push(payload);
  if (payload.model === 'hang') return;
  if (payload.stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: '本轮' } }] }) + '\n\n');
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: '依据已公布评分解说。' } }] }) + '\n\n');
    res.end(
      'data: ' +
        JSON.stringify({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 12 } }) +
        '\n\ndata: [DONE]\n\n',
    );
  } else {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: '非流式模型也可解说。' } }],
        usage: { prompt_tokens: 5, completion_tokens: 8 },
      }),
    );
  }
});
await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const baseUrl = 'http://127.0.0.1:' + (upstream.address() as any).port + '/v1';
const settings = await modelStore.saveCustom({
  name: '测试模型',
  modelId: 'test',
  baseUrl,
  apiKey: 'test-secret',
  stream: true,
});
const modelId = settings.custom[0]!.id;
await commentatorSettings.update({ id: 'pi', kind: 'pi', name: 'Pi 解说', modelId, prompt: '沉稳简洁' });
const fixture = fileURLToPath(new URL('./fixtures/commentary-agent.mjs', import.meta.url));
after(async () => {
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  await rm(temp, { recursive: true, force: true });
});

test('default Pi executes the real Agent lifecycle against the configured streaming model', async () => {
  const events: any[] = [];
  const session = new OpenCommentatorSession('pi', temp);
  await session.send('Q7，选手得分已经公开；上一轮点评保留在上下文。', (e) => events.push(e));
  session.close();
  assert.deepEqual(
    events
      .filter((e) => e.type === 'text')
      .map((e) => e.text)
      .slice(0, 2),
    ['本轮', '本轮依据已公布评分解说。'],
  );
  assert.equal(events.at(-1).type, 'done');
  assert.equal(events.find((e) => e.type === 'usage').input, 20);
  assert.ok(requests.at(-1).messages[0].content.includes('沉稳简洁'));
  assert.ok(requests.at(-1).messages.at(-1).content.includes('Q7'));
  assert.equal(requests.at(-1).tools, undefined);
});
test('direct LLM supports existing non-streaming custom endpoints', async () => {
  const saved = await modelStore.saveCustom({ name: '非流式', modelId: 'plain', baseUrl, stream: false });
  const id = saved.custom.at(-1)!.id;
  await requireCommentator('llm:' + id, true);
  const events: any[] = [];
  const session = new OpenCommentatorSession('llm:' + id, temp);
  await session.send('本轮情况', (e) => events.push(e));
  session.close();
  assert.equal(events.find((e) => e.type === 'text').text, '非流式模型也可解说。');
  assert.equal(requests.at(-1).stream, undefined);
  assert.equal(requests.at(-1).messages[0].role, 'system');
});
test('custom Pi and process profiles survive restart and keep arbitrary argument strings literal', async () => {
  const saved = await commentatorSettings.update({
    name: '自己的 Agent',
    kind: 'command',
    prompt: '证据优先',
    command: process.execPath,
    args: [fixture, 'normal', 'literal $(not-a-shell)'],
  });
  const id = saved.selected;
  const text: string[] = [];
  const session = new OpenCommentatorSession(id, temp);
  await session.send('已结算 Q3', (e) => {
    if (e.type === 'text') text.push(e.text);
  });
  session.close();
  assert.equal(text.at(-1), '独立 Agent：已结算 Q3 / 证据优先');
  assert.ok((await commentatorSettings.read()).find((p) => p.id === id));
  const agent = await commentatorSettings.update({ name: '战术 Pi', kind: 'pi', modelId, prompt: '只讲策略' });
  const other = new OpenCommentatorSession(agent.selected, temp);
  await other.send('Q4', () => {});
  other.close();
  assert.ok(requests.at(-1).messages[0].content.includes('只讲策略'));
  assert.ok(!(await readFile(commentatorSettings.file, 'utf8')).includes('test-secret'));
});
test('process errors, missing executable and timeout terminate without a successful commentary', async () => {
  for (const mode of ['invalid', 'exit', 'hang', 'missing']) {
    const saved = await commentatorSettings.update({
      name: mode,
      kind: 'command',
      prompt: '',
      command: mode === 'missing' ? path.join(temp, 'missing.exe') : process.execPath,
      args: [fixture, mode],
    });
    const session = new OpenCommentatorSession(saved.selected, temp, 500);
    const events: any[] = [];
    await assert.rejects(session.send('Q9', (e) => events.push(e)));
    session.close();
    assert.equal(
      events.some((e) => e.type === 'done'),
      false,
    );
  }
});
test('API timeout and close abort the real pending provider request', async () => {
  const saved = await modelStore.saveCustom({ name: '慢模型', modelId: 'hang', baseUrl, stream: true });
  const id = 'llm:' + saved.custom.at(-1)!.id;
  const timed = new OpenCommentatorSession(id, temp, 120);
  await assert.rejects(timed.send('Q1', () => {}));
  timed.close();
  const canceled = new OpenCommentatorSession(id, temp);
  const pending = canceled.send('Q2', () => {});
  setTimeout(() => canceled.close(), 50);
  await assert.rejects(pending);
  await assert.rejects(canceled.send('Q3', () => {}));
});
test('HTTP API validates profiles and returns no provider credentials', async () => {
  const server = createServer((req, res) => {
    void handleGameApi(req, res, new URL(req.url!, 'http://localhost'), {} as any, {} as any);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + (server.address() as any).port + '/api/game/commentators';
  try {
    const catalog = await (await fetch(url)).text();
    assert.ok(catalog.includes('Pi 解说'));
    assert.ok(!catalog.includes('test-secret'));
    const invalid = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'bad', kind: 'command', prompt: '', command: 'relative.exe', args: [] }),
    });
    assert.equal(invalid.status, 400);
    const foreign = await fetch(url, { headers: { origin: 'https://untrusted.example' } });
    assert.equal(foreign.status, 403);
    await assert.rejects(requireCommentator('commentator:missing', true));
    await assert.rejects(commentatorSettings.update({ id: 'pi', action: 'delete' }));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test('switching sources discards late text, closes sessions and allows reopening a source', async () => {
  const events: any[] = [];
  const sessions: any[] = [];
  const seat = new Commentator(
    temp,
    () => [],
    (e) => events.push(e),
    (id) => {
      const session: any = {
        id,
        close() {
          this.closed = true;
          this.resolve?.();
        },
        cancel() {},
        send(_p: string, emit: any) {
          this.emit = emit;
          return new Promise<void>((r) => (this.resolve = r));
        },
      };
      sessions.push(session);
      return session;
    },
  );
  try {
    seat.configure('pi', true);
    seat.ask('第一问');
    seat.configure('llm:' + modelId, true);
    seat.ask('第二问');
    sessions[0].emit({ type: 'text', text: '过期回复' });
    sessions[1].emit({ type: 'text', text: '当前回复' });
    sessions[1].resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      events.some((e) => e.entry?.text === '过期回复'),
      false,
    );
    assert.ok(events.some((e) => e.entry?.text === '当前回复'));
    seat.configure('pi', true);
    seat.ask('第三问');
    assert.equal(sessions.length, 3);
    assert.equal(sessions[0].closed, true);
    sessions[2].resolve();
  } finally {
    seat.dispose();
  }
});
