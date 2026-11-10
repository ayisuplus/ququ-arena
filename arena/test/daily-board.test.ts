/**
 * 每日一擂当日榜契约：当日榜/日连胜/冠军墙全部是纯视图（career.history 现算零独立账本），
 * 只认「当日擂台罐」的 benchmark 主轨场次；日连胜按自然日连续段，断档归零但保留历史最长。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArenaDef, BattleResult, BoardEntry } from '../src/types.ts';
import { loadCareer, settleBattle } from '../src/career-store.ts';
import { dailyArena, dailyBoard, dailyStreaks, dailyWall } from '../src/daily.ts';

const def: ArenaDef = { name: 'arena-a', title: '甲罐', description: 'd', judge: { kind: 'exact' } };
const otherDef: ArenaDef = { name: 'arena-b', title: '乙罐', description: 'd', judge: { kind: 'exact' } };
const single = [{ def, tasks: [{ id: 'q1' }] }];
const mk = (model: string, avg: number): BoardEntry => ({
  model,
  name: model,
  avg,
  byCondition: {},
  answered: 10,
  errors: 0,
  elo: 1500 + avg,
  avgLatencyMs: 0,
});
const battle = (at: string, arena: ArenaDef, source?: 'game-duel'): BattleResult => ({
  arena,
  startedAt: at,
  durationMs: 1,
  contestants: [],
  records: [],
  ...(source ? { meta: { arenaFingerprint: 'f', judgeModels: [], toolVersion: 't', source } } : {}),
});

test('当日榜：只收当日+当日擂台+主轨场次，每人取最佳一场', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'daily-'));
  try {
    const today = '2026-09-25';
    await settleBattle(battle(`${today}T01:00:00.000Z`, def), [mk('甲', 0.6), mk('乙', 0.9), mk('丙', 0.5)], dir);
    // 甲第二场更佳 → 取最佳
    await settleBattle(battle(`${today}T02:00:00.000Z`, def), [mk('甲', 0.95), mk('乙', 0.9)], dir);
    // 昨天的场不进今日榜
    await settleBattle(battle('2026-09-24T01:00:00.000Z', def), [mk('丁', 1)], dir);
    // 非擂台罐的场不进榜
    await settleBattle(battle(`${today}T03:00:00.000Z`, otherDef), [mk('戊', 1)], dir);
    // 游戏赛轨不进榜
    await settleBattle(battle(`${today}T04:00:00.000Z`, def, 'game-duel'), [mk('己', 1)], dir);
    const book = await loadCareer(dir);
    const rows = dailyBoard(book, def.name, today);
    assert.deepEqual(
      rows.map((r) => r.id),
      ['甲', '乙', '丙'],
      '按最佳均分排序：甲 0.95 > 乙 0.9 > 丙 0.5',
    );
    assert.equal(rows[0]!.best, 0.95);
    assert.equal(rows[0]!.runs, 2);
    assert.equal(dailyBoard(book, otherDef.name, today).length, 1, '换罐查询互不串榜：arena-b 当天只有戊');
    // dailyArena 单罐恒返回它自己（榜的口径与选罐器同源）
    assert.equal(dailyArena(single, new Date(`${today}T00:00:00Z`))?.def.name, def.name);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('日连胜：连续自然日夺冠延伸，断档归零但保留最长纪录', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'streak-'));
  try {
    // 甲 9/22、9/23、9/24 连擂 3 天夺冠；乙每天都陪跑
    for (const day of ['2026-09-22', '2026-09-23', '2026-09-24']) {
      await settleBattle(battle(`${day}T01:00:00.000Z`, def), [mk('甲', 1), mk('乙', 0.5)], dir);
    }
    const book = await loadCareer(dir);
    const now = new Date('2026-09-25T12:00:00Z');
    let s = dailyStreaks(book, single, now).find((x) => x.id === '甲')!;
    assert.equal(s.streak, 3, '最后夺冠日 9/24=昨天，连胜活着');
    assert.equal(s.best, 3);
    // 断档 3 天：当前连胜归 0，最长纪录保留
    const later = dailyStreaks(book, single, new Date('2026-09-28T12:00:00Z')).find((x) => x.id === '甲')!;
    assert.equal(later.streak, 0);
    assert.equal(later.best, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('冠军墙：只认每日一擂夺冠（普通赛/非冠军不计），近日期在前', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wall-'));
  try {
    await settleBattle(battle('2026-09-23T01:00:00.000Z', def), [mk('甲', 1), mk('乙', 0.5)], dir);
    await settleBattle(battle('2026-09-24T01:00:00.000Z', def), [mk('乙', 1), mk('甲', 0.5)], dir);
    // 普通赛（非擂台罐）夺冠不进墙
    await settleBattle(battle('2026-09-24T02:00:00.000Z', otherDef), [mk('丙', 1)], dir);
    const book = await loadCareer(dir);
    const wall = dailyWall(book, single);
    assert.deepEqual(
      wall.map((w) => w.date),
      ['2026-09-24', '2026-09-23'],
    );
    assert.deepEqual(
      wall[0]!.champions.map((c) => c.id),
      ['乙'],
    );
    assert.equal(wall.length, 2, '丙的普通赛冠军不上墙');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
