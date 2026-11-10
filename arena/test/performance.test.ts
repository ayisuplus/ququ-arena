import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { compatibleUsage, piUsage } from '../src/token-usage.ts';
import { RANKING_POLICY, EFFICIENCY_POLICY, performanceMetrics, type RankingPolicy } from '../src/performance.ts';
import { buildSettlement, describeScoring } from '../src/scoring-summary.ts';
import { buildLeaderboard } from '../src/leaderboard.ts';
import { askModel, resolveContestant } from '../src/models.ts';
import { emptyModelSettings } from '../src/model-settings.ts';
import { runBattle } from '../src/runner.ts';
import { LiveState } from '../src/live-state.ts';
import { renderReport, renderMarkdown } from '../src/report.ts';
import { commentate } from '../src/commentary.ts';
import type { BattleRecord, BattleResult } from '../src/types.ts';

const record = (model: string, extra: Partial<BattleRecord> = {}): BattleRecord => ({
  model,
  taskId: 'Q1',
  condition: 'test',
  prompt: '题目',
  answer: '4',
  score: 1,
  latencyMs: 1000,
  solveMs: 1000,
  attempts: 1,
  usageComplete: true,
  usage: { input: 100, output: 100, cachedInput: 0 },
  ...extra,
});
// 默认构造旧规则（综合分定名次）的战绩：历史战绩按当时规则解读，这些性质必须继续成立
const result = (records: BattleRecord[], rankingPolicy: RankingPolicy = EFFICIENCY_POLICY): BattleResult => ({
  arena: { name: 'test', title: '指标验证', description: '', judge: { kind: 'exact' } },
  startedAt: '2026-09-12T00:00:00Z',
  durationMs: 2000,
  contestants: ['A', 'B'].map((id) => ({ id, name: id, kind: 'pi' })),
  records,
  meta: {
    arenaFingerprint: 'test',
    toolVersion: 'test',
    judgeModels: [],
    rankingPolicy,
    plannedTasks: new Set(records.map((r) => r.taskId)).size,
  },
});
const settle = (r: BattleResult) => buildSettlement(r, buildLeaderboard(r));
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('Token口径：缓存与推理不重复相加，零与缺失分开，非法缓存值排除，pi输入还原', () => {
  const raw = {
    prompt_tokens: 100,
    completion_tokens: 80,
    prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 10 },
    completion_tokens_details: { reasoning_tokens: 50 },
  };
  assert.deepEqual(compatibleUsage(raw), { input: 100, output: 80, cachedInput: 60, cacheWrite: 10, reasoning: 50 });
  assert.equal(compatibleUsage({}), undefined);
  assert.equal(compatibleUsage({ prompt_tokens: 0 }), undefined);
  assert.deepEqual(compatibleUsage({ prompt_tokens: 0, completion_tokens: 0 }), { input: 0, output: 0 });
  for (const invalid of [-1, NaN, Infinity, 101, '60'])
    assert.equal(
      compatibleUsage({ ...raw, prompt_tokens_details: { cached_tokens: invalid } })!.cachedInput,
      undefined,
    );
  assert.equal(compatibleUsage({ prompt_tokens: null, completion_tokens: 4 }), undefined);
  assert.deepEqual(piUsage({ input: 30, output: 80, cacheRead: 60, cacheWrite: 10, reasoning: 50 }), {
    input: 100,
    output: 80,
    cachedInput: 60,
    cacheWrite: 10,
    reasoning: 50,
  });
  assert.deepEqual(piUsage({ input: 100, output: 80, cacheRead: 0, cacheWrite: 0 }), { input: 100, output: 80 });
  assert.equal(piUsage({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }), undefined);
});

test('竞技综合分：速度、Token、缓存各自单调奖励，同分质量由效率决胜，旧战绩仍并列', () => {
  for (const improvement of [
    { solveMs: 500 },
    { usage: { input: 100, output: 50, cachedInput: 0 } },
    { usage: { input: 100, output: 100, cachedInput: 80 } },
  ]) {
    const r = result([record('A'), record('B', improvement)]),
      board = buildLeaderboard(r),
      before = structuredClone(board);
    const s = buildSettlement(r, board);
    assert.deepEqual(s.leaderIds, ['B']);
    assert.equal(s.rows[0]!.modelId, 'B');
    assert.equal(s.rows[0]!.rank, 1);
    assert.deepEqual(board, before);
    assert.equal(s.rows[0]!.avg, 1);
    assert.ok(s.rows[0]!.performance!.score! > s.rows[1]!.performance!.score!);
    delete r.meta!.rankingPolicy;
    assert.equal(settle(r).outcome, 'tie');
    assert.equal(settle(r).rows[0]!.performance, undefined);
  }
  const metrics = performanceMetrics(
    result([
      record('A', { solveMs: 2000, usage: { input: 100, output: 300, cachedInput: 0 } }),
      record('B', { usage: { input: 100, output: 100, cachedInput: 80 } }),
    ]),
  );
  close(metrics.get('A')!.score!, 0.825);
  close(metrics.get('B')!.score!, 0.99);
  for (const m of metrics.values())
    close(
      Object.values(m.points).reduce((s, n) => s + n),
      m.score!,
    );
});

test('答题质量门控：错误或空白低耗时不刷分，也不作为其它模型的效率基线', () => {
  const r = result([
    record('A'),
    record('B', { score: 0, solveMs: 1, usage: { input: 0, output: 0, cachedInput: 0 } }),
  ]);
  const metrics = performanceMetrics(r);
  close(metrics.get('A')!.score!, 1);
  close(metrics.get('B')!.score!, 0);
  assert.deepEqual(settle(r).leaderIds, ['A']);
  const partial = result([record('A', { score: 0.5 }), record('B', { score: 1 })]);
  close(performanceMetrics(partial).get('A')!.score!, 0.475);
  r.records[1]!.error = 'timeout';
  assert.equal(settle(r).outcome, 'incomplete');
  assert.equal(performanceMetrics(r).get('B')!.score, null);
});

test('同题缺失项统一退出：缓存未知不是0%，重试用量不完整不获利，全零输入不除零', () => {
  const r = result([
    record('A', { usage: { input: 100, output: 100, cachedInput: 90 } }),
    record('B', { usage: { input: 100, output: 100 } }),
  ]);
  const metrics = performanceMetrics(r);
  for (const m of metrics.values()) {
    assert.equal(m.included.cache, 0);
    close(m.score!, 1);
  }
  assert.equal(metrics.get('B')!.cacheHitRate, null);
  assert.equal(settle(r).outcome, 'tie');
  r.records[1]!.usageComplete = false;
  for (const m of performanceMetrics(r).values()) {
    assert.equal(m.included.tokens, 0);
    assert.equal(m.included.cache, 0);
  }
  assert.equal(settle(r).rows.find((row) => row.modelId === 'B')!.usageComplete, false);
  const zeros = result([
    record('A', { usage: { input: 0, output: 0, cachedInput: 0 } }),
    record('B', { usage: { input: 0, output: 0, cachedInput: 0 } }),
  ]);
  for (const m of performanceMetrics(zeros).values()) {
    close(m.score!, 1);
    assert.equal(m.cacheHitRate, null);
  }
});

test('缓存总览按输入Token加权，按题比较耗时和用量，速度缺失不伪造历史数据', () => {
  const r = result([
    record('A', { usage: { input: 100, output: 0, cachedInput: 100 } }),
    record('B'),
    record('A', { taskId: 'Q2', usage: { input: 900, output: 100, cachedInput: 0 } }),
    record('B', { taskId: 'Q2', usage: { input: 900, output: 100, cachedInput: 0 } }),
  ]);
  close(performanceMetrics(r).get('A')!.cacheHitRate!, 0.1);
  assert.equal(performanceMetrics(r).get('A')!.cacheSamples, 2);
  delete r.records[0]!.solveMs;
  for (const m of performanceMetrics(r).values()) assert.equal(m.included.speed, 1);
  assert.equal(performanceMetrics(r).get('A')!.avgSolveMs, null);
});

test('真实本机HTTP：流式分批用量、末尾缓存补发、JSON响应使用同一Token口径', async () => {
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const frames = [
        { usage: { prompt_tokens: 100 } },
        {
          choices: [{ delta: { reasoning: '中文推理', content: '4' }, finish_reason: 'stop' }],
          usage: { completion_tokens: 80, completion_tokens_details: { reasoning_tokens: 50 } },
        },
        { usage: { prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 10 } } },
        { usage: { prompt_tokens: 100, completion_tokens: 80 } },
      ];
      res.end(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n');
    } else
      res.end(
        JSON.stringify({
          choices: [{ message: { content: '4' } }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 80,
            prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 10 },
            completion_tokens_details: { reasoning_tokens: 50 },
          },
        }),
      );
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const modelSettings = emptyModelSettings();
  modelSettings.custom.push({
    id: 'custom:metrics',
    name: '本机测试',
    modelId: 'metrics',
    apiKey: '',
    stream: true,
    baseUrl: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
  });
  try {
    for (const onDelta of [() => {}, undefined]) {
      const out = await askModel(
        resolveContestant('custom:metrics'),
        { id: 'Q1', condition: 'test', input: '2+2', target: '4' },
        'exact',
        { modelSettings, onDelta },
      );
      assert.equal(out.text, '4');
      assert.deepEqual(out.usage, { input: 100, output: 80, cachedInput: 60, cacheWrite: 10, reasoning: 50 });
    }
  } finally {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('重试计时与用量标记：退避计入速度，失败请求缺失用量退出Token评分', async () => {
  let calls = 0;
  const base = result([]);
  const battle = await runBattle(
    base.arena,
    [{ id: 'Q1', condition: 'test', input: '2+2', target: '4' }],
    base.contestants.slice(0, 1),
    {
      roundSync: true,
      retries: 1,
      ask: async () => {
        if (calls++ === 0) throw new Error('本机模拟首次失败');
        return { text: '4', latencyMs: 20, usage: { input: 100, output: 1, cachedInput: 50 } };
      },
    },
  );
  const r = battle.records[0]!;
  assert.equal(r.attempts, 2);
  assert.ok(r.solveMs! >= 1000);
  assert.equal(r.latencyMs, 20);
  assert.equal(r.usageComplete, false);
  assert.equal(battle.meta!.rankingPolicy, RANKING_POLICY);
  assert.equal(performanceMetrics(battle).get('A')!.included.tokens, 0);
});

test('旧规则战绩：快照/持久化/战报/解说统一综合冠军，分项规则公开，更早的战绩保留原排名', () => {
  const r = result([record('A'), record('B', { solveMs: 500 })]);
  const s = settle(r),
    state = new LiveState();
  state.accept({
    battle: 'b',
    seq: 1,
    type: 'model',
    modelId: 'B',
    taskId: 'Q1',
    attempt: 0,
    solveMs: 500,
    usage: r.records[1]!.usage,
  });
  state.accept({
    battle: 'b',
    seq: 2,
    type: 'round-end',
    taskId: 'Q1',
    metrics: Object.fromEntries(performanceMetrics(r)),
  });
  state.accept({ battle: 'b', seq: 3, type: 'done', board: [], commentary: [], reportFile: '', settlement: s });
  const saved = JSON.parse(JSON.stringify(r)),
    snapshot = JSON.parse(JSON.stringify(state.snapshot()));
  assert.deepEqual(settle(saved).leaderIds, ['B']);
  assert.deepEqual(snapshot.frames[2].settlement, s);
  assert.equal(snapshot.frames[0].usage.cachedInput, 0);
  assert.match(renderReport(r), /竞技综合榜/);
  assert.match(renderMarkdown(r), /缓存命中/);
  assert.match(commentate(r, buildLeaderboard(r), new Map())[0]!, /冠军：B/);
  const scoring = describeScoring(r.arena.judge, [], 'arena-default', false, EFFICIENCY_POLICY);
  assert.match(scoring.performance!.join(''), /70.*15.*10.*5/);
  assert.ok(!scoring.aggregation.includes('不参与评分'));
  delete saved.meta.rankingPolicy;
  assert.equal(settle(saved).outcome, 'tie');
  assert.ok(!renderReport(saved).includes('<h2>竞技综合榜</h2>'));
});

test('超时后的迟到答案不会被保留为重试成绩或零耗时优势', async () => {
  let calls = 0;
  const base = result([]);
  const battle = await runBattle(
    base.arena,
    [{ id: 'Q1', condition: 'test', input: '2+2', target: '4' }],
    base.contestants.slice(0, 1),
    {
      timeoutMs: 1,
      retries: 1,
      ask: async () => {
        if (calls++ > 0) throw new Error('重试失败');
        await new Promise((resolve) => setTimeout(resolve, 15));
        return { text: '4', latencyMs: 15, usage: { input: 1, output: 1 } };
      },
    },
  );
  assert.equal(battle.records[0]!.answer, '');
  assert.match(battle.records[0]!.error!, /未完成.*退赛/);
  assert.equal(calls, 1, '超过单题总时限后不可重试');
  assert.equal(performanceMetrics(battle).get('A')!.score, null);
});

test('现行规则：按答题均分排名，效率不决胜；分差置信区间不含 0 才判胜者，否则只暂列第一', () => {
  // 同分：效率再好也不决定名次
  const same = result(
    [record('A'), record('B', { solveMs: 200, usage: { input: 100, output: 20, cachedInput: 90 } })],
    RANKING_POLICY,
  );
  const tie = settle(same);
  assert.equal(tie.outcome, 'tie');
  assert.deepEqual([...tie.leaderIds].sort(), ['A', 'B']);
  assert.ok(
    tie.rows.every((row) => row.performance),
    '效率指标照常计算，供参考',
  );
  assert.match(
    describeScoring(same.arena.judge, [], 'arena-default', false, RANKING_POLICY).aggregation,
    /效率参考，不决定名次/,
  );
  // 差距显著：A 12 题全对，B 全错
  const tasks = Array.from({ length: 12 }, (_, i) => `Q${i}`);
  const clear = result(
    tasks.flatMap((taskId) => [record('A', { taskId }), record('B', { taskId, score: 0, solveMs: 100 })]),
    RANKING_POLICY,
  );
  const win = settle(clear);
  assert.equal(win.outcome, 'winner');
  assert.deepEqual(win.leaderIds, ['A']);
  assert.match(win.reason, /置信区间 .* 不含 0/);
  assert.equal(win.rows[0]!.modelId, 'A', '速度更快的 B 不会因效率排到前面');
  // 差距在误差内：只差一题
  const close = result(
    tasks.flatMap((taskId, i) => [record('A', { taskId }), record('B', { taskId, score: i === 0 ? 0 : 1 })]),
    RANKING_POLICY,
  );
  const unsure = settle(close);
  assert.equal(unsure.outcome, 'inconclusive');
  assert.deepEqual(unsure.leaderIds, ['A']);
  assert.match(unsure.reason, /含 0.*不判定胜者/);
  // 报告与解说：以答题质量为准，效率表降为参考
  assert.match(renderReport(close), /效率参考（不决定名次）/);
  assert.ok(!renderReport(close).includes('<h2>竞技综合榜</h2>'));
  assert.match(renderReport(close), /本场结论：答题均分暂列第一/);
  assert.match(renderMarkdown(close), /本场结论：答题均分暂列第一/);
  assert.ok(!commentate(close, buildLeaderboard(close), new Map()).join('').includes('竞技综合分'));
});
