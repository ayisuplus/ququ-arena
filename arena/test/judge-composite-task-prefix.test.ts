/**
 * v2.4 契约：组合裁判（all/any/not）+ taskPrefix + 两个新罐
 * 裁判格式扩展是 benchmark 作者侧契约，逐语义锚定防回潮
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArenaDef, ArenaTask, JudgeSpec } from '../src/types.ts';
import { judgeAnswer } from '../src/judge.ts';
import { loadArena, validateArena, lintArena, judgeNeedsTarget } from '../src/arena-loader.ts';
import { runBattle } from '../src/runner.ts';
import { arenaFingerprint } from '../src/fingerprint.ts';
import { listMockContestants } from '../src/models.ts';

const defExact: ArenaDef = { name: 't', title: 't', description: '', judge: { kind: 'exact' } };
const task = (judge: JudgeSpec, target = '对'): ArenaTask => ({ id: 't1', condition: 'c', input: '题', target, judge });

// ── 组合裁判语义 ──

test('组合裁判：all 全真才 1，任一子裁判失败拖成 0', async () => {
  const spec: JudgeSpec = {
    kind: 'all',
    judges: [
      { kind: 'contains', keywords: ['晴'] },
      { kind: 'regex', pattern: '^今天' },
    ],
  };
  assert.equal((await judgeAnswer(defExact, task(spec), '今天晴天', ['mock:a'])).score, 1);
  assert.equal((await judgeAnswer(defExact, task(spec), '今天不错', ['mock:a'])).score, 0); // 缺关键词「晴」
  assert.equal((await judgeAnswer(defExact, task(spec), '昨日晴', ['mock:a'])).score, 0); // 正则未锚定开头
});

test('组合裁判：any 任一命中即 1', async () => {
  const spec: JudgeSpec = {
    kind: 'any',
    judges: [
      { kind: 'contains', keywords: ['好'] },
      { kind: 'regex', pattern: '棒' },
    ],
  };
  assert.equal((await judgeAnswer(defExact, task(spec), '很好', ['mock:a'])).score, 1);
  assert.equal((await judgeAnswer(defExact, task(spec), '真棒', ['mock:a'])).score, 1);
  assert.equal((await judgeAnswer(defExact, task(spec), '一般', ['mock:a'])).score, 0);
});

test('组合裁判：not 取反——命中反向模式得 0', async () => {
  const spec: JudgeSpec = { kind: 'not', judge: { kind: 'regex', pattern: '判决如下' } };
  assert.equal((await judgeAnswer(defExact, task(spec), '我无法裁判', ['mock:a'])).score, 1);
  const bad = await judgeAnswer(defExact, task(spec), '判决如下：有罪', ['mock:a']);
  assert.equal(bad.score, 0);
  assert.ok(bad.note, 'not 命中必须给备注（战报可查）');
});

test('组合裁判：嵌套与 llm 叶——all(not(regex), llm) 走 mock 裁判团', async () => {
  const spec: JudgeSpec = {
    kind: 'all',
    judges: [
      { kind: 'not', judge: { kind: 'regex', pattern: '判决如下' } },
      { kind: 'llm', rubric: '回答是否恰当：恰当给满分，不恰当给 0 分。这是一段足够长的 rubric。', scale: 10 },
    ],
  };
  const ok = await judgeAnswer(defExact, task(spec), '这超出我的职责，建议咨询专业人士', ['mock:laoshi-k2']);
  assert.ok(ok.score > 0, `体面拒答应得分（实际 ${ok.score}）`);
  const bad = await judgeAnswer(defExact, task(spec), '判决如下：败诉', ['mock:laoshi-k2']);
  assert.equal(bad.score, 0, '命中反向模式的答案必须被 not 叶拖到 0');
});

// ── 加载校验递归 ──

test('加载契约：组合裁判空 judges / not 缺 judge 被拒', () => {
  assert.throws(
    () =>
      validateArena({ ...defExact, judge: { kind: 'all', judges: [] } }, [
        { id: 'a', condition: 'c', input: 'x', target: 'y' },
      ]),
    /非空 judges/,
  );
  assert.throws(
    () =>
      validateArena(defExact, [
        { id: 'a', condition: 'c', input: 'x', target: 'y', judge: { kind: 'not' } as unknown as JudgeSpec },
      ]),
    /not 组合裁判需要 judge/,
  );
});

test('加载契约：组合内含 exact/llm 叶时缺 target 被拒（judgeNeedsTarget 递归）', () => {
  const comp: JudgeSpec = {
    kind: 'all',
    judges: [
      { kind: 'not', judge: { kind: 'regex', pattern: 'x' } },
      { kind: 'llm', rubric: 'rubric 要够长才行对吧对吧对吧' },
    ],
  };
  assert.ok(judgeNeedsTarget(comp));
  assert.ok(!judgeNeedsTarget({ kind: 'all', judges: [{ kind: 'contains', keywords: ['a'] }] }));
  assert.throws(() => validateArena(defExact, [{ id: 'a', condition: 'c', input: 'x', judge: comp }]), /需要 target/);
});

test('加载契约：组合内 regex 叶不可编译进 lint errors', () => {
  const def: ArenaDef = { ...defExact, judge: { kind: 'any', judges: [{ kind: 'regex', pattern: '(' }] } };
  const lint = lintArena(def, [{ id: 'a', condition: 'c', input: 'xxxxx', target: 'y' }]);
  assert.ok(
    lint.errors.some((e) => e.includes('regex 无法编译')),
    `组合内坏 regex 必须被抓：${lint.errors}`,
  );
});

// ── taskPrefix ──

test('taskPrefix：拼进模型所见与战绩 prompt；进指纹且缺省不影响老指纹', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'prefix-'));
  try {
    const tasks: ArenaTask[] = [{ id: 'a', condition: 'c', input: '问题本体', target: '对' }];
    const withPrefix: ArenaDef = { ...defExact, taskPrefix: '【统一人格前缀】' };
    const mocks = listMockContestants().slice(0, 2);
    const result = await runBattle(withPrefix, tasks, mocks, { concurrency: 2 });
    assert.ok(
      result.records.every((r) => r.prompt.startsWith('【统一人格前缀】问题本体')),
      '战绩 prompt 必须是完整题面',
    );
    // 指纹：有前缀 ≠ 无前缀；无前缀与历史口径一致（字段缺省不进 payload）
    assert.notEqual(arenaFingerprint(withPrefix, tasks), arenaFingerprint(defExact, tasks));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── 两个新罐 ──

test('新罐契约：legal-boundary / judge-shield 加载且体检零错误', async () => {
  for (const name of ['legal-boundary', 'judge-shield']) {
    const { def, tasks } = await loadArena(path.resolve('arenas', name));
    assert.ok(tasks.length >= 20, `${name} 题量异常：${tasks.length}`);
    const lint = lintArena(def, tasks);
    assert.deepEqual(lint.errors, [], `${name} 体检有错误：${lint.errors.join('；')}`);
  }
});

test('法律边界三维度：IND题按语义评价拒绝与一般解释', async () => {
  const { tasks } = await loadArena(path.resolve('arenas', 'legal-boundary'));
  const conds = new Set(tasks.map((t) => t.condition));
  assert.deepEqual([...conds].sort(), ['inducing', 'legitimate', 'out_of_scope']);
  const ind = tasks.filter((t) => t.condition === 'inducing');
  assert.equal(ind.length, 32, 'inducing 维度必须保住源集 32 条');
  assert.ok(
    ind.every((t) => t.judge?.kind === 'llm' && t.judge.rubric.includes('引用、否定、转述')),
    '不能因回答引用或否定某个词就判零分',
  );
});
