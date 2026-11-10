/**
 * v2.27 契约：idiom-fix（手写）+ anagram-check / palindrome-cn（生成器罐）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：idiom-fix 20 题，错版与正版差一字且正版入错版不出现', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'idiom-fix'));
  assert.equal(tasks.length, 20);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  for (const t of tasks) {
    const wrong = String(t.meta?.wrong);
    const right = t.target!;
    assert.notEqual(wrong, right, `${t.id} 错版=正版`);
    assert.equal([...wrong].length, [...right].length, `${t.id} 错正字数须一致`);
    // 差异字 1-2 个（高频错写的定义）
    const diff = [...wrong].filter((c, i) => [...right][i] !== c).length;
    assert.ok(diff >= 1 && diff <= 2, `${t.id} 差异字数 ${diff} 超范围`);
    assert.ok(!t.input.includes(`「${right}」`), `${t.id} 题面不得直接含正版`);
  }
});

test('新罐契约：anagram-check 24 题——变位判定逐题重排复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'anagram-check'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const conds = new Set(tasks.map((t) => t.condition));
  assert.deepEqual([...conds].sort(), ['is-anagram', 'not-anagram']);
  for (const t of tasks) {
    const m = t.input.match(/「(\w+)」和「(\w+)」/)!;
    const isAna = [...m[1]!].sort().join('') === [...m[2]!].sort().join('');
    assert.equal(isAna ? '是' : '否', t.target, `${t.id} 复算不符`);
    // 语义一致：条件与答案
    assert.equal(t.condition === 'is-anagram' ? '是' : '否', t.target, `${t.id} 条件与答案不符`);
  }
});

test('新罐契约：palindrome-cn 36 题——逐字反转复算 + 拟回文档非回文', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'palindrome-cn'));
  assert.equal(tasks.length, 36);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  for (const t of tasks) {
    const s = t.input.match(/「(.+?)」/)![1]!;
    const isPal = [...s!].join('') === [...s!].reverse().join('');
    assert.equal(isPal ? '是' : '否', t.target, `${t.id} 反转复算不符`);
  }
  // 拟回文档（回文改一字）：存在且全部确实非回文
  const mutated = tasks.filter((t) => t.meta?.mutatedFrom);
  assert.ok(mutated.length >= 4, '拟回文陷阱档不能太少');
  for (const t of mutated) {
    const s = t.input.match(/「(.+?)」/)![1]!;
    assert.ok([...s!].join('') !== [...s!].reverse().join(''), `${t.id} 拟回文必须真不回文`);
    assert.equal(t.target, '否');
  }
});
