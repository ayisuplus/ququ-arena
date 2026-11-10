/**
 * v0.4 契约测试：联赛积分、题目质量诊断、k 裁判一致性、花名别名
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArenaDef, BattleResult, BoardEntry } from '../src/types.ts';
import { computeStandings, renderLeague, type LeagueLeg } from '../src/league.ts';
import { analyzeArena } from '../src/analyze.ts';
import { judgeAgreement } from '../src/stats.ts';
import { resolveContestant } from '../src/models.ts';

const def: ArenaDef = { name: 't', title: '测试罐', description: '', judge: { kind: 'exact' } };

const mkEntry = (model: string, avg: number): BoardEntry => ({
  model,
  name: model,
  avg,
  byCondition: {},
  answered: 10,
  errors: 0,
  elo: Math.round(1500 + (avg - 0.5) * 400),
  avgLatencyMs: 0,
});

function leg(name: string, podium: [string, number][]): LeagueLeg {
  // podium 按名次给出 (model, avg)
  const arenaDef: ArenaDef = { ...def, name, title: name };
  const board = podium.map(([model, avg]) => mkEntry(model, avg));
  const records = podium.flatMap(([model, avg]) =>
    Array.from({ length: 4 }, (_, i) => ({
      taskId: `${name}-t${i}`,
      condition: 'c1',
      model,
      prompt: '',
      answer: '',
      score: avg,
      latencyMs: 1,
    })),
  );
  const result: BattleResult = {
    arena: arenaDef,
    startedAt: '2026-09-10T00:00:00.000Z',
    durationMs: 1,
    contestants: podium.map(([id]) => ({ id, name: id, kind: 'mock' as const })),
    records,
    meta: { arenaFingerprint: 'fp', judgeModels: ['mock:j'], toolVersion: '0.4.0' },
  };
  return { def: arenaDef, result, board };
}

test('联赛积分：第 i 名拿 (N−i) 分，平分按场均决胜', () => {
  const legs = [
    leg('A', [
      ['x', 0.9],
      ['y', 0.5],
      ['z', 0.2],
    ]),
    leg('B', [
      ['y', 0.8],
      ['x', 0.7],
      ['z', 0.1],
    ]),
  ];
  const st = computeStandings(legs);
  // x: 3+2=5, y: 2+3=5, z: 1+1=2
  assert.equal(st[0]!.id, 'x', '平分时应由场均决胜：x 场均 0.8 > y 0.65');
  assert.equal(st[1]!.id, 'y');
  assert.equal(st[2]!.points, 2);
  assert.equal(st[0]!.titles, 1);
  assert.deepEqual(st[0]!.places, [1, 2]);
});

test('联赛页：盟主/积分榜/分站速览齐全', () => {
  const legs = [
    leg('A', [
      ['x', 0.9],
      ['y', 0.5],
    ]),
    leg('B', [
      ['x', 0.8],
      ['y', 0.6],
    ]),
  ];
  const html = renderLeague(legs, computeStandings(legs), '2026-09-10T00:00:00.000Z');
  for (const needle of ['盟 主', '总积分榜', '分站速览', '积分规则', '2026-Q3', '👑']) {
    assert.ok(html.includes(needle), `联赛页缺少 ${needle}`);
  }
});

test('题目诊断：送分题/团灭题/高区分度题各归其位', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'analyze-'));
  try {
    // 4 只蛐蛐 × 4 题：easy 全对（送分），hard 全错（团灭），
    // mid/disc 强蛐蛐(m1,m2)对、弱蛐蛐(m3,m4)错 → rest 有方差，r 可定义且趋 1
    const models = ['m1', 'm2', 'm3', 'm4'];
    const strong = (m: string) => (m === 'm1' || m === 'm2' ? 1 : 0);
    const records = models.flatMap((model) => [
      { taskId: 'easy', condition: 'c1', model, prompt: '', answer: '', score: 1, latencyMs: 1 },
      { taskId: 'hard', condition: 'c1', model, prompt: '', answer: '', score: 0, latencyMs: 1 },
      { taskId: 'mid', condition: 'c1', model, prompt: '', answer: '', score: strong(model), latencyMs: 1 },
      { taskId: 'disc', condition: 'c1', model, prompt: '', answer: '', score: strong(model), latencyMs: 1 },
    ]);
    const result: BattleResult = {
      arena: def,
      startedAt: '2026-09-10T00:00:00.000Z',
      durationMs: 1,
      contestants: models.map((id) => ({ id, name: id, kind: 'mock' as const })),
      records,
    };
    // 同一阵容写 3 场，凑够 n≥8
    for (let i = 0; i < 3; i++) {
      await writeFile(path.join(dir, `战绩-t-2026-09-1${i}T00-00-00.json`), JSON.stringify(result));
    }
    const { tasks, battles } = await analyzeArena('t', dir);
    assert.equal(battles, 3);
    const byId = new Map(tasks.map((t) => [t.taskId, t]));
    assert.equal(byId.get('easy')!.tag, 'giveaway');
    assert.equal(byId.get('hard')!.tag, 'bloodbath');
    const disc = byId.get('disc')!;
    assert.equal(disc.tag, 'sharp');
    assert.ok(disc.r !== null && disc.r > 0.9, `disc 的 r 应接近 1，实际 ${disc.r}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('judgeAgreement：k=3 裁判取逐对 r 均值', () => {
  // 裁判 1/2 完全正相关，裁判 3 与之完全负相关 → 三对 r: 1, -1, -1，均值 -1/3
  const votes = [{ votes: [0.1, 0.1, 0.9] }, { votes: [0.5, 0.5, 0.5] }, { votes: [0.9, 0.9, 0.1] }];
  const ag = judgeAgreement(votes)!;
  assert.ok(ag.pearson !== null);
  assert.equal(ag.judges, 3);
  assert.ok(Math.abs(ag.pearson - -0.33) < 0.01, `实际 r=${ag.pearson}`);
});

test('花名别名：id 不变（身价照算），展示名替换', () => {
  const c = resolveContestant('mock:xueba-o9=考神本神');
  assert.equal(c.id, 'mock:xueba-o9');
  assert.equal(c.name, '考神本神');
  const plain = resolveContestant('mock:xueba-o9');
  assert.equal(plain.name, '学霸-o9');
});
