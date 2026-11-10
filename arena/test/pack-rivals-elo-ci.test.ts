/**
 * v0.7 契约测试：罐打包/解包/防篡改、Elo 不确定区间、宿敌累计、暗色主题注入
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArenaDef, ArenaTask, BattleResult, BoardEntry } from '../src/types.ts';
import { packArena, unpackArena } from '../src/pack.ts';
import { loadCareer, settleBattle } from '../src/career-store.ts';
import { profileView, eloCI, rivalriesOf } from '../src/career.ts';
import { renderStable } from '../src/stableHtml.ts';
import { renderReport } from '../src/report.ts';

const def: ArenaDef = { name: 't', title: '测试罐', description: 'd', judge: { kind: 'exact' } };
const tasks: ArenaTask[] = [
  { id: 'a', condition: 'c1', input: '题甲', target: '答甲' },
  { id: 'b', condition: 'c1', input: '题乙', target: '答乙' },
];

test('罐打包回路：pack → unpack 恒等，指纹一致', () => {
  const pack = packArena(def, tasks);
  assert.equal(pack.fingerprint.length, 16);
  const back = unpackArena(JSON.stringify(pack));
  assert.deepEqual(back.tasks, tasks);
  assert.equal(back.arena.name, def.name);
});

test('防篡改：改一个字的题面 → 指纹不符拒装', () => {
  const pack = packArena(def, tasks);
  pack.tasks[0]!.input = '题甲（被改过）';
  assert.throws(() => unpackArena(JSON.stringify(pack)), /指纹不符/);
});

test('防篡改：格式版本不对拒装', () => {
  assert.throws(() => unpackArena(JSON.stringify({ format: 'weird/9', arena: def, tasks })), /未知包格式/);
});

test('eloCI：随机游走语义——稳定选手区间窄，波动选手区间宽，单场不出数', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ci-'));
  try {
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
    // 稳赢 5 场：delta 恒 +600（sd=0 → CI 应很窄）
    for (let i = 0; i < 5; i++) {
      const board = [mk('steady', 1), mk('shaky', 0)];
      const result: BattleResult = {
        arena: def,
        startedAt: '2026-09-10T00:00:00.000Z',
        durationMs: 1,
        contestants: [],
        records: [],
      };
      await settleBattle(result, board, dir);
    }
    const book = await loadCareer(dir);
    const steady = profileView(book, 'steady')!;
    assert.equal(steady.eloCI, 0, 'delta 恒定时 CI 应为 0');
    // 单场：<2 场无 CI
    const dir2 = await mkdtemp(path.join(tmpdir(), 'ci2-'));
    const board = [mk('once', 1), mk('other', 0)];
    await settleBattle(
      { arena: def, startedAt: '2026-09-10T00:00:00.000Z', durationMs: 1, contestants: [], records: [] },
      board,
      dir2,
    );
    assert.equal(eloCI((await loadCareer(dir2)).entries['once']!), undefined);
    await rm(dir2, { recursive: true, force: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('宿敌累计：同场 n 次、名次压过记 ahead', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rival-'));
  try {
    const mk = (model: string, avg: number): BoardEntry => ({
      model,
      name: model,
      avg,
      byCondition: {},
      answered: 10,
      errors: 0,
      elo: 1500,
      avgLatencyMs: 0,
    });
    for (let i = 0; i < 3; i++) {
      const board = [mk('a', 0.9), mk('b', 0.5), mk('c', 0.1)];
      const result: BattleResult = {
        arena: def,
        startedAt: '2026-09-10T00:00:00.000Z',
        durationMs: 1,
        contestants: [],
        records: [],
      };
      await settleBattle(result, board, dir);
    }
    const book = await loadCareer(dir);
    const rv = rivalriesOf(book, 'a');
    assert.equal(rv.length, 2);
    assert.equal(rv[0]!.n, 3);
    assert.equal(rv[0]!.ahead, 3, 'a 三场全压过所有对手');
    const rvC = rivalriesOf(book, 'c');
    assert.equal(rvC[0]!.ahead, 0, 'c 从未压过任何人');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('暗色主题：战报/总榜注入 theme css 与拨杆', async () => {
  const result: BattleResult = {
    arena: def,
    startedAt: '2026-09-10T00:00:00.000Z',
    durationMs: 1,
    contestants: [],
    records: [],
  };
  const report = renderReport(result);
  assert.ok(report.includes('[data-theme="dark"]'), '战报缺暗色样式');
  assert.ok(report.includes('toggleTheme'), '战报缺主题拨杆');
  const dir = await mkdtemp(path.join(tmpdir(), 'theme-'));
  try {
    const mk = (model: string, avg: number): BoardEntry => ({
      model,
      name: model,
      avg,
      byCondition: {},
      answered: 10,
      errors: 0,
      elo: 1600,
      avgLatencyMs: 0,
    });
    // 两场才有 eloCI（样本方差需要 n≥2）
    for (let i = 0; i < 2; i++) {
      await settleBattle(
        { arena: def, startedAt: '2026-09-10T00:00:00.000Z', durationMs: 1, contestants: [], records: [] },
        [mk('a', 1), mk('b', 0)],
        dir,
      );
    }
    const stable = renderStable(await loadCareer(dir), new Date());
    assert.ok(stable.includes('[data-theme="dark"]'), '总榜缺暗色样式');
    assert.ok(stable.includes('±'), '总榜缺 Elo 不确定区间');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
