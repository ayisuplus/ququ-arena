/**
 * v2.12 契约：legal-math 罐（法条算术擂台）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：legal-math 21 题三维度，答案格式纪律自洽', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'legal-math'));
  assert.equal(tasks.length, 21);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual(lintArena(def, tasks).warnings, [], 'family+answerInPrompt 声明后不应有警告');
  assert.deepEqual([...new Set(tasks.map((t) => t.condition))].sort(), [
    'deposit-calc',
    'interest-rule',
    'limitation-calc',
  ]);
  for (const t of tasks) {
    assert.ok(Array.isArray(t.meta?.articles) && (t.meta!.articles as string[]).length >= 1, `${t.id} 缺引用条文`);
    for (const a of t.meta!.articles as string[]) assert.ok(t.input.includes(a), `${t.id} 题面未引 ${a}`);
    assert.ok(String(t.meta?.source ?? '').includes('自建'), `${t.id} 溯源必须标明自建`);
    // 答案格式纪律：日期 YYYY-MM-DD（LM-LC-09 带时分）；金额 N万；判断题指定选项
    if (t.condition === 'limitation-calc' && !['LM-LC-04', 'LM-LC-08', 'LM-LC-09'].includes(t.id))
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(t.target!), `${t.id} 日期格式`);
    if (t.condition === 'deposit-calc' && t.id !== 'LM-DC-04' && t.id !== 'LM-DC-08')
      assert.ok(/^\d+万$/.test(t.target!), `${t.id} 金额格式`);
  }
  // 答案泄漏声明只在答案真的出现在题面时
  for (const t of tasks) {
    const inPrompt = t.input.includes(t.target!);
    assert.equal(Boolean(t.meta?.answerInPrompt), inPrompt, `${t.id} answerInPrompt 声明与实际不符`);
  }
});

test('新罐契约：legal-math 关键答案的法学正确性锚定（防回归改数）', async () => {
  const { tasks } = await loadArena(path.resolve('arenas', 'legal-math'));
  const byId = new Map(tasks.map((t) => [t.id, t.target]));
  // 同号日计算不额外加一天；本题明确排除未给出的休假顺延。
  // 对照最高法院期间示例：https://www.court.gov.cn/zixun/xiangqing/6943.html
  assert.equal(byId.get('LM-LC-01'), '2025-03-10');
  // 一个月自 2024-01-31 起 → 到期月无对应日 → 闰年月末 2024-02-29
  assert.equal(byId.get('LM-LC-02'), '2024-02-29');
  // 国庆假 10-01~10-07 → 顺延至 10-08
  assert.equal(byId.get('LM-LC-03'), '2024-10-08');
  assert.equal(byId.get('LM-LC-05'), '2026-06-01');
  assert.equal(byId.get('LM-LC-06'), '2024-04-15');
  assert.equal(byId.get('LM-LC-07'), '2024-03-10');
  // 净补偿比较：违约金12万 > 双倍返还16万减去自己的本金8万。
  assert.equal(byId.get('LM-DC-06'), '12万');
  // 定金：50万标的 20% 上限 = 10万；实付 8万 视为变更；双倍返还 16万
  assert.equal(byId.get('LM-DC-01'), '10万');
  assert.equal(byId.get('LM-DC-02'), '8万');
  assert.equal(byId.get('LM-DC-03'), '16万');
  // 利息：自然人间不明=无息；公司向个人=应确定
  assert.equal(byId.get('LM-IR-02'), '没有利息');
  assert.equal(byId.get('LM-IR-03'), '应确定利息');
});
