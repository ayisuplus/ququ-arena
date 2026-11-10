/**
 * 解说与战报契约测试：统计化解说触发条件、战报必须披露的可复现要素
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArenaDef, BattleResult } from '../src/types.ts';
import { buildLeaderboard } from '../src/leaderboard.ts';
import { commentate } from '../src/commentary.ts';
import { renderReport, renderMarkdown, writeReport } from '../src/report.ts';

const def: ArenaDef = {
  name: 't',
  title: '测试罐',
  description: 'd',
  judge: { kind: 'exact' },
  canary: 'ququ-arena:test-canary',
  conditions: { c1: '维度一' },
};

/** 构造 12 题比赛：scores 为每只蛐蛐的逐题得分 */
function battleOf(scoresBy: Record<string, number[]>, disputes = false): BattleResult {
  const models = Object.keys(scoresBy);
  const records = models.flatMap((model) =>
    scoresBy[model].map((score, i) => ({
      taskId: `t${i}`,
      condition: 'c1',
      model,
      prompt: `第${i}题`,
      answer: '',
      score,
      latencyMs: 1,
      ...(disputes ? { dispute: 0.5 } : {}),
    })),
  );
  return {
    arena: def,
    startedAt: '2026-09-10T00:00:00.000Z',
    durationMs: 1,
    contestants: models.map((id) => ({ id, name: id, kind: 'mock' as const })),
    records,
    meta: { arenaFingerprint: 'fp123', judgeModels: ['mock:judge'], toolVersion: '0.2.0' },
  };
}

const flat = (v: number, n = 12) => Array.from({ length: n }, () => v);

test('解说：分差在噪声内时喊神仙打架，且引用 CI', () => {
  // 交替胜负：均值差为 0，任何合理统计都应判"噪声内"
  const result = battleOf({ a: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], b: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1] });
  const lines = commentate(result, buildLeaderboard(result), new Map());
  assert.ok(
    lines.some((l) => l.includes('神仙打架') && l.includes('CI')),
    `实际解说：${lines}`,
  );
});

test('解说：碾压局喊屠杀，分差显著时不喊神仙打架', () => {
  const result = battleOf({ a: flat(1), b: flat(0) });
  const lines = commentate(result, buildLeaderboard(result), new Map());
  assert.ok(
    lines.some((l) => l.includes('屠杀局')),
    `实际解说：${lines}`,
  );
  assert.ok(!lines.some((l) => l.includes('神仙打架')), `全胜对全负不该喊神仙打架：${lines}`);
});

test('解说：双裁判高分歧题触发裁判吵架播报', () => {
  const result = battleOf({ a: flat(0.8), b: flat(0.6) }, true);
  const lines = commentate(result, buildLeaderboard(result), new Map());
  assert.ok(
    lines.some((l) => l.includes('裁判吵架')),
    `实际解说：${lines}`,
  );
});

test('解说：爆冷判定基于赛前身价', () => {
  const result = battleOf({ a: flat(0), b: flat(1), c: flat(0.5) });
  const pre = new Map([
    ['a', 2000], // 最大热门垫底
    ['b', 1400],
    ['c', 1500],
  ]);
  const lines = commentate(result, buildLeaderboard(result), pre);
  // 措辞轮换：大爆冷/大冷门 都算触发（契约是判定，不是文案）
  assert.ok(
    lines.some((l) => /大爆冷|大冷门/.test(l)),
    `实际解说：${lines}`,
  );
});

test('战报：必须披露指纹/裁判/版本/canary，且含 CI 与胜率矩阵', () => {
  const result = battleOf({ a: flat(0.9), b: flat(0.5) });
  const html = renderReport(result);
  for (const needle of ['fp123', 'mock:judge', '0.2.0', 'ququ-arena:test-canary', '95% CI', '胜率矩阵', '维度对决']) {
    assert.ok(html.includes(needle), `战报缺少 ${needle}`);
  }
});

test('writeReport：同场产出 HTML + JSON + Markdown 三件套', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'report-'));
  try {
    const result = battleOf({ a: flat(0.9), b: flat(0.5) });
    await writeReport(result, dir, { commentary: ['测试解说'] });
    const files = await readdir(dir);
    assert.ok(
      files.some((f) => f.endsWith('.html')),
      '缺 HTML 战报',
    );
    assert.ok(
      files.some((f) => f.endsWith('.json')),
      '缺战绩 JSON',
    );
    assert.ok(
      files.some((f) => f.endsWith('.md')),
      '缺 Markdown 摘要',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Markdown 摘要：含榜单表与解说，可直接粘贴', () => {
  const result = battleOf({ a: flat(0.9), b: flat(0.5) });
  const md = renderMarkdown(result, { commentary: ['测试解说'] });
  assert.match(md, /\| 名次 \| 蛐蛐 \| 总分 \|/);
  assert.ok(md.includes('测试解说'));
  assert.ok(md.includes('fp123'));
});
