import test from 'node:test';
import assert from 'node:assert/strict';
import { describeScoring, buildSettlement, requiresModelJudge } from '../src/scoring-summary.ts';
import { buildLeaderboard } from '../src/leaderboard.ts';
import { LiveState } from '../src/live-state.ts';
import { commentaryContext } from '../src/commentator.ts';
import type { BattleResult, BattleRecord, JudgeSpec } from '../src/types.ts';

const record = (model: string, score: number, extra: Partial<BattleRecord> = {}): BattleRecord => ({
  taskId: 'Q1',
  model,
  condition: 'test',
  prompt: '题目',
  answer: '答案',
  score,
  latencyMs: 20,
  ...extra,
});
const result = (records: BattleRecord[], extra: Partial<BattleResult> = {}): BattleResult => ({
  arena: { name: 'fixture', title: '评分测试', description: '', judge: { kind: 'exact' } },
  startedAt: '2026-09-12T00:00:00Z',
  durationMs: 100,
  contestants: ['A', 'B'].map((id) => ({ id, name: id, kind: 'pi' })),
  records,
  ...extra,
});
const settle = (battle: BattleResult, options: Parameters<typeof buildSettlement>[2] = {}) =>
  buildSettlement(battle, buildLeaderboard(battle), options);

test('评分规则：组合递归、真实语义与答案相关细则延迟公开', () => {
  const spec: JudgeSpec = {
    kind: 'all',
    judges: [
      { kind: 'exact', trimPunct: false },
      { kind: 'contains', keywords: ['保密词'] },
      {
        kind: 'any',
        judges: [
          { kind: 'regex', pattern: 'SECRET_PATTERN' },
          { kind: 'not', judge: { kind: 'llm', rubric: 'SECRET_RUBRIC', scale: 5 } },
        ],
      },
    ],
  };
  assert.equal(requiresModelJudge(spec), true);
  assert.equal(requiresModelJudge({ kind: 'not', judge: { kind: 'exact' } }), false);
  const during = describeScoring(spec, ['openrouter:lab/judge']);
  assert.ok(during.details.some((v) => /最低得分/.test(v)));
  assert.ok(during.details.some((v) => /最高得分/.test(v)));
  assert.ok(during.details.some((v) => /保留首尾标点/.test(v)));
  assert.ok(during.details.some((v) => /0–5/.test(v)));
  assert.ok(!JSON.stringify(during).includes('SECRET'));
  assert.ok(!JSON.stringify(during).includes('保密词'));
  const after = describeScoring(spec, ['openrouter:lab/judge'], 'task-override', true);
  assert.ok(JSON.stringify(after).includes('SECRET_PATTERN'));
  assert.ok(JSON.stringify(after).includes('保密词'));
  assert.equal(after.detailsAvailable, true);
  assert.equal(after.source, 'task-override');
  assert.match(describeScoring({ kind: 'llm', rubric: 'x' }, ['mock:laoshi-k2']).details.join(''), /启发式演示/);
  assert.deepEqual(describeScoring({ kind: 'exact' }, ['mock:laoshi-k2']).judgeModels, []);
});

test('结算：均分原值判断并列，显示相同百分比不强制并列，不改原榜单', () => {
  const tied = result([record('A', 0.8), record('B', 0.8)]),
    board = buildLeaderboard(tied),
    before = structuredClone(board);
  const tie = buildSettlement(tied, board);
  assert.equal(tie.outcome, 'tie');
  assert.deepEqual(tie.leaderIds.sort(), ['A', 'B']);
  assert.deepEqual(
    tie.rows.map((r) => r.rank),
    [1, 1],
  );
  assert.deepEqual(board, before);
  const precise = settle(result([record('A', 0.9994), record('B', 0.99949)]));
  assert.equal(precise.outcome, 'winner');
  assert.deepEqual(precise.leaderIds, ['B']);
  assert.equal(precise.rows[0]!.fullCredit, 0);
  assert.equal(precise.rows[0]!.partialCredit, 1);
});

test('结算：失败不是零分，全部失败、缺题、中止、单模型均不宣称冠军', () => {
  const failed = result([
    record('A', 0, { error: '502', note: '裁判弃权（调用失败）', usage: { input: 3, output: 2 } }),
    record('B', 0, { error: 'timeout' }),
  ]);
  const none = settle(failed);
  assert.equal(none.outcome, 'no-score');
  assert.deepEqual(none.leaderIds, []);
  assert.ok(none.rows.every((r) => r.avg === null && r.zeroCredit === 0 && r.rank === null));
  assert.equal(none.rows.find((r) => r.modelId === 'A')!.judgeErrors, 1);
  assert.equal(none.rows.find((r) => r.modelId === 'B')!.modelErrors, 1);
  assert.deepEqual(none.rows.find((r) => r.modelId === 'A')!.tokenUsage, { input: 3, output: 2 });
  const zeros = settle(result([record('A', 0), record('B', 0)]));
  assert.equal(zeros.outcome, 'tie');
  assert.equal(zeros.rows[0]!.zeroCredit, 1);
  const partial = settle(result([record('A', 1), record('B', 0)]), { expectedTasks: 2 });
  assert.equal(partial.outcome, 'incomplete');
  assert.deepEqual(partial.leaderIds, []);
  assert.equal(partial.rows[0]!.missing, 1);
  const stopped = settle(result([record('A', 1)], { status: 'stopped' }), { preElo: new Map([['A', 1612]]) });
  assert.equal(stopped.outcome, 'incomplete');
  assert.equal(stopped.expectedTasks, null);
  assert.equal(stopped.career, 'unchanged');
  assert.equal(stopped.rows.find((r) => r.modelId === 'A')!.elo, 1612);
  assert.ok(stopped.rows.every((r) => r.delta === 0));
  const single = result([record('A', 1)]);
  single.contestants = single.contestants.slice(0, 1);
  assert.equal(settle(single).outcome, 'single');
  assert.deepEqual(settle(single).leaderIds, []);
});

test('结算：有效题集合不同不能比较，回放与模拟裁判警示保留', () => {
  const mismatched = result([
    record('A', 1),
    record('A', 0, { taskId: 'Q2', error: 'timeout' }),
    record('B', 0, { error: 'timeout' }),
    record('B', 0, { taskId: 'Q2' }),
  ]);
  assert.equal(settle(mismatched).outcome, 'incomplete');
  assert.deepEqual(settle(mismatched).leaderIds, []);
  const legacy = result([record('A', 1), record('B', 0.5)]);
  legacy.arena.judge = { kind: 'llm', rubric: '评分' };
  legacy.meta = { arenaFingerprint: 'fixture', toolVersion: 'old', judgeModels: ['mock:laoshi-k2'] };
  const replay = settle(legacy, { replay: true });
  assert.equal(replay.career, 'replay');
  assert.equal(replay.eloBasis, 'match');
  assert.ok(replay.warnings.some((v) => /启发式演示/.test(v)));
  assert.ok(replay.rows.every((r) => r.delta === 0));
  delete legacy.meta;
  assert.ok(settle(legacy).warnings.some((v) => /未保存裁判身份/.test(v)));
  assert.equal(settle(legacy, { replay: true, stopped: true }).outcome, 'incomplete');
});

test('评分与结算完整留在状态快照，开题时解说拿不到隐藏规则', () => {
  const state = new LiveState(),
    spec: JudgeSpec = { kind: 'contains', keywords: ['SECRET_KEYWORD'] };
  state.accept({
    battle: 'b1',
    seq: 1,
    type: 'start',
    title: '测试',
    contestants: ['A', 'B'],
    total: 2,
    scoring: describeScoring(spec),
  });
  state.accept({
    battle: 'b1',
    seq: 2,
    type: 'round',
    taskId: 'Q1',
    index: 0,
    total: 1,
    prompt: '题面',
    scoring: describeScoring(spec),
  });
  for (let seq = 3; seq < 620; seq++)
    state.accept({
      battle: 'b1',
      seq,
      type: 'model',
      taskId: 'Q1',
      modelId: 'A',
      attempt: 0,
      channel: 'answer',
      delta: '中',
    });
  assert.ok(!JSON.stringify(commentaryContext(state.snapshot().frames)).includes('SECRET_KEYWORD'));
  state.accept({
    battle: 'b1',
    seq: 620,
    type: 'round-end',
    taskId: 'Q1',
    scoring: describeScoring(spec, [], 'arena-default', true),
  });
  const settlement = settle(result([record('A', 1), record('B', 1)]));
  state.accept({ battle: 'b1', seq: 621, type: 'done', board: [], commentary: [], reportFile: '', settlement });
  const restored = JSON.parse(JSON.stringify(state.snapshot()));
  assert.deepEqual(restored.frames.find((f: any) => f.type === 'done').settlement, settlement);
  assert.ok(
    restored.frames
      .find((f: any) => f.type === 'round-end')
      .scoring.details.join('')
      .includes('SECRET_KEYWORD'),
  );
});
