/**
 * v2.8 契约：session-shift 罐（规则漂移擂台）+ answerInPrompt 豁免
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { ArenaDef, ArenaTask } from '../src/types.ts';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('lint：answerInPrompt 声明豁免泄漏检测，未声明仍报警', () => {
  const def: ArenaDef = { name: 't', title: 't', description: '', judge: { kind: 'exact' } };
  const mk = (id: string, aip: boolean): ArenaTask => ({
    id,
    condition: 'c',
    input: '规则写着：端口改为 9090。问端口？',
    target: '9090',
    meta: aip ? { answerInPrompt: true } : {},
  });
  const exempt = lintArena(def, [mk('a', true)]);
  assert.ok(!exempt.warnings.some((w) => w.includes('答案泄漏')), `声明后不应报警：${exempt.warnings}`);
  const normal = lintArena(def, [mk('b', false)]);
  assert.ok(
    normal.warnings.some((w) => w.includes('答案泄漏')),
    '未声明的选择题面必须报警',
  );
});

test('新罐契约：session-shift 32 题四维度，答案短语均出自题面条款', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'session-shift'));
  assert.equal(tasks.length, 32);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual(lintArena(def, tasks).warnings, [], '声明豁免后不应有警告');
  assert.deepEqual([...new Set(tasks.map((t) => t.condition))].sort(), [
    'apply-latest',
    'no-update',
    'primacy-trap',
    'scope-guard',
  ]);
  assert.equal(tasks.filter((t) => t.condition === 'apply-latest').length, 12);
  assert.equal(tasks.filter((t) => t.condition === 'primacy-trap').length, 8);
  assert.equal(tasks.filter((t) => t.condition === 'scope-guard').length, 6);
  assert.equal(tasks.filter((t) => t.condition === 'no-update').length, 6);
  for (const t of tasks) {
    assert.equal(t.meta?.answerInPrompt, true, `${t.id} 必须声明 answerInPrompt`);
    assert.ok(String(t.meta?.source ?? '').includes('自建'), `${t.id} 溯源必须标明自建（非数据收割）`);
  }
  // scope-guard 的答案必须来自旧条款（retention 语义自证：v2 更新文本不含该答案措辞）
  for (const t of tasks.filter((x) => x.condition === 'scope-guard')) {
    const v2Only = (t.input.split(/v2[^：]*：/)[1] ?? '').split('场景问题')[0]!; // 切到场景问题前
    assert.ok(!v2Only.includes(t.target!), `${t.id} 的答案不应出现在 v2 更新文本里`);
  }
});
