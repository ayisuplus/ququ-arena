/**
 * v2.5 契约：conditionPrefix / family 感知换皮检测 / metacog-gate / statute-match
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArenaDef, ArenaTask } from '../src/types.ts';
import { loadArena, lintArena } from '../src/arena-loader.ts';
import { runBattle } from '../src/runner.ts';
import { arenaFingerprint } from '../src/fingerprint.ts';
import { listMockContestants } from '../src/models.ts';

const baseDef: ArenaDef = { name: 't', title: 't', description: '', judge: { kind: 'exact' } };

// ── conditionPrefix ──

test('conditionPrefix：拼接顺序 taskPrefix → conditionPrefix[condition] → input，且进战绩 prompt', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'condprefix-'));
  try {
    const def: ArenaDef = {
      ...baseDef,
      taskPrefix: '[全局]',
      conditionPrefix: { lookup: '[维度]' },
    };
    const tasks: ArenaTask[] = [
      { id: 'a', condition: 'lookup', input: '题A', target: 'x' },
      { id: 'b', condition: 'recall', input: '题B', target: 'x' },
    ];
    const result = await runBattle(def, tasks, listMockContestants().slice(0, 1), { concurrency: 1 });
    const pa = result.records.find((r) => r.taskId === 'a')!;
    const pb = result.records.find((r) => r.taskId === 'b')!;
    assert.equal(pa.prompt, '[全局][维度]题A', 'lookup 题必须两段前缀齐备');
    assert.equal(pb.prompt, '[全局]题B', 'recall 题只有全局前缀');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('conditionPrefix：进指纹；缺省不影响老指纹', () => {
  const tasks: ArenaTask[] = [{ id: 'a', condition: 'c', input: '题', target: 'x' }];
  const withCP: ArenaDef = { ...baseDef, conditionPrefix: { c: '[x]' } };
  assert.notEqual(arenaFingerprint(withCP, tasks), arenaFingerprint(baseDef, tasks));
  // 只加无关字段（description）不动指纹
  assert.equal(arenaFingerprint({ ...baseDef, description: '改描述' }, tasks), arenaFingerprint(baseDef, tasks));
});

// ── family 感知换皮检测 ──

test('lint：同 meta.family 的受控变体不报换皮，跨 family 的近似仍报，完全相同仍报错', () => {
  const mk = (id: string, family: string | null, tail: string): ArenaTask => ({
    id,
    condition: 'c',
    input:
      '当前时间：2026-09-04 10:00。知识卡片：「Python 最新稳定版本：3.13.5」（观察于 2026-06-15 10:00，有效期至 2026-12-31）' +
      tail,
    target: 'x',
    meta: family ? { family } : {},
  });
  // 同族近似（tail 不同）→ 不报警
  const sameFam = lintArena(baseDef, [
    mk('a1', 'python-stable', '问：现在什么版本'),
    mk('a2', 'python-stable', '问：当前什么版本'),
  ]);
  assert.ok(!sameFam.warnings.some((w) => w.includes('a1')), `同族受控变体不应报警：${sameFam.warnings}`);
  // 跨族近似 → 报警
  const crossFam = lintArena(baseDef, [
    mk('a1', 'python-stable', '问：现在什么版本'),
    mk('b1', 'linux-lts', '问：当前什么版本'),
  ]);
  assert.ok(
    crossFam.warnings.some((w) => w.includes('a1') && w.includes('b1')),
    '跨族近似必须报警',
  );
  // 同族完全相同 → 仍报错（family 不豁免 identical）
  const identical = lintArena(baseDef, [mk('a1', 'python-stable', ''), mk('a2', 'python-stable', '')]);
  assert.ok(
    identical.errors.some((e) => e.includes('完全重复')),
    '同族完全重复必须报错',
  );
});

// ── 两个新罐 ──

test('新罐契约：metacog-gate 150 题九维度，拒答协议 exact「需更新」', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'metacog-gate'));
  assert.equal(tasks.length, 150);
  const conds = new Set(tasks.map((t) => t.condition));
  assert.equal(conds.size, 9, `维度数 ${conds.size} ≠ 9`);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  // v2.17 标签订正后：拒答 87（92 − 7 stale→fresh + 2 fresh→stale）、作答 63
  const decline = tasks.filter((t) =>
    ['unknown', 'stale', 'contested', 'empty', 'env_stale', 'no_env'].includes(t.condition),
  );
  assert.equal(decline.length, 87, '订正后拒答类 87');
  assert.ok(
    decline.every((t) => t.judge?.kind === 'exact' && t.target === '需更新'),
    '拒答题必须 exact「需更新」',
  );
  const answer = tasks.filter((t) => ['known', 'fresh', 'env_fresh'].includes(t.condition));
  assert.equal(answer.length, 63, '订正后作答类 63');
  assert.ok(
    answer.every((t) => t.judge?.kind === 'exact'),
    '作答题完整匹配短答案、选项或资料字段，不以零散要点冒充正确',
  );
});

test('新罐契约：statute-match 22 题双维度，条文块只在 conditionPrefix', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'statute-match'));
  assert.equal(tasks.length, 22);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const recall = tasks.filter((t) => t.condition === 'recall');
  const lookup = tasks.filter((t) => t.condition === 'lookup');
  assert.equal(recall.length, 11);
  assert.equal(lookup.length, 11);
  assert.ok(def.conditionPrefix?.lookup?.includes('第四百六十五条'), '条文块必须在 conditionPrefix.lookup');
  assert.ok(
    lookup.every((t) => !t.input.includes('第四百')),
    'lookup 题面不再内嵌条文块',
  );
  // recall 与 lookup 不同案情（防罐内串题）
  const recallStatutes = new Set(recall.map((t) => t.meta?.statute));
  assert.deepEqual(
    [...recallStatutes].sort((a, b) => Number(a) - Number(b)),
    [465, 470, 490, 496, 502, 509, 511, 563, 577, 584, 585],
  );
});
