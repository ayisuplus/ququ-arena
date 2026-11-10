/**
 * v1.2 契约测试：Kendall's W、Glicko 闲置回升、蛐蛐个人页渲染
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArenaDef, BattleResult, BoardEntry } from '../src/types.ts';
import { kendallW } from '../src/stats.ts';
import { loadCareer, settleBattle } from '../src/career-store.ts';
import { renderCricket } from '../src/cricketHtml.ts';

test("Kendall's W：完全一致=1，完全反转=0，部分一致在 (0,1)", () => {
  assert.equal(
    kendallW([
      [1, 2, 3],
      [1, 2, 3],
    ]),
    1,
  );
  assert.equal(
    kendallW([
      [1, 2, 3],
      [3, 2, 1],
    ]),
    0,
  );
  const mid = kendallW([
    [1, 2, 3, 4],
    [1, 2, 4, 3],
  ]);
  assert.ok(mid > 0.8 && mid < 1, `微扰排名应得高 W，实际 ${mid}`);
  assert.equal(kendallW([[1, 2]]), 1, '单场不出数（默认 1）');
});

test('Glicko 闲置回升：本场未参赛的在册蛐蛐 RD 涨、μ 不变', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'idle-'));
  try {
    const def: ArenaDef = { name: 't', title: 't', description: '', judge: { kind: 'exact' } };
    const mk = (model: string, avg: number): BoardEntry => ({
      model,
      name: model,
      avg,
      byCondition: {},
      answered: 4,
      errors: 0,
      elo: 1500,
      avgLatencyMs: 0,
    });
    const mkBattle = (): BattleResult => ({
      arena: def,
      startedAt: '2026-09-10T00:00:00.000Z',
      durationMs: 1,
      contestants: [],
      records: ['a', 'b'].flatMap((m) => [
        { taskId: 't1', condition: 'c1', model: m, prompt: '', answer: '', score: m === 'a' ? 1 : 0, latencyMs: 1 },
      ]),
    });
    // 第一场：a/b/c 同场（c 建立 glicko）
    const r1 = mkBattle();
    r1.records.push({ taskId: 't1', condition: 'c1', model: 'c', prompt: '', answer: '', score: 0.5, latencyMs: 1 });
    await settleBattle(r1, [mk('a', 1), mk('b', 0), mk('c', 0.5)], dir);
    const rd1 = (await loadCareer(dir)).entries['c']!.glicko!.rd;
    // 第二场：只有 a/b，c 闲置
    await settleBattle(mkBattle(), [mk('a', 1), mk('b', 0)], dir);
    const c2 = (await loadCareer(dir)).entries['c']!.glicko!;
    assert.ok(c2.rd > rd1, `闲置必须涨 RD（${rd1} → ${c2.rd}）`);
    assert.equal(c2.r, (await loadCareer(dir)).entries['c']!.glicko!.r, '闲置 μ 不变');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('蛐蛐个人页：雷达/走势/成就/宿敌/战绩分区齐全', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cricket-'));
  try {
    const def: ArenaDef = { name: 't', title: 't', description: '', judge: { kind: 'exact' } };
    const mk = (model: string, avg: number): BoardEntry => ({
      model,
      name: model,
      avg,
      byCondition: { c1: avg, c2: avg * 0.8, c3: avg * 1.1 > 1 ? 1 : avg * 1.1 },
      answered: 4,
      errors: 0,
      elo: 1600,
      avgLatencyMs: 0,
    });
    const result: BattleResult = {
      arena: def,
      startedAt: '2026-09-10T00:00:00.000Z',
      durationMs: 1,
      contestants: [],
      records: ['a', 'b'].flatMap((m) => [
        { taskId: 't1', condition: 'c1', model: m, prompt: '', answer: '', score: m === 'a' ? 1 : 0, latencyMs: 1 },
      ]),
    };
    await settleBattle(result, [mk('a', 0.9), mk('b', 0.3)], dir);
    const html = renderCricket(await loadCareer(dir), 'a');
    for (const needle of ['蛐蛐档案', '成就墙', '宿敌榜', '近期战绩', '<svg', '积分', 'Glicko']) {
      assert.ok(html.includes(needle), `个人页缺少 ${needle}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
