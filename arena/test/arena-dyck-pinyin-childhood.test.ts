/**
 * v2.29 契约：dyck-bracket / word-sort-pinyin（生成器罐）+ childhood-song（手写罐）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：dyck-bracket 24 题——栈模拟逐题复算缺失收尾', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'dyck-bracket'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
  for (const t of tasks) {
    const cut = t.input.match(/没有写完：(.+)\n/)![1]!;
    // 前缀合法性自检：栈不为负
    const stack: string[] = [];
    for (const ch of cut) {
      if (CLOSE[ch]) stack.push(ch);
      else {
        assert.ok(stack.length > 0, `${t.id} 前缀不合法（栈空遇闭括号）`);
        assert.equal(CLOSE[stack.pop()!], ch, `${t.id} 闭括号类型不匹配`);
      }
    }
    const ans = stack
      .reverse()
      .map((c) => CLOSE[c])
      .join('');
    assert.equal(ans, t.target, `${t.id} 栈模拟复算不符`);
    assert.ok(ans.length >= 1, `${t.id} 必须缺至少一个收尾`);
  }
});

test('新罐契约：word-sort-pinyin 24 题——拼音表独立复排且无恒等排列', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'word-sort-pinyin'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual(lintArena(def, tasks).warnings, [], '恒等排列剔除后不应有警告');
  for (const t of tasks) {
    const words = t.input.match(/排列：(.+?)。/)![1]!.split('、');
    assert.equal(words.length, 4);
    assert.notEqual(words.join('、'), t.target, `${t.id} 恒等排列（白出题）`);
    const py = String(t.meta?.pinyins).split(',');
    assert.equal(py.length, 4, `${t.id} 拼音表长度不符`);
    assert.equal(new Set(py).size, 4, `${t.id} 拼音并列（歧义）`);
    const truth = [...py.keys()]
      .sort((a, b) => py[a]!.localeCompare(py[b]!))
      .map((k) => words[k]!)
      .join('、');
    assert.equal(truth, t.target, `${t.id} 拼音复排不符`);
  }
});

test('新罐契约：childhood-song 16 题，上句不重复且答案非空短句', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'childhood-song'));
  assert.equal(tasks.length, 16);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const ups = new Set(tasks.map((t) => t.input.match(/「(.+?)」/)![1]!));
  assert.equal(ups.size, 16, '上句不得重复');
  for (const t of tasks) assert.ok(t.target && [...t.target!].length <= 12, `${t.id} 答案过长`);
});
