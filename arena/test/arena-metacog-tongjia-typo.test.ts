/**
 * v2.17 契约：metacog-gate 标签订正 + tongjia-typo（T3 收割与上游缺陷剔除）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('订正契约：metacog-gate 九条 st 标签已按源语义审查订正并留痕', async () => {
  const { tasks } = await loadArena(path.resolve('arenas', 'metacog-gate'));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  // fresh→stale（卡片已过期却允许直答）：改判拒答协议
  for (const id of ['st-06-fresh', 'st-07-fresh']) {
    const t = byId.get(id)!;
    assert.equal(t.condition, 'stale', `${id} 应改判 stale`);
    assert.equal(t.target, '需更新');
    assert.equal(t.judge?.kind, 'exact');
    assert.ok(t.meta?.labelCorrection, `${id} 缺订正注记`);
    assert.equal(t.meta?.beforeCondition, 'fresh', 'beforeCondition 留痕');
  }
  // stale→fresh（卡片未过期却要求搜索）：恢复作答 + 订正答案
  const restored = [
    'st-09-stale',
    'st-11-stale',
    'st-12-stale',
    'st-13-stale',
    'st-14-stale',
    'st-15-stale',
    'st-16-stale',
  ];
  for (const id of restored) {
    const t = byId.get(id)!;
    assert.equal(t.condition, 'fresh', `${id} 应改判 fresh`);
    assert.equal(t.judge?.kind, 'exact', `${id} 有效证据应完整匹配字段取值`);
    assert.ok(t.meta?.labelCorrection, `${id} 缺订正注记`);
  }
});

test('新罐契约：tongjia-typo 140 题三语境，无退化题无重复题', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'tongjia-typo'));
  assert.equal(tasks.length, 140);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, [], '去重后不得有完全重复');
  const conds = new Map<string, number>();
  for (const t of tasks) conds.set(t.condition, (conds.get(t.condition) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries(conds), { C0: 60, 'C+': 60, 'C-': 20 });
  // 退化题（扰动未生效：引用词=答案）必须为零——上游 20 条已剔除
  for (const t of tasks) {
    const quoted = (t.input.match(/「(.+?)」/) ?? [])[1] ?? '';
    assert.notEqual(quoted, t.target, `${t.id} 是退化题（扰动未生效）`);
  }
  // 题面+答案唯一
  const keys = new Set(tasks.map((t) => t.input + '|' + t.target));
  assert.equal(keys.size, tasks.length, '题面+答案不得重复');
  // 溯源与同词组
  for (const t of tasks) {
    assert.ok(String(t.meta?.source ?? '').includes('TongJia-Bench'), `${t.id} 缺溯源`);
    assert.ok(t.meta?.family === t.meta?.groupId, `${t.id} family 必须=group_id（同词语境成组）`);
  }
});
