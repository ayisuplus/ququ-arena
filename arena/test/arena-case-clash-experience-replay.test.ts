/**
 * v2.9 契约：case-clash（案卷冲突检测）+ experience-replay（经验回放）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：case-clash 24 题——冲突题与干净题统一 LLM 裁判（语义评分）', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'case-clash'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual([...new Set(tasks.map((t) => t.condition))].sort(), [
    'amount-clash',
    'clean',
    'identity-clash',
    'timeline-clash',
  ]);
  const clash = tasks.filter((t) => t.condition !== 'clean');
  const clean = tasks.filter((t) => t.condition === 'clean');
  assert.equal(clash.length, 18);
  assert.equal(clean.length, 6);
  // 2026-09-23 起：关键词组合裁判评价不了自由文本、且会因措辞不同误判，统一改为罐级 LLM 裁判
  assert.equal(def.judge.kind, 'llm', 'case-clash 走罐级 LLM 裁判');
  assert.ok((def.judge as { rubric?: string }).rubric, 'llm 裁判必须带 rubric');
  for (const t of tasks) {
    assert.equal(t.judge, undefined, `${t.id} 不应再挂逐题组合裁判`);
    assert.ok(t.target, `${t.id} 缺参考答案（llm 裁判需要）`);
  }
  for (const t of clash) {
    assert.ok(t.meta?.anchor, `${t.id} 缺冲突锚点（保留供出题官追溯）`);
    assert.ok(t.target!.includes('冲突'), `${t.id} target 语义不符`);
  }
  for (const t of clean) {
    assert.equal(t.target, '无冲突');
  }
  // 干净对照的答案不得出现在任何冲突题的目标里（对照是真的干净）
  assert.ok(
    clean.every((t) => !clash.some((c) => c.input === t.input)),
    '对照题材料不得复用冲突题',
  );
});

test('经验回放24题四类：保留样例，欠定问题允许回答信息不足', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'experience-replay'));
  assert.equal(tasks.length, 24);
  assert.deepEqual([...new Set(tasks.map((t) => t.condition))].sort(), [
    'format-map',
    'rule-infer',
    'symbol-map',
    'threshold-infer',
  ]);
  for (const t of tasks) {
    assert.equal(t.meta?.answerInPrompt, true, `${t.id} 必须声明 answerInPrompt（标签词表必在经验对中）`);
    assert.ok(String(t.meta?.source ?? '').includes('自建'), `${t.id} 溯源必须标明自建`);
    const pairs = (t.input.match(/→/g) ?? []).length;
    assert.ok(pairs >= 4, `${t.id} 经验对不足（含新输入箭头共 ${pairs} 个 →）`);
    // 规则/阈值/符号类的答案是词表成员，必须出现在经验对里
    // 豁免 ER-SM-06：组合型答案（L2 = 败诉前缀 L + 审级 2）按构造不在词表
    if (t.condition !== 'format-map' && t.id !== 'ER-SM-06' && t.target !== '信息不足') {
      assert.ok(t.input.includes(t.target!), `${t.id} 答案词不在经验词表中（模式题自证）`);
    }
  }
});
