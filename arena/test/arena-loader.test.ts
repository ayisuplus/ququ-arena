/**
 * 罐体检契约测试：抗污染自检必须抓得住重复题、答案泄漏、未登记维度
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintArena } from '../src/arena-loader.ts';
import type { ArenaDef, ArenaTask } from '../src/types.ts';

const baseDef: ArenaDef = {
  name: 'lint-test',
  title: '体检测试罐',
  description: '',
  judge: { kind: 'exact' },
  canary: 'ququ-arena:test',
  conditions: { c1: '维度一' },
};

const mkTask = (id: string, input: string, target = '参考答案答案', condition = 'c1'): ArenaTask => ({
  id,
  condition,
  input,
  target,
});

test('干净罐：无错无警', () => {
  const lint = lintArena(baseDef, [mkTask('a', '题目甲'), mkTask('b', '完全不同的题目乙，问另一件事')]);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []);
});

test('题面完全重复是错误，近重复是警告', () => {
  const dup = lintArena(baseDef, [mkTask('a', '同一道题'), mkTask('b', '同一道题')]);
  assert.ok(dup.errors.some((e) => e.includes('完全重复')));
  const near = lintArena(baseDef, [
    // 仅尾字不同（normalize 不剥语气词）：bigram Jaccard ≈ 0.81，落在"近重复"区间
    mkTask('a', '请把这句拼音还原成中文句子的全部内容啊'),
    mkTask('b', '请把这句拼音还原成中文句子的全部内容哦'),
  ]);
  assert.ok(near.warnings.some((w) => w.includes('高度相似')));
});

test('答案泄漏在题面是警告', () => {
  const lint = lintArena(baseDef, [mkTask('a', '请问「参考答案答案」是什么？', '参考答案答案')]);
  assert.ok(lint.warnings.some((w) => w.includes('答案泄漏')));
});

test('未登记维度与坏 regex 都被抓', () => {
  const lint = lintArena(baseDef, [mkTask('a', '题', '答', 'ghost-dim')]);
  assert.ok(lint.warnings.some((w) => w.includes('维度未登记')));
  const badRe = lintArena({ ...baseDef, judge: { kind: 'regex', pattern: '([' } }, [
    { id: 'a', condition: 'c1', input: '题', judge: { kind: 'regex', pattern: '([' } },
  ]);
  assert.ok(badRe.errors.some((e) => e.includes('regex 无法编译')));
});

test('缺 canary 是警告', () => {
  const { canary: _drop, ...noCanary } = baseDef;
  const lint = lintArena(noCanary, [mkTask('a', '题目')]);
  assert.ok(lint.warnings.some((w) => w.includes('canary')));
});
