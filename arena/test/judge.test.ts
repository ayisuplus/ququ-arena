/**
 * 裁判团契约测试：规则裁判的确定性 + llm 多裁判的均值/分歧语义
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, ruleJudge, llmJudge, rescueJudgeJson } from '../src/judge.ts';
import type { ArenaTask } from '../src/types.ts';

test('normalize：去空白、全角转半角、去首尾标点', () => {
  assert.equal(normalize(' ＡＢＣ 123 '), 'ABC123');
  assert.equal(normalize('，你好。'), '你好');
  assert.equal(normalize('a b\tc'), 'abc');
});

test('normalize：圈码/括号数字转阿拉伯（真模型按题面圈码作答的公平性）', () => {
  assert.equal(normalize('②⑤①④③'), '25143'); // 深思-V4F 事故现场：序列全对不得判错
  assert.equal(normalize('④③①⑤②'), '43152');
  assert.equal(normalize('⑩'), '10');
  assert.equal(normalize('⑴⑵'), '12');
  assert.equal(ruleJudge({ kind: 'exact' }, '②⑤①④③', '25143').score, 1);
});

test('exact 裁判：标准化后一致得 1，否则得 0 且给期望/实答备注', () => {
  const spec = { kind: 'exact' as const };
  assert.equal(ruleJudge(spec, '床前明月光。', '床前明月光').score, 1);
  const miss = ruleJudge(spec, '床前明月光', '疑是地上霜');
  assert.equal(miss.score, 0);
  assert.match(miss.note ?? '', /期望/);
});

test('exact 裁判 lenient（opt-in）：默认关闭，严格口径与既有战绩口径零变化', () => {
  // T-007 事故现场：题要求「只输出老实人」，MiMo-Flash 答「戊是老实人」→ 严格口径判错。
  // 未声明 lenient 的罐必须维持原判（不得动 75 罐既有战绩口径）。
  assert.equal(ruleJudge({ kind: 'exact' }, '戊是老实人', '老实人').score, 0);
});

test('exact 裁判 lenient：接受「答案对、只是多说了话」——T-007 真实案例修前判错→修后判对', () => {
  const spec = { kind: 'exact' as const, lenient: true };
  // §3.1 表格里的 7 条纯格式失败全部转正
  assert.equal(ruleJudge(spec, '丙是老实人', '老实人').score, 1);
  assert.equal(ruleJudge(spec, '丁 是 老实人', '老实人').score, 1); // 空格经 normalize 去除
  assert.equal(ruleJudge(spec, '丁是老实人。', '老实人').score, 1);
  assert.equal(ruleJudge(spec, '戊是老实人', '老实人').score, 1);
  assert.equal(ruleJudge(spec, '戊是老实人。', '老实人').score, 1);
  assert.equal(ruleJudge(spec, '戊 是骗子', '骗子').score, 1);
  assert.equal(ruleJudge(spec, '戊是骗子', '骗子').score, 1);
  // 其他常见冗余形态
  assert.equal(ruleJudge(spec, '答案是老实人', '老实人').score, 1);
  assert.equal(ruleJudge(spec, '所以老实人', '老实人').score, 1);
  assert.equal(ruleJudge(spec, '老实人。因为乙说真话', '老实人').score, 1); // 首句即答案
});

test('exact 裁判 lenient：宁严勿纵——否定式 / 异主语 / 疑问 / 真错仍判 0', () => {
  const spec = { kind: 'exact' as const, lenient: true };
  assert.equal(ruleJudge(spec, '戊不是老实人', '老实人').score, 0); // 前缀含否定
  assert.equal(ruleJudge(spec, '他不是老实人', '老实人').score, 0);
  assert.equal(ruleJudge(spec, '所有人都说他是老实人', '老实人').score, 0); // 前缀超长，非「薄包裹」
  assert.equal(ruleJudge(spec, '我认为戊是老实人', '老实人').score, 0); // 前缀超长
  assert.equal(ruleJudge(spec, '老实人吗？', '老实人').score, 0); // 疑问不是作答
  assert.equal(ruleJudge(spec, '老实人，但其实是骗子', '老实人').score, 0); // 后文改口
  assert.equal(ruleJudge(spec, '老实人？', '老实人').score, 0); // 疑问语气不是作答
  assert.equal(ruleJudge(spec, '老实人不是骗子', '骗子').score, 0); // 首句非目标
  assert.equal(ruleJudge(spec, '骗子', '老实人').score, 0); // 真错
  assert.equal(ruleJudge(spec, '戊', '老实人').score, 0); // 只回人名（不完整）
});

test('contains 裁判：缺关键词得 0 并列出缺失', () => {
  const spec = { kind: 'contains' as const, keywords: ['反讽', '不满'] };
  assert.equal(ruleJudge(spec, '这是反讽，表达不满', undefined).score, 1);
  const v = ruleJudge(spec, '这是反讽', undefined);
  assert.equal(v.score, 0);
  assert.match(v.note ?? '', /不满/);
});

test('regex 裁判：命中得 1，未命中得 0', () => {
  const spec = { kind: 'regex' as const, pattern: '\\d{4}' };
  assert.equal(ruleJudge(spec, '答案是 2026', undefined).score, 1);
  assert.equal(ruleJudge(spec, '没有数字', undefined).score, 0);
});

const probeTask: ArenaTask = {
  id: 't-1',
  condition: 'detect',
  input: '这句话是阴阳怪气吗？',
  target: '是反讽，表面夸赞实际嘲讽',
};

const llmSpec = { kind: 'llm' as const, rubric: '识别反讽', scale: 10 };

test('llm mock 裁判：同一裁判同一题给分恒定（可复现性契约）', async () => {
  const a = await llmJudge(llmSpec, probeTask, '这是反讽，表面夸赞实际嘲讽', ['mock:laoshi-k2']);
  const b = await llmJudge(llmSpec, probeTask, '这是反讽，表面夸赞实际嘲讽', ['mock:laoshi-k2']);
  assert.equal(a.score, b.score);
});

test('llm 双裁判：得分为两裁判均值，分歧度 = max-min', async () => {
  const v = await llmJudge(llmSpec, probeTask, '这是反讽，表面夸赞实际嘲讽', ['mock:laoshi-k2', 'mock:xueba-o9']);
  assert.ok(v.dispute !== undefined && v.dispute >= 0, '双裁判必须带分歧度');
  const va = await llmJudge(llmSpec, probeTask, '这是反讽，表面夸赞实际嘲讽', ['mock:laoshi-k2']);
  const vb = await llmJudge(llmSpec, probeTask, '这是反讽，表面夸赞实际嘲讽', ['mock:xueba-o9']);
  assert.ok(Math.abs(v.score - (va.score + vb.score) / 2) < 1e-9, '总分必须是两裁判均值');
  assert.ok(Math.abs(v.dispute! - Math.abs(va.score - vb.score)) < 1e-9, '分歧度必须是 max-min');
});

test('llm 单裁判：无分歧度字段', async () => {
  const v = await llmJudge(llmSpec, probeTask, '真诚赞美', ['mock:laoshi-k2']);
  assert.equal(v.dispute, undefined);
});

test('llm 真裁判 JSON 抢救：reason 带未转义引号不再作废整份答卷（MiMo-V2.6-Pro 实测翻车）', async () => {
  const v = await llmJudge(llmSpec, probeTask, '作答', ['custom:judge-fixture'], undefined, {
    ask: async () => ({
      text: '{"score": 8, "reason": "开头轻笑与"没用就骂"略显自贬讨好"}',
      latencyMs: 1,
    }),
  });
  assert.equal(v.score, 0.8);
  assert.match(v.note ?? '', /没用就骂/);
});

test('llm 真裁判抢救不出分数仍走失败通道（弃权 ≠ 0 分）', async () => {
  await assert.rejects(
    llmJudge(llmSpec, probeTask, '作答', ['custom:judge-fixture'], undefined, {
      ask: async () => ({ text: '{{"reason": "没给分数"}', latencyMs: 1 }),
    }),
    /JSON 解析失败/,
  );
});

test('rescueJudgeJson：按字段捞出分数与理由，无结构返回 null', () => {
  assert.deepEqual(rescueJudgeJson('{"score": 8, "reason": "好"坏"}'), { score: 8, reason: '好"坏' });
  assert.deepEqual(rescueJudgeJson('{"score": 7}'), { score: 7 });
  assert.equal(rescueJudgeJson('瞎写一通'), null);
});
