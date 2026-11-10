/**
 * v2.6 契约：statute-reading 罐（民法典原文细读擂台）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：statute-reading 96 题五维度，真/假平衡，条条引原文', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'statute-reading'));
  assert.equal(tasks.length, 96);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual(lintArena(def, tasks).warnings, [], 'family 声明后不应再有换皮警告');
  const conds = new Set(tasks.map((t) => t.condition));
  assert.deepEqual([...conds].sort(), ['detail-shift', 'logic-invert', 'modal-swap', 'scope-shift', 'verbatim-true']);
  const t = tasks.filter((x) => x.condition === 'verbatim-true');
  const f = tasks.filter((x) => x.condition !== 'verbatim-true');
  assert.equal(t.length, 48, '真陈述 48 条（48 条条文各一真）');
  assert.equal(f.length, 48, '假陈述 48 条');
  assert.ok(t.every((x) => x.target === '真') && f.every((x) => x.target === '假'), 'target 必须与真假一致');
  assert.ok(
    tasks.every((x) => x.judge === undefined),
    '全部走罐级 exact 默认裁判',
  );
  for (const x of tasks) {
    const statute = String(x.meta?.statute ?? '');
    assert.ok(statute.endsWith('条'), `${x.id} 缺 meta.statute`);
    assert.ok(x.input.includes(`条文原文：「${statute}`), `${x.id} 必须引用所考条文原文`);
    assert.equal(x.meta?.family, statute, 'T/F 对必须以条号为 family（受控变体声明）');
    assert.ok(String(x.meta?.source ?? '').includes('civil_code'), `${x.id} 缺溯源`);
  }
  // 陷阱分布按语义真实归属（96 题版：detail 18 / logic 15 / scope 11 / modal 4）
  const dist = { 'modal-swap': 4, 'scope-shift': 11, 'logic-invert': 15, 'detail-shift': 18 };
  for (const [trap, n] of Object.entries(dist)) {
    assert.equal(tasks.filter((x) => x.condition === trap).length, n, `${trap} 必须 ${n} 条`);
  }
});

test('新罐契约：statute-reading 答案纪律——exact 裁判下「真/假」之外皆翻车', async () => {
  const { tasks } = await loadArena(path.resolve('arenas', 'statute-reading'));
  const { judgeAnswer } = await import('../src/judge.ts');
  const t0 = tasks[0]!;
  const def = { judge: { kind: 'exact' } } as unknown as import('../src/types.ts').ArenaDef;
  assert.equal((await judgeAnswer(def, t0, t0.target!, ['mock:a'])).score, 1);
  assert.equal((await judgeAnswer(def, t0, t0.target === '真' ? '假' : '真', ['mock:a'])).score, 0);
  assert.equal((await judgeAnswer(def, t0, `该陈述为${t0.target}`, ['mock:a'])).score, 0);
});
