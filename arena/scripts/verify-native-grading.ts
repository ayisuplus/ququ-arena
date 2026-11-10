import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createTaskGrader, gradeRecord } from '../src/task-grading.ts';
import { defaultRubric } from '../src/task-mode.ts';
import { detectAgents } from '../src/agents.ts';
import type { BattleRecord } from '../src/types.ts';

const directory = await mkdtemp(path.join(os.tmpdir(), 'arena-native-grading-'));
const out = path.resolve('../docs/validation/task-tracks');
await mkdir(out, { recursive: true });
const record: BattleRecord = {
  taskId: 'native-smoke',
  condition: 'budget',
  model: 'synthetic-answer-fixture',
  prompt: '合成材料：80人，每人5元物料，不收其他费用。',
  answer: '最终90人，每人5元，总额450元，比初版增加50元。',
  latencyMs: 0,
  score: 0,
  taskSnapshot: {
    id: 'native-smoke',
    condition: 'budget',
    input: '合成材料：80人，每人5元物料，不收其他费用。',
    judge: defaultRubric('multi_turn'),
    rounds: [
      { id: 'r1', title: '初版', input: '计算总额。' },
      { id: 'r2', title: '变更', input: '人数改90，其余不变，给出新总额和差额。' },
    ],
  },
  rounds: [
    {
      roundId: 'r1',
      title: '初版',
      prompt: '合成材料：80人，每人5元物料，不收其他费用。计算总额。',
      answer: '80人，每人5元，总额400元。',
      latencyMs: 0,
      solveMs: 0,
      attempts: 1,
      usageComplete: false,
    },
    {
      roundId: 'r2',
      title: '变更',
      prompt: '人数改90，其余不变，给出新总额和差额。',
      answer: '最终90人，每人5元，总额450元，比初版增加50元。',
      latencyMs: 0,
      solveMs: 0,
      attempts: 1,
      usageComplete: false,
    },
  ],
};
try {
  const began = Date.now();
  await gradeRecord(record, createTaskGrader({ kind: 'agent', agent: 'codex' }, { cwd: directory }));
  const agents = (await detectAgents()).map(({ id, status, version }) => ({ id, status, version }));
  await writeFile(
    path.join(out, 'codex-smoke.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        elapsedMs: Date.now() - began,
        purpose: '真实 Codex 正式评分；选手答卷为隔离合成测试数据，未调用真实参赛模型',
        agents,
        record,
      },
      null,
      2,
    ),
  );
  assert.equal(record.gradingStatus, 'graded', record.gradingError);
  assert.equal(record.grade!.dimensions.length, 4);
  console.log(
    JSON.stringify({ status: record.gradingStatus, score: record.score, elapsedMs: Date.now() - began, agents }),
  );
} finally {
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('arena-native-grading-'));
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
