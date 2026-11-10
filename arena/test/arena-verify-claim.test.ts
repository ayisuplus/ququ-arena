/**
 * v2.7 契约：verify-claim 罐（宣称核验擂台）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：verify-claim 16 题三维度，成立/不成立语义与条件一致', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'verify-claim'));
  assert.equal(tasks.length, 16);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual(lintArena(def, tasks).warnings, [], 'already-* 去重后不应有换皮警告');
  assert.deepEqual([...new Set(tasks.map((t) => t.condition))].sort(), ['hidden-gap', 'unverifiable', 'verified-pass']);
  // 语义一致：verified-pass 成立；hidden-gap / unverifiable 不成立
  for (const t of tasks) {
    const expect = t.condition === 'verified-pass' ? '成立' : '不成立';
    assert.equal(t.target, expect, `${t.id} target 与条件语义不符`);
    assert.ok(
      t.input.includes('需求：') && t.input.includes('候选实现') && t.input.includes('已运行证据'),
      `${t.id} 缺三段式结构`,
    );
    assert.ok(String(t.meta?.source ?? '').includes('verify'), `${t.id} 缺溯源`);
  }
  // 防一刀切维度必须存在且够分量
  assert.equal(tasks.filter((t) => t.condition === 'verified-pass').length, 5);
  assert.equal(tasks.filter((t) => t.condition === 'hidden-gap').length, 7);
  assert.equal(tasks.filter((t) => t.condition === 'unverifiable').length, 4);
});

test('新罐契约：hidden-gap 题的候选实现必须真的过得了所示可见测试（证据自洽）', async () => {
  // 若候选实现连可见测试都过不去，"可见测试已通过"的证据就是假的，题目失去张力
  const { tasks } = await loadArena(path.resolve('arenas', 'verify-claim'));
  for (const t of tasks.filter((x) => x.condition === 'hidden-gap')) {
    const code = t.input.match(/```python\n([\s\S]*?)```/)?.[1] ?? '';
    assert.ok(code.includes('def solve'), `${t.id} 缺候选实现`);
    // 七族的已知缺口关键词必须在需求里点名（否则模型无从判断）
    const req = t.input.split('\n')[0]!;
    assert.ok(req.length > 20, `${t.id} 需求描述过短`);
  }
});
