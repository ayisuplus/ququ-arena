/**
 * v2.20 契约：cipher-decode / math24-judge（生成器罐）+ riddle-me（手写罐）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：cipher-decode 30 题四密码，密文可由答案重新编码自证', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'cipher-decode'));
  assert.equal(tasks.length, 30);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const conds = [...new Set(tasks.map((t) => t.condition))].sort();
  assert.deepEqual(conds, ['a1z26', 'caesar', 'morse', 'reverse']);
  const cipherOf = (t: (typeof tasks)[number]) => t.input.split('密文：')[1]!.split('\n')[0]!.trim();
  for (const t of tasks) {
    const ct = cipherOf(t);
    const pt = t.target!;
    if (t.condition === 'reverse') assert.equal([...pt].reverse().join(''), ct, `${t.id} 倒序自证`);
    if (t.condition === 'a1z26')
      assert.deepEqual(
        ct.split(' ').map(Number),
        [...pt].map((c) => c.charCodeAt(0) - 96),
        `${t.id} A1Z26 自证`,
      );
    if (t.condition === 'caesar') {
      const shift = Number(t.input.match(/位移 (\d) 位/)![1]);
      assert.equal(
        [...pt].map((c) => String.fromCharCode(((c.charCodeAt(0) - 97 + shift) % 26) + 97)).join(''),
        ct,
        `${t.id} 凯撒自证`,
      );
    }
    if (t.condition === 'morse')
      assert.ok(/^[.\- ]+$/.test(ct) && ct.split(' ').length === pt.length, `${t.id} 摩斯形态`);
  }
});

test('新罐契约：math24-judge 30 题均衡，锚定案正确，可解性枚举复算一致', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'math24-judge'));
  assert.equal(tasks.length, 30);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.equal(tasks.filter((t) => t.target === '能').length, 15, '能/不能必须 15/15 均衡');
  assert.equal(tasks.filter((t) => t.target === '不能').length, 15);
  // 锚定案
  assert.equal(tasks.find((t) => t.meta?.nums === '3,3,8,8')?.target, '能', '3 3 8 8 经典难题必须标「能」');
  assert.equal(tasks.find((t) => t.meta?.nums === '1,1,1,1')?.target, '不能');
  // 独立求解器复算（锚定案先自证：3,3,8,8 能 / 1,1,1,1 不能 / 1,2,3,4 能）
  const EPS = 1e-9;
  const solve = (nums: number[]): boolean => {
    const rec = (xs: number[]): boolean => {
      if (xs.length === 1) return Math.abs(xs[0]! - 24) < EPS;
      for (let i = 0; i < xs.length; i++)
        for (let j = i + 1; j < xs.length; j++) {
          const a = xs[i]!,
            b = xs[j]!;
          const rest = xs.filter((_, k) => k !== i && k !== j);
          for (const r of [a + b, a - b, b - a, a * b, b !== 0 ? a / b : NaN, a !== 0 ? b / a : NaN]) {
            if (!Number.isNaN(r) && rec([...rest, r])) return true;
          }
        }
      return false;
    };
    return rec(nums);
  };
  assert.ok(solve([3, 3, 8, 8]), '求解器自证：3 3 8 8 必须可解');
  assert.ok(!solve([1, 1, 1, 1]), '求解器自证：1 1 1 1 必须不可解');
  assert.ok(solve([1, 2, 3, 4]), '求解器自证：1 2 3 4 必须可解');
  for (const t of tasks) {
    const nums = String(t.meta?.nums).split(',').map(Number);
    assert.equal(solve(nums) ? '能' : '不能', t.target, `${t.id}（${t.meta?.nums}）可解性复算不符`);
  }
});

test('新罐契约：riddle-me 16 题双类，谜底为短词，走 LLM 裁判', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'riddle-me'));
  assert.equal(tasks.length, 16);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual([...new Set(tasks.map((t) => t.condition))].sort(), ['riddle-char', 'riddle-object']);
  assert.equal(tasks.filter((t) => t.condition === 'riddle-char').length, 12);
  assert.equal(tasks.filter((t) => t.condition === 'riddle-object').length, 4);
  // 2026-09-23 起：exact 精确判分把语义等价的合法谜底误判为错，改为罐级 LLM 裁判
  assert.equal(def.judge.kind, 'llm', 'riddle-me 走罐级 LLM 裁判');
  assert.ok((def.judge as { rubric?: string }).rubric, 'llm 裁判必须带 rubric');
  for (const t of tasks) {
    assert.equal(t.judge, undefined, `${t.id} 不应挂逐题裁判`);
    assert.ok(t.target && t.target.length <= 4, `${t.id} 谜底过长`);
  }
});
