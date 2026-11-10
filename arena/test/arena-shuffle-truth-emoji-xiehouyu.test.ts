/**
 * v2.19 契约：shuffle-track / truth-lie（生成器罐）+ emoji-quiz / xiehouyu（手写罐）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：shuffle-track 26 题三难度，交换链复算一致', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'shuffle-track'));
  assert.equal(tasks.length, 26);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual(lintArena(def, tasks).warnings, [], '同族声明后不应有警告');
  const conds = new Map<string, number>();
  for (const t of tasks) conds.set(t.condition, (conds.get(t.condition) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries(conds), { 'swaps-2': 6, 'swaps-4': 10, 'swaps-6': 10 });
  for (const t of tasks) {
    // 独立复算：从题面解析初始分配与交换链，模拟后目标物持有者必须=target
    const init = Object.fromEntries(
      [...t.input.matchAll(/([甲乙丙丁戊]) 拿着 (\S+?)(?=，|。)/g)].map((m) => [m[1], m[2]]),
    );
    for (const m of t.input.matchAll(/([甲乙丙丁戊]) 用手中的 (\S+?) 与 ([甲乙丙丁戊]) 手中的 (\S+?) 交换/g)) {
      const [, a, ia, b, ib] = m;
      init[a] = ib;
      init[b] = ia;
    }
    const target = t.input.match(/完成后，(\S+?) 在谁手里/)![1];
    const holder = Object.entries(init).find(([, v]) => v === target)?.[0];
    assert.equal(holder, t.target, `${t.id} 复算不符（生成器权威性回归）`);
  }
});

test('新罐契约：truth-lie 26 题锚定链唯一可解，独立传播复算一致', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'truth-lie'));
  assert.equal(tasks.length, 26);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  // T-007 口径修复：答案唯一、格式受限（只输出「老实人」/「骗子」），启用 opt-in 宽松口径——
  // 「戊是老实人」这类「答案对、多说主语」不得再被当成推理错。
  assert.deepEqual(def.judge, { kind: 'exact', lenient: true });
  const conds = new Map<string, number>();
  for (const t of tasks) conds.set(t.condition, (conds.get(t.condition) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries(conds), { 'chain-3': 6, 'chain-4': 10, 'chain-5': 10 });
  for (const t of tasks) {
    // 锚定句必须在题面（无锚自指链可双解，题不成立）
    assert.ok(/已知 [甲乙丙丁戊] 是(老实人|骗子)。/.test(t.input), `${t.id} 缺锚定句`);
    const anchorTruth = /是老实人。/.test(t.input.match(/已知[^。]*。/)![0]);
    const claims = [...t.input.matchAll(/([甲乙丙丁戊]) 说：「([甲乙丙丁戊]) 是(老实人|骗子)」/g)];
    const truth = new Map([[claims[0]![1]!, anchorTruth]]);
    for (const [, p, next, claim] of claims) truth.set(next!, truth.get(p!) === (claim === '老实人'));
    const asked = t.input.match(/问题：([甲乙丙丁戊]) 是/)![1];
    assert.equal(truth.get(asked!) ? '老实人' : '骗子', t.target, `${t.id} 传播复算不符`);
  }
});

test('新罐契约：emoji-quiz / xiehouyu 手写罐结构与答案纪律', async () => {
  const quiz = await loadArena(path.resolve('arenas', 'emoji-quiz'));
  assert.equal(quiz.tasks.length, 20);
  assert.deepEqual(lintArena(quiz.def, quiz.tasks).errors, []);
  assert.deepEqual([...new Set(quiz.tasks.map((t) => t.condition))].sort(), ['idiom', 'movie']);
  assert.ok(
    quiz.tasks.every((t) => t.judge === undefined),
    'emoji-quiz 走罐级 exact 默认',
  );
  const xh = await loadArena(path.resolve('arenas', 'xiehouyu'));
  assert.equal(xh.tasks.length, 20);
  assert.deepEqual(lintArena(xh.def, xh.tasks).errors, []);
  assert.ok(
    xh.tasks.every((t) => t.input.includes('——')),
    '歇后语题面必须带破折号',
  );
  // 手写罐答案不得为空且不宜过长（谜底/歇后语后半都是短词）
  for (const t of [...quiz.tasks, ...xh.tasks]) assert.ok(t.target && t.target.length <= 8, `${t.id} 答案过长`);
});
