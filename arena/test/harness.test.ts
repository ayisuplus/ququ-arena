import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Type } from '@earendil-works/pi-ai';
import { connectModel } from '../src/harness/connection.ts';
import { PiTrial } from '../src/harness/runtime.ts';
import { BASELINE, DEFAULT_PROFILES, makeProfile } from '../src/harness/extensions.ts';
import { HarnessEngine } from '../src/harness/runner.ts';
import { summarize, usageSummary } from '../src/harness/analysis.ts';
import { ModelSettingsStore, emptyModelSettings } from '../src/model-settings.ts';
import { probeModel, probeResult } from '../src/model-probe.ts';
import type { StartHarness, Trial } from '../src/harness/types.ts';

async function endpoint(handler: (body: any, call: number) => any | Promise<any>) {
  const requests: any[] = [];
  const server = http.createServer((req, res) => {
    void (async () => {
      let raw = '';
      for await (const c of req) raw += c;
      const body = JSON.parse(raw);
      requests.push(body);
      const result = await handler(body, requests.length);
      if (result.error) {
        res
          .writeHead(result.status ?? 429, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: { message: result.error } }));
        return;
      }
      if (body.stream !== true) {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            choices: [{ message: { content: result.text ?? 'OK' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
        );
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const frame = (delta: object, finish: string | null = null, usage?: object) =>
        res.write(
          'data: ' +
            JSON.stringify({
              id: 'completion',
              model: 'fixture',
              choices: [{ index: 0, delta, finish_reason: finish }],
              ...(usage ? { usage } : {}),
            }) +
            '\n\n',
        );
      if (result.tools)
        frame({
          role: 'assistant',
          tool_calls: result.tools.map((t: any, i: number) => ({
            index: i,
            id: 'call_' + requests.length + '_' + i,
            type: 'function',
            function: { name: t.name, arguments: JSON.stringify(t.args) },
          })),
        });
      else {
        frame({ role: 'assistant', reasoning_content: '公开摘要' });
        for (const c of result.text ?? '42') frame({ content: c });
      }
      frame(
        {},
        result.tools ? 'tool_calls' : 'stop',
        result.noUsage
          ? undefined
          : { prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 2 } },
      );
      res.end('data: [DONE]\n\n');
    })().catch(() => res.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const settings = emptyModelSettings();
  settings.custom.push({
    id: 'custom:11111111-1111-1111-1111-111111111111',
    name: 'isolated fixture',
    modelId: 'fixture',
    baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`,
    apiKey: 'fixture-secret',
    stream: true,
  });
  return {
    settings,
    id: settings.custom[0]!.id,
    requests,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
const newTrial = (): Trial => ({
  id: 't1',
  taskId: 'q1',
  profileId: 'baseline',
  repeat: 1,
  status: 'running',
  calls: [],
  rounds: [],
});
const budget = { timeMs: 5000, maxCalls: 12, maxOutputTokens: 128 };

test('真实 pi-agent 循环：工具调用后继续；规划与复核都计量，中文增量不重复', async () => {
  let writes = 0;
  const api = await endpoint((body) => {
    const last = body.messages.at(-1);
    if (JSON.stringify(last.content)?.includes('先分析')) return { text: '检查边界的计划' };
    if (JSON.stringify(last.content)?.includes('请复核')) return { text: '复核后的中文答案' };
    if (last.role === 'tool') return { text: '代码修改完成' };
    return { tools: [{ name: 'write_file', args: { value: '已修改' } }] };
  });
  const trial = newTrial(),
    controller = new AbortController(),
    events: string[] = [];
  const runtime = new PiTrial(
    await connectModel(api.id, api.settings),
    trial,
    budget,
    DEFAULT_PROFILES[3]!,
    [
      {
        name: 'write_file',
        label: 'write',
        description: 'fixture tool',
        parameters: Type.Object({ value: Type.String() }),
        async execute(_id, args) {
          writes++;
          return { content: [{ type: 'text', text: (args as { value: string }).value }], details: {} };
        },
      },
    ],
    controller.signal,
    (k, text) => events.push(k + text),
  );
  try {
    assert.equal(await runtime.answer('r1', '修改代码，不访问外部网络'), '复核后的中文答案');
    assert.equal(writes, 1);
    assert.equal(trial.calls.length, 4);
    assert.deepEqual(
      trial.calls.map((c) => c.phase),
      ['plan', 'solve', 'solve', 'review'],
    );
    assert.equal(trial.calls[3]!.text, '复核后的中文答案');
    assert.equal(trial.calls[0]!.reasoning, '公开摘要');
    assert.deepEqual(usageSummary([trial]), {
      calls: 4,
      knownCalls: 4,
      input: 40,
      output: 20,
      total: 60,
      complete: true,
      cacheKnownCalls: 4,
      cacheRate: 0.2,
    });
    assert.ok(api.requests.every((r) => r.max_tokens === 128 && r.temperature === 0));
    assert.ok(!api.requests[0].tools);
    assert.ok(events.some((e) => e.startsWith('tool_result')));
  } finally {
    await runtime.close();
    await api.close();
  }
});

test('预算覆盖扩展；三次失败精确计数、无 SDK 隐式重试、无密钥泄漏', async () => {
  const api = await endpoint(() => ({ error: 'HTTP 429 fixture-secret' }));
  const trial = newTrial(),
    runtime = new PiTrial(
      await connectModel(api.id, api.settings),
      trial,
      budget,
      BASELINE,
      [],
      new AbortController().signal,
      () => {},
    );
  try {
    await assert.rejects(runtime.answer('r1', 'test'), /累计失败 3 次/);
    assert.equal(api.requests.length, 3);
    assert.equal(trial.calls.length, 3);
    assert.ok(!JSON.stringify(trial).includes('fixture-secret'));
    assert.equal(usageSummary([trial]).complete, false);
  } finally {
    await runtime.close();
    await api.close();
  }
  const success = await endpoint(() => ({ text: '42' })),
    second = newTrial();
  const limited = new PiTrial(
    await connectModel(success.id, success.settings),
    second,
    { ...budget, maxCalls: 1 },
    DEFAULT_PROFILES[1]!,
    [],
    new AbortController().signal,
    () => {},
  );
  try {
    await assert.rejects(limited.answer('r1', 'test'), /调用预算/);
    assert.equal(success.requests.length, 1);
  } finally {
    await limited.close();
    await success.close();
  }
});

test('工程交付以文件为准：正常工具结束后没有文字总结仍进入产物验收', async () => {
  const api = await endpoint((body) =>
    body.messages.at(-1).role === 'tool' ? { text: '' } : { tools: [{ name: 'write_file', args: {} }] },
  );
  const trial = newTrial(),
    runtime = new PiTrial(
      await connectModel(api.id, api.settings),
      trial,
      budget,
      BASELINE,
      [
        {
          name: 'write_file',
          label: 'write',
          description: 'fixture',
          parameters: Type.Object({}),
          async execute() {
            return { content: [{ type: 'text', text: 'saved' }], details: {} };
          },
        },
      ],
      new AbortController().signal,
      () => {},
    );
  try {
    assert.equal(await runtime.answer('r1', 'write artifact'), '');
    assert.equal(api.requests.length, 2);
  } finally {
    await runtime.close();
    await api.close();
  }
});

test('跨轮保留自身上下文，另一次试验完全隔离；缺失用量不作为零', async () => {
  const api = await endpoint(() => ({ text: '回答中文', noUsage: true })),
    connection = await connectModel(api.id, api.settings);
  try {
    const trial = newTrial(),
      a = new PiTrial(connection, trial, budget, BASELINE, [], new AbortController().signal, () => {});
    await a.answer('r1', '第一轮私有材料');
    await a.answer('r2', '第二轮变更');
    await a.close();
    assert.ok(JSON.stringify(api.requests[1]).includes('第一轮私有材料'));
    assert.ok(JSON.stringify(api.requests[1]).includes('回答中文'));
    const b = new PiTrial(connection, newTrial(), budget, BASELINE, [], new AbortController().signal, () => {});
    await b.answer('r1', '另一试验');
    await b.close();
    assert.ok(!JSON.stringify(api.requests[2]).includes('第一轮私有材料'));
    assert.equal(usageSummary([trial]).knownCalls, 0);
  } finally {
    await api.close();
  }
});

async function fixture(api: Awaited<ReturnType<typeof endpoint>>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-harness-')),
    arenas = path.join(root, 'arenas');
  await mkdir(path.join(arenas, 'fixture'), { recursive: true });
  await writeFile(
    path.join(arenas, 'fixture/arena.json'),
    JSON.stringify({
      name: 'fixture',
      title: '独立合成测试',
      description: '测试',
      judge: { kind: 'exact' },
      taskPrefix: '公共前缀\n',
    }),
  );
  await writeFile(
    path.join(arenas, 'fixture/tasks.jsonl'),
    ['q1', 'q2'].map((id) => JSON.stringify({ id, condition: 'test', input: id, target: '42' })).join('\n'),
  );
  const settings = new ModelSettingsStore(path.join(root, 'settings.json'));
  await writeFile(settings.file, JSON.stringify(api.settings));
  return {
    root,
    settings,
    engine: new HarnessEngine(root, arenas, settings),
    input: {
      model: api.id,
      benchmark: 'fixture',
      tasks: ['q1', 'q2'],
      profiles: [DEFAULT_PROFILES[1]!.id],
      repeats: 2,
      split: 'development',
      budget,
    } as StartHarness,
  };
}
async function done(engine: HarnessEngine, id: string) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    const run = await engine.get(id);
    if (!['running', 'grading'].includes(run.status)) {
      await engine.close();
      return await engine.get(id);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('fixture timed out');
}

test('配对运行与重复：冻结前缀答案、扩展和全部预算，bootstrap 的独立单位是题目', async () => {
  const api = await endpoint(() => ({ text: '42' })),
    f = await fixture(api);
  try {
    const started = await f.engine.start(f.input);
    const run = await done(f.engine, started.id);
    assert.equal(run.status, 'completed');
    assert.equal(run.trials.length, 8);
    assert.equal(run.trials[0]!.profileId, 'baseline');
    assert.notEqual(run.trials[2]!.profileId, 'baseline');
    assert.ok(run.trials.every((t) => t.score === 1));
    assert.ok(run.benchmark.tasks[0]!.text!.input.startsWith('公共前缀'));
    const summary = summarize(run);
    assert.equal(summary[1]!.independentTasks, 2);
    assert.equal(summary[1]!.delta, 0);
    assert.equal(summary[1]!.usage.calls, 8);
    assert.equal(summary[0]!.usage.calls, 4);
    assert.equal(run.protocol.piVersion, '0.85.1');
    assert.ok(!JSON.stringify(run).includes('fixture-secret'));
    assert.ok(!JSON.stringify(run).includes(api.settings.custom[0]!.baseUrl));
    await assert.rejects(f.engine.start({ ...f.input, split: 'holdout' }), /已用于开发/);
    const custom = await f.engine.store.addProfile('边界优先', ['plan'], { plan: '专门检查边界条件' });
    assert.notEqual(custom.revision, DEFAULT_PROFILES[1]!.revision);
    assert.equal((await f.engine.get(run.id)).profiles[1]!.revision, DEFAULT_PROFILES[1]!.revision);
    const reread = new HarnessEngine(f.root, f.engine.arenasDir, f.settings);
    assert.equal((await reread.get(run.id)).trials[0]!.rounds[0]!.answer, '42');
    await reread.close();
  } finally {
    await f.engine.close();
    await api.close();
  }
});

test('中止取消在途调用，不继续扩展；剩余试验保留为中止状态', async () => {
  const api = await endpoint(async () => {
      await new Promise((r) => setTimeout(r, 2000));
      return { text: '迟到答案' };
    }),
    f = await fixture(api);
  try {
    const run = await f.engine.start(f.input);
    while (!api.requests.length) await new Promise((r) => setTimeout(r, 10));
    const stopped = await f.engine.cancel(run.id);
    assert.equal(stopped.status, 'cancelled');
    assert.equal(api.requests.length, 1);
    assert.ok(stopped.trials.every((t) => t.status === 'cancelled'));
    assert.equal(stopped.trials[0]!.rounds.length, 0);
  } finally {
    await f.engine.close();
    await api.close();
  }
});

test('单模型连接检测真实请求、并发去重、配置变化失效', async () => {
  const api = await endpoint(() => ({ text: 'OK' }));
  try {
    const [a, b] = await Promise.all([
      probeModel('probe-fixture', api.id, api.settings),
      probeModel('probe-fixture', api.id, api.settings),
    ]);
    assert.deepEqual(a, b);
    assert.equal(a.state, 'ready');
    assert.equal(api.requests.length, 1);
    assert.equal(probeResult('probe-fixture', api.id, api.settings)?.state, 'ready');
    const changed = structuredClone(api.settings);
    changed.custom[0]!.apiKey = 'changed';
    assert.equal(probeResult('probe-fixture', api.id, changed), undefined);
    assert.throws(() => makeProfile('bad', ['unknown']));
  } finally {
    await api.close();
  }
});

test('连接检测：推理模型耗尽微量输出预算也可连接，真正空响应仍失败', async () => {
  const api = await endpoint(() => ({ text: '' }));
  try {
    const result = await probeModel('reasoning-probe', api.id, api.settings);
    assert.equal(result.state, 'ready');
    assert.match(result.message, /尚无最终答案/);
  } finally {
    await api.close();
  }
  const settings = emptyModelSettings();
  const result = await probeModel('empty-probe', 'custom:empty', settings, async () => ({ text: '', latencyMs: 1 }));
  assert.equal(result.state, 'error');
});

test('评分错误保留答卷；更换评分模型拒绝补评；仅补失败评分且并发只执行一次', async () => {
  let valid = false,
    grades = 0;
  const api = await endpoint((body) => {
      if (JSON.stringify(body.messages).includes('独立的中文正式裁判')) {
        grades++;
        return {
          text: valid
            ? JSON.stringify({
                dimensions: [
                  { id: 'correct', score: 8, reason: '正确', evidence: [{ roundId: 'answer', quote: '42' }] },
                ],
              })
            : '{invalid',
        };
      }
      return { text: '42' };
    }),
    f = await fixture(api);
  try {
    await writeFile(
      path.join(f.engine.arenasDir, 'fixture/arena.json'),
      JSON.stringify({
        mode: 'open',
        name: 'fixture',
        title: '评分隔离测试',
        description: '合成',
        judge: { kind: 'rubric', dimensions: [{ id: 'correct', name: '正确性', weight: 100, criteria: '核对答案' }] },
      }),
    );
    const run = await f.engine.start({ ...f.input, tasks: ['q1'], repeats: 1, judge: api.id });
    const first = await done(f.engine, run.id);
    assert.equal(first.status, 'pending_grading');
    assert.equal(grades, 2);
    assert.ok(first.trials.every((t) => t.rounds[0]!.answer === '42' && t.score === undefined));
    const calls = api.requests.length;
    const changed = structuredClone(api.settings);
    changed.custom[0]!.modelId = 'changed';
    await writeFile(f.settings.file, JSON.stringify(changed));
    await assert.rejects(f.engine.retryGrading(run.id), /评分模型或接口已更改/);
    assert.equal(api.requests.length, calls);
    await writeFile(f.settings.file, JSON.stringify(api.settings));
    // Editing the source bank cannot change the standard frozen into this experiment.
    await writeFile(path.join(f.engine.arenasDir, 'fixture/arena.json'), '{}');
    valid = true;
    const retries = await Promise.allSettled([f.engine.retryGrading(run.id), f.engine.retryGrading(run.id)]);
    assert.equal(retries.filter((r) => r.status === 'fulfilled').length, 1);
    const saved = await done(f.engine, run.id);
    assert.equal(saved.status, 'completed');
    assert.ok(saved.trials.every((t) => t.score === 0.8));
    assert.equal(grades, 4);
    assert.equal(api.requests.length, calls + 2);
    assert.ok(saved.trials.every((t) => t.judgeCalls?.length === 2));
  } finally {
    await f.engine.close();
    await api.close();
  }
});

test('执行时间预算包含无输出等待，超时后不进入扩展或继续轮次', async () => {
  const api = await endpoint(async () => {
      await new Promise((r) => setTimeout(r, 1500));
      return { text: '迟到' };
    }),
    f = await fixture(api);
  try {
    const run = await f.engine.start({ ...f.input, repeats: 1, tasks: ['q1'], budget: { ...budget, timeMs: 1000 } });
    const stopped = await done(f.engine, run.id);
    assert.equal(stopped.status, 'completed');
    assert.ok(stopped.trials.every((t) => t.status === 'failed' && t.score === 0 && t.error?.includes('执行预算')));
    assert.equal(api.requests.length, 2);
    assert.ok(stopped.trials.every((t) => !t.rounds.length && t.elapsedMs! >= 1000 && t.elapsedMs! < 1500));
  } finally {
    await f.engine.close();
    await api.close();
  }
});
