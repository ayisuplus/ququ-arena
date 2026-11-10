import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import { jsonLines, readSse, delay } from '../src/streams.ts';
import { createAgentNormalizer, type AgentEvent, type CommentatorSession } from '../src/agent-session.ts';
import { LiveState, EventJournal, readTimeline } from '../src/live-state.ts';
import { BattleControl } from '../src/battle-control.ts';
import { runBattle, type FightEvent } from '../src/runner.ts';
import { Commentator, commentaryContext } from '../src/commentator.ts';
import { createArenaServer } from '../src/server.ts';
import { askModel, type ModelDelta } from '../src/models.ts';
import type { BattleEvent, EventDraft } from '../src/battle-events.ts';
import type { ArenaDef, ArenaTask, Contestant } from '../src/types.ts';

const def: ArenaDef = { name: 'test-sync', title: '测试场', description: '', judge: { kind: 'exact' } };
const tasks: ArenaTask[] = ['Q1', 'Q2', 'Q3'].map((id) => ({ id, condition: 'test', input: '二加二', target: '4' }));
const models: Contestant[] = Array.from({ length: 16 }, (_, i) => ({
  id: `test:m${i}`,
  name: `模型 ${i}`,
  kind: 'pi',
}));

test('协议解码：中文逐字节、CRLF、结束残帧与 SSE 多行', async () => {
  const frames: unknown[] = [],
    parser = jsonLines((e) => frames.push(e));
  for (const byte of Buffer.from('{"text":"中文🟩"}\r\n{"text":"结束"}')) parser.push(Buffer.from([byte]));
  parser.end();
  assert.deepEqual(frames, [{ text: '中文🟩' }, { text: '结束' }]);
  const bytes = Buffer.from('data: 中文\r\ndata: 分块\r\n\r\n: heartbeat\n\ndata: [DONE]\n\n');
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const b of bytes) c.enqueue(new Uint8Array([b]));
      c.close();
    },
  });
  assert.deepEqual(await Array.fromAsync(readSse(body)), ['中文\n分块', '[DONE]']);
});

test('Codex：推理摘要/答案交错，完成补发不重复，不展示原始隐式推理', () => {
  const events: AgentEvent[] = [],
    accept = createAgentNormalizer('codex', (e) => events.push(e));
  accept({ method: 'item/reasoning/summaryTextDelta', params: { itemId: 'r', summaryIndex: 0, delta: '公开' } });
  accept({ method: 'item/agentMessage/delta', params: { itemId: 'a', delta: '答案' } });
  accept({ method: 'item/reasoning/textDelta', params: { itemId: 'r', delta: '不应显示' } });
  accept({ method: 'item/completed', params: { item: { id: 'r', type: 'reasoning', summary: ['公开摘要'] } } });
  accept({ method: 'item/completed', params: { item: { id: 'a', type: 'agentMessage', text: '答案完整' } } });
  accept({ method: 'item/completed', params: { item: { id: 'a', type: 'agentMessage', text: '答案完整' } } });
  assert.deepEqual(events.filter((e) => e.type === 'text').at(-1), { type: 'text', text: '答案完整' });
  assert.deepEqual(events.filter((e) => e.type === 'reasoning').at(-1), { type: 'reasoning', text: '公开摘要' });
  assert.ok(!JSON.stringify(events).includes('不应显示'));
  assert.equal(events.filter((e) => e.type === 'text').length, 2);
});

test('Claude：空思考增量仍接收结束摘要，答案补齐且不重复', () => {
  const events: AgentEvent[] = [],
    accept = createAgentNormalizer('claude', (e) => events.push(e));
  accept({ type: 'stream_event', event: { type: 'message_start', message: { id: 'm1' } } });
  accept({
    type: 'stream_event',
    event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '' } },
  });
  accept({
    type: 'stream_event',
    event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '初步' } },
  });
  accept({
    type: 'assistant',
    message: {
      id: 'm1',
      content: [
        { type: 'thinking', thinking: '公开摘要' },
        { type: 'text', text: '初步结论' },
      ],
    },
  });
  accept({ type: 'result', result: '初步结论。', usage: { input_tokens: 10, output_tokens: 6 } });
  assert.deepEqual(
    events.filter((e) => e.type === 'reasoning'),
    [{ type: 'reasoning', text: '公开摘要' }],
  );
  assert.deepEqual(events.filter((e) => e.type === 'text').at(-1), { type: 'text', text: '初步结论。' });
  assert.deepEqual(events.at(-1), { type: 'done' });
});

test('模型 API：中文流式推理与答案分离，兼容 JSON 最终补发', async (t) => {
  const key = process.env.DOTS_API_KEY;
  process.env.DOTS_API_KEY = 'test-only';
  const chunks = [
    { choices: [{ delta: { reasoning_content: '公开' } }] },
    { choices: [{ delta: { content: '答案' } }] },
    { choices: [{ delta: { reasoning_content: '推理' } }] },
    { choices: [{ delta: { content: '中文' } }], usage: { prompt_tokens: 8, completion_tokens: 4 } },
  ];
  let stream = true;
  t.mock.method(globalThis, 'fetch', async () =>
    stream
      ? new Response(
          new ReadableStream({
            start(c) {
              for (const byte of Buffer.from(
                chunks.map((v) => `data: ${JSON.stringify(v)}\n\n`).join('') + 'data: [DONE]\n\n',
              ))
                c.enqueue(new Uint8Array([byte]));
              c.close();
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        )
      : Response.json({ choices: [{ message: { content: '答案中文', reasoning_content: '公开推理' } }] }),
  );
  const deltas: ModelDelta[] = [];
  try {
    const c: Contestant = { id: 'dots:test', name: 'test', kind: 'pi', provider: 'dots', modelId: 'test' };
    const result = await askModel(c, tasks[0]!, 'exact', { onDelta: (e) => deltas.push(e) });
    assert.equal(result.text, '答案中文');
    assert.equal(result.reasoning, '公开推理');
    assert.deepEqual(result.usage, { input: 8, output: 4 });
    assert.equal(
      deltas
        .filter((e) => e.channel === 'answer')
        .map((e) => e.delta)
        .join(''),
      result.text,
    );
    stream = false;
    deltas.length = 0;
    const fallback = await askModel(c, tasks[0]!, 'exact', { onDelta: (e) => deltas.push(e) });
    assert.equal(fallback.reasoning, '公开推理');
    assert.ok(deltas.every((e) => e.replace));
  } finally {
    if (key === undefined) delete process.env.DOTS_API_KEY;
    else process.env.DOTS_API_KEY = key;
  }
});

test('快照：超过 500 个增量后完整恢复，保留文本块与独立重试', () => {
  const state = new LiveState();
  let seq = 0;
  const emit = (e: Partial<FightEvent>) =>
    state.accept({ battle: 'b1', seq: ++seq, type: 'model', taskId: 'Q1', modelId: 'A', attempt: 0, ...e });
  emit({ status: 'generating' });
  for (let i = 0; i < 620; i++) emit({ channel: i % 2 ? 'answer' : 'reasoning', block: i % 2, delta: '中' });
  emit({ status: 'retrying', error: 'timeout' });
  emit({ attempt: 1, status: 'generating' });
  emit({ attempt: 1, channel: 'answer', block: 1, delta: '好' });
  state.accept({
    battle: 'b1',
    seq: ++seq,
    type: 'model',
    taskId: 'Q1',
    modelId: 'B',
    attempt: 0,
    answer: '另一个窗口',
  });
  const frames = state.snapshot().frames.filter((e) => e.type === 'model');
  assert.equal(frames.length, 3);
  assert.equal(frames[0]!.answer!.length, 310);
  assert.equal(frames[0]!.reasoning!.length, 310);
  assert.deepEqual(frames[1]!.parts?.answer, [[1, '好']]);
  assert.equal(frames[2]!.answer, '另一个窗口');
  emit({ attempt: 1, channel: 'answer', block: 1, delta: '结果', replace: true });
  const last = state
    .snapshot()
    .frames.filter((e) => e.type === 'model')
    .filter((e) => e.modelId === 'A')
    .at(-1)!;
  assert.equal(last.answer, '结果');
});

test('逐题同步：16 模型最多 8 路，上一题全部结算才进入下一题，裁判只看最终答案', async () => {
  let active = 0,
    peak = 0;
  const ended = new Map<string, number>();
  const observed: FightEvent[] = [];
  const result = await runBattle(def, tasks, models, {
    roundSync: true,
    concurrency: 8,
    onModelEvent: (e) => observed.push(e),
    ask: async (c, task, _kind, opts) => {
      if (task.id !== 'Q1') assert.equal(ended.get(tasks[tasks.findIndex((t) => t.id === task.id) - 1]!.id), 16);
      active++;
      peak = Math.max(peak, active);
      opts?.onDelta?.({ channel: 'reasoning', block: 0, delta: '错误的想法：5' });
      await delay(c.id.endsWith('0') ? 12 : 2);
      active--;
      ended.set(task.id, (ended.get(task.id) ?? 0) + 1);
      opts?.onDelta?.({ channel: 'answer', block: 1, delta: '4' });
      return { text: '4', reasoning: '错误的想法：5', latencyMs: 12 };
    },
  });
  assert.equal(peak, 8);
  assert.equal(result.records.length, 48);
  assert.ok(result.records.every((r) => r.score === 1));
  assert.equal(observed.filter((e) => e.status === 'waiting').length, 48);
});

test('题间暂停、恢复和终止：中止取消在途调用，不启动剩余题', async () => {
  const control = new BattleControl();
  const paused = Promise.withResolvers<void>();
  const states: string[] = [];
  const events: FightEvent[] = [];
  let asks = 0;
  const p = runBattle(def, tasks, models.slice(0, 2), {
    roundSync: true,
    control,
    onModelEvent: (e) => events.push(e),
    onRoundEnd(task) {
      states.push(task.id);
      if (task.id === 'Q1') {
        control.pause();
        paused.resolve();
      }
    },
    ask: async (_c, task, _k, opts) => {
      asks++;
      if (task.id === 'Q2') {
        control.stop();
        await delay(1000, opts?.signal);
      }
      return { text: '4', latencyMs: 1 };
    },
  });
  await paused.promise;
  await delay(5);
  assert.equal(control.state, 'paused');
  assert.equal(asks, 2);
  control.resume();
  const result = await p;
  assert.equal(result.status, 'stopped');
  assert.deepEqual(states, ['Q1']);
  assert.ok(asks < 6);
  assert.ok(events.some((e) => e.status === 'stopped'));
});

test('单题超时直接退赛：不再重新获得一个超时周期', async () => {
  const events: FightEvent[] = [];
  const result = await runBattle(def, tasks.slice(0, 1), models.slice(0, 1), {
    timeoutMs: 8,
    retries: 1,
    onModelEvent: (e) => events.push(e),
    ask: async (_c, _t, _k, opts) => {
      await delay(100, opts?.signal);
      return { text: '4', latencyMs: 100 };
    },
  });
  assert.ok(result.records[0]!.error);
  assert.deepEqual(
    events.filter((e) => e.status === 'generating').map((e) => e.attempt),
    [0],
  );
  assert.equal(events.at(-1)!.attempt, 0);
  assert.equal(events.at(-1)!.status, 'withdrawn');
  assert.equal(result.withdrawals?.[0]?.reason, 'timeout');
});

test('解说数据：本题结束前不包含参考答案或裁判解释', () => {
  const frames: BattleEvent[] = [
    { type: 'round', battle: 'b1', taskId: 'Q1', prompt: '题面', index: 0, total: 1 },
    {
      type: 'model',
      battle: 'b1',
      taskId: 'Q1',
      modelId: 'A',
      attempt: 0,
      status: 'done',
      answer: '模型猜测',
      score: 0,
      note: '参考答案是 SECRET',
    },
  ];
  assert.ok(!JSON.stringify(commentaryContext(frames)).includes('SECRET'));
  frames.push({ type: 'round-end', battle: 'b1', taskId: 'Q1', target: 'SECRET' });
  assert.equal(commentaryContext(frames).target, 'SECRET');
  frames.push({ type: 'round', battle: 'b1', taskId: 'Q2', prompt: '下一题', index: 1, total: 2 });
  assert.ok(
    JSON.stringify(commentaryContext(frames).recentRounds).includes('SECRET'),
    '合并点评不能漏掉已结束的前一题',
  );
  assert.equal(commentaryContext(frames).target, undefined, '下一题未结束时仍不可获得目标答案');
});

test('解说调度：安静时不调用，追问优先，故障不切换 Agent，切换携带上下文', async () => {
  const state = new LiveState();
  const requests: {
    prompt: string;
    done: ReturnType<typeof Promise.withResolvers<void>>;
    agent: string;
    emit: (e: AgentEvent) => void;
  }[] = [];
  let seq = 0;
  const emit = (event: EventDraft) => state.accept({ ...event, battle: 'b1', seq: ++seq } as BattleEvent);
  const fake = (agent: string): CommentatorSession => ({
    send: (prompt, emit) => {
      const done = Promise.withResolvers<void>();
      requests.push({ prompt, done, agent, emit });
      return done.promise;
    },
    cancel() {},
    close() {
      requests.at(-1)?.done.reject(new Error('已关闭'));
    },
  });
  const seat = new Commentator(os.tmpdir(), () => state.snapshot().frames, emit, fake);
  try {
    seat.configure('codex', true);
    await seat.tick();
    assert.equal(requests.length, 0);
    emit({ type: 'round', taskId: 'Q1', prompt: '二加二', index: 0, total: 1 });
    seat.ask('先回答我的问题');
    assert.equal(requests.length, 1);
    const model: BattleEvent = { type: 'model', battle: 'b1', taskId: 'Q1', modelId: 'A', attempt: 0, answer: '4' };
    state.accept(model);
    seat.observe(model);
    seat.ask('第二个问题');
    requests[0]!.emit({ type: 'text', text: '第一问分析' });
    requests[0]!.done.resolve();
    await delay(0);
    assert.equal(requests.length, 2);
    assert.match(requests[1]!.prompt, /第二个问题/);
    requests[1]!.done.reject(new Error('测试连接失败'));
    await delay(0);
    assert.equal(seat.enabled, false);
    assert.equal(seat.agentId, 'codex');
    seat.configure('claude', true);
    seat.ask('换一位解说继续');
    assert.equal(requests.at(-1)!.agent, 'claude');
    assert.match(requests.at(-1)!.prompt, /第一问分析/);
    requests.at(-1)!.done.resolve();
    await delay(0);
  } finally {
    seat.dispose();
  }
});

test('解说故障独立于模型调用与评分', async () => {
  const state = new LiveState();
  const seat = new Commentator(
    os.tmpdir(),
    () => state.snapshot().frames,
    (e) => state.accept({ ...e, battle: 'b1' } as BattleEvent),
    () => ({
      async send() {
        throw new Error('测试 Agent 故障');
      },
      cancel() {},
      close() {},
    }),
  );
  seat.configure('codex', true);
  try {
    const result = await runBattle(def, tasks, models.slice(0, 2), {
      roundSync: true,
      ask: async () => ({ text: '4', latencyMs: 1 }),
      onModelEvent(e) {
        const event: BattleEvent = { ...e, type: 'model', battle: 'b1' };
        state.accept(event);
        seat.observe(event);
        void seat.tick();
      },
    });
    assert.equal(result.records.length, 6);
    assert.ok(result.records.every((r) => r.score === 1 && !r.error));
    assert.equal(seat.enabled, false);
  } finally {
    seat.dispose();
  }
});

test('时间轴：独立文件完整落盘，拒绝越界路径', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-journal-'));
  try {
    const journal = new EventJournal(path.join(dir, 'timeline-test.jsonl'));
    for (let i = 0; i < 650; i++)
      journal.push({
        type: 'model',
        battle: 'b1',
        seq: i,
        taskId: 'Q1',
        modelId: 'A',
        attempt: 0,
        channel: 'answer',
        block: 0,
        delta: '中文',
      });
    await journal.flush();
    assert.equal((await readTimeline(dir, 'timeline-test.jsonl')).length, 650);
    await assert.rejects(readTimeline(dir, '../outside.jsonl'), /非法/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('集成：新比赛时间轴回放、快照重连与刷新不新开赛', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-workbench-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir: dir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const collect = async (id: string) => {
    const controller = new AbortController();
    const output: any[] = [];
    const response = await fetch(`${base}/battle/stream?battle=${id}&snapshot=1`, { signal: controller.signal });
    try {
      for await (const line of readSse(response.body!)) {
        const e = JSON.parse(line);
        output.push(e);
        if (e.type === 'done' || e.frames?.some((f: BattleEvent) => f.type === 'done')) break;
      }
    } finally {
      controller.abort();
    }
    return output.flatMap((e) => (e.type === 'snapshot' ? e.frames : [e]));
  };
  try {
    const page = await (await fetch(`${base}/battle?arena=tongjia-pinyin&limit=2&pace=0`)).text();
    const id = page.match(/data-battle="(b\d+)"/)![1]!;
    const events = await collect(id);
    assert.equal(events.filter((e) => e.type === 'round').length, 2);
    const launch = events.find((e) => e.type === 'start').launch;
    assert.equal(launch.arena, 'tongjia-pinyin');
    assert.equal(launch.limit, 2);
    assert.deepEqual(
      launch.models,
      events.find((e) => e.type === 'start').roster.map((m: { id: string }) => m.id),
    );
    assert.ok(events.some((e) => e.type === 'model' && e.channel === 'answer'));
    const files = (await readdir(dir)).filter((f) => f.startsWith('战绩-'));
    const result = JSON.parse(await readFile(path.join(dir, files[0]!), 'utf8'));
    assert.ok(result.timelineFile);
    const timeline = await readTimeline(dir, result.timelineFile);
    assert.equal(timeline.at(-1)?.type, 'done');
    const refreshed = await (await fetch(`${base}/battle?arena=tongjia-pinyin&session=${id}`)).text();
    assert.match(refreshed, new RegExp(`data-battle="${id}"`));
    assert.equal((await readdir(dir)).filter((f) => f.startsWith('战绩-')).length, 1);
    const snap = await collect(id);
    assert.ok(snap.some((e) => e.type === 'model' && e.answer));
    const replayPage = await (
      await fetch(`${base}/replay?file=${encodeURIComponent(files[0]!)}&speed=0&pace=0`)
    ).text();
    const replayEvents = await collect(replayPage.match(/data-battle="(b\d+)"/)![1]!);
    assert.deepEqual(replayEvents.find((e) => e.type === 'start').launch, launch, '回放恢复原始完整开赛参数');
    assert.ok(replayEvents.some((e) => e.type === 'round-end'));
    assert.ok(replayEvents.some((e) => e.type === 'model'));
    assert.equal((await fetch(`${base}/battle?session=b9999`)).status, 410);
    const careerBefore = await readFile(path.join(dir, 'career.json'), 'utf8');
    const stoppedPage = await (await fetch(`${base}/battle?arena=tongjia-pinyin&limit=3&pace=1200`)).text();
    const stopId = stoppedPage.match(/data-battle="(b\d+)"/)![1]!;
    assert.equal(
      (
        await fetch(`${base}/api/battles/${stopId}/control`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"action":"stop"}',
        })
      ).status,
      200,
    );
    const stoppedEvents = await collect(stopId);
    assert.ok(stoppedEvents.some((e) => e.type === 'done' && e.stopped));
    const stoppedFile = (await readdir(dir)).filter((f) => f.startsWith('战绩-')).find((f) => !files.includes(f))!;
    assert.equal(JSON.parse(await readFile(path.join(dir, stoppedFile), 'utf8')).status, 'stopped');
    assert.equal(await readFile(path.join(dir, 'career.json'), 'utf8'), careerBefore);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
