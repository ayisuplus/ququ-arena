/**
 * v2.22 契约：logical-deduction / number-sequence（生成器罐）+ couplet-chain（手写罐）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：logical-deduction 24 题——约束集唯一解且答案=真解对应位', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'logical-deduction'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual(lintArena(def, tasks).warnings, [], 'family 声明后不应有警告');
  function* perms(arr: string[], pre: string[] = []): Generator<string[]> {
    if (!arr.length) yield pre;
    for (let i = 0; i < arr.length; i++) yield* perms([...arr.slice(0, i), ...arr.slice(i + 1)], [...pre, arr[i]!]);
  }
  for (const t of tasks) {
    const items = t.input.match(/排成一列：(.+?)。/)![1]!.split('、');
    assert.equal(items.length, 4, `${t.id} 必须四物`);
    const constraints = [...t.input.matchAll(/\d+\. (.+)/g)].map((m) => m[1]!);
    // 把约束文本重新编译为测试函数（与生成器不同的代码路径）
    const testers = constraints.map((c) => {
      let m = c.match(/^(.+?) 紧邻 (.+?) 左边$/);
      if (m) return (q: string[]) => q.indexOf(m![2]!) - q.indexOf(m![1]!) === 1;
      m = c.match(/^(.+?) 在 (.+?) 左边$/);
      if (m) return (q: string[]) => q.indexOf(m![1]!) < q.indexOf(m![2]!);
      m = c.match(/^(.+?) 在最左$/);
      if (m) return (q: string[]) => q[0] === m![1]!;
      m = c.match(/^(.+?) 在最右$/);
      if (m) return (q: string[]) => q[3] === m![1]!;
      m = c.match(/^(.+?) 不在最左$/);
      if (m) return (q: string[]) => q[0] !== m![1]!;
      m = c.match(/^(.+?) 不在最右$/);
      if (m) return (q: string[]) => q[3] !== m![1]!;
      throw new Error(`${t.id} 未覆盖的约束句式：${c}`);
    });
    const sols = [...perms(items)].filter((s) => testers.every((fn) => fn(s)));
    assert.equal(sols.length, 1, `${t.id} 约束集必须唯一解（实际 ${sols.length}）`);
    const askPos = Number(t.input.match(/第 (\d) 位/)![1]);
    assert.equal(sols[0]![askPos - 1], t.target, `${t.id} 答案≠唯一解对应位`);
    assert.ok(Number(t.meta?.constraints) <= 4, `${t.id} 约束过多（${t.meta?.constraints}）——最小化失效`);
  }
});

test('新罐契约：number-sequence 16 题八族，各族公式复算下一项一致', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'number-sequence'));
  assert.equal(tasks.length, 16);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const fams = new Set(tasks.map((t) => t.meta?.family));
  assert.equal(fams.size, 8, '八族');
  for (const t of tasks) {
    const shown = String(t.meta?.shown).split(',').map(Number);
    assert.equal(shown.length, 5, `${t.id} 须展示 5 项`);
    const next = Number(t.target);
    const [a, b, c, d, e] = shown as [number, number, number, number, number];
    switch (t.meta?.family) {
      case 'primes':
        assert.deepEqual([...shown, next], [2, 3, 5, 7, 11, 13]);
        break;
      case 'fib':
        assert.equal(next, d + e);
        break;
      case 'squares': {
        const k = Math.round(Math.sqrt(a));
        assert.equal(next, (k + 5) ** 2);
        break;
      }
      case 'triangular':
        assert.deepEqual([...shown, next], [1, 3, 6, 10, 15, 21]);
        break;
      case 'arithmetic':
        assert.equal(next, e + (b - a));
        break;
      case 'geometric':
        assert.equal(next, e * (b / a));
        break;
      case 'alt-diff':
        assert.equal(next, e + (b - a), `${t.id} 交错差第 6 项 = 第5项 + 第1差`);
        break;
      case 'squares-pm1': {
        const pm = a === 2 ? 1 : -1;
        assert.equal(next, 36 + pm, `${t.id} 平方±1`);
        break;
      } // 首项 1²±1 = 0 或 2，据此定 ±
    }
  }
});

test('新罐契约：couplet-chain 16 题，下联字数与上联相等（对仗自检）', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'couplet-chain'));
  assert.equal(tasks.length, 16);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  for (const t of tasks) {
    const up = t.input.match(/「(.+?)」/)![1]!;
    assert.equal([...t.target!].length, [...up].length, `${t.id} 上下联字数不等（对仗自检）`);
  }
});
