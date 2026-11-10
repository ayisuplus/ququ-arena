import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { runBattle, type FightEvent } from '../src/runner.ts';
import { MATCH_LIMITS, resolveMatchLimits } from '../src/battle-resilience.ts';
import { BattleControl } from '../src/battle-control.ts';
import { ModelRequestError, type AskOptions } from '../src/models.ts';
import { OpenRouterRequestError } from '../src/openrouter-limits.ts';
import { emptyModelSettings } from '../src/model-settings.ts';
import { LiveState } from '../src/live-state.ts';
import { buildLeaderboard } from '../src/leaderboard.ts';
import { buildSettlement } from '../src/scoring-summary.ts';
import { renderReport, renderMarkdown } from '../src/report.ts';
import { settleOnBook } from '../src/career.ts';
import { commentaryContext } from '../src/commentator.ts';
import { delay, readSse } from '../src/streams.ts';
import type { ArenaDef, ArenaTask, Contestant } from '../src/types.ts';

const def: ArenaDef = { name: 'resilience', title: '容灾验收', description: '独立测试', judge: { kind: 'exact' } };
const tasks: ArenaTask[] = Array.from({ length: 6 }, (_, i) => ({
  id: `Q${i + 1}`,
  input: '2+2',
  target: '4',
  condition: 'test',
}));
const models: Contestant[] = ['A', 'B'].map((id) => ({ id, name: id, kind: 'pi' }));
const answer = { text: '4', latencyMs: 1 };

test('累计三次调用失败跨题生效，成功不清零，健康选手继续完成全部题目', async () => {
  const asks: string[] = [],
    events: FightEvent[] = [];
  const battle = await runBattle(def, tasks, models, {
    roundSync: true,
    retries: 0,
    onModelEvent: (e) => events.push(e),
    ask: async (c, task) => {
      asks.push(c.id + task.id);
      if (c.id === 'A' && ['Q1', 'Q3', 'Q5'].includes(task.id)) throw new Error('网络抖动');
      return answer;
    },
  });
  assert.equal(asks.filter((id) => id.startsWith('A')).length, 5);
  assert.equal(asks.filter((id) => id.startsWith('B')).length, 6);
  assert.equal(battle.withdrawals?.length, 1);
  assert.equal(battle.withdrawals?.[0]?.failures, 3);
  assert.equal(events.filter((e) => e.modelId === 'A' && e.taskId === 'Q6').length, 0);
  const board = buildLeaderboard(battle),
    settled = buildSettlement(battle, board);
  assert.equal(settled.outcome, 'winner');
  assert.deepEqual(settled.leaderIds, ['B']);
  assert.equal(settled.rows.find((r) => r.modelId === 'A')?.rank, null);
  assert.equal(settled.rows.find((r) => r.modelId === 'A')?.answered, 2);
  assert.equal(
    settled.rows.find((r) => r.modelId === 'B')?.performance?.included.speed,
    6,
    '退赛模型不应让健康选手的后续效率指标全部失效',
  );
  assert.match(renderReport(battle), /退赛记录/);
  assert.match(renderMarkdown(battle), /累计调用失败 3 次/);
  const book: any = { version: 1, entries: {} };
  settleOnBook(battle, board, book);
  assert.equal(book.entries.A.titles, 0);
  const next = await runBattle(def, tasks.slice(0, 1), models, { ask: async () => answer });
  assert.deepEqual(next.withdrawals, []);
  assert.equal(next.records.length, 2);
});

test('同题重试也累计：三次失败即弃权，全员退赛提前收场', async () => {
  let asks = 0;
  const battle = await runBattle(def, tasks, models.slice(0, 1), {
    roundSync: true,
    ask: async () => {
      asks++;
      throw new Error('503');
    },
  });
  assert.equal(asks, 3);
  assert.equal(battle.records.length, 1);
  assert.equal(battle.records[0]!.attempts, 3);
  assert.equal(buildSettlement(battle, buildLeaderboard(battle)).outcome, 'no-score');
  assert.deepEqual(MATCH_LIMITS, { failures: 3, questionMs: 60_000, judgeMs: 60_000 });
  assert.equal(battle.meta?.execution?.timeoutMs, 60_000);
});

test('单题/裁判超时上限可配置：默认 60s，环境变量可抬高但上限仍在', () => {
  // 默认不变（既有行为）；环境变量只抬高「上限值」，不取消上限
  assert.deepEqual(resolveMatchLimits({}), { failures: 3, questionMs: 60_000, judgeMs: 60_000 });
  assert.deepEqual(resolveMatchLimits({ QUQU_QUESTION_TIMEOUT_MS: '120000' }), {
    failures: 3,
    questionMs: 120_000,
    judgeMs: 60_000,
  });
  assert.deepEqual(resolveMatchLimits({ QUQU_JUDGE_TIMEOUT_MS: '90000' }), {
    failures: 3,
    questionMs: 60_000,
    judgeMs: 90_000,
  });
  // 非法值必须报错而非静默退回默认（NaN 比较恒 false 的静默方向最危险）
  assert.throws(() => resolveMatchLimits({ QUQU_QUESTION_TIMEOUT_MS: '0' }), /正数/);
  assert.throws(() => resolveMatchLimits({ QUQU_JUDGE_TIMEOUT_MS: 'abc' }), /正数/);
});

test('超时上限经环境变量接线到运行配置（子进程实证默认 60s / 抬高后生效）', async () => {
  const read = (env: NodeJS.ProcessEnv) =>
    new Promise<string>((resolve, reject) => {
      execFile(
        'node',
        [
          '--input-type=module',
          '-e',
          "import('./src/battle-resilience.ts').then((m) => process.stdout.write(String(m.MATCH_LIMITS.questionMs)))",
        ],
        { cwd: process.cwd(), env },
        (err, stdout) => (err ? reject(err) : resolve(stdout)),
      );
    });
  assert.equal(await read({ ...process.env }), '60000');
  assert.equal(await read({ ...process.env, QUQU_QUESTION_TIMEOUT_MS: '120000' }), '120000');
});

test('持续思考与不响应取消也受单题时限限制，迟到增量不污染快照和下一题', async () => {
  const events: FightEvent[] = [];
  let late: AskOptions | undefined;
  const pending = Promise.withResolvers<typeof answer>();
  const began = Date.now();
  const battle = await runBattle(def, tasks.slice(0, 2), models, {
    roundSync: true,
    timeoutMs: 30,
    onModelEvent: (e) => events.push(e),
    ask: async (c, _task, _kind, opts) => {
      if (c.id === 'B') return answer;
      late = opts;
      opts?.onDelta?.({ channel: 'reasoning', block: 0, delta: '已有的公开推理' });
      const thinking = setInterval(() => opts?.onDelta?.({ channel: 'reasoning', block: 0, delta: '继续思考' }), 5);
      opts?.signal?.addEventListener('abort', () => clearInterval(thinking), { once: true });
      return pending.promise;
    },
  });
  assert.ok(Date.now() - began < 1000);
  assert.equal(late?.signal?.aborted, true);
  assert.equal(battle.withdrawals?.[0]?.reason, 'timeout');
  assert.match(battle.records[0]!.reasoning!, /^已有的公开推理/);
  assert.equal(battle.records.filter((r) => r.model === 'B').length, 2);
  const length = events.length;
  late?.onDelta?.({ channel: 'answer', block: 0, delta: '迟到答案' });
  pending.resolve(answer);
  await delay(1);
  assert.equal(events.length, length);
  assert.ok(!events.some((e) => e.delta === '迟到答案'));
});

test('失败后的重试等待共用单题预算，不再等完很长的 Retry-After', async () => {
  let calls = 0;
  const battle = await runBattle(def, tasks, models.slice(0, 1), {
    roundSync: true,
    timeoutMs: 25,
    ask: async () => {
      calls++;
      throw new ModelRequestError('限流', 429, new Headers({ 'retry-after': '600' }));
    },
  });
  assert.equal(calls, 1);
  assert.equal(battle.withdrawals?.[0]?.reason, 'timeout');
});

test('排队等候容量不占单题预算', async () => {
  const battle = await runBattle(def, tasks.slice(0, 1), models, {
    roundSync: true,
    concurrency: 1,
    timeoutMs: 100,
    ask: async () => {
      await delay(60);
      return answer;
    },
  });
  assert.ok(battle.durationMs >= 120);
  assert.deepEqual(battle.withdrawals, []);
});

test('空答案计为调用失败，401 提前退出且不重试', async () => {
  const empty = await runBattle(def, tasks, models.slice(0, 1), {
    roundSync: true,
    retries: 0,
    ask: async () => ({ text: '  ', latencyMs: 1 }),
  });
  assert.equal(empty.withdrawals?.[0]?.failures, 3);
  assert.equal(empty.records.length, 3);
  let calls = 0;
  const rejected = await runBattle(def, tasks, models.slice(0, 1), {
    roundSync: true,
    ask: async () => {
      calls++;
      throw new ModelRequestError('身份验证失败', 401, new Headers());
    },
  });
  assert.equal(calls, 1);
  assert.equal(rejected.withdrawals?.[0]?.reason, 'unavailable');
});

test('共享免费额度耗尽只隔离 OpenRouter，厂商直连继续运行', async () => {
  const roster: Contestant[] = [
    { id: 'router:a', name: '免费 A', kind: 'pi', provider: 'openrouter', modelId: 'a:free' },
    { id: 'router:b', name: '免费 B', kind: 'pi', provider: 'openrouter', modelId: 'b:free' },
    models[1]!,
  ];
  const asks: string[] = [];
  const battle = await runBattle(def, tasks, roster, {
    roundSync: true,
    concurrency: 1,
    openRouterFreeOnly: true,
    ask: async (c) => {
      asks.push(c.id);
      if (c.provider === 'openrouter')
        throw new OpenRouterRequestError(429, { error: { message: 'Rate limit exceeded: free-models-per-day' } });
      return answer;
    },
  });
  assert.equal(asks.filter((id) => id.startsWith('router')).length, 1);
  assert.equal(battle.withdrawals?.length, 2);
  assert.equal(battle.records.filter((r) => r.model === 'B').length, 6);
  assert.notEqual(battle.status, 'stopped');
});

test('手动终止可以打断不返回的适配器，不计为选手失败', async () => {
  const control = new BattleControl();
  const battle = await runBattle(def, tasks, models, {
    roundSync: true,
    control,
    ask: async () => {
      setTimeout(() => control.stop(), 10);
      return new Promise(() => {});
    },
  });
  assert.equal(battle.status, 'stopped');
  assert.deepEqual(battle.withdrawals, []);
  assert.equal(battle.records.length, 2);
  assert.ok(battle.records.every((r) => r.note === '比赛已中止'));
});

test('裁判无响应单独超时，保留最终答案，不让选手累计失败或退赛', async (t) => {
  const settings = emptyModelSettings();
  settings.custom.push({
    id: 'custom:judge',
    name: '本地测试裁判',
    modelId: 'judge',
    baseUrl: 'http://127.0.0.1:9/v1',
    apiKey: '',
    stream: true,
  });
  t.mock.method(globalThis, 'fetch', async () => new Promise<Response>(() => {}));
  const battle = await runBattle(
    { ...def, judge: { kind: 'llm', rubric: '正确则满分', scale: 1 } },
    tasks.slice(0, 4),
    models.slice(0, 1),
    {
      roundSync: true,
      judgeModel: 'custom:judge',
      modelSettings: settings,
      judgeTimeoutMs: 15,
      ask: async () => answer,
    },
  );
  assert.equal(battle.records.length, 4);
  assert.deepEqual(battle.withdrawals, []);
  assert.ok(
    battle.records.every((r) => r.answer === '4' && r.note?.includes('裁判弃权') && r.error?.includes('评分超时')),
  );
});

test('退赛快照分别保留每个模型和原因，解说可见，持久化后不参与冠军判定', () => {
  const state = new LiveState();
  for (const [i, model] of models.entries())
    state.accept({
      type: 'withdrawal',
      battle: 'b1',
      seq: i + 1,
      withdrawal: {
        modelId: model.id,
        taskId: 'Q1',
        reason: 'failures',
        failures: 3,
        message: '失败 3 次已弃权',
        at: 100 + i,
      },
    });
  const snapshot = JSON.parse(JSON.stringify(state.snapshot()));
  assert.equal(snapshot.frames.length, 2);
  assert.equal(commentaryContext(snapshot.frames).withdrawals.length, 2);
});

test('流式结束或解析失败时取消读取，释放响应体', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
    },
    cancel() {
      cancelled = true;
    },
  });
  for await (const data of readSse(stream)) {
    assert.equal(data, '[DONE]');
    break;
  }
  assert.equal(cancelled, true);
});
