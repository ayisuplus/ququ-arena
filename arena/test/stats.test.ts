/**
 * 统计模块契约测试：CI 的确定性、配对对齐、胜率矩阵语义
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapCI, gapCI, winMatrix } from '../src/stats.ts';

test('bootstrapCI：常数序列的 CI 退化为点', () => {
  const ci = bootstrapCI([0.5, 0.5, 0.5, 0.5]);
  assert.ok(ci);
  assert.equal(ci.lo, 0.5);
  assert.equal(ci.hi, 0.5);
});

test('bootstrapCI：固定种子下同输入 CI 恒定（战报可复现契约）', () => {
  const scores = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0];
  const a = bootstrapCI(scores);
  const b = bootstrapCI(scores);
  assert.deepEqual(a, b);
});

test('bootstrapCI：CI 包住样本均值且宽度随 n 收窄', () => {
  const small = bootstrapCI([1, 0, 1, 0]);
  const big = bootstrapCI(Array.from({ length: 100 }, (_, i) => (i % 2 ? 1 : 0)));
  assert.ok(small && big);
  assert.ok(small.lo <= 0.5 && small.hi >= 0.5);
  assert.ok(big.hi - big.lo < small.hi - small.lo + 1e-9, 'n 越大 CI 越窄');
});

test('gapCI：A 全胜 1 分时 CI 退化为 {1,1}', () => {
  const records = [
    { model: 'a', taskId: 't1', score: 1 },
    { model: 'a', taskId: 't2', score: 1 },
    { model: 'b', taskId: 't1', score: 0 },
    { model: 'b', taskId: 't2', score: 0 },
  ];
  const ci = gapCI(records, 'a', 'b');
  assert.ok(ci, 'CI 应存在');
  assert.equal(ci.lo, 1);
  assert.equal(ci.hi, 1);
});

test('gapCI：弃权题从配对中剔除（按 taskId 对齐，非下标）', () => {
  // a 在 t1/t2/t3 全对；b 在 t2 弃权、t1/t3 全错
  // 正确配对：仅 t1/t3 入样 → 分差恒 1。若错按下标配对则混入 t2 → CI 不再恒 1
  const records = [
    { model: 'a', taskId: 't1', score: 1 },
    { model: 'a', taskId: 't2', score: 1 },
    { model: 'a', taskId: 't3', score: 1 },
    { model: 'b', taskId: 't1', score: 0 },
    { model: 'b', taskId: 't2', score: 0, error: 'timeout' },
    { model: 'b', taskId: 't3', score: 0 },
  ];
  const ci = gapCI(records, 'a', 'b');
  assert.ok(ci, 'CI 应存在');
  assert.equal(ci.lo, 1);
  assert.equal(ci.hi, 1);
});

test('winMatrix：全胜=1，全平=0.5，弃权题不计', () => {
  const records = [
    { model: 'a', taskId: 't1', score: 1 },
    { model: 'b', taskId: 't1', score: 0 },
    { model: 'a', taskId: 't2', score: 1 },
    { model: 'b', taskId: 't2', score: 1 },
    { model: 'a', taskId: 't3', score: 1 },
    // b 在 t3 缺席
  ];
  const m = winMatrix(records, ['a', 'b']);
  assert.equal(m.get('a')!.get('b'), 0.75); // 1胜 + 1平 / 2局
  assert.equal(m.get('b')!.get('a'), 0.25);
});
