/**
 * v2.25 契约：measure-word / digit-slang（手写罐）+ temporal-seq（生成器罐）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：measure-word 20 题单字量词，digit-slang 16 题', async () => {
  const mw = await loadArena(path.resolve('arenas', 'measure-word'));
  assert.equal(mw.tasks.length, 20);
  assert.deepEqual(lintArena(mw.def, mw.tasks).errors, []);
  assert.deepEqual(lintArena(mw.def, mw.tasks).warnings, [], 'family 声明后不应有警告');
  for (const t of mw.tasks) {
    assert.equal([...t.target!].length, 1, `${t.id} 量词必须单字`);
    assert.ok(t.input.includes('__'), `${t.id} 缺空位标记`);
    assert.ok(!t.input.split('__')[0]!.endsWith(t.target!), `${t.id} 答案不得贴题面`);
  }
  const ds = await loadArena(path.resolve('arenas', 'digit-slang'));
  assert.equal(ds.tasks.length, 16);
  assert.deepEqual(lintArena(ds.def, ds.tasks).errors, []);
  for (const t of ds.tasks) {
    assert.ok(/^\d+$/.test(t.input.match(/「(\d+)」/)![1]!), `${t.id} 题面必须是数字串`);
    assert.ok(t.target && [...t.target!].length <= 4, `${t.id} 含义过长`);
  }
});

test('新罐契约：temporal-seq 24 题——查询时刻在块中间且答案=覆盖活动', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'temporal-seq'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return h! * 60 + m!;
  };
  for (const t of tasks) {
    const blocks = [...t.input.matchAll(/(\d+:\d{2})-(\d+:\d{2}) (\S+)/g)].map(
      (m) => [toMin(m[1]!), toMin(m[2]!), m[3]!] as const,
    );
    assert.ok(blocks.length >= 3, `${t.id} 至少三块`);
    // 块不重叠自检
    const sorted = [...blocks].sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < sorted.length; k++) assert.ok(sorted[k]![0] >= sorted[k - 1]![1], `${t.id} 时间块重叠`);
    const q = toMin(String(t.meta?.queryTime));
    // 查询时刻必须在某块中间（不贴边界 15 分钟内）
    const hit = blocks.find(([s, e]) => q > s && q < e);
    assert.ok(hit, `${t.id} 查询时刻不在任何块内`);
    assert.ok(q - hit![0] >= 15 && hit![1] - q >= 15, `${t.id} 查询时刻贴边界（两可）`);
    assert.equal(hit![2], t.target, `${t.id} 答案≠覆盖活动`);
  }
});
