import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error 浏览器端原生 JS 模块，无类型声明
import { acceptEvent, boardRows, callsFor, createBattleState, gradeFor, isTerminal } from '../web/batch-state.js';

const roster = [
  { id: 'a', name: '甲' },
  { id: 'b', name: '乙' },
];
const start = { type: 'start', battle: 'b1', seq: 1, title: '《测试》', total: 4, roster };
const round = (seq: number, taskId: string, index: number) => ({
  type: 'round',
  battle: 'b1',
  seq,
  taskId,
  prompt: taskId + ' 的题面',
  index,
  total: 2,
});
const model = (seq: number, extra: Record<string, unknown>) => ({
  type: 'model',
  battle: 'b1',
  seq,
  taskId: 't1',
  modelId: 'a',
  attempt: 1,
  ...extra,
});

test('批量评测状态：只收本场事件，按 seq 去重', () => {
  const state = createBattleState();
  assert.equal(acceptEvent(state, start, 'b1'), true);
  assert.equal(acceptEvent(state, { ...start, battle: 'b2', seq: 2 }, 'b1'), false, '其他场次的事件不处理');
  assert.equal(acceptEvent(state, { type: 'progress', battle: 'b1', seq: 1, done: 3 }, 'b1'), false, '重复 seq 丢弃');
  assert.equal(acceptEvent(state, { type: 'status' }, 'b1'), false, '连接状态帧不带场次');
  assert.equal(state.title, '《测试》');
  assert.equal(state.control, 'running');
  assert.equal(state.progress, 0);
});

test('批量评测状态：流式增量按块拼接，整段补发覆盖，重试取最新一次', () => {
  const state = createBattleState();
  for (const e of [
    start,
    round(2, 't1', 1),
    model(3, { status: 'generating' }),
    model(4, { channel: 'answer', block: 1, delta: '世界' }),
    model(5, { channel: 'answer', block: 0, delta: '你好' }),
    model(6, { channel: 'reasoning', block: 0, delta: '想一想' }),
    model(7, { status: 'error', error: '超时' }),
    model(8, { attempt: 2, status: 'done', answer: '最终答案', score: 1 }),
  ])
    acceptEvent(state, e, 'b1');
  const [first, second] = callsFor(state, 't1', 'a');
  assert.equal(first.answer, '你好世界', '块按序号拼接，与到达顺序无关');
  assert.equal(first.reasoning, '想一想');
  assert.equal(first.error, '超时');
  assert.equal(second.answer, '最终答案');
  assert.equal(callsFor(state, 't1', 'a').at(-1).score, 1);
});

test('批量评测状态：快照重建、评分事件回写、结算后以服务端成绩为准', () => {
  const state = createBattleState();
  acceptEvent(
    state,
    {
      type: 'snapshot',
      battle: 'b1',
      seq: 9,
      frames: [start, round(2, 't1', 1), model(3, { status: 'done', answer: 'x' }), round(4, 't2', 2)],
    },
    'b1',
  );
  assert.equal(state.seq, 9);
  assert.equal(state.latestTask, 't2');
  assert.equal(state.rounds.size, 2);
  assert.equal(
    acceptEvent(state, { type: 'progress', battle: 'b1', seq: 5, done: 1 }, 'b1'),
    false,
    '快照之前的事件不重放',
  );
  const judge = { kind: 'agent', agent: 'codex' };
  acceptEvent(
    state,
    {
      type: 'grading',
      battle: 'b1',
      seq: 10,
      taskId: 't1',
      modelId: 'a',
      status: 'graded',
      judge,
      grade: { score: 0.5, dimensions: [] },
    },
    'b1',
  );
  assert.equal(gradeFor(state, 't1', 'a').status, 'graded');
  assert.equal(callsFor(state, 't1', 'a').at(-1).score, 0.5, '任务评分回写到最新调用');
  let rows = boardRows(state);
  assert.deepEqual(
    rows.map((r: { id: string }) => r.id),
    ['a', 'b'],
  );
  assert.equal(rows[0].avg, 0.5);
  assert.equal(rows[0].answered, 1);
  assert.equal(rows[1].avg, null);
  assert.equal(isTerminal(state), false);
  const withdrawal = { modelId: 'b', taskId: 't2', reason: 'timeout', message: '单题超时退赛', failures: 0, at: 1 };
  acceptEvent(
    state,
    {
      type: 'done',
      battle: 'b1',
      seq: 11,
      board: [],
      commentary: [],
      reportFile: '/results/r.html',
      pendingGrades: 1,
      settlement: {
        reason: '差距不显著',
        warnings: [],
        rows: [
          { modelId: 'b', name: '乙', rank: 1, avg: 0.9, answered: 2, errors: 0, withdrawal },
          { modelId: 'a', name: '甲', rank: 2, avg: 0.5, answered: 2, errors: 1, performance: { score: 40.2 } },
        ],
      },
    },
    'b1',
  );
  assert.equal(state.control, 'completed');
  assert.equal(isTerminal(state), true);
  rows = boardRows(state);
  assert.deepEqual(
    rows.map((r: { id: string }) => r.id),
    ['b', 'a'],
    '结算后按服务端名次',
  );
  assert.equal(rows[1].performance, 40.2);
  assert.equal(state.withdrawals.get('b').message, '单题超时退赛');
});

test('批量评测状态：错误与停止都是终态', () => {
  const stopped = createBattleState();
  acceptEvent(stopped, { ...start }, 'b1');
  acceptEvent(
    stopped,
    { type: 'done', battle: 'b1', seq: 2, stopped: true, board: [], commentary: [], reportFile: '' },
    'b1',
  );
  assert.equal(stopped.control, 'stopped');
  assert.equal(isTerminal(stopped), true);
  const failed = createBattleState();
  acceptEvent(failed, { type: 'error', battle: 'b1', seq: 1, message: '题库暂停' }, 'b1');
  assert.equal(failed.control, 'error');
  assert.equal(failed.error, '题库暂停');
  assert.equal(isTerminal(failed), true);
});
