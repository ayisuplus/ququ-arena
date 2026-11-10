import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { bootstrapCI, judgeAgreement } from '../src/stats.ts';
import { diffBattles } from '../src/diff.ts';
import { protocolKey } from '../src/experiment-protocol.ts';
import { analyzeArena } from '../src/analyze.ts';
import type { BattleResult } from '../src/types.ts';
const result = (): BattleResult => ({
  arena: { name: 'fixture', title: '协议测试', description: '', judge: { kind: 'exact' } },
  startedAt: new Date().toISOString(),
  durationMs: 2,
  contestants: [{ id: 'x', name: 'x', kind: 'mock' }],
  records: [{ taskId: 't', condition: 'c', model: 'x', prompt: '原始任务', answer: 'x', score: 1, latencyMs: 1 }],
  meta: {
    arenaFingerprint: 'task-v1',
    judgeModels: ['judge-a'],
    toolVersion: 'v1',
    execution: { schedule: 'pool', concurrency: 1, reasoning: 'default', timeoutMs: 60000 },
  },
});
test('单观测没有 CI；常数裁判的相关性不可定义但绝对分歧保留', () => {
  assert.equal(bootstrapCI([1]), undefined);
  assert.equal(bootstrapCI([]), undefined);
  const r = judgeAgreement([{ votes: [0.1, 0.9] }, { votes: [0.1, 0.9] }, { votes: [0.1, 0.9] }])!;
  assert.equal(r.pearson, null);
  assert.equal(r.meanDispute, 0.8);
});
test('实验协议：拒绝混合裁判、预算、版本和缺失指纹；字段顺序不影响身份', () => {
  const a = result();
  for (const change of [
    (b: BattleResult) => (b.meta!.judgeModels = ['judge-b']),
    (b: BattleResult) => (b.meta!.execution!.timeoutMs = 30000),
    (b: BattleResult) => (b.meta!.arenaFingerprint = ''),
    (b: BattleResult) => (b.meta!.toolVersion = 'v2'),
    (b: BattleResult) => (b.meta!.taskBudgetMs = 90000),
  ]) {
    const b = structuredClone(a);
    change(b);
    assert.throws(() => diffBattles(a, b));
    assert.notEqual(protocolKey(a), protocolKey(b));
  }
  const b = structuredClone(a);
  b.meta!.execution = { timeoutMs: 60000, reasoning: 'default', concurrency: 1, schedule: 'pool' };
  assert.equal(protocolKey(a), protocolKey(b));
  assert.equal(diffBattles(a, b).models[0].sharedTasks, 1);
  delete b.meta!.execution;
  delete a.meta!.execution;
  assert.ok(diffBattles(a, b).warnings.some((w) => w.includes('描述性')));
});
test('题目诊断必须先选版本，禁止同题号的旧新材料混合', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-protocol-test-')),
    a = result(),
    b = result();
  b.meta!.arenaFingerprint = 'task-v2';
  b.records[0].prompt = '修改后的任务';
  await writeFile(path.join(dir, '战绩-fixture-a.json'), JSON.stringify(a));
  await writeFile(path.join(dir, '战绩-fixture-b.json'), JSON.stringify(b));
  await assert.rejects(() => analyzeArena('fixture', dir), /--protocol/);
  const one = await analyzeArena('fixture', dir, protocolKey(a));
  assert.equal(one.battles, 1);
  assert.equal(one.tasks[0].n, 1);
  delete a.meta;
  delete b.meta;
  assert.notEqual(protocolKey(a), protocolKey(b));
});
