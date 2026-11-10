/**
 * v3.1 契约：miner（弱项挖掘——benchmark→agent 的桥）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BattleResult, BattleRecord } from '../src/types.ts';
import { mineWeaknesses, weaknessBrief } from '../src/miner.ts';
import { inventArena } from '../src/inventor.ts';

const rec = (over: Partial<BattleRecord>): BattleRecord => ({
  taskId: 't1',
  condition: 'c',
  model: 'm',
  prompt: '题面',
  answer: '答',
  score: 0,
  latencyMs: 0,
  ...over,
});
const mkResult = (records: BattleRecord[]): BattleResult => ({
  arena: { name: 'a', title: 't', description: '', judge: { kind: 'exact' } },
  startedAt: '2026-09-10T00:00:00.000Z',
  durationMs: 1,
  contestants: [],
  records,
});

test('挖矿契约：团灭题检出升序、维度弱项、弃权剔除、阈值语义', () => {
  const result = mkResult([
    rec({ taskId: 't1', condition: 'c1', model: 'm1', score: 0, answer: '全错A' }),
    rec({ taskId: 't1', condition: 'c1', model: 'm2', score: 0.1, answer: '全错B' }),
    rec({ taskId: 't2', condition: 'c2', model: 'm1', score: 0.9, answer: '对' }),
    rec({ taskId: 't2', condition: 'c2', model: 'm2', score: 1, answer: '对' }),
    rec({ taskId: 't3', condition: 'c1', model: 'm1', error: '挂了', score: 0 }), // 弃权剔除
  ]);
  const rep = mineWeaknesses(result);
  assert.equal(rep.tasks.length, 1, '只有 t1 是弱项');
  assert.equal(rep.tasks[0]!.taskId, 't1');
  assert.ok(rep.tasks[0]!.samples.length <= 2, '翻车现场至多截取两条');
  assert.equal(rep.conditions.length, 1);
  assert.equal(rep.conditions[0]!.condition, 'c1');
  // 阈值收紧：0.05 以下才报——t1 均分 0.05 恰好≤阈值边界
  assert.equal(mineWeaknesses(result, 0.04).tasks.length, 0, '阈值 0.04 时无矿');
});

test('挖矿契约：脑洞文本带翻车现场 + 出题官离线成罐（agent 桥真实可跑）', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mine-'));
  try {
    const rep = mineWeaknesses(
      mkResult([
        rec({ taskId: 't1', condition: 'c1', model: 'm1', score: 0, answer: '错答一' }),
        rec({ taskId: 't1', condition: 'c1', model: 'm2', score: 0.1, answer: '错答二' }),
      ]),
    );
    const brief = weaknessBrief(rep, 6);
    assert.ok(brief.includes('翻车现场'), '脑洞必须附翻车现场');
    assert.ok(brief.includes('t1'), '脑洞必须点题');
    // 出题官离线模板模式（无 Key 也能成罐）——agent 桥的真实闭环
    const r = await inventArena(brief, dir, { offline: true, count: 6 });
    assert.ok(r.taskCount > 0, '离线模式须出题');
    const files = await readdir(r.dir);
    assert.ok(files.includes('arena.json') && files.includes('tasks.jsonl'), '罐双件齐备');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
