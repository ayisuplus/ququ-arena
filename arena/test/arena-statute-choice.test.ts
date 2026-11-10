/**
 * v2.10 契约：statute-choice 罐（法条竞合 · 择一适用擂台）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：statute-choice 16 题四维度，target 必须是甲乙条文之一', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'statute-choice'));
  assert.equal(tasks.length, 16);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual(lintArena(def, tasks).warnings, [], '条文对 family 声明后不应有换皮警告');
  assert.deepEqual([...new Set(tasks.map((t) => t.condition))].sort(), [
    'election-by-facts',
    'general-fallback',
    'procedure-timing',
    'special-over-general',
  ]);
  for (const t of tasks) {
    const arts = (t.meta?.articles as string[] | undefined) ?? [];
    assert.equal(arts.length, 2, `${t.id} 必须是一对条文`);
    // target 是阿拉伯数字条号，且题面必须引用该条原文
    assert.ok(/^\d+$/.test(t.target!), `${t.id} target 必须是阿拉伯数字条号`);
    assert.ok(t.input.includes('条文甲') && t.input.includes('条文乙'), `${t.id} 缺条文引文`);
    assert.equal(t.meta?.family, [...arts].sort().join('|'), `${t.id} family 必须是条文对`);
    assert.ok(String(t.meta?.source ?? '').includes('自建'), `${t.id} 溯源必须标明自建`);
  }
  // 对照维度语义：general-fallback 的答案是一般条款（577/466/472）
  const gf = tasks.filter((t) => t.condition === 'general-fallback').map((t) => t.target);
  assert.deepEqual([...gf].sort(), ['466', '472', '577', '577'], 'general-fallback 答案必须是一般条款');
  // 同条文对双向题（311/597）：善意取得与无权处分都在——要件差异翻转答案是本罐的灵魂
  const pair = tasks.filter((t) => t.meta?.family === '第三百一十一条|第五百九十七条');
  assert.equal(pair.length, 2, '311/597 条文对必须有双向两题');
  assert.ok(new Set(pair.map((t) => t.target)).size === 2, '同条文对两题答案必须不同（要件翻转）');
});
