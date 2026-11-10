/**
 * 契约测试：analyze 的诚实性——mock 合成数据不得产出区分度/难度结论。
 *
 * 背景（T-004 体检）：全平台 98.67% 的战绩是 4 只 mock 蛐蛐（确定性人格，power 0.92/0.82/0.70/0.45）
 * 跑的，其对错由人格战力决定、与题目难度无关——旧 analyzeArena 把 mock 观测与真实观测一锅算，
 * 于是任何罐都会被聚出「漂亮」的 point-biserial r（sharp/flat）。本测试锁死修复后的口径：
 * 区分度只用「有效真实观测」，真实样本 < MIN_REAL_OBS 一律 r=null 且 tag=unverified。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { runBattle } from '../src/runner.ts';
import { analyzeArena, arenaStatus, arenaStatusFor, MIN_REAL_OBS } from '../src/analyze.ts';
import { listMockContestants } from '../src/mock.ts';
import type { ArenaDef, ArenaTask, BattleResult } from '../src/types.ts';

const def: ArenaDef = { name: 'honesty', title: '诚实性测试', description: '', judge: { kind: 'exact' } };
const tasks: ArenaTask[] = Array.from({ length: 6 }, (_, i) => ({
  id: `H${i + 1}`,
  condition: 'test',
  input: `${i}+${i}，只输出整数`,
  target: String(i + i),
}));

test('仅 mock 合成数据的罐不产出区分度结论：r=null / tag=unverified / IRT 无输入', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'ququ-analyze-honesty-'));
  try {
    // 4 只 mock 人格跑同一题库 3 场——旧逻辑会因人格分差自动造出 sharp/flat
    for (let i = 0; i < 3; i++) {
      const result = await runBattle(def, tasks, listMockContestants(), { concurrency: 4 });
      await writeFile(path.join(tmp, `战绩-honesty-2026-09-2${i}T00-00-00.json`), JSON.stringify(result));
    }
    const { tasks: rows, battles, raw } = await analyzeArena('honesty', tmp);
    assert.equal(battles, 3);
    assert.equal(rows.length, tasks.length);
    for (const r of rows) {
      assert.equal(r.nReal, 0, `${r.taskId} 无真实观测`);
      assert.equal(r.nMock, 12, `${r.taskId} 应有 3 场 × 4 mock = 12 条合成观测`);
      assert.equal(r.r, null, `${r.taskId} 纯 mock 不得给出 point-biserial r`);
      assert.equal(r.tag, 'unverified', `${r.taskId} 应为「未验证」而非 sharp/flat/giveaway`);
    }
    assert.equal(raw.length, 0, 'IRT 输入同样不得含 mock 合成观测');

    const status = await arenaStatusFor('honesty', tmp);
    assert.equal(status.status, 'unverified');
    assert.equal(status.nReal, 0);
    assert.equal(status.nMock, 3 * 4 * tasks.length);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('罐体诊断区分真实样本量、天花板/地板与同场模型分差', () => {
  const mk = (scores: number[], mock = 0): BattleResult => ({
    arena: def,
    startedAt: '2026-09-20T00:00:00.000Z',
    durationMs: 1,
    contestants: [],
    records: [
      ...scores.map((score, i) => ({
        taskId: `t${i}`,
        condition: 'c',
        model: 'real:m',
        prompt: '',
        answer: '',
        score,
        latencyMs: 1,
      })),
      ...Array.from({ length: mock }, (_, i) => ({
        taskId: `m${i}`,
        condition: 'c',
        model: 'mock:xueba-o9',
        prompt: '',
        answer: '',
        score: 1,
        latencyMs: 1,
      })),
    ],
  });
  // 数量门槛只认「真实」观测
  assert.equal(arenaStatus([mk([1, 1, 1, 1, 1, 1, 1], 100)]).status, 'unverified', '7 条真实 + 100 mock 仍不足');
  assert.equal(arenaStatus([mk([], 100)]).status, 'unverified', '纯 mock 不构成证据');
  // 达标后按真实均分分档
  assert.equal(arenaStatus([mk(Array(MIN_REAL_OBS).fill(1))]).status, 'too-easy', '真实全满分=天花板');
  assert.equal(arenaStatus([mk(Array(MIN_REAL_OBS).fill(0))]).status, 'too-hard', '真实全零=地板');
  assert.equal(arenaStatus([mk([1, 0, 1, 0, 1, 0, 1, 0])]).status, 'unverified', '单模型成绩波动不能证明模型间区分度');
  const paired = mk(Array(MIN_REAL_OBS).fill(1));
  paired.records.push(...paired.records.map((r) => ({ ...r, model: 'real:b', score: 0 })));
  assert.equal(arenaStatus([paired]).status, 'validated', '同场足量配对且分差区间不含零才算有可测分差');
  // 停战罐单独标注，不与「未验证」混为一谈
  const paused = arenaStatus([mk([], 50)], true);
  assert.equal(paused.paused, true);
  assert.equal(paused.status, 'unverified');
});

test('罐体诊断只读取指定题库指纹的战绩', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'ququ-analyze-fingerprint-'));
  const fixture = (fingerprint: string, score: number): BattleResult => ({
    id: fingerprint,
    status: 'completed',
    arena: def,
    startedAt: '2026-09-23T00:00:00.000Z',
    durationMs: 1,
    contestants: [],
    records: Array.from({ length: MIN_REAL_OBS }, (_, i) => ({
      taskId: `t${i}`,
      condition: 'c',
      model: 'real:m',
      prompt: '',
      answer: '',
      score,
      latencyMs: 1,
    })),
    meta: { arenaFingerprint: fingerprint, judgeModels: [], toolVersion: 'test' },
  });
  try {
    await writeFile(path.join(tmp, '战绩-honesty-old.json'), JSON.stringify(fixture('old', 1)));
    await writeFile(path.join(tmp, '战绩-honesty-current.json'), JSON.stringify(fixture('current', 0)));
    const status = await arenaStatusFor('honesty', tmp, false, 'current');
    assert.equal(status.status, 'too-hard');
    assert.equal(status.nReal, MIN_REAL_OBS);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('真实观测 ≥ 阈值时保留区分度结论（mock 不与真实混算）', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'ququ-analyze-real-'));
  try {
    // 4 只「真实」蛐蛐（id 非 mock:）：强蛐蛐对 mid/disc 题、弱蛐蛐错 —— rest 有方差，r 应显著为正
    const models = ['real:a', 'real:b', 'real:c', 'real:d'];
    const strong = (m: string) => (m === 'real:a' || m === 'real:b' ? 1 : 0);
    const realRecords = models.flatMap((model) => [
      { taskId: 'easy', condition: 'c', model, prompt: '', answer: '', score: 1, latencyMs: 1 },
      { taskId: 'hard', condition: 'c', model, prompt: '', answer: '', score: 0, latencyMs: 1 },
      { taskId: 'mid', condition: 'c', model, prompt: '', answer: '', score: strong(model), latencyMs: 1 },
      { taskId: 'disc', condition: 'c', model, prompt: '', answer: '', score: strong(model), latencyMs: 1 },
    ]);
    // 往 disc 混入 10 条 mock 观测：不得把 disc 的 r 拉偏，也不得混进真实均分
    const mockRecords = Array.from({ length: 10 }, () => ({
      taskId: 'disc',
      condition: 'c',
      model: 'mock:jianglv-7b',
      prompt: '',
      answer: '',
      score: 0,
      latencyMs: 1,
    }));
    const records = [...realRecords, ...mockRecords];
    const result: BattleResult = {
      arena: def,
      startedAt: '2026-09-20T00:00:00.000Z',
      durationMs: 1,
      contestants: models.map((id) => ({ id, name: id, kind: 'mock' as const })),
      records,
    };
    for (let i = 0; i < 2; i++)
      await writeFile(path.join(tmp, `战绩-honesty-2026-09-1${i}T00-00-00.json`), JSON.stringify(result));
    const { tasks: rows } = await analyzeArena('honesty', tmp);
    const disc = rows.find((r) => r.taskId === 'disc')!;
    assert.equal(disc.nReal, 8, '真实观测 = 4 蛐蛐 × 2 场');
    assert.equal(disc.nMock, 20, 'mock 观测单独计数、不混入 r');
    assert.equal(disc.mean, 0.5, '难度取真实均分，不被 mock 的 0 拉低');
    assert.ok(disc.r !== null && disc.r > 0.9, `真实分差应给出高 r，实际 ${disc.r}`);
    assert.equal(disc.tag, 'sharp');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
