import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { validateArena, loadArena } from '../src/arena-loader.ts';
import { QuestionBankStore } from '../src/question-bank-store.ts';
import { runBattle } from '../src/runner.ts';
import { BattleControl } from '../src/battle-control.ts';
import { defaultRubric } from '../src/task-mode.ts';
import {
  gradingPrompt,
  parseGrade,
  createTaskGrader,
  gradeRecord,
  GRADING_INSTRUCTIONS,
  type TaskGrader,
} from '../src/task-grading.ts';
import { retryGrading } from '../src/grading-retry.ts';
import { sumRoundUsage } from '../src/task-runner.ts';
import { saveBattle, loadBattle } from '../src/results-store.ts';
import { settleBattle, loadCareer } from '../src/career-store.ts';
import { buildLeaderboard } from '../src/leaderboard.ts';
import { buildSettlement } from '../src/scoring-summary.ts';
import { LiveState } from '../src/live-state.ts';
import { arenaFingerprint } from '../src/fingerprint.ts';
import { seedBanks } from '../scripts/seed-task-tracks.ts';
import { emptyModelSettings } from '../src/model-settings.ts';
import type { ArenaDef, ArenaTask, BattleRecord, Contestant, RubricGrade } from '../src/types.ts';

const def: ArenaDef = {
  name: 'test-multi',
  title: '跨轮任务',
  description: '',
  mode: 'multi_turn',
  judge: defaultRubric('multi_turn'),
};
const task: ArenaTask = {
  id: 'T1',
  condition: 'change',
  input: '合成材料：人数80；不得联网。',
  rounds: [
    { id: 'r1', title: '初版', input: '计算80份物料。' },
    { id: 'r2', title: '变更', input: '人数改90，其余要求保持。' },
    { id: 'r3', title: '交付', input: '给出最终核对。' },
  ],
};
const contestants: Contestant[] = ['a', 'b'].map((id) => ({
  id: `custom:${id}`,
  name: `身份不进入裁判-${id}`,
  kind: 'pi',
}));
function good(record: BattleRecord): RubricGrade {
  const spec = record.taskSnapshot!.judge;
  assert.equal(spec?.kind, 'rubric');
  if (spec?.kind !== 'rubric') throw new Error();
  return parseGrade(
    JSON.stringify({
      dimensions: spec.dimensions.map((d) => ({
        id: d.id,
        score: 8,
        reason: '依据材料核对完整',
        evidence: [{ roundId: record.rounds![0]!.roundId, quote: record.rounds![0]!.answer }],
      })),
    }),
    record,
  );
}
const ask = async () => ({
  text: '人数已经核对',
  reasoning: '公开摘要',
  latencyMs: 5,
  usage: { input: 10, output: 5, cachedInput: 2 },
});
const run = (extra: Parameters<typeof runBattle>[3] = {}) =>
  runBattle(def, [task], contestants, {
    ask,
    grader: async (r) => good(r),
    matchJudge: { kind: 'agent', agent: 'codex' },
    ...extra,
  });
const temporary = async (t: test.TestContext) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-task-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
};

test('native checkpoint resumes only unfinished rounds and retains grading and withdrawals', async () => {
  const control = new BattleControl();
  let calls = 0,
    grades = 0;
  let saved: BattleRecord | undefined;
  const single = [contestants[0]!];
  await runBattle(def, [task], single, {
    control,
    ask: async () => {
      calls++;
      return ask();
    },
    grader: async (r) => {
      grades++;
      return good(r);
    },
    onCheckpoint: (record) => {
      saved = structuredClone(record);
      control.stop();
    },
  });
  assert.equal(calls, 1);
  assert.equal(grades, 0);
  assert.equal(saved?.rounds?.length, 1);
  const finished = await runBattle(def, [task], single, {
    resumeRecords: [saved!],
    ask: async (_c, _t, _k, options) => {
      assert.ok(options!.history!.length >= 2);
      calls++;
      return ask();
    },
    grader: async (r) => {
      grades++;
      return good(r);
    },
  });
  assert.equal(calls, 3);
  assert.equal(grades, 1);
  assert.equal(finished.records[0]!.rounds!.length, 3);
  const again = await runBattle(def, [task], single, {
    resumeRecords: finished.records,
    completedRecords: [JSON.stringify([task.id, single[0]!.id])],
    ask: async () => {
      throw Error('already answered');
    },
    grader: async () => {
      throw Error('already graded');
    },
  });
  assert.deepEqual(again.records, finished.records);
  const withdrawn = {
    ...finished.records[0]!,
    withdrawal: {
      modelId: single[0]!.id,
      taskId: task.id,
      reason: 'failures' as const,
      message: 'fixture withdrawal',
      failures: 3,
      at: 123,
    },
  };
  const restored = await runBattle(def, [task, { ...task, id: 'T2' }], single, {
    resumeRecords: [withdrawn],
    completedRecords: [JSON.stringify([task.id, single[0]!.id])],
    ask: async () => {
      throw Error('withdrawn contestant must not be called');
    },
  });
  assert.deepEqual(restored.records, [withdrawn]);
  assert.deepEqual(restored.withdrawals, [withdrawn.withdrawal]);
});

test('赛制校验：旧题不变，开放答案可省略，多轮2–5轮、维度权重必须完整', () => {
  validateArena(def, [task]);
  validateArena({ ...def, mode: 'open' }, [{ ...task, rounds: undefined }]);
  assert.throws(
    () => validateArena({ ...def, mode: undefined, judge: { kind: 'exact' } }, [{ ...task, rounds: undefined }]),
    /target/,
  );
  for (const n of [0, 1, 6])
    assert.throws(
      () =>
        validateArena(def, [
          { ...task, rounds: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, title: '轮次', input: '要求' })) },
        ]),
      /2–5/,
    );
  assert.throws(() => validateArena(def, [{ ...task, rounds: [task.rounds![0]!, task.rounds![0]!] }]), /重复/);
  const broken = structuredClone(def);
  if (broken.judge.kind === 'rubric') broken.judge.dimensions[0]!.weight--;
  assert.throws(() => validateArena(broken, [task]), /100%/);
  assert.throws(() => validateArena({ ...def, judge: { kind: 'llm', rubric: '随便' } }, [task]), /多维/);
  assert.throws(() => validateArena({ ...def, judge: { kind: 'exact' } }, [{ ...task, judge: def.judge }]), /多维/);
  assert.throws(() => validateArena({ ...def, mode: 'qa' }, [{ ...task, rounds: undefined }]), /需要选择/);
  assert.throws(
    () =>
      validateArena({ ...def, mode: 'qa', judge: { kind: 'exact' } }, [
        { ...task, rounds: undefined, judge: { kind: 'not', judge: def.judge } },
      ]),
    /需要选择/,
  );
});

test('指纹覆盖赛道、轮次材料和顺序；显式qa不改变旧指纹', () => {
  const fp = arenaFingerprint(def, [task]);
  const changed = structuredClone(task);
  changed.rounds!.reverse();
  assert.notEqual(arenaFingerprint(def, [changed]), fp);
  changed.rounds![0]!.input += '新增';
  assert.notEqual(arenaFingerprint(def, [changed]), fp);
  assert.notEqual(arenaFingerprint({ ...def, mode: 'open' }, [task]), fp);
  assert.equal(arenaFingerprint({ ...def, mode: undefined }, [task]), arenaFingerprint({ ...def, mode: 'qa' }, [task]));
});

test('跨轮历史、轮次屏障与上下文隔离：不丢材料、不传裁判、不重复追加', async () => {
  const calls: { model: string; task: string; input: string; history: { role: string; content: string }[] }[] = [];
  const finished = new Set<string>();
  const tasks = [task, { ...task, id: 'T2' }];
  const result = await runBattle(def, tasks, contestants, {
    concurrency: 2,
    grader: async (r) => good(r),
    ask: async (c, q, _kind, options) => {
      const history = structuredClone(options?.history ?? []),
        round = history.length / 2;
      if (round > 0) for (const model of contestants) assert.ok(finished.has(`${q.id}:${round - 1}:${model.id}`));
      calls.push({ model: c.id, task: q.id, input: q.input, history });
      await wait(c.id.endsWith('a') ? 2 : 8);
      finished.add(`${q.id}:${round}:${c.id}`);
      return {
        text: `${c.id}的第${round + 1}轮公开答卷`,
        reasoning: '不放入对话的摘要',
        latencyMs: 8,
        usage: { input: 10, output: 5, cachedInput: 2 },
      };
    },
  });
  assert.equal(result.records.length, 4);
  assert.equal(calls.length, 12);
  for (const c of calls) {
    assert.equal(c.history.length % 2, 0);
    if (c.history.length) assert.match(c.history[0]!.content, /人数80/);
    for (const h of c.history.filter((h) => h.role === 'assistant')) {
      assert.ok(h.content.startsWith(c.model));
      assert.doesNotMatch(h.content, /评分|摘要/);
    }
    if (c.history.length === 4) assert.match(c.history[2]!.content, /人数改90/);
  }
  for (const r of result.records) {
    assert.equal(r.rounds?.length, 3);
    assert.equal(r.usage?.input, 30);
    assert.equal(r.usage?.output, 15);
    assert.equal(
      r.solveMs,
      r.rounds!.reduce((n, s) => n + s.solveMs, 0),
    );
    assert.ok(r.solveMs! >= 24);
    assert.equal(r.gradingStatus, 'graded');
  }
  assert.equal(result.meta?.plannedTasks, 2);
  assert.equal(buildLeaderboard(result)[0]!.answered, 2);
});

test('暂停在轮间生效，恢复后继续；停止保留已完成轮次并取消在途请求', async () => {
  const control = new BattleControl();
  let calls = 0;
  const battle = run({
    control,
    onStage: (_t, index) => {
      if (index === 0) control.pause();
    },
    ask: async () => {
      calls++;
      return ask();
    },
  });
  await wait(30);
  assert.equal(calls, 2);
  control.resume();
  assert.equal((await battle).records[0]!.rounds?.length, 3);
  const stop = new BattleControl();
  let aborted = 0;
  const stopped = await run({
    control: stop,
    ask: async (_c, _t, _k, opts) => {
      if (!opts?.history?.length) return ask();
      opts.signal!.addEventListener('abort', () => aborted++);
      setTimeout(() => stop.stop(), 5);
      return new Promise(() => {});
    },
  });
  assert.equal(stopped.status, 'stopped');
  assert.equal(aborted, 2);
  assert.ok(stopped.records.every((r) => r.rounds?.[0]?.answer === '人数已经核对'));
  assert.ok(stopped.records.every((r) => !r.grade));
});

test('单轮与累计时限独立；排队和裁判耗时不消耗任务预算', async () => {
  const timeout = await run({ timeoutMs: 10, ask: async () => new Promise(() => {}) });
  assert.ok(timeout.withdrawals!.every((w) => w.reason === 'timeout'));
  const cumulative = await run({ timeoutMs: 100, taskBudgetMs: 6 });
  assert.ok(cumulative.records.every((r) => r.rounds!.length <= 2 && r.error));
  const waiting = await run({
    taskBudgetMs: 18,
    concurrency: 1,
    grader: async (r) => {
      await wait(30);
      return good(r);
    },
  });
  assert.ok(waiting.records.every((r) => r.gradingStatus === 'graded' && r.solveMs! >= 15));
  assert.equal(waiting.meta?.execution?.timeoutMs, 180000);
});

test('累计三次调用失败退赛；上下文超限明确报错，失败历史不传到下一轮', async () => {
  let calls = 0;
  const failed = await runBattle(
    def,
    [
      { ...task, id: 'a' },
      { ...task, id: 'b' },
      { ...task, id: 'c' },
      { ...task, id: 'd' },
    ],
    [contestants[0]!],
    {
      retries: 0,
      grader: async (r) => good(r),
      ask: async () => {
        calls++;
        throw new Error('context_length_exceeded：完整材料超过接口上下文容量');
      },
    },
  );
  assert.equal(calls, 3);
  assert.equal(failed.withdrawals![0]!.reason, 'failures');
  assert.match(failed.records[0]!.rounds![0]!.error!, /context_length_exceeded/);
});

test('未知用量不变成零缓存；多轮汇总保留已知用量并标为不完整', async () => {
  const result = await run();
  const rounds = structuredClone(result.records[0]!.rounds!);
  delete rounds[1]!.usage!.cachedInput;
  assert.equal(sumRoundUsage(rounds)?.cachedInput, undefined);
  delete rounds[1]!.usage;
  assert.equal(sumRoundUsage(rounds)?.input, 20);
});

test('裁判上下文只包含冻结要求、匿名公开答案和维度，无解说追问及其他成绩', async () => {
  const result = await run();
  const record = result.records[0]!;
  record.model = '秘密模型身份';
  record.note = '用户追问秘密';
  record.reasoning = '解说聊天秘密';
  const prompt = gradingPrompt(record);
  assert.doesNotMatch(prompt, /秘密模型身份|用户追问秘密|解说聊天秘密|身份不进入裁判/);
  assert.match(prompt, /人数80/);
  assert.match(prompt, /人数改90/);
  assert.match(prompt, /最终核对/);
  assert.match(prompt, /不调用工具/);
  assert.ok(!GRADING_INSTRUCTIONS.includes('100–200'));
});

test('评分校验拒绝缺项、越界、字符串分数、重复ID、错误轮次和伪造引用', async () => {
  const record = (await run()).records[0]!;
  const base = good(record);
  for (const mutate of [
    (g: RubricGrade) => g.dimensions.pop(),
    (g: RubricGrade) => (g.dimensions[0]!.score = 11),
    (g: RubricGrade) => (g.dimensions[0]!.score = -1),
    (g: RubricGrade) => ((g.dimensions[0] as any).score = '8'),
    (g: RubricGrade) => (g.dimensions[1]!.id = g.dimensions[0]!.id),
    (g: RubricGrade) => (g.dimensions[0]!.evidence[0]!.roundId = '不存在'),
    (g: RubricGrade) => (g.dimensions[0]!.evidence[0]!.quote = '伪造原文'),
    (g: RubricGrade) => (g.dimensions[0]!.evidence = []),
  ]) {
    const bad = structuredClone(base);
    mutate(bad);
    assert.throws(() => parseGrade(JSON.stringify(bad), record));
  }
  assert.throws(() => parseGrade('这是坏格式', record), /JSON/);
  const overridden = { ...base, score: 1000 };
  assert.equal(parseGrade(JSON.stringify(overridden), record).score, base.score);
});

test('同一Agent每份答卷与每次重试使用新的独立会话，完成后关闭', async () => {
  const record = (await run()).records[0]!;
  const paths = new Set<string>();
  let closed = 0;
  const grader = createTaskGrader(
    { kind: 'agent', agent: 'codex' },
    {
      cwd: os.tmpdir(),
      sessionFactory: (_judge, cwd) => {
        assert.ok(!paths.has(cwd));
        paths.add(cwd);
        return {
          send: async (prompt, emit) => {
            assert.match(prompt, /匿名答卷/);
            emit({ type: 'text', text: JSON.stringify(good(record)) });
          },
          cancel() {},
          close() {
            closed++;
          },
        };
      },
    },
  );
  await grader(record);
  await grader(record);
  assert.equal(paths.size, 2);
  assert.equal(closed, 2);
});

test('冻结API裁判身份：补评前更换地址或模型会被拒绝，不向替换后的接口发送答卷', async () => {
  const record = (await run()).records[0]!,
    settings = emptyModelSettings();
  const model = {
    id: 'custom:judge',
    name: '裁判',
    modelId: 'frozen-judge',
    baseUrl: 'http://127.0.0.1:1/v1',
    apiKey: 'fixture',
    stream: false,
  };
  settings.custom.push(model);
  let calls = 0;
  const grader = createTaskGrader(
    { kind: 'api', model: model.id, connection: { baseUrl: model.baseUrl, modelId: model.modelId } },
    {
      cwd: os.tmpdir(),
      modelSettings: settings,
      ask: async () => {
        calls++;
        return { text: JSON.stringify(good(record)), latencyMs: 1 };
      },
    },
  );
  await grader(record);
  model.baseUrl = 'http://127.0.0.1:2/v1';
  await assert.rejects(() => grader(record), /本场不会自动更换裁判/);
  model.baseUrl = 'http://127.0.0.1:1/v1';
  model.modelId = 'another-judge';
  await assert.rejects(() => grader(record), /本场不会自动更换裁判/);
  assert.equal(calls, 1);
});

test('裁判超时和晚到结果不能追加有效评分；失败不会记为选手调用失败', async () => {
  const record = (await run()).records[0]!;
  delete record.grade;
  let resolve: (grade: RubricGrade) => void = () => {};
  await gradeRecord(
    record,
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    undefined,
    5,
  );
  const snapshot = JSON.stringify(record);
  resolve(good(record));
  await wait(5);
  assert.equal(JSON.stringify(record), snapshot);
  assert.equal(record.gradingStatus, 'pending');
  const result = await run({
    grader: async () => {
      throw new Error('裁判掉线');
    },
  });
  assert.equal(result.withdrawals?.length, 0);
  assert.equal(result.status, 'pending_grading');
  const settlement = buildSettlement(result, buildLeaderboard(result));
  assert.equal(settlement.leaderIds.length, 0);
  assert.equal(settlement.career, 'unchanged');
});

test('仅重试失败答卷，沿用冻结标准；并发重试和重复结算不重复入账', async (t) => {
  const dir = await temporary(t);
  let initial = 0;
  const result = await run({
    grader: async (r) => {
      if (++initial === 2) throw new Error('掉线');
      return good(r);
    },
  });
  const file = path.basename(await saveBattle(result, dir));
  await settleBattle(result, buildLeaderboard(result), dir);
  assert.deepEqual((await loadCareer(dir, 'multi_turn')).entries, {});
  let retried = 0;
  const opts = {
    cwd: dir,
    grader: async (r: BattleRecord) => {
      retried++;
      assert.match(r.taskSnapshot!.input, /人数80/);
      await wait(10);
      return good(r);
    },
  };
  await Promise.all([retryGrading(dir, file, opts), retryGrading(dir, file, opts)]);
  assert.equal(retried, 1);
  const stored = await loadBattle(path.join(dir, file));
  assert.equal(stored.status, 'completed');
  await Promise.all([
    settleBattle(stored, buildLeaderboard(stored), dir),
    settleBattle(stored, buildLeaderboard(stored), dir),
  ]);
  const book = await loadCareer(dir, 'multi_turn');
  assert.ok(Object.values(book.entries).every((e) => e.battles === 1));
  assert.deepEqual((await loadCareer(dir)).entries, {});
  assert.deepEqual((await loadCareer(dir, 'open')).entries, {});
  await retryGrading(dir, file, opts);
  assert.equal(retried, 1);
  assert.equal((await loadCareer(dir, 'multi_turn')).entries[contestants[0]!.id]!.battles, 1);
});

test('断线快照保留每轮完整文本、独立重试与分项评分状态', () => {
  const state = new LiveState();
  let seq = 0;
  for (const roundId of ['r1', 'r2', 'r3']) {
    for (const attempt of [0, 1]) {
      state.accept({
        type: 'model',
        battle: 'b1',
        taskId: 'T1',
        modelId: 'm1',
        roundId,
        attempt,
        seq: ++seq,
        status: 'generating',
      });
      for (let i = 0; i < 600; i++)
        state.accept({
          type: 'model',
          battle: 'b1',
          taskId: 'T1',
          modelId: 'm1',
          roundId,
          attempt,
          seq: ++seq,
          channel: 'answer',
          block: 0,
          delta: '中',
        });
    }
  }
  const frames = state.snapshot().frames.filter((e) => e.type === 'model');
  assert.equal(frames.length, 6);
  assert.ok(frames.every((e) => e.answer?.length === 600));
});

test('新题库编辑、轮次排序、冲突保护和导出备份可往返', async (t) => {
  const dir = await temporary(t),
    store = new QuestionBankStore(dir);
  const created = await store.save({ def, tasks: [task] });
  const edited = structuredClone(created);
  edited.tasks[0]!.rounds!.reverse();
  if (edited.def.judge.kind === 'rubric') {
    edited.def.judge.dimensions[0]!.weight = 35;
    edited.def.judge.dimensions[1]!.weight = 30;
  }
  const updated = await store.save(edited, created.def.name);
  await assert.rejects(store.save(created, created.def.name), /修改|冲突|更新/);
  const loaded = await loadArena(path.join(dir, created.def.name));
  assert.deepEqual(loaded.tasks, updated.tasks);
  assert.equal(loaded.tasks[0]!.rounds![0]!.id, 'r3');
  const backups = await readdir(path.join(dir, '.editor-backups', created.def.name));
  assert.ok(backups.some((f) => f.endsWith('.ququ.json')));
});

test('18个种子任务自包含、可编辑；预算与排期关键约束有独立数值核对', () => {
  const banks = seedBanks();
  assert.equal(banks[0]!.tasks.length, 12);
  assert.equal(banks[1]!.tasks.length, 6);
  for (const bank of banks) {
    validateArena(bank.def, bank.tasks);
    assert.equal(new Set(bank.tasks.map((t) => t.condition)).size, 6);
    for (const q of bank.tasks) {
      assert.match(q.input, /合成材料/);
      assert.equal(q.judge?.kind, 'rubric');
    }
  }
  const budget = (people: number, teacher: number, cap: number) =>
    [40, 30]
      .flatMap((meal) =>
        [10, 5].map((material) => ({ meal, material, total: 3000 + teacher + people * (meal + material) })),
      )
      .filter((r) => r.total <= cap - 500);
  assert.deepEqual(budget(80, 1000, 8000)[0], { meal: 30, material: 10, total: 7200 });
  assert.deepEqual(budget(80, 500, 7000)[0], { meal: 30, material: 5, total: 6300 });
  assert.equal(budget(90, 500, 7000).length, 0);
  assert.equal(3000 + 500 + 90 * 35 + 500 - 7000, 150);
  assert.equal(2 + 3 + 2 + 1, 8);
  assert.equal(2 + 2 + 1 + 2 + 1 + 1, 9); // MT02: unavailable day + added safety.
  assert.equal((36 + 14) / 1000, (74 + 26) / 2000);
  assert.equal(100 + 38 - 30 - 20 - 8, 80);
});
