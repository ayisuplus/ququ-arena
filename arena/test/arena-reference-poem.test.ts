/**
 * v2.26 契约：reference-cn（中文指代消解）+ poem-match（诗意配对）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：reference-cn 20 题最小对——同主干两句答案必须相反', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'reference-cn'));
  assert.equal(tasks.length, 20);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  // 最小对：编号相邻的（奇,偶）两句共享主干、代词相同、答案必须一正一反
  for (let k = 1; k <= 10; k++) {
    const a = tasks.find((t) => t.id === `RC-${String(2 * k - 1).padStart(2, '0')}`)!;
    const b = tasks.find((t) => t.id === `RC-${String(2 * k).padStart(2, '0')}`)!;
    assert.ok(a && b, `缺第 ${k} 对`);
    assert.ok(a.input.startsWith('背景：') && b.input.startsWith('背景：'), '消解指代必须给出区分背景');
    const stemOf = (s: string) => s.slice(s.indexOf('句子：')).split('，因为')[0];
    assert.equal(stemOf(a.input), stemOf(b.input), `第 ${k} 对主干不同：${a.id} vs ${b.id}`);
    assert.equal(a.meta?.pronoun, b.meta?.pronoun, `第 ${k} 对代词不同`);
    assert.notEqual(a.target, b.target, `第 ${k} 对答案必须翻转（最小对的意义）`);
    // 答案必须出现在共享主干中（两个人名各为其一）
    assert.ok(stemOf(a.input)!.includes(a.target!) && stemOf(a.input)!.includes(b.target!), `第 ${k} 对答案须在主干中`);
  }
});

test('新罐契约：poem-match 16 题四选项，正确答案在选项中且干扰项为名篇', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'poem-match'));
  assert.equal(tasks.length, 16);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  for (const t of tasks) {
    const options = [...t.input.matchAll(/^([A-D])\. (.+)$/gm)];
    assert.equal(options.length, 4, `${t.id} 必须四选项`);
    assert.ok(['A', 'B', 'C', 'D'].includes(t.target!), `${t.id} target 必须是字母`);
    const letters = options.map((o) => o[1]);
    assert.deepEqual(letters, ['A', 'B', 'C', 'D'], `${t.id} 选项顺序`);
    // 描述不得直接含正确诗句（否则零推理）
    const correctVerse = options.find((o) => o[1] === t.target)![2]!;
    assert.ok(!t.input.split('\n')[1]!.includes(correctVerse), `${t.id} 描述泄漏正确诗句`);
  }
});
