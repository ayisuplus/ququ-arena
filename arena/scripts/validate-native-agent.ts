// Explicit acceptance command: one real call using the already configured Codex login.
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { detectAgents } from '../src/agents.ts';
import { createTaskGrader } from '../src/task-grading.ts';
import { defaultRubric } from '../src/task-mode.ts';
import type { BattleRecord } from '../src/types.ts';

const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error('需要绝对证据目录');
await mkdir(output, { recursive: true });
const agent = (await detectAgents(true)).find((a) => a.id === 'codex');
if (agent?.status !== 'ready') throw new Error('现有 Codex 未就绪');
const answer = '材料明确给出 2 个箱子，每箱 3 个样品，因此共有 2 × 3 = 6 个样品。假设每箱数量准确且没有重复计数。';
const record: BattleRecord = {
  taskId: 'real-judge-minimum',
  model: 'anonymous-local-fixture',
  condition: 'verification',
  prompt: '有 2 个箱子，每箱 3 个样品。请算总数，说明依据与假设。',
  answer,
  score: 0,
  latencyMs: 0,
  taskSnapshot: {
    id: 'real-judge-minimum',
    condition: 'verification',
    input: '有 2 个箱子，每箱 3 个样品。请算总数，说明依据与假设。',
    judge: defaultRubric('open'),
  },
  rounds: [
    {
      roundId: 'r1',
      title: '完整答卷',
      prompt: '计算样品总数并说明依据。',
      answer,
      latencyMs: 0,
      solveMs: 0,
      attempts: 1,
      usageComplete: false,
    },
  ],
};
const started = Date.now();
try {
  const grade = await createTaskGrader({ kind: 'agent', agent: 'codex' }, { cwd: path.join(output, 'sessions') })(
    record,
    AbortSignal.timeout(90000),
  );
  const result = {
    realExecution: true,
    scope: 'one existing Codex grader call; synthetic answer; no Docker engineering execution',
    agent: { id: agent.id, version: agent.version, billing: agent.billing },
    elapsedMs: Date.now() - started,
    record,
    grade,
  };
  await writeFile(path.join(output, 'real-agent.json'), JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({ ok: true, elapsedMs: result.elapsedMs, dimensions: grade.dimensions.length, score: grade.score }),
  );
} catch (e) {
  await writeFile(
    path.join(output, 'real-agent.json'),
    JSON.stringify(
      { realExecution: true, ok: false, elapsedMs: Date.now() - started, error: (e as Error).message },
      null,
      2,
    ),
  );
  throw e;
}
