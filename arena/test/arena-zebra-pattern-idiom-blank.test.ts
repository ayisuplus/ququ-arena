/**
 * v2.24 契约：zebra-mini / pattern-grid（生成器罐）+ idiom-blank（手写罐）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：zebra-mini 24 题——约束唯一解且答案=真解该色', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'zebra-mini'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  // 独立求解器：216 分配枚举 + 约束文本重编译（与生成器不同代码路径）
  function* perms(arr: number[], pre: number[] = []): Generator<number[]> {
    if (!arr.length) yield pre;
    for (let i = 0; i < arr.length; i++) yield* perms([...arr.slice(0, i), ...arr.slice(i + 1)], [...pre, arr[i]!]);
  }
  const ITEMS = ['红', '绿', '蓝', '猫', '狗', '鸟', '茶', '咖啡', '牛奶'];
  for (const t of tasks) {
    const constraints = [...t.input.matchAll(/\d+\. (.+)/g)].map((m) => m[1]!);
    const testers = constraints.map((c) => {
      let m = c.match(/^「(.+?)」和「(.+?)」在同一栋房子$/);
      if (m) return (M: Record<string, number>) => M[m![1]!] === M[m![2]!];
      m = c.match(/^「(.+?)」的房子紧邻「(.+?)」的房子左边$/);
      if (m) return (M: Record<string, number>) => M[m![2]!]! - M[m![1]!]! === 1;
      m = c.match(/^「(.+?)」的房子在最左$/);
      if (m) return (M: Record<string, number>) => M[m![1]!] === 1;
      m = c.match(/^「(.+?)」的房子在最右$/);
      if (m) return (M: Record<string, number>) => M[m![1]!] === 3;
      m = c.match(/^「(.+?)」的房子在中间$/);
      if (m) return (M: Record<string, number>) => M[m![1]!] === 2;
      m = c.match(/^「(.+?)」的房子不在最左$/);
      if (m) return (M: Record<string, number>) => M[m![1]!] !== 1;
      m = c.match(/^「(.+?)」的房子不在最右$/);
      if (m) return (M: Record<string, number>) => M[m![1]!] !== 3;
      throw new Error(`${t.id} 未覆盖约束句式：${c}`);
    });
    const sols: Record<string, number>[] = [];
    for (const color of perms([1, 2, 3]))
      for (const pet of perms([1, 2, 3]))
        for (const drink of perms([1, 2, 3])) {
          const M: Record<string, number> = {
            红: color[0]!,
            绿: color[1]!,
            蓝: color[2]!,
            猫: pet[0]!,
            狗: pet[1]!,
            鸟: pet[2]!,
            茶: drink[0]!,
            咖啡: drink[1]!,
            牛奶: drink[2]!,
          };
          if (testers.every((fn) => fn(M))) sols.push(M);
        }
    assert.equal(sols.length, 1, `${t.id} 必须唯一解（实际 ${sols.length}）`);
    const drink = t.input.match(/喝「(.+?)」/)![1]!;
    const house = sols[0]![drink]!;
    const ansColor = ['红', '绿', '蓝'].find((c) => sols[0]![c] === house)!;
    assert.equal(ansColor, t.target, `${t.id} 答案≠唯一解`);
  }
});

test('新罐契约：pattern-grid 12 题三规则均衡，规则可辨识且答案=演算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'pattern-grid'));
  assert.equal(tasks.length, 12);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual(lintArena(def, tasks).warnings, [], '规则文案外置后不应有警告');
  const rotL = (s: string) => s.slice(1) + s[0];
  const rotR = (s: string) => s[s.length - 1]! + s.slice(0, -1);
  const inv = (s: string) => [...s].map((c) => (c === '○' ? '●' : '○')).join('');
  const conds = new Map<string, number>();
  for (const t of tasks) {
    conds.set(t.condition, (conds.get(t.condition) ?? 0) + 1);
    const rows = t.input.match(/第 1 行：([○●]+)\n第 2 行：([○●]+)/)!;
    const [r1, r2] = [rows[1]!, rows[2]!];
    // 规则可辨识：三规则对 row1 的像互不相同
    const cands = [rotL(r1), rotR(r1), inv(r1)];
    assert.equal(new Set(cands).size, 3, `${t.id} 规则不可辨（起始行 ${r1}）`);
    // 恰好一个规则把 row1 映到 row2，且与 meta.rule 一致
    const hit = ['rotate-left', 'rotate-right', 'invert'].filter((name, k) => cands[k] === r2);
    assert.equal(hit.length, 1, `${t.id} row1→row2 无唯一规则`);
    assert.equal(hit[0], t.meta?.rule, `${t.id} 辨识规则≠meta.rule`);
    // 答案=该规则再演算一步
    const fn = { 'rotate-left': rotL, 'rotate-right': rotR, invert: inv }[t.meta!.rule as string]!;
    assert.equal(fn(r2), t.target, `${t.id} 答案≠规则演算`);
  }
  assert.deepEqual(Object.fromEntries(conds), { 'rotate-left': 4, 'rotate-right': 4, invert: 4 }, '三规则均衡');
});

test('新罐契约：idiom-blank 20 题，单字答案且填空后成成语', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'idiom-blank'));
  assert.equal(tasks.length, 20);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  for (const t of tasks) {
    assert.equal([...t.target!].length, 1, `${t.id} 答案必须单字`);
    assert.ok(t.input.includes('__'), `${t.id} 缺空位标记`);
    const filled = t.input.match(/「(.+?)」/)![1]!.replace('__', t.target!);
    assert.equal([...filled].length, 4, `${t.id} 填后须四字成语（${filled}）`);
  }
});
