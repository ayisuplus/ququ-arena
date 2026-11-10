/**
 * v3.0x 契约：voxel-craft（合成链路规划擂台）——素材溯源 voxelgym recipes.toml + LADDER 成就链
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

/** 与 voxelgym tasks/__init__.py 的 LADDER 保持一致（顺序即语义） */
const LADDER = [
  'collect_log',
  'craft_planks',
  'craft_table',
  'craft_wooden_pickaxe',
  'mine_stone',
  'craft_stone_pickaxe',
  'place_furnace',
  'mine_iron_ore',
  'mine_coal',
  'smelt_iron',
  'craft_iron_pickaxe',
  'mine_diamond',
];
/** 与 voxelgym recipes.toml 七条配方的 out 字段一致 */
const RECIPE_OUTS = new Set([
  'planks',
  'stick',
  'crafting_table',
  'wooden_pickaxe',
  'stone_pickaxe',
  'iron_pickaxe',
  'furnace',
]);

test('新罐契约：voxel-craft 22 题三维度，配方/前驱/计数逐题复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'voxel-craft'));
  assert.equal(tasks.length, 22);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []); // answerInPrompt 声明 + family 同族声明必须兜住泄漏/换皮告警
  assert.deepEqual([...new Set(tasks.map((t) => t.condition))].sort(), [
    'chain-count',
    'chain-prereq',
    'recipe-lookup',
  ]);

  const recipes = tasks.filter((t) => t.condition === 'recipe-lookup');
  const prereqs = tasks.filter((t) => t.condition === 'chain-prereq');
  const counts = tasks.filter((t) => t.condition === 'chain-count');
  assert.equal(recipes.length, 7);
  assert.equal(prereqs.length, 8);
  assert.equal(counts.length, 7);

  // 配方题：target ∈ recipes.toml 产物集合，且七条全覆盖
  assert.deepEqual([...new Set(recipes.map((t) => t.target))].sort(), [...RECIPE_OUTS].sort());
  for (const t of recipes) {
    assert.ok(t.target, `${t.id} 缺 target`);
    assert.ok(RECIPE_OUTS.has(t.target), `${t.id} 产物越出配方表`);
  }

  // 前驱题：target = 所问里程碑在 LADDER 中的直接前驱
  for (const t of prereqs) {
    const idx = LADDER.indexOf(String(t.meta?.milestone));
    assert.ok(idx >= 1, `${t.id} 的 milestone 不在 LADDER（或无首里程碑问了前驱）`);
    assert.ok(t.target, `${t.id} 缺 target`);
    assert.equal(t.target, LADDER[idx - 1], `${t.id}（${t.meta?.milestone}）前驱复算不符`);
  }

  // 计数题：target = 区间索引差 + 1（含两端）
  for (const t of counts) {
    const i = LADDER.indexOf(String(t.meta?.from));
    const j = LADDER.indexOf(String(t.meta?.to));
    assert.ok(i >= 0 && j >= i, `${t.id} 的 from/to 不在 LADDER 或顺序颠倒`);
    assert.ok(t.target, `${t.id} 缺 target`);
    assert.equal(t.target, String(j - i + 1), `${t.id}（${t.meta?.from}→${t.meta?.to}）计数复算不符`);
  }
});

test('链答案合法性：chain 题 target ∈ LADDER 或正整数', async () => {
  const { tasks } = await loadArena(path.resolve('arenas', 'voxel-craft'));
  for (const t of tasks) {
    assert.ok(t.target, `${t.id} 缺 target`);
    if (t.condition === 'chain-prereq') assert.ok(LADDER.includes(t.target), `${t.id} target 越出 LADDER`);
    if (t.condition === 'chain-count') assert.match(t.target, /^[1-9]\d*$/, `${t.id} target 非正整数`);
  }
});

test('溯源：每题 meta.source 含 voxelgym', async () => {
  const { tasks } = await loadArena(path.resolve('arenas', 'voxel-craft'));
  for (const t of tasks) {
    assert.ok(String(t.meta?.source ?? '').includes('voxelgym'), `${t.id} 缺 voxelgym 溯源`);
    // answerInPrompt 只在「答案确实字面在题面」的 chain-prereq 上声明（链题答案里程碑名在题面链上）；
    // 配方/计数题答案不在题面，声明是失真 no-op——第三轮审查语义订正（v3.21）
    if (t.condition === 'chain-prereq') assert.equal(t.meta?.answerInPrompt, true, `${t.id} 缺 answerInPrompt 声明`);
    else assert.notEqual(t.meta?.answerInPrompt, true, `${t.id} 不应声明 answerInPrompt（答案不在题面）`);
  }
});
