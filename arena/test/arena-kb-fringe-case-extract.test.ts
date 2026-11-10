/**
 * v2.11 契约：kb-fringe（标注淘汰区）+ case-extract（案卷要素）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：kb-fringe 20 题全带标注证据，且与 metacog-gate 零重叠', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'kb-fringe'));
  const gate = await loadArena(path.resolve('arenas', 'metacog-gate'));
  assert.equal(tasks.length, 20);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  // 淘汰区选题自证：源 id 不得在正赛罐里出现
  const gateIds = new Set(gate.tasks.map((t) => t.id));
  for (const t of tasks) {
    const srcId = String(t.id).replace(/^KF-/, '');
    assert.ok(!gateIds.has(srcId), `${srcId} 与 metacog-gate 正赛重叠——淘汰区选题失效`);
    assert.ok(typeof t.meta?.correctSamples === 'number', `${t.id} 缺 correctSamples 证据`);
    assert.ok(String(t.meta?.labelingRule ?? '').includes('3/3'), `${t.id} 缺标注规则`);
    assert.ok(String(t.meta?.labelingModel ?? '').includes('gguf'), `${t.id} 缺标注模型`);
  }
  // 三维语义：known 组合作答裁判，unknown exact 拒答
  const known = tasks.filter((t) => t.condition.startsWith('fringe-known'));
  const unknown = tasks.filter((t) => t.condition === 'fringe-unknown');
  assert.equal(known.length, 12);
  assert.equal(unknown.length, 8);
  assert.ok(
    known.every((t) => t.judge?.kind === 'exact'),
    '修订后短答案/单选题采用完整匹配，不能用关键词正则代替语义',
  );
  assert.ok(
    unknown.every((t) => def.review?.excluded?.[t.id]),
    '来源模型未知不代表其他模型未知，此类题必须暂停',
  );
  assert.ok(
    unknown.every((t) => t.judge?.kind === 'exact' && t.target === '需更新'),
    'fringe-unknown 必须 exact 拒答协议',
  );
  // 难度前沿自证：known 全部 correct_samples ≤ 2（3/3 的稳题在正赛，不在淘汰区）
  assert.ok(
    known.every((t) => Number(t.meta?.correctSamples) <= 2),
    '淘汰区不得混入 3/3 稳题',
  );
});

test('新罐契约：case-extract 24 题双维度，时间线答案为合法排列', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'case-extract'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual(lintArena(def, tasks).warnings, [], '输出协议去示例后不应有泄漏警告');
  const tl = tasks.filter((t) => t.condition === 'timeline-order');
  const mi = tasks.filter((t) => t.condition === 'missing-info');
  assert.equal(tl.length, 12);
  assert.equal(mi.length, 12);
  for (const t of tl) {
    const parts = t.target!.split(',');
    assert.equal(parts.length, 4, `${t.id} 时间线序列须含 4 事件`);
    assert.equal(new Set(parts).size, 4, `${t.id} 序列不得重复编号`);
    assert.ok(
      parts.every((p) => /^[A-D]$/.test(p)),
      `${t.id} 编号越界`,
    );
    assert.ok(!t.input.includes(t.target!), `${t.id} 协议示例不得泄漏答案`);
    assert.equal(t.judge, undefined, `${t.id} 走罐级 exact 默认`);
  }
  for (const t of mi) {
    assert.equal(t.judge?.kind, 'contains', `${t.id} 缺失项用 contains 裁判`);
  }
});
