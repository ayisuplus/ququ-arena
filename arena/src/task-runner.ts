import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { ArenaDef, ArenaTask, BattleRecord, BattleResult, Contestant, RoundAnswer, TokenUsage } from './types.ts';
import { ARENA_VERSION } from './types.ts';
import { oneFight, pool, type BattleOptions, type ContestantState } from './runner.ts';
import { requirePlayableTasks } from './arena-loader.ts';
import { arenaFingerprint } from './fingerprint.ts';
import { createTaskGrader, gradeRecord } from './task-grading.ts';
import { MATCH_LIMITS } from './battle-resilience.ts';
import { TASK_LIMITS } from './task-mode.ts';
import { RANKING_POLICY } from './performance.ts';

export function sumRoundUsage(rounds: RoundAnswer[]): TokenUsage | undefined {
  const known = rounds.flatMap((r) => (r.usage ? [r.usage] : []));
  if (!known.length) return undefined;
  const sum: TokenUsage = { input: 0, output: 0 };
  for (const key of ['input', 'output', 'cachedInput', 'cacheWrite', 'reasoning'] as const) {
    // Missing optional fields are unknown, not a zero cache hit rate.
    if (
      (known.length === rounds.length && known.every((u) => u[key] !== undefined)) ||
      key === 'input' ||
      key === 'output'
    )
      sum[key] = known.reduce((n, u) => n + (u[key] ?? 0), 0);
  }
  return sum;
}

/** Task and round barriers share the existing retry/withdrawal generation path. Grading never enters model history. */
export async function runTaskBattle(
  def: ArenaDef,
  tasks: ArenaTask[],
  contestants: Contestant[],
  opts: BattleOptions,
): Promise<BattleResult> {
  const concurrency = Math.max(1, Math.floor(opts.concurrency ?? 8));
  const retries = Math.min(2, Math.max(0, Math.floor(opts.retries ?? 2)));
  const roundMs = Math.min(opts.timeoutMs ?? TASK_LIMITS.roundMs, TASK_LIMITS.roundMs);
  const taskMs = Math.min(opts.taskBudgetMs ?? TASK_LIMITS.taskMs, TASK_LIMITS.taskMs);
  for (const n of [
    concurrency,
    retries + 1,
    roundMs,
    taskMs,
    opts.judgeTimeoutMs ?? TASK_LIMITS.roundMs,
    opts.limit ?? 1,
  ])
    if (!Number.isFinite(n) || n <= 0) throw new Error('并发、时限和题数必须是有效正数');
  const judge =
    opts.matchJudge ??
    (opts.judgeModel
      ? { kind: 'api' as const, model: opts.judgeModel }
      : { kind: 'agent' as const, agent: 'codex' as const });
  const grader =
    opts.grader ??
    createTaskGrader(judge, {
      cwd: opts.gradingCwd ?? path.join(os.tmpdir(), 'arena-grading'),
      modelSettings: opts.modelSettings,
      openRouterFreeOnly: opts.openRouterFreeOnly,
    });
  const selected = requirePlayableTasks(def, tasks).slice(0, opts.limit);
  const began = Date.now(),
    records: BattleRecord[] = [];
  const states = new Map(
    contestants.map((c) => [
      c.id,
      { failures: opts.resumeFailures?.[c.id] ?? 0, abort: new AbortController() } as ContestantState,
    ]),
  );
  for (const saved of opts.resumeRecords ?? []) {
    const state = states.get(saved.model);
    if (state && saved.withdrawal) {
      state.withdrawal = saved.withdrawal;
      state.failures = saved.withdrawal.failures;
    }
  }
  const result: BattleResult = {
    id: opts.matchId ?? randomUUID(),
    arena: structuredClone(def),
    startedAt: new Date(began).toISOString(),
    durationMs: 0,
    contestants,
    records,
    withdrawals: [...states.values()].flatMap((s) => (s.withdrawal ? [s.withdrawal] : [])),
    meta: {
      arenaFingerprint: arenaFingerprint(def, tasks),
      judgeModels: [judge.kind === 'agent' ? `agent:${judge.agent}` : judge.model],
      judge,
      toolVersion: ARENA_VERSION,
      plannedTasks: selected.length,
      rankingPolicy: RANKING_POLICY,
      // 与 runBattle 同口径：免费演示档落盘标 free-tier（多轮 / 工程题跑道同样适用）。
      ...(opts.openRouterFreeOnly ? { source: 'free-tier' as const } : {}),
      taskBudgetMs: taskMs,
      execution: {
        schedule: 'rounds',
        concurrency,
        reasoning: opts.reasoning ?? 'provider-default',
        timeoutMs: roundMs,
        failureLimit: MATCH_LIMITS.failures,
        judgeTimeoutMs: opts.judgeTimeoutMs ?? TASK_LIMITS.roundMs,
      },
    },
  };
  const withdraw = (
    c: Contestant,
    task: ArenaTask,
    reason: 'failures' | 'timeout' | 'unavailable',
    message: string,
  ) => {
    const state = states.get(c.id)!;
    if (state.withdrawal) return;
    state.withdrawal = { modelId: c.id, taskId: task.id, reason, message, failures: state.failures, at: Date.now() };
    state.abort.abort(new Error(message));
    result.withdrawals!.push(state.withdrawal);
    opts.onWithdrawal?.(state.withdrawal);
  };
  for (const [index, original] of selected.entries()) {
    await opts.control?.checkpoint();
    if (opts.control?.abort.signal.aborted) break;
    if ([...states.values()].every((s) => s.withdrawal) && !opts.resumeRecords?.some((r) => r.taskId === original.id))
      continue;
    const task = structuredClone(original);
    task.input = (def.taskPrefix ?? '') + (def.conditionPrefix?.[task.condition] ?? '') + task.input;
    task.judge = structuredClone(task.judge ?? def.judge);
    const stages = task.rounds ?? [{ id: 'r1', title: '完整答卷', input: '' }];
    const entries = new Map(
      contestants
        .filter(
          (c) =>
            !states.get(c.id)!.withdrawal || opts.resumeRecords?.some((r) => r.taskId === task.id && r.model === c.id),
        )
        .map((c): [string, BattleRecord] => [
          c.id,
          {
            taskId: task.id,
            condition: task.condition,
            model: c.id,
            prompt: task.input,
            answer: '',
            score: 0,
            latencyMs: 0,
            rounds: [],
            taskSnapshot: task,
            judge: task.judge,
            target: task.target,
          },
        ]),
    );
    for (const [id, record] of entries) {
      const saved = opts.resumeRecords?.find((r) => r.taskId === record.taskId && r.model === id);
      if (saved) entries.set(id, structuredClone(saved));
    }
    opts.onRound?.(task, index, selected.length);
    for (const [roundIndex, stage] of stages.entries()) {
      await opts.control?.checkpoint();
      if (opts.control?.abort.signal.aborted) break;
      const prompt =
        roundIndex === 0
          ? task.input + (stage.input ? `\n\n第 1 轮 · ${stage.title}\n${stage.input}` : '')
          : `第 ${roundIndex + 1} 轮 · ${stage.title}\n${stage.input}`;
      opts.onStage?.(task, roundIndex, stages.length, prompt);
      const stageEvent = { roundId: stage.id, roundTitle: stage.title, roundIndex, roundTotal: stages.length };
      for (const c of contestants)
        if (entries.has(c.id) && !states.get(c.id)!.withdrawal && !entries.get(c.id)!.error)
          opts.onModelEvent?.({ taskId: task.id, modelId: c.id, attempt: 0, status: 'waiting', ...stageEvent });
      await pool(
        contestants.map((c) => async () => {
          const record = entries.get(c.id),
            state = states.get(c.id)!;
          if (!record || record.error || state.withdrawal || opts.control?.abort.signal.aborted) return;
          if (record.rounds!.some((r) => r.roundId === stage.id)) return;
          const remaining = taskMs - (record.solveMs ?? 0);
          if (remaining <= 0) {
            withdraw(c, task, 'timeout', '整项任务累计作答时间已用尽，已退赛');
            record.error = state.withdrawal!.message;
            return;
          }
          const history = record.rounds!.flatMap((r) => [
            { role: 'user' as const, content: r.prompt },
            { role: 'assistant' as const, content: r.answer },
          ]);
          const rec = await oneFight(
            def,
            { ...task, input: prompt },
            c,
            [],
            retries,
            {
              ...opts,
              history,
              generationOnly: true,
              timeoutMs: Math.min(roundMs, remaining),
              onModelEvent: (event) => opts.onModelEvent?.({ ...event, ...stageEvent }),
            },
            state,
            (reason, message) => withdraw(c, task, reason, message),
            (message) => {
              for (const model of contestants)
                if (model.provider === 'openrouter' && (opts.openRouterFreeOnly || model.modelId?.endsWith(':free')))
                  withdraw(model, task, 'unavailable', `OpenRouter 免费额度已耗尽：${message}`);
            },
          );
          record.rounds!.push({
            roundId: stage.id,
            title: stage.title,
            prompt,
            answer: rec.answer,
            reasoning: rec.reasoning,
            latencyMs: rec.latencyMs,
            solveMs: rec.solveMs ?? 0,
            attempts: rec.attempts ?? 1,
            usage: rec.usage,
            usageComplete: rec.usageComplete ?? false,
            ...(rec.error ? { error: rec.error } : {}),
          });
          record.answer = rec.answer;
          record.reasoning = rec.reasoning;
          record.latencyMs += rec.latencyMs;
          record.solveMs = (record.solveMs ?? 0) + (rec.solveMs ?? 0);
          record.attempts = (record.attempts ?? 0) + (rec.attempts ?? 1);
          if (rec.error) {
            record.error = rec.error;
            record.note = rec.note;
          }
          if (!opts.control?.abort.signal.aborted) await opts.onCheckpoint?.(record);
        }),
        concurrency,
      );
    }
    // Sequential anonymous grading: no sibling answer or score is supplied, and every native session is new.
    for (const record of entries.values()) {
      if (opts.completedRecords?.includes(JSON.stringify([record.taskId, record.model]))) {
        records.push(record);
        await opts.onProgress?.(records.length, selected.length * contestants.length, record);
        continue;
      }
      const withdrawal = states.get(record.model)!.withdrawal;
      if (withdrawal) record.withdrawal = withdrawal;
      record.usage = sumRoundUsage(record.rounds!);
      record.usageComplete = record.rounds!.length === stages.length && record.rounds!.every((r) => r.usageComplete);
      if (opts.control?.abort.signal.aborted) {
        record.error ??= '比赛已中止，保留已完成轮次';
        record.note = '比赛已中止';
      } else if (!record.error && record.rounds!.length === stages.length) {
        record.gradingStatus = 'pending';
        await opts.onCheckpoint?.(record);
        opts.onGrading?.(record, 'working');
        await gradeRecord(record, grader, opts.control?.abort.signal, opts.judgeTimeoutMs);
        opts.onGrading?.(record, record.grade ? 'graded' : 'pending');
      } else record.error ??= withdrawal?.message ?? '任务轮次未完成';
      record.finishedMs = Date.now() - began;
      records.push(record);
      await opts.onProgress?.(records.length, selected.length * contestants.length, record);
    }
    if (!opts.control?.abort.signal.aborted) opts.onRoundEnd?.(task);
  }
  result.status = opts.control?.abort.signal.aborted
    ? 'stopped'
    : records.some((r) => r.gradingStatus === 'pending')
      ? 'pending_grading'
      : 'completed';
  result.durationMs = Date.now() - began;
  return result;
}
