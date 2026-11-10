/**
 * v3.8 契约：data-analysis（资料分析）+ sentence-order（语句排序）+ reading-mini（阅读理解）——传统罐第四批
 * data：meta.expr 复算；sentence-order：展示序↔正确序三方映射；reading：选项契约 + 细节题 answerText ⊆ 原文
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';
import type { ArenaTask } from '../src/types.ts';

/** meta.expr 求值：仅数字/四则/括号 + ceil/floor */
function evalExpr(expr: string): number {
  const stripped = expr.replace(/ceil|floor/g, '');
  assert.match(stripped, /^[\d+\-*/().\s]+$/, `expr 含白名单外字符：${expr}`);
  return new Function('ceil', 'floor', `return (${expr});`)(Math.ceil, Math.floor) as number;
}

/** 解析 A-D 选项：字母 → 文本 */
function parseOptions(t: ArenaTask): Map<string, string> {
  return new Map([...t.input.matchAll(/^([A-D])[.、]\s*(.+)$/gm)].map((m) => [m[1]!, m[2]!.trim()]));
}

/** 排序题三方映射复算：展示序按 order 重排必须等于 meta 正确序 */
function assertOrderMapping(tasks: ArenaTask[], metaKey: string): void {
  const NUM: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
  for (const t of tasks) {
    const shown = new Map([...t.input.matchAll(/([①②③④⑤])\s*(.+)/g)].map((m) => [NUM[m[1]!]!, m[2]!.trim()]));
    assert.equal(shown.size, 5, `${t.id} 展示条数不足 5`);
    const canonical = t.meta?.[metaKey] as string[] | undefined;
    const order = String(t.meta?.order ?? '');
    assert.ok(canonical?.length === 5, `${t.id} meta.${metaKey} 须为 5 条正确序`);
    assert.ok(order, `${t.id} 缺 meta.order`);
    assert.deepEqual([...order].sort(), ['1', '2', '3', '4', '5'], `${t.id} order 非 1-5 排列`);
    assert.equal(t.target, order, `${t.id} target ≠ meta.order`);
    assert.deepEqual(
      [...order].map((d) => shown.get(Number(d))),
      canonical,
      `${t.id} 展示序按 order 重排 ≠ 正确序`,
    );
    assert.notEqual(order, '12345', `${t.id} 展示序未打乱`);
  }
  assert.equal(new Set(tasks.map((t) => t.target)).size, 20, '存在重复排序串');
}

test('新罐契约：data-analysis 20 题四维度，expr 逐题复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'data-analysis'));
  assert.equal(tasks.length, 20);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []);
  for (const c of ['growth-rate', 'ratio', 'average', 'mixed']) {
    assert.equal(tasks.filter((t) => t.condition === c).length, 5, `${c} 题量不足`);
  }
  for (const t of tasks) {
    assert.ok(t.target, `${t.id} 缺 target`);
    const expr = String(t.meta?.expr ?? '');
    assert.ok(expr, `${t.id} 缺 meta.expr`);
    const v = evalExpr(expr);
    assert.ok(Number.isInteger(v) && v > 0, `${t.id} 答案非正整数（${v}）`);
    assert.equal(String(v), t.target, `${t.id} expr 复算 ${v} ≠ target ${t.target}`);
  }
  // 锚点自证：8000→10000 是 +25%；平均数反求 30*3-25-35=30
  assert.equal(tasks.find((t) => t.id === 'DA-GR-01')?.target, '25');
  assert.equal(tasks.find((t) => t.id === 'DA-AV-05')?.target, '30');
});

test('新罐契约：sentence-order 20 题四维度，展示序↔正确序三方映射复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'sentence-order'));
  assert.equal(tasks.length, 20);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []);
  for (const c of ['reference-chain', 'conjunction-chain', 'general-detail', 'time-space']) {
    assert.equal(tasks.filter((t) => t.condition === c).length, 5, `${c} 题量不足`);
  }
  assertOrderMapping(tasks, 'sentences');
});

test('新罐契约：reading-mini 20 题四维度，细节题答案逐字锚定原文', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'reading-mini'));
  assert.equal(tasks.length, 20);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []);
  for (const c of ['detail', 'main-idea', 'infer', 'word-meaning']) {
    assert.equal(
      tasks.filter((t) => t.condition === c).length,
      { detail: 8, 'main-idea': 4, infer: 4, 'word-meaning': 4 }[c],
      `${c} 题量不足`,
    );
  }
  for (const t of tasks) {
    assert.ok(t.target, `${t.id} 缺 target`);
    assert.match(t.target, /^[A-D]$/, `${t.id} target 须为选项字母`);
    const opts = parseOptions(t);
    assert.deepEqual([...opts.keys()].sort(), ['A', 'B', 'C', 'D'], `${t.id} 选项不齐`);
    assert.equal(new Set(opts.values()).size, 4, `${t.id} 选项文本有重复`);
    assert.equal(opts.get(t.target), String(t.meta?.answerText ?? ''), `${t.id} 字母与 answerText 不符`);
    assert.ok(t.input.includes('问题：'), `${t.id} 缺问题标记`);
    // 细节题铁律：答案必须逐字出现在短文中（选项区之前）
    if (t.condition === 'detail') {
      const passage = t.input.split('问题：')[0]!;
      assert.ok(passage.includes(String(t.meta?.answerText)), `${t.id} 细节题答案未逐字出现在原文`);
    }
  }
  // 答案字母四散
  assert.equal(new Set(tasks.map((t) => t.target)).size, 4, '答案字母分布过于集中');
});
