/**
 * v2.28 契约：base-convert / roman-num（生成器罐）+ reverse-word-cn（手写罐）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：base-convert 24 题双向三进制，逐题双向复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'base-convert'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const conds = new Set(tasks.map((t) => t.condition));
  assert.equal(conds.size, 6, '三进制 × 双向 = 六条件');
  for (const t of tasks) {
    const v = Number(t.meta?.decimal),
      base = Number(t.meta?.base);
    if (t.condition.includes('to-dec')) {
      const cipher = t.input.match(/进制数 (\S+) 等于/)![1]!;
      assert.equal(parseInt(cipher, base), v, `${t.id} 密文复算≠decimal`);
      assert.equal(t.target, String(v));
    } else {
      assert.equal(v.toString(base), t.target, `${t.id} 转换复算不符`);
      assert.ok(t.input.includes(String(v)), `${t.id} 题面须含十进制数`);
    }
  }
});

test('新罐契约：roman-num 24 题，减记规则独立实现复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'roman-num'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const M: Record<string, number> = { M: 1000, D: 500, C: 100, L: 50, X: 10, V: 5, I: 1 };
  const fromRoman = (s: string) => {
    let n = 0;
    for (let i = 0; i < s.length; i++) n += M[s[i]!]! < (M[s[i + 1]!] ?? 0) ? -M[s[i]!]! : M[s[i]!]!;
    return n;
  };
  for (const t of tasks) {
    const v = Number(t.meta?.decimal);
    const roman = t.condition === 'to-roman' ? t.target! : t.input.match(/罗马数字 (\S+) 等于/)![1]!;
    assert.equal(fromRoman(roman), v, `${t.id} 罗马串复算不符`);
    if (t.condition === 'to-roman') assert.equal(t.target, roman);
    else assert.equal(t.target, String(v));
  }
  // 减记规则覆盖：至少几题含 IV/IX/XC/CD/CM
  const withSub = tasks.filter((t) => /IV|IX|XC|CD|CM/.test(t.condition === 'to-roman' ? t.target! : t.input));
  assert.ok(withSub.length >= 6, '减记规则题太少（罗马数字的考点就是减记）');
});

test('新罐契约：reverse-word-cn 24 题，两可词答案=逐字反转且对照组答「不是」', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'reverse-word-cn'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual(lintArena(def, tasks).warnings, [], 'family 声明后不应有警告');
  const has = tasks.filter((t) => t.condition === 'has-reverse');
  const no = tasks.filter((t) => t.condition === 'no-reverse');
  assert.equal(has.length, 20);
  assert.equal(no.length, 4);
  for (const t of has) {
    const w = t.input.match(/「(.+?)」/)![1]!;
    assert.equal([...w].reverse().join(''), t.target, `${t.id} 答案必须=逐字反转`);
    assert.notEqual(w, t.target, `${t.id} 回文词不算两可`);
  }
  assert.ok(
    no.every((t) => t.target === '不是'),
    '对照组必须答「不是」',
  );
});
