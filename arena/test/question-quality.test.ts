import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { auditQuestionBank, sequenceCandidates, scoreRules } from '../scripts/audit-question-bank.ts';
import { loadArena, validateArena, playableTasks, requirePlayableTasks } from '../src/arena-loader.ts';
import { ruleJudge } from '../src/judge.ts';
import { runBattle } from '../src/runner.ts';
import { createArenaServer } from '../src/server.ts';
import { dailyArena } from '../src/daily.ts';
import { arenaFingerprint } from '../src/fingerprint.ts';
import { renderHome } from '../src/homeHtml.ts';
import type { ArenaDef, ArenaTask, Contestant } from '../src/types.ts';

test('全库离线审查：参考答案/无效回答与独立题面求解，不使用元数据作为答案', async (t) => {
  const report = await auditQuestionBank(path.resolve('arenas'));
  assert.equal(report.banks, 75);
  assert.equal(report.tasks, 2052);
  assert.deepEqual(report.issues, []);
  assert.ok(report.solverChecked >= 494);
  assert.ok(report.ruleChecked > 1700);
  t.diagnostic(
    `${report.playable}题可用，${report.paused}题暂停；${report.ruleChecked}题规则检查，${report.solverChecked}题独立求解，${report.modelJudged}题需语义裁判。`,
  );
});

test('完整答案比较：括号不被吃掉，等价写法不等于任意子串，默认保留大小写区别', () => {
  for (const answer of ['', '()', '[]', '()[]。', ')))'])
    assert.equal(ruleJudge({ kind: 'exact' }, answer, ']))').score, 0);
  assert.equal(ruleJudge({ kind: 'exact' }, ']))', ']))').score, 1);
  assert.equal(ruleJudge({ kind: 'exact' }, '', '').score, 0);
  assert.equal(ruleJudge({ kind: 'exact' }, 'fe', 'Fe').score, 0);
  const json = { kind: 'exact' as const, ignoreCase: true, alternatives: ['JSON全称'] };
  assert.equal(ruleJudge(json, 'JavaScript Object Notation', 'JavaScript Object Notation').score, 1);
  assert.equal(ruleJudge(json, 'javascript object notation', 'JavaScript Object Notation').score, 1);
  assert.equal(ruleJudge(json, 'JSON全称', 'JavaScript Object Notation').score, 1);
  assert.equal(ruleJudge(json, '不是 JavaScript Object Notation，而是别的', 'JavaScript Object Notation').score, 0);
});

test('有限数列规则不依赖题库作者写的family；欠定阈值有具体反例', async () => {
  assert.deepEqual(sequenceCandidates([6, 8, 12, 14, 18]), [20]);
  assert.deepEqual(sequenceCandidates([5, 11, 17, 23, 29]), [35]); // 都是质数不代表下一项也是质数
  assert.deepEqual(sequenceCandidates([1, 1, 2, 3, 5]), [8]);
  const { tasks } = await loadArena(path.resolve('arenas/experience-replay'));
  // 两个阈值都解释历史，但给1200不同答案；不再复述生成器选定阈值。
  const classify = (value: number, cutoff: number) => (value < cutoff ? '一级审批' : '二级审批');
  for (const boundary of [1000, 2000]) {
    for (const [v, out] of [
      [300, '一级审批'],
      [800, '一级审批'],
      [2500, '二级审批'],
      [6000, '二级审批'],
    ] as const)
      assert.equal(classify(v, boundary), out);
  }
  assert.notEqual(classify(1200, 1000), classify(1200, 2000));
  assert.equal(tasks.find((t) => t.id === 'ER-RI-02')!.target, '信息不足');
  for (const id of ['ER-TI-01', 'ER-TI-02', 'ER-TI-03', 'ER-TI-05', 'ER-SM-02', 'ER-SM-05'])
    assert.equal(tasks.find((t) => t.id === id)!.target, '信息不足');
});

test('题目反例回归：错误方位、合法异形词、无条件未知标签与大写十六进制', async () => {
  const grid = await loadArena(path.resolve('arenas/emoji-grid'));
  const moved = grid.tasks.find((t) => t.id === 'EG-WM-05')!;
  assert.equal(scoreRules(grid.def.judge, '🥝', moved.target), 1);
  assert.equal(scoreRules(grid.def.judge, '🐳', moved.target), 0);
  const idioms = await loadArena(path.resolve('arenas/idiom-fix'));
  assert.ok(!idioms.tasks.some((t) => t.input.includes('写错了：「惹事生非」')));
  const typo = await loadArena(path.resolve('arenas/tongjia-typo'));
  assert.ok(!playableTasks(typo.def, typo.tasks).some((t) => t.input.includes('信件') && t.target === '信笺'));
  const knowledge = await loadArena(path.resolve('arenas/kb-fringe'));
  assert.ok(!playableTasks(knowledge.def, knowledge.tasks).some((t) => t.condition === 'fringe-unknown'));
  const base = await loadArena(path.resolve('arenas/base-convert'));
  assert.equal(ruleJudge(base.def.judge, 'B4', 'b4').score, 1);
});

const fixture: ArenaDef = {
  name: 'quality-fixture',
  title: '题库质量隔离测试',
  description: '',
  judge: { kind: 'exact' },
  review: { date: '2026-09-13', excluded: { bad: '题意不完整' } },
};
const fixtureTasks: ArenaTask[] = [
  { id: 'bad', condition: 'test', input: '缺条件', target: '1' },
  { id: 'good', condition: 'test', input: '2+2，只输出整数', target: '4' },
  { id: 'later', condition: 'test', input: '3+3，只输出整数', target: '6' },
];
const contestants: Contestant[] = [{ id: 'local-fixture', name: '本地测试', kind: 'mock' }];

test('先排除后limit；任务总数、模型所见题目和指纹保持一致，暂停库不发生调用', async () => {
  const asked: string[] = [];
  const result = await runBattle(fixture, fixtureTasks, contestants, {
    limit: 1,
    ask: async (_c, t) => {
      asked.push(t.id);
      return { text: '4', latencyMs: 1 };
    },
  });
  assert.deepEqual(asked, ['good']);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]!.score, 1);
  assert.equal(result.meta?.plannedTasks, 1);
  assert.equal(result.meta?.arenaFingerprint, arenaFingerprint(fixture, fixtureTasks));
  assert.notEqual(
    arenaFingerprint(fixture, fixtureTasks),
    arenaFingerprint({ ...fixture, review: undefined }, fixtureTasks),
  );
  assert.equal(
    arenaFingerprint(fixture, fixtureTasks),
    arenaFingerprint({ ...fixture, review: { date: '2026-09-14', excluded: { bad: '更新文字说明' } } }, fixtureTasks),
  );
  const blocked = { ...fixture, review: { date: '2026-09-13', blockedReason: '答案不唯一' } };
  await assert.rejects(
    runBattle(blocked, fixtureTasks, contestants, {
      ask: async () => {
        throw Error('不得到达上游');
      },
    }),
    /暂停对战.*答案不唯一/,
  );
  assert.throws(
    () =>
      requirePlayableTasks(
        { ...fixture, review: { date: '2026-09-13', excluded: { bad: '待修订', good: '待修订', later: '待修订' } } },
        fixtureTasks,
      ),
    /没有可用题目/,
  );
  assert.equal(dailyArena([{ def: blocked, tasks: fixtureTasks }]), undefined);
  assert.throws(
    () =>
      validateArena({ ...fixture, review: { date: '2026-09-13', excluded: { missing: '拼错题号' } } }, fixtureTasks),
    /无效题号/,
  );
  assert.throws(
    () =>
      validateArena({ ...fixture, judge: { kind: 'exact', alternatives: [42] as unknown as string[] } }, fixtureTasks),
    /alternatives/,
  );
});

test('暂停题库仍可查看原因，但不会出现在单场和批量选择器', () => {
  const page = renderHome({
    arenas: [
      {
        name: 'blocked',
        title: '暂停库',
        desc: '',
        taskCount: 0,
        pausedCount: 12,
        reviewNote: '缺少必要线索',
        judgeKind: 'exact',
        fingerprint: 'old',
      },
      {
        name: 'partial',
        title: '可用库',
        desc: '',
        taskCount: 2,
        pausedCount: 1,
        reviewNote: '一题已排除',
        judgeKind: 'exact',
        fingerprint: 'new',
      },
    ],
    top: [],
    results: [],
    daily: null,
    queueCard: '',
  });
  assert.ok(!page.includes('<option value="blocked"'));
  assert.match(page, /data-choose-arena="blocked"[^>]* disabled/);
  assert.ok(page.includes('13 道存在歧义或评分问题的题已暂停'));
  assert.ok(page.includes('缺少必要线索') && page.includes('2 题可用'));
});

test('HTTP预检：开赛请求拒绝暂停库，不产生比赛产物；坏包不能被审查静默漏掉', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'arena-quality-'));
  const arenasDir = path.join(root, 'arenas'),
    resultsDir = path.join(root, 'results');
  for (const name of ['blocked', 'ready']) {
    await mkdir(path.join(arenasDir, name), { recursive: true });
    await writeFile(
      path.join(arenasDir, name, 'arena.json'),
      JSON.stringify({
        ...fixture,
        name,
        ...(name === 'blocked' ? { review: { date: '2026-09-13', blockedReason: '存在两个正确答案' } } : {}),
      }),
    );
    await writeFile(path.join(arenasDir, name, 'tasks.jsonl'), fixtureTasks.map((t) => JSON.stringify(t)).join('\n'));
  }
  const server = createArenaServer({
    arenasDir,
    resultsDir,
    modelSettingsFile: path.join(root, 'empty-settings.json'),
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const route of ['/battle?arena=blocked']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 400);
      assert.match(await response.text(), /存在两个正确答案/);
    }
    const queue = (await fetch(base + '/queue/status').then((r) => r.json())) as { running: unknown; queue: unknown[] };
    assert.equal(queue.running, null);
    assert.deepEqual(queue.queue, []);
    assert.deepEqual(await readdir(resultsDir).catch(() => []), []);
    await writeFile(path.join(arenasDir, 'ready', 'arena.json'), '{invalid json');
    const audit = await auditQuestionBank(arenasDir);
    assert.ok(audit.issues.some((i) => i.bank === 'ready' && i.error.includes('JSON')));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});
