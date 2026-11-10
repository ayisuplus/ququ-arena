/**
 * v2.30 契约：element-symbol / t9-encode（生成器罐）+ stroke-count（手写罐）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

const PERIODIC: Record<string, string> = {
  氢: 'H',
  氦: 'He',
  锂: 'Li',
  铍: 'Be',
  硼: 'B',
  碳: 'C',
  氮: 'N',
  氧: 'O',
  氟: 'F',
  氖: 'Ne',
  钠: 'Na',
  镁: 'Mg',
  铝: 'Al',
  硅: 'Si',
  磷: 'P',
  硫: 'S',
  氯: 'Cl',
  氩: 'Ar',
  钾: 'K',
  钙: 'Ca',
  铁: 'Fe',
  铜: 'Cu',
  锌: 'Zn',
  银: 'Ag',
  金: 'Au',
  汞: 'Hg',
  铅: 'Pb',
  锡: 'Sn',
  碘: 'I',
  氙: 'Xe',
};
const T9: Record<string, string> = {
  a: '2',
  b: '2',
  c: '2',
  d: '3',
  e: '3',
  f: '3',
  g: '4',
  h: '4',
  i: '4',
  j: '5',
  k: '5',
  l: '5',
  m: '6',
  n: '6',
  o: '6',
  p: '7',
  q: '7',
  r: '7',
  s: '7',
  t: '8',
  u: '8',
  v: '8',
  w: '9',
  x: '9',
  y: '9',
  z: '9',
};

test('新罐契约：element-symbol 24 题双向，周期表逐题复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'element-symbol'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const REV = Object.fromEntries(Object.entries(PERIODIC).map(([a, b]) => [b, a]));
  for (const t of tasks) {
    const sym = String(t.meta?.symbol);
    if (t.condition === 'symbol-to-name') assert.equal(REV[sym], t.target, `${t.id} 符号→名复算不符`);
    else assert.equal(PERIODIC[t.input.match(/元素「(.+?)」/)![1]!], t.target, `${t.id} 名→符号复算不符`);
  }
});

test('新罐契约：t9-encode 20 题，T9 表逐题复算；罐只出编码方向（解码歧义纪律）', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 't9-encode'));
  assert.equal(tasks.length, 20);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.ok(
    tasks.every((t) => t.condition === 'pinyin-to-t9'),
    '罐只出编码方向',
  );
  for (const t of tasks) {
    const truth = [...String(t.meta?.syllable)].map((c) => T9[c]).join('');
    assert.equal(truth, t.target, `${t.id} T9 复算不符`);
  }
});

test('新罐契约：stroke-count 20 题，笔画数在 2-5 且逐题带字', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'stroke-count'));
  assert.equal(tasks.length, 20);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const chars = new Set(tasks.map((t) => t.meta?.char));
  assert.equal(chars.size, 20, '字不得重复');
  for (const t of tasks) {
    const n = Number(t.target);
    assert.ok(n >= 2 && n <= 5, `${t.id} 笔画数 ${n} 越界（本罐收 2-5 画字）`);
    assert.ok(t.input.includes(String(t.meta?.char)), `${t.id} 题面须含字`);
  }
});
