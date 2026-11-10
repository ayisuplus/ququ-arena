/**
 * v3.7 契约：definition-judge（定义判断）+ event-order（事件排序）+ word-blank（选词填空）——传统罐第三批
 * definition/word：选项结构 + 字母↔answerText；event-order：order 数字串 ↔ 输入展示序 ↔ meta.events 三方映射复算
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';
import type { ArenaTask } from '../src/types.ts';

/** 解析 A-D 选项：字母 → 文本 */
function parseOptions(t: ArenaTask): Map<string, string> {
  return new Map([...t.input.matchAll(/^([A-D])[.、]\s*(.+)$/gm)].map((m) => [m[1]!, m[2]!.trim()]));
}

function assertOptionContract(tasks: ArenaTask[]): void {
  for (const t of tasks) {
    assert.ok(t.target, `${t.id} 缺 target`);
    assert.match(t.target, /^[A-D]$/, `${t.id} target 须为选项字母`);
    const opts = parseOptions(t);
    assert.deepEqual([...opts.keys()].sort(), ['A', 'B', 'C', 'D'], `${t.id} 选项不齐`);
    assert.equal(new Set(opts.values()).size, 4, `${t.id} 选项文本有重复`);
    assert.equal(opts.get(t.target), String(t.meta?.answerText ?? ''), `${t.id} 字母与 answerText 不符`);
  }
}

test('新罐契约：definition-judge 20 题四概念域，定义名入题面、选项契约', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'definition-judge'));
  assert.equal(tasks.length, 20);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []);
  for (const c of ['legal-def', 'econ-def', 'psych-def', 'mgmt-def']) {
    assert.equal(tasks.filter((t) => t.condition === c).length, 5, `${c} 题量不足`);
  }
  assertOptionContract(tasks);
  for (const t of tasks) {
    const defName = String(t.meta?.defName ?? '');
    assert.ok(defName, `${t.id} 缺 meta.defName`);
    assert.ok(t.input.startsWith(defName + '：'), `${t.id} 定义名未置于题首`);
    assert.ok(t.input.includes('以下哪项最符合上述定义？'), `${t.id} 缺设问句`);
  }
  // 每题正确答案不得与任一干扰项文本重复（已由选项去重覆盖），且概念域内 defName 不重复
  const names = tasks.map((t) => t.meta?.defName);
  assert.equal(new Set(names).size, 20, 'defName 有重复——同一概念考两次');
});

test('新罐契约：event-order 20 题四维度，展示序↔正确序三方映射复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'event-order'));
  assert.equal(tasks.length, 20);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []);
  for (const c of ['causal', 'process', 'time-history', 'plot-logic']) {
    assert.equal(tasks.filter((t) => t.condition === c).length, 5, `${c} 题量不足`);
  }
  const NUM: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
  for (const t of tasks) {
    // 输入展示序：①..⑤ → 事件文本
    const shown = new Map([...t.input.matchAll(/([①②③④⑤])\s*(.+)/g)].map((m) => [NUM[m[1]!]!, m[2]!.trim()]));
    assert.equal(shown.size, 5, `${t.id} 展示事件数不足 5`);
    const events = t.meta?.events as string[] | undefined;
    const order = String(t.meta?.order ?? '');
    assert.ok(events?.length === 5, `${t.id} meta.events 须为 5 条正确序`);
    assert.ok(order, `${t.id} 缺 meta.order`);
    // order 是 1..5 的排列
    assert.deepEqual([...order].sort(), ['1', '2', '3', '4', '5'], `${t.id} order 非 1-5 排列`);
    // target 与 meta.order 一致
    assert.equal(t.target, order, `${t.id} target ≠ meta.order`);
    // 三方映射复算：按 order 依次取展示事件，必须等于正确序 events
    const rebuilt = [...order].map((d) => shown.get(Number(d)));
    assert.deepEqual(rebuilt, events, `${t.id} 展示序按 order 重排 ≠ 正确序`);
    // 防送分：展示序本身不得已是正确序
    assert.notEqual(order, '12345', `${t.id} 展示序未打乱`);
    // 全部答案数字串互不相同（防只背一串）
  }
  const orders = new Set(tasks.map((t) => t.target));
  assert.equal(orders.size, 20, '存在重复排序串——打乱多样性不足');
});

test('新罐契约：word-blank 20 题四维度，横线入题面、选项契约', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'word-blank'));
  assert.equal(tasks.length, 20);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []);
  for (const c of ['synonym-nuance', 'collocation', 'conjunction', 'context-twist']) {
    assert.equal(tasks.filter((t) => t.condition === c).length, 5, `${c} 题量不足`);
  }
  assertOptionContract(tasks);
  for (const t of tasks) {
    assert.ok(t.input.includes('______'), `${t.id} 题面缺横线空位`);
    // 正确答案不得已出现在题面句子里（防泄漏——选项区除外）
    const sentence = t.input.split('\n')[0]!;
    assert.ok(!sentence.includes(String(t.meta?.answerText).replace(/……/g, '')), `${t.id} 答案词已出现在题干句中`);
  }
  // 答案字母分布：四字母均出现（防全选 C 拿满分）
  const letters = new Set(tasks.map((t) => t.target));
  assert.equal(letters.size, 4, '答案字母分布过于集中');
});
