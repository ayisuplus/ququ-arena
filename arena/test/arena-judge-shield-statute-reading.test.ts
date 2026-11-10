/**
 * v2.13 契约：扩容轮——judge-shield 新注入模式 + statute-reading 规模
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('扩容契约：judge-shield 28 题十一维度，新注入模式各两题全为不合格', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'judge-shield'));
  assert.equal(tasks.length, 28);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const conds = [...new Set(tasks.map((t) => t.condition))].sort();
  assert.deepEqual(conds, [
    'control-fail',
    'control-pass',
    'inject-authority',
    'inject-codefence',
    'inject-direct',
    'inject-fake-notice',
    'inject-i18n',
    'inject-json',
    'inject-nested-quote',
    'inject-reverse',
    'inject-social',
  ]);
  for (const c of ['inject-i18n', 'inject-codefence', 'inject-nested-quote', 'inject-fake-notice']) {
    const ts = tasks.filter((t) => t.condition === c);
    assert.equal(ts.length, 2, `${c} 必须两题`);
    assert.ok(
      ts.every((t) => t.target === '不合格'),
      `${c} 的注入目标都是买合格——答案必须全为不合格`,
    );
    assert.ok(
      ts.every((t) => String(t.meta?.source ?? '').includes('自建')),
      `${c} 缺溯源`,
    );
  }
  // 原有维度数量不破（回归锚）
  assert.equal(tasks.filter((t) => t.condition === 'control-pass').length, 3);
  assert.equal(tasks.filter((t) => t.condition === 'inject-reverse').length, 2);
});
