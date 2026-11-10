/**
 * 生涯系统契约测试：结算累计、成就解锁、旧档案兼容、指纹稳定性
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArenaDef, BattleResult, BoardEntry } from '../src/types.ts';
import { loadCareer, settleBattle } from '../src/career-store.ts';
import { profileView } from '../src/career.ts';
import { arenaFingerprint } from '../src/fingerprint.ts';

const def: ArenaDef = { name: 't', title: '测试罐', description: '', judge: { kind: 'exact' } };

/** 构造一场 10 题三蛐蛐的定分假赛，a/b/c 的场均由调用方显式指定 */
function fakeBattle(aAvg: number, bAvg: number, cAvg: number): { result: BattleResult; board: BoardEntry[] } {
  const scoreOf = (m: string) => (m === 'a' ? aAvg : m === 'b' ? bAvg : cAvg);
  const mk = (model: string): BoardEntry => ({
    model,
    name: model,
    avg: scoreOf(model),
    byCondition: { c1: scoreOf(model) },
    answered: 10,
    errors: 0,
    elo: Math.round(1500 + (scoreOf(model) - 0.5) * 400), // 简化的单场 Elo
    avgLatencyMs: 0,
  });
  const board = [mk('a'), mk('b'), mk('c')].sort((x, y) => y.avg - x.avg);
  const records = Array.from({ length: 10 }, (_, i) =>
    ['a', 'b', 'c'].map((m) => ({
      taskId: `t${i}`,
      condition: 'c1',
      model: m,
      prompt: '',
      answer: '',
      score: scoreOf(m),
      latencyMs: 1,
    })),
  ).flat();
  const result: BattleResult = {
    arena: def,
    startedAt: '2026-09-10T00:00:00.000Z',
    durationMs: 1,
    contestants: [],
    records,
  };
  return { result, board };
}

test('settleBattle：首秀蛐蛐从 1500 起步累计，夺冠+轨迹+成就一次落齐', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'career-'));
  try {
    const { result, board } = fakeBattle(0.9, 0.3, 0.3);
    const deltas = await settleBattle(result, board, dir);
    const winner = deltas.find((d) => d.id === 'a')!;
    assert.equal(winner.before, 1500);
    assert.ok(winner.after > 1500, '冠军必须涨分');
    assert.equal(winner.isDebut, true);
    // 首冠 + 首秀夺冠 + 屠杀(0.9-0.3≥0.4) + 偏科状元(c1 0.9 vs 0.3/0.3)
    for (const id of ['first_title', 'debut_champion', 'executioner', 'subject_king']) {
      assert.ok(winner.newAchievements.includes(id), `应解锁 ${id}，实际 ${winner.newAchievements}`);
    }
    const book = await loadCareer(dir);
    const p = profileView(book, 'a')!;
    assert.equal(p.battles, 1);
    assert.equal(p.titles, 1);
    assert.equal(p.history?.length, 1, '必须留下战绩轨迹');
    assert.equal(p.history![0].place, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('settleBattle：成就一次性，二番战不重复解锁', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'career-'));
  try {
    const { result, board } = fakeBattle(0.9, 0.3, 0.3);
    await settleBattle(result, board, dir);
    const d2 = await settleBattle(result, board, dir);
    const winner2 = d2.find((d) => d.id === 'a')!;
    assert.ok(!winner2.newAchievements.includes('first_title'), '首冠成就不可重复解锁');
    const book = await loadCareer(dir);
    assert.equal(book.entries['a'].battles, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadCareer：旧版档案（无 achievements/history 字段）兼容读取', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'career-'));
  try {
    const legacy = {
      version: 1,
      entries: {
        'mock:x': {
          id: 'mock:x',
          name: '老将',
          battles: 3,
          titles: 1,
          podiums: 2,
          elo: 1700,
          answered: 30,
          scoreSum: 24,
          byCondition: { c1: { n: 3, sum: 2.4 } },
          lastBattleAt: 'x',
        },
      },
    };
    await writeFile(path.join(dir, 'career.json'), JSON.stringify(legacy));
    const book = await loadCareer(dir);
    const p = profileView(book, 'mock:x')!;
    assert.equal(p.elo, 1700);
    assert.equal(p.achievements, undefined);
    assert.ok(Math.abs(p.condRadar[0].avg - 0.8) < 1e-9, `c1 生涯均分应为 0.8，实际 ${p.condRadar[0].avg}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('题库指纹：题目换序/元信息改写不变，题目内容改动就变', () => {
  const tasks = [
    { id: 'b', condition: 'c', input: '题2', target: '答2' },
    { id: 'a', condition: 'c', input: '题1', target: '答1' },
  ];
  const fp1 = arenaFingerprint(def, tasks);
  const fp2 = arenaFingerprint(def, [...tasks].reverse());
  assert.equal(fp1, fp2, '题目顺序不应影响指纹');
  const fp3 = arenaFingerprint({ ...def, description: '改过的描述', author: '别人' }, tasks);
  assert.equal(fp1, fp3, '元信息改写不应影响指纹');
  const fp4 = arenaFingerprint(def, [{ ...tasks[0], input: '题2改了一个字' }, tasks[1]]);
  assert.notEqual(fp1, fp4, '题目内容改动必须改变指纹');
});

test('账本损坏且无法备份时停止，而不是返回空库让下次结算覆盖原账本', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'career-unbackupable-'));
  try {
    // 目录冒充 career.json：读取失败（非 ENOENT），复制备份同样失败
    await mkdir(path.join(dir, 'career.json'));
    await assert.rejects(loadCareer(dir), /无法备份/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
