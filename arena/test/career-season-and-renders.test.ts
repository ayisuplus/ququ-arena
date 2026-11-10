/**
 * v0.3 契约测试：赛季软重置、裁判一致性、海报/总榜/论文骨架渲染
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ArenaDef, BattleResult, BoardEntry } from '../src/types.ts';
import { loadCareer, settleBattle } from '../src/career-store.ts';
import { seasonOf } from '../src/career.ts';
import { judgeAgreement } from '../src/stats.ts';
import { renderPoster } from '../src/poster.ts';
import { renderStable } from '../src/stableHtml.ts';
import { renderLatex } from '../src/export.ts';

const def: ArenaDef = {
  name: 't',
  title: '测试罐',
  description: 'd',
  judge: { kind: 'exact' },
  canary: 'ququ-arena:test',
  conditions: { c1: '维度一' },
};

function fakeBattle(at: string): { result: BattleResult; board: BoardEntry[] } {
  const mk = (model: string, avg: number): BoardEntry => ({
    model,
    name: model,
    avg,
    byCondition: { c1: avg },
    answered: 10,
    errors: 0,
    elo: Math.round(1500 + (avg - 0.5) * 400),
    avgLatencyMs: 0,
  });
  const board = [mk('a', 0.9), mk('b', 0.3)];
  const records = Array.from({ length: 10 }, (_, i) =>
    ['a', 'b'].map((m) => ({
      taskId: `t${i}`,
      condition: 'c1',
      model: m,
      prompt: '',
      answer: '',
      score: m === 'a' ? 0.9 : 0.3,
      latencyMs: 1,
    })),
  ).flat();
  return {
    result: { arena: def, startedAt: at, durationMs: 1, contestants: [], records },
    board,
  };
}

test('seasonOf：日历季度（UTC）', () => {
  assert.equal(seasonOf('2026-01-15T00:00:00Z'), '2026-Q1');
  assert.equal(seasonOf('2026-09-09T23:59:59Z'), '2026-Q3');
  assert.equal(seasonOf('2026-12-31T12:00:00Z'), '2026-Q4');
});

test('赛季软重置：跨季首战 Elo 向 1500 收 25%，同季不衰减，赛季归档落账', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'season-'));
  try {
    // Q3 打一场攒身价：elo 从 1500 涨到 1500+delta(0.9 场均 → +160)
    const q3 = fakeBattle('2026-09-10T00:00:00.000Z');
    const d1 = await settleBattle(q3.result, q3.board, dir);
    const eloQ3 = d1.find((d) => d.id === 'a')!.after;
    assert.ok(eloQ3 > 1500);
    assert.ok(!d1.find((d) => d.id === 'a')!.decayed, '首场不该衰减');

    // Q4 首战：before 应为 1500 + (eloQ3-1500)*0.75
    const q4 = fakeBattle('2026-10-01T00:00:00.000Z');
    const d2 = await settleBattle(q4.result, q4.board, dir);
    const a2 = d2.find((d) => d.id === 'a')!;
    assert.ok(a2.decayed, '跨季首战必须触发衰减');
    assert.equal(a2.before, Math.round(1500 + (eloQ3 - 1500) * 0.75));

    // 赛季归档：两个赛季各有记录，elo 为当季终值
    const book = await loadCareer(dir);
    const seasons = book.entries['a'].seasons!;
    assert.equal(seasons['2026-Q3'].battles, 1);
    assert.equal(seasons['2026-Q3'].elo, eloQ3);
    assert.equal(seasons['2026-Q4'].battles, 1);
    assert.equal(seasons['2026-Q4'].elo, a2.after);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('judgeAgreement：完全相关 r=1，完全负相关 r=-1，少于 3 对不给数', () => {
  const votes = (pairs: [number, number][]) => pairs.map(([x, y]) => ({ votes: [x, y] }));
  const pos = judgeAgreement(
    votes([
      [0.1, 0.2],
      [0.5, 0.6],
      [0.9, 1.0],
    ]),
  )!;
  assert.equal(pos.pearson, 1);
  const neg = judgeAgreement(
    votes([
      [0.1, 1.0],
      [0.5, 0.6],
      [0.9, 0.2],
    ]),
  )!;
  assert.equal(neg.pearson, -1);
  assert.equal(
    judgeAgreement(
      votes([
        [0.5, 0.6],
        [0.7, 0.8],
      ]),
    ),
    undefined,
  );
  // 平均分歧 = |x-y| 均值
  const d = judgeAgreement(
    votes([
      [0.0, 0.3],
      [0.5, 0.6],
      [1.0, 1.0],
    ]),
  )!;
  assert.ok(Math.abs(d.meanDispute - 0.133) < 0.001);
});

test('海报：冠军特写 + 显著性徽章 + 指纹页脚', () => {
  const { result } = fakeBattle('2026-09-10T00:00:00.000Z');
  result.contestants = [
    { id: 'a', name: '甲', kind: 'mock' },
    { id: 'b', name: '乙', kind: 'mock' },
  ];
  result.meta = { arenaFingerprint: 'fpabc', judgeModels: ['mock:j'], toolVersion: '0.3.0' };
  const html = renderPoster(result);
  for (const needle of ['甲', '90.0%', 'fpabc', '优势统计显著']) {
    assert.ok(html.includes(needle), `海报缺少 ${needle}`);
  }
  // 团灭局单独验证名场面板块（本场 a=0.9 无团灭题，不该出现）
  assert.ok(!html.includes('名场面'), '无团灭题时不该有名场面板块');
  const bath = fakeBattle('2026-09-10T00:00:00.000Z');
  bath.result.contestants = result.contestants;
  bath.result.records.forEach((r) => (r.score = 0)); // 全员翻车
  assert.ok(renderPoster(bath.result).includes('名场面'), '团灭局海报必须有名场面');
});

test('蛐蛐棚页：段位/赛季归档/成就图标齐全', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'stable-'));
  try {
    const q3 = fakeBattle('2026-09-10T00:00:00.000Z');
    await settleBattle(q3.result, q3.board, dir);
    const book = await loadCareer(dir);
    const html = renderStable(book, new Date('2026-09-10T12:00:00Z'));
    for (const needle of ['生涯总榜', '2026-Q3', '赛季归档', 'a</div>', '骁骑']) {
      assert.ok(html.includes(needle), `总榜页缺少 ${needle}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('论文骨架：数据可证部分已填，留白部分显式标注', () => {
  const { result } = fakeBattle('2026-09-10T00:00:00.000Z');
  result.contestants = [
    { id: 'a', name: '甲', kind: 'mock' },
    { id: 'b', name: '乙', kind: 'mock' },
  ];
  result.meta = { arenaFingerprint: 'fptex', judgeModels: ['mock:j'], toolVersion: '0.3.0' };
  const { main, bib } = renderLatex(result);
  for (const needle of [
    '\\section{实验设置}',
    '\\section{实验结果}',
    '\\section{失败案例分析}',
    '\\section{可复现性声明}',
    'fptex',
    'ququ-arena:test',
    '90.0\\%',
    '【留白',
  ]) {
    assert.ok(main.includes(needle), `骨架缺少 ${needle}`);
  }
  assert.ok(bib.includes('fptex') && bib.includes('@misc'), 'refs.bib 缺指纹条目');
});
