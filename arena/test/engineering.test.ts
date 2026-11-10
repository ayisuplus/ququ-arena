import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { ENGINEERING_TASKS, hash, publicTask } from '../src/engineering/tasks.ts';
import { safeFile, type DockerWorkspace } from '../src/engineering/docker.ts';
import { startEngineeringTools } from '../src/engineering/tools.ts';
import { EngineeringEngine } from '../src/engineering/runner.ts';
import { EngineeringStore, makePatch } from '../src/engineering/store.ts';
import { engineeringComparisonKey, summarizeEngineering } from '../src/engineering/api.ts';
import type { EngineeringRun } from '../src/engineering/types.ts';
import type { AgentSession } from '../src/agent-session.ts';
import { createArenaServer } from '../src/server.ts';

const fixtureDir = () => mkdtemp(path.join(os.tmpdir(), 'arena-engineering-test-'));
function mockWorkspace() {
  let files: Record<string, string> = {},
    closed = false;
  return {
    id: randomUUID(),
    get closed() {
      return closed;
    },
    async start(_image: string, initial: Record<string, string>, signal?: AbortSignal) {
      signal?.throwIfAborted();
      files = { ...initial };
    },
    async put(changes: Record<string, string>, signal?: AbortSignal) {
      signal?.throwIfAborted();
      assert.equal(closed, false);
      Object.assign(files, changes);
    },
    async get(paths: string[], signal?: AbortSignal) {
      signal?.throwIfAborted();
      return Object.fromEntries(paths.map((p) => [p, files[p]]));
    },
    async syntax() {
      return { code: 0, output: 'syntax fixture', truncated: false };
    },
    async checks() {
      return { code: 1, output: 'public regression fixture', truncated: false };
    },
    async verify(task: (typeof ENGINEERING_TASKS)[number]) {
      return {
        passed: false,
        checks: task.checks.map((c) => ({ id: c.id, title: c.title, passed: false })),
        logs: { 'acceptance.log': 'controlled failure' },
      };
    },
    async close() {
      closed = true;
    },
  };
}
async function done(engine: EngineeringEngine, id: string) {
  const until = Date.now() + 4000;
  while (Date.now() < until) {
    const run = await engine.get(id);
    if (run.status !== 'running') return run;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('fixture did not finish');
}
const ready = {
  environment: async () => ({ ready: true, server: 'fixture', image: 'sha256:' + 'a'.repeat(64), message: 'fixture' }),
  agents: async () => [
    { id: 'codex' as const, name: 'Codex', status: 'ready' as const, version: 'fixture-v1' },
    { id: 'claude' as const, name: 'Claude', status: 'ready' as const, version: 'fixture-v1' },
  ],
  runtime: async () => ({ code: 0, output: 'fixture-node', truncated: false }),
};
test('工程任务：公开清单不泄露独立验收代码，版本随标准变化', () => {
  assert.equal(ENGINEERING_TASKS.length, 6);
  for (const task of ENGINEERING_TASKS) {
    assert.ok(task.requirements.length > 50);
    assert.deepEqual(task.writable, ['src/solution.ts']);
    assert.ok(task.checks.length >= 3);
    assert.ok(publicTask(task).checks.every((c) => !('code' in c)));
    const edited = structuredClone(task);
    edited.checks[0].code += ' ';
    assert.notEqual(hash(task), hash(edited));
  }
});
test('工程工具：拒绝跨目录、写测试、伪造授权；取消后不能再写', async () => {
  for (const value of ['../key', '/etc/passwd', 'C:\\key', 'src/../test/a', 'src//a', 'src/./a', 'src/a\u0000'])
    assert.throws(() => safeFile(value));
  const w = mockWorkspace(),
    task = ENGINEERING_TASKS[0],
    controller = new AbortController();
  await w.start('fixture', task.files);
  const events: string[] = [],
    tools = await startEngineeringTools(w as unknown as DockerWorkspace, task, controller.signal, (k, t) =>
      events.push(k + ':' + t),
    );
  const call = async (name: string, args = {}) =>
    fetch(tools.url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tools.bearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
  try {
    assert.equal((await fetch(tools.url, { method: 'POST' })).status, 403);
    assert.equal(
      (
        await fetch(tools.url, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + tools.bearer, Origin: 'https://bad.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (await (await call('write_file', { path: 'test/public.test.mjs', content: 'PASS' })).json()).result.isError,
      true,
    );
    assert.equal((await (await call('read_file', { path: 'acceptance.mjs' })).json()).result.isError, true);
    await call('write_file', { path: 'src/solution.ts', content: '中文分块测试' });
    assert.equal((await w.get(['src/solution.ts']))['src/solution.ts'], '中文分块测试');
    controller.abort();
    assert.equal((await call('write_file', { path: 'src/solution.ts', content: 'late' })).status, 410);
    assert.equal((await w.get(['src/solution.ts']))['src/solution.ts'], '中文分块测试');
  } finally {
    await tools.close();
  }
});
test('工程运行：每次重复干净隔离，失败保留产物，运行顺序轮换，快照可恢复', async () => {
  const dir = await fixtureDir(),
    workspaces: ReturnType<typeof mockWorkspace>[] = [],
    prompts: string[] = [];
  const engine = new EngineeringEngine(dir, {
    ...ready,
    workspace: () => {
      const w = mockWorkspace();
      workspaces.push(w);
      return w as unknown as DockerWorkspace;
    },
    session: () =>
      ({
        async send(prompt, emit) {
          prompts.push(prompt);
          emit({ type: 'text', text: 'fixture 完成' });
          emit({ type: 'done' });
        },
        close() {},
        cancel() {},
      }) as AgentSession,
  });
  try {
    const run = await engine.start({
      task: 'idempotent-ledger',
      agents: ['codex', 'claude'],
      repeats: 2,
      budgetMinutes: 1,
    });
    await assert.rejects(
      () => engine.start({ task: 'idempotent-ledger', agents: ['codex'], repeats: 1, budgetMinutes: 1 }),
      /已有/,
    );
    const result = await done(engine, run.id);
    assert.equal(result.status, 'finished');
    assert.deepEqual(
      result.trials.map((t) => t.agent),
      ['codex', 'claude', 'claude', 'codex'],
    );
    assert.equal(workspaces.length, 8);
    assert.ok(workspaces.every((w) => w.closed));
    assert.ok(prompts.every((p) => !p.includes('fixture 完成')));
    assert.ok(result.trials.every((t) => t.status === 'failed' && t.artifacts?.some((a) => a.name === 'patch.diff')));
    const saved = await engine.store.get(run.id);
    assert.deepEqual(saved.trials, result.trials);
    assert.deepEqual(
      saved.events.map((e) => e.seq),
      saved.events.map((_, i) => i + 1),
    );
    const summary = summarizeEngineering(result);
    assert.ok(summary.every((s) => s.passed === 0 && s.planned === 2 && s.started === 2 && s.environmentValid === 2));
    const altered = structuredClone(result);
    altered.protocol.image = 'different';
    assert.notEqual(engineeringComparisonKey(result), engineeringComparisonKey(altered));
  } finally {
    await engine.close();
  }
});
test('工程取消：停止原生会话与所有工作区，迟到输出不能污染记录', async () => {
  const dir = await fixtureDir(),
    workspaces: ReturnType<typeof mockWorkspace>[] = [],
    entered = Promise.withResolvers<void>();
  let late: ((event: any) => void) | undefined, rejectSend: ((error: Error) => void) | undefined;
  const engine = new EngineeringEngine(dir, {
    ...ready,
    workspace: () => {
      const w = mockWorkspace();
      workspaces.push(w);
      return w as unknown as DockerWorkspace;
    },
    session: () =>
      ({
        async send(_p, emit) {
          late = emit;
          entered.resolve();
          return new Promise<void>((_r, reject) => (rejectSend = reject));
        },
        close() {
          rejectSend?.(new Error('cancelled'));
        },
        cancel() {},
      }) as AgentSession,
  });
  try {
    const run = await engine.start({ task: 'pagination', agents: ['codex'], repeats: 2, budgetMinutes: 1 });
    await entered.promise;
    await engine.cancel(run.id);
    const saved = await engine.get(run.id);
    assert.equal(saved.status, 'cancelled');
    assert.ok(saved.trials.every((t) => t.status === 'cancelled'));
    late?.({ type: 'text', text: 'late contamination' });
    assert.equal((await engine.get(run.id)).trials[0].text, '');
    assert.ok(workspaces.every((w) => w.closed));
    assert.ok(saved.trials[0].artifacts?.length);
  } finally {
    await engine.close();
  }
});
test('工程恢复：进程重启不重试 Agent，按记录清理遗留容器', async () => {
  const dir = await fixtureDir(),
    store = new EngineeringStore(dir),
    removed: string[] = [];
  const run = {
    id: 'e-' + randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'running',
    task: ENGINEERING_TASKS[0],
    protocol: { version: 'fixture' },
    events: [],
    trials: [
      {
        id: 't1',
        agent: 'codex',
        repeat: 1,
        status: 'working',
        text: '保留',
        reasoning: '',
        containers: { work: randomUUID(), verification: randomUUID() },
      },
    ],
  } as unknown as EngineeringRun;
  await store.save(run);
  const engine = new EngineeringEngine(dir, {
    removeContainer: async (id) => {
      removed.push(id);
    },
  });
  try {
    const recovered = await engine.get(run.id);
    assert.equal(recovered.status, 'interrupted');
    assert.equal(recovered.trials[0].text, '保留');
    assert.equal(removed.length, 2);
  } finally {
    await engine.close();
  }
});
test('工程超时：预算到期终止工具循环并保留记录', async (t) => {
  const dir = await fixtureDir(),
    entered = Promise.withResolvers<void>();
  let rejectSend: ((error: Error) => void) | undefined;
  const engine = new EngineeringEngine(dir, {
    ...ready,
    workspace: () => mockWorkspace() as unknown as DockerWorkspace,
    session: () =>
      ({
        async send() {
          entered.resolve();
          return new Promise<void>((_r, reject) => (rejectSend = reject));
        },
        close() {
          rejectSend?.(new Error('timeout'));
        },
        cancel() {},
      }) as unknown as AgentSession,
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const run = await engine.start({ task: 'pagination', agents: ['codex'], repeats: 1, budgetMinutes: 1 });
    await entered.promise;
    t.mock.timers.tick(60000);
    t.mock.timers.reset();
    const result = await done(engine, run.id);
    assert.equal(result.trials[0].status, 'timed_out');
    assert.ok(result.trials[0].artifacts?.some((a) => a.name === 'failure.log'));
  } finally {
    t.mock.timers.reset();
    await engine.close();
  }
});
test('环境失败保留端到端分母，不伪装为验收失败或有效样本', async () => {
  const dir = await fixtureDir();
  const engine = new EngineeringEngine(dir, {
    ...ready,
    workspace: () =>
      ({
        ...mockWorkspace(),
        async start() {
          throw new Error('fixture engine unavailable');
        },
      }) as unknown as DockerWorkspace,
  });
  try {
    const run = await engine.start({ task: 'pagination', agents: ['codex'], repeats: 1, budgetMinutes: 1 });
    const result = await done(engine, run.id);
    assert.equal(result.trials[0].status, 'environment_error');
    const s = summarizeEngineering(result)[0];
    assert.equal(s.planned, 1);
    assert.equal(s.environmentValid, 0);
    assert.equal(s.passed, 0);
  } finally {
    await engine.close();
  }
});
test('工程接口：同源限制、旧文本入口兼容、网页与任务源码分离', async () => {
  const dir = await fixtureDir();
  await mkdir(path.join(dir, 'arenas'));
  const server = createArenaServer({
    arenasDir: path.join(dir, 'arenas'),
    resultsDir: path.join(dir, 'results'),
    modelSettingsFile: path.join(dir, 'models.json'),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  try {
    const html = await (await fetch(url + '/experiments')).text();
    assert.match(html, /独立复验/);
    assert.match(html, /文本实验诊断/);
    assert.equal((await fetch(url + '/web/engineering.js')).status, 200);
    assert.equal(
      (await fetch(url + '/api/engineering/runs', { headers: { Origin: 'https://foreign.example' } })).status,
      403,
    );
    assert.equal(
      (
        await fetch(url + '/api/engineering/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: '../secrets', agents: ['codex'], repeats: 1, budgetMinutes: 1 }),
        })
      ).status,
      400,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test('工程补丁：空文件和缺少末尾换行有明确 diff 标识', () => {
  assert.match(makePatch({ 'src/a.ts': 'abc\n' }, { 'src/a.ts': '' }), /@@ -1,1 \+0,0 @@\n-abc\n$/);
  assert.match(makePatch({ 'src/a.ts': '' }, { 'src/a.ts': '中文' }), /@@ -0,0 \+1,1 @@\n\+中文\n\\ No newline/);
});
