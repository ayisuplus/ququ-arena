/**
 * v1.0 契约测试：diff 同卷对比（配对 CI/共享题口径/指纹硬约束）、加赛选题
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ArenaDef, ArenaTask, BattleResult } from '../src/types.ts';
import { diffBattles } from '../src/diff.ts';
import { pickPlayoffTasks } from '../src/leaderboard.ts';

const def: ArenaDef = { name: 't', title: '测试罐', description: '', judge: { kind: 'exact' } };

/** 构造战绩：scores[model][taskIndex] */
function mkBattle(scores: Record<string, number[]>, fingerprint = 'fp1'): BattleResult {
  const records = Object.entries(scores).flatMap(([model, arr]) =>
    arr.map((score, i) => ({
      taskId: `t${i}`,
      condition: 'c1',
      model,
      prompt: '',
      answer: '',
      score,
      latencyMs: 1,
    })),
  );
  return {
    arena: def,
    startedAt: '2026-09-10T00:00:00.000Z',
    durationMs: 1,
    contestants: Object.keys(scores).map((id) => ({ id, name: id, kind: 'mock' as const })),
    records,
    meta: { arenaFingerprint: fingerprint, judgeModels: ['j'], toolVersion: '1.0.0' },
  };
}

test('diff：同一场自比全部噪声、Δ=0、无摆动题', () => {
  const b = mkBattle({ x: [1, 0, 1, 0, 1, 0, 1, 0], y: [0, 1, 0, 1, 0, 1, 0, 1] });
  const rep = diffBattles(b, b);
  for (const m of rep.models) {
    assert.equal(m.delta, 0);
    assert.equal(m.verdict, 'noise');
  }
  assert.equal(rep.swings.length, 0);
});

test('diff：B 全胜翻盘判显著进步，逐题摆动列出', () => {
  const a = mkBattle({ x: Array.from({ length: 12 }, () => 0) });
  const b = mkBattle({ x: Array.from({ length: 12 }, () => 1) });
  const rep = diffBattles(a, b);
  assert.equal(rep.models[0]!.verdict, 'up');
  assert.ok(rep.models[0]!.ci!.hi < 0, 'Δ(A−B) 的 CI 必须整体为负');
  assert.ok(rep.swings.length === 12);
});

test('diff：指纹不同硬拒比', () => {
  const a = mkBattle({ x: [1] }, 'fp1');
  const b = mkBattle({ x: [1] }, 'fp2');
  assert.throws(() => diffBattles(a, b), /不同一份考卷|不是同一份考卷/);
});

test('diff：题量不同的场次只比共同题（口径不混）', () => {
  // A 4 题全对（avg 1.0），B 8 题前 4 全对后 4 全错（全场 avg 0.5）
  const a = mkBattle({ x: [1, 1, 1, 1] });
  const b = mkBattle({ x: [1, 1, 1, 1, 0, 0, 0, 0] });
  const rep = diffBattles(a, b);
  assert.equal(rep.models[0]!.sharedTasks, 4, '只比 4 道共同题');
  assert.equal(rep.models[0]!.avgA, 1);
  assert.equal(rep.models[0]!.avgB, 1, '共同题口径下 B 也是全对——不许被后 4 题拉低');
});

test('pickPlayoffTasks：选方差最大的 K 题且保持罐内原序', () => {
  const tasks: ArenaTask[] = Array.from({ length: 5 }, (_, i) => ({
    id: `t${i}`,
    condition: 'c1',
    input: '',
    target: '',
  }));
  // t2 方差最大（0/1 分裂），t0/t1/t3/t4 全同分
  const records = ['a', 'b'].flatMap((m) =>
    tasks.map((t) => ({
      taskId: t.id,
      model: m,
      score: t.id === 't2' ? (m === 'a' ? 1 : 0) : 1,
    })),
  );
  const picked = pickPlayoffTasks(records, tasks, 2);
  assert.ok(picked.length <= 2);
  assert.ok(
    picked.some((t) => t.id === 't2'),
    '方差最大的题必须入选',
  );
  // 罐内原序保持
  const ids = picked.map((t) => t.id);
  assert.deepEqual(ids, [...ids].sort());
});
