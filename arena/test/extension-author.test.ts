import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { ExtensionAuthor } from '../src/harness/authoring.ts';
import { AuthorStore, draftSource } from '../src/harness/authoring-store.ts';
import { checkExtension, EXAMPLE_TESTS, testCases } from '../src/harness/authoring-tests.ts';
import { AUTHOR_GUIDE, startAuthorTools } from '../src/harness/authoring-tools.ts';
import { NATIVE_TEMPLATES } from '../src/harness/native-templates.ts';
import { nativePackage } from '../src/harness/native-package.ts';
import { nativeStatus } from '../src/harness/native-host.ts';
import type { AgentEvent } from '../src/agent-session.ts';
import type { AgentInfo } from '../src/agents.ts';
const dir = () => mkdtemp(path.join(os.tmpdir(), 'extension-author-test-'));
const base = (): { files: Record<string, string>; flags: Record<string, string | boolean> } => ({
  files: { ...NATIVE_TEMPLATES[1]!.package.files, 'extension-tests.json': JSON.stringify(EXAMPLE_TESTS) },
  flags: {},
});
const agents = async (): Promise<AgentInfo[]> => [{ id: 'codex', name: 'Codex', status: 'ready', version: 'fixture' }];
const environment = async () => ({
  ready: true,
  version: '0.85.1',
  hash: 'fixture',
  image: 'sha256:' + '0'.repeat(64),
  message: 'fixture',
});
const check: typeof checkExtension = async (p) => ({
  digest: nativePackage(p).digest,
  at: new Date().toISOString(),
  passed: true,
  cases: [],
});
async function done(engine: ExtensionAuthor, id: string) {
  for (let i = 0; i < 200; i++) {
    const d = await engine.get(id);
    if (!['running', 'checking'].includes(d.status)) return d;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('fixture timeout');
}
async function mcp(endpoint: { url: string; bearer: string }, name: string, args: object = {}) {
  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + endpoint.bearer, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  assert.equal(response.status, 200);
  const body: any = await response.json();
  if (body.result.isError) throw new Error(body.result.content[0].text);
  return body.result.content[0].text;
}
test('草稿文件和用例限制：路径、原型键、大小、无断言与未知操作均拒绝', () => {
  assert.throws(() => draftSource({ files: { '../private.json': 'x' } }), /相对文件路径/);
  assert.throws(() => draftSource({ files: { '.env': 'key' } }));
  assert.throws(() => draftSource({ files: { 'a.ts': 'x'.repeat(128001) } }));
  assert.throws(() => draftSource({ files: JSON.parse('{"__proto__/a.ts":"x"}') }));
  const files = base().files;
  assert.equal(testCases(files).length, 2);
  const invalid = structuredClone(EXAMPLE_TESTS);
  invalid.cases[0]!.steps[0]!.expect = [];
  assert.throws(() => testCases({ ...files, 'extension-tests.json': JSON.stringify(invalid) }), /断言/);
  assert.throws(
    () =>
      testCases({
        ...files,
        'extension-tests.json': JSON.stringify({
          version: 1,
          cases: [{ name: 'x', files: {}, steps: [{ op: 'shell', expect: [{ path: '', equals: 0 }] }] }],
        }),
      }),
    /不支持/,
  );
});
test('真实功能试运行覆盖拦截、允许、文件效果和用例状态隔离', async (t) => {
  const env = await nativeStatus();
  if (!env.ready) {
    t.skip(env.message);
    return;
  }
  const result = await checkExtension(base(), AbortSignal.timeout(60000), () => {});
  assert.equal(result.passed, true);
  assert.equal(result.cases.length, 2);
  assert.ok(result.capabilities?.events.includes('tool_call'));
  const broken = base();
  broken.files['index.ts'] = 'export default function(pi) {}';
  const failed = await checkExtension(broken, AbortSignal.timeout(60000), () => {});
  assert.equal(failed.passed, false);
  assert.equal(failed.cases[0]!.steps[0]!.passed, false);
});
test('不同新草稿具有独立包名，不因默认重名而无法组合', async () => {
  const engine = new ExtensionAuthor(await dir());
  try {
    const a = await engine.create({ name: '检索' }),
      b = await engine.create({ name: '护栏' });
    assert.notEqual(nativePackage(a.source).name, nativePackage(b.source).name);
  } finally {
    await engine.close();
  }
});
test('会话续接读取最新草稿；开发计量与导出隔离，重复请求不重复调用', async () => {
  const directory = await dir(),
    sessions: (string | undefined)[] = [],
    prompts: string[] = [];
  const engine = new ExtensionAuthor(directory, {
    agents,
    environment,
    check,
    session: (_agent, _cwd, id, instructions, options) => {
      sessions.push(id);
      assert.ok(instructions?.includes('不得访问'));
      assert.ok(!instructions?.includes('acceptance.mjs'));
      return {
        async send(prompt, emit) {
          prompts.push(prompt);
          emit({ type: 'session', id: 'native-author-thread' });
          const snapshot = JSON.parse(await mcp(options!.tools, 'read_draft'));
          assert.ok(!('benchmark' in snapshot));
          assert.ok((await mcp(options!.tools, 'get_extension_guide')).includes('registerTool'));
          await mcp(options!.tools, 'write_file', {
            path: 'README.md',
            content: '独立合成扩展\n中文改动 ' + sessions.length,
          });
          await mcp(options!.tools, 'run_tests');
          emit({
            type: 'usage',
            input: 10,
            output: 2,
            totalInput: 100 * sessions.length,
            totalOutput: 20 * sessions.length,
          });
          emit({ type: 'text', text: '已完成真实草稿修改' });
          emit({ type: 'done' });
        },
        close() {},
        cancel() {},
      };
    },
  });
  try {
    let d = await engine.create({ name: '测试扩展', source: base() }),
      requestId = randomUUID();
    await engine.send(d.id, { prompt: '增加说明', revision: d.revision, requestId });
    d = await done(engine, d.id);
    assert.equal(d.status, 'ready');
    assert.equal(d.checkCurrent, true);
    await engine.send(d.id, { prompt: '增加说明', revision: 1, requestId });
    assert.equal(prompts.length, 1);
    assert.deepEqual(d.turns[0]!.usage, { input: 100, output: 20 });
    assert.equal('sessionId' in d, false);
    const snapshot = await engine.export(d.id);
    assert.equal(snapshot.source.files['README.md'], '独立合成扩展\n中文改动 1');
    await engine.send(d.id, { prompt: '修改说明', revision: d.revision, requestId: randomUUID() });
    d = await done(engine, d.id);
    assert.deepEqual(sessions, [undefined, 'native-author-thread']);
    assert.deepEqual(d.turns[1]!.usage, { input: 100, output: 20 });
    const source = structuredClone(d.source);
    source.files['index.ts'] += '\n// manual';
    const edited = await engine.edit(d.id, { revision: d.revision, name: d.name, source });
    assert.equal(edited.checkCurrent, false);
    await assert.rejects(engine.edit(d.id, { revision: d.revision, name: d.name, source }), /新修订/);
    await assert.rejects(engine.export(d.id), /尚未通过/);
  } finally {
    await engine.close();
  }
});
test('取消是终态：拒绝晚到工具/输出，保留已写入文件，不自动续跑', async () => {
  const directory = await dir();
  let late: Promise<unknown> | undefined,
    release!: () => void,
    endpoint: { url: string; bearer: string },
    emit: (e: AgentEvent) => void;
  const began = Promise.withResolvers<void>(),
    blocked = Promise.withResolvers<void>();
  release = () => blocked.resolve();
  const engine = new ExtensionAuthor(directory, {
    agents,
    environment,
    check,
    session: (_a, _c, _id, _i, options) => ({
      async send(_p, e) {
        emit = e;
        endpoint = options!.tools;
        await mcp(endpoint, 'write_file', { path: 'README.md', content: 'before cancel' });
        began.resolve();
        await blocked.promise;
        late = mcp(endpoint, 'write_file', { path: 'README.md', content: 'after cancel' }).catch(() => {});
        emit({ type: 'text', text: 'late' });
      },
      close() {
        release();
      },
      cancel() {
        release();
      },
    }),
  });
  try {
    const d = await engine.create({ name: '取消', source: base() });
    await engine.send(d.id, { prompt: '修改', revision: 1, requestId: randomUUID() });
    await began.promise;
    await assert.rejects(engine.edit(d.id, { revision: 2, name: d.name, source: base() }), /正在运行/);
    const stopped = await engine.cancel(d.id);
    await late;
    assert.equal(stopped.status, 'cancelled');
    assert.equal(stopped.source.files['README.md'], 'before cancel');
    assert.equal(stopped.turns[0]!.text, '');
    assert.equal((await engine.store.get(d.id)).status, 'cancelled');
  } finally {
    release();
    await engine.close();
  }
});
test('重启恢复保留已保存内容并清理所属容器，不自行调用 Codex', async () => {
  const directory = await dir(),
    store = new AuthorStore(directory),
    id = 'd-' + randomUUID(),
    cid = randomUUID();
  await store.save({
    id,
    name: '中断草稿',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    revision: 4,
    status: 'running',
    source: base(),
    checks: [],
    turns: [],
    containerId: cid,
  });
  const removed: string[] = [],
    engine = new ExtensionAuthor(directory, {
      removeContainer: async (id) => {
        removed.push(id);
      },
      session: () => {
        throw new Error('must not run');
      },
    });
  try {
    const d = await engine.get(id);
    assert.equal(d.status, 'interrupted');
    assert.equal(d.revision, 4);
    assert.deepEqual(removed, [cid]);
  } finally {
    await engine.close();
  }
});
test('本机会话 MCP 拒绝无认证和未知工具；中文分块完整保留', async () => {
  const controller = new AbortController(),
    calls: string[] = [],
    endpoint = await startAuthorTools(controller.signal, async (_n, a) => {
      calls.push(a.content);
      return a.content;
    });
  try {
    assert.equal((await fetch(endpoint.url, { method: 'POST', body: '{}' })).status, 403);
    assert.equal(await mcp(endpoint, 'write_file', { path: 'README.md', content: '中文😀扩展' }), '中文😀扩展');
    assert.deepEqual(calls, ['中文😀扩展']);
    await assert.rejects(mcp(endpoint, 'read_secret'), /无效/);
    assert.ok(!AUTHOR_GUIDE.includes('标准答案'));
  } finally {
    controller.abort();
    await endpoint.close();
  }
});
