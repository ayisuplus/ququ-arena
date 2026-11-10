/**
 * 对战引擎 —— N 蛐蛐 × M 题并发开赛
 * 真实模型调用失败自动重试（指数退避）；多次尝试仍败记"弃权"，
 * 与"答错"区分——弃权不进 Elo，这是科学性底线。
 */
import { randomUUID } from 'node:crypto';
import type { ArenaDef, ArenaTask, BattleRecord, BattleResult, Contestant, ContestantWithdrawal } from './types.ts';
import { ARENA_VERSION } from './types.ts';
import { askModel, ModelRequestError, type AnswerOut, type ModelDelta, type AskOptions } from './models.ts';
import { judgeAnswer } from './judge.ts';
import { requirePlayableTasks } from './arena-loader.ts';
import { arenaFingerprint } from './fingerprint.ts';
import { BattleControl } from './battle-control.ts';
import { delay } from './streams.ts';
import { OpenRouterRequestError } from './openrouter-limits.ts';
import { MATCH_LIMITS, abortable, deadline } from './battle-resilience.ts';
import { runTaskBattle } from './task-runner.ts';
import { RANKING_POLICY } from './performance.ts';
import type { TaskGrader } from './task-grading.ts';
import type { MatchJudge, RubricGrade } from './types.ts';

export interface FightEvent extends Partial<ModelDelta> {
  roundId?: string;
  roundIndex?: number;
  roundTotal?: number;
  roundTitle?: string;
  grade?: RubricGrade;
  taskId: string;
  modelId: string;
  attempt: number;
  startedAt?: number;
  parts?: { answer: [number, string][]; reasoning: [number, string][] };
  status?: 'waiting' | 'generating' | 'judging' | 'done' | 'retrying' | 'error' | 'stopped' | 'withdrawn';
  failures?: number;
  answer?: string;
  reasoning?: string;
  score?: number;
  note?: string;
  error?: string;
  ms?: number;
  solveMs?: number;
  usageComplete?: boolean;
  usage?: AnswerOut['usage'];
}
export interface ContestantState {
  failures: number;
  abort: AbortController;
  withdrawal?: ContestantWithdrawal;
}
export async function oneFight(
  def: ArenaDef,
  task: ArenaTask,
  c: Contestant,
  judgeModels: string[],
  retries: number,
  opts: BattleOptions,
  state: ContestantState,
  withdraw: (reason: ContestantWithdrawal['reason'], message: string) => void,
  quotaExhausted: (message: string) => void,
): Promise<BattleRecord> {
  const spec = task.judge ?? def.judge;
  const base: Omit<BattleRecord, 'score'> = {
    taskId: task.id,
    condition: task.condition,
    model: c.id,
    prompt: task.input,
    answer: '',
    target: task.target,
    ...(task.judge ? { judge: task.judge } : {}),
    latencyMs: 0,
  };
  let attempt = 0;
  const solveStarted = Date.now();
  let solveMs = 0;
  const notify = (event: Omit<FightEvent, 'modelId' | 'taskId' | 'attempt'>) =>
    opts.onModelEvent?.({ ...event, modelId: c.id, taskId: task.id, attempt, failures: state.failures });
  const signals = [state.abort.signal, ...(opts.control ? [opts.control.abort.signal] : [])];
  const budget = opts.timeoutMs ?? MATCH_LIMITS.questionMs;
  const clock = deadline(budget, `单题超过 ${budget / 1000} 秒未完成，已退赛`, signals);
  let partial: { answer: string; reasoning: string } = { answer: '', reasoning: '' };
  try {
    // One deadline spans all attempts and backoff; reasoning deltas never extend it.
    const previous = !opts.generationOnly
      ? opts.resumeRecords?.find(
          (r) => r.taskId === task.id && r.model === c.id && r.gradingStatus === 'pending' && !r.error,
        )
      : undefined;
    let out: AnswerOut | null = previous
      ? { text: previous.answer, reasoning: previous.reasoning, latencyMs: previous.latencyMs, usage: previous.usage }
      : null;
    if (previous) solveMs = previous.solveMs ?? previous.latencyMs;
    let lastErr: unknown;
    for (attempt = 0; !out && attempt <= retries; attempt++) {
      let streaming = true;
      const blocks = { answer: new Map<number, string>(), reasoning: new Map<number, string>() };
      partial = { answer: '', reasoning: '' };
      try {
        clock.signal.throwIfAborted();
        const retryMs = Date.now() - solveStarted;
        notify({ status: 'generating', startedAt: solveStarted });
        out = await abortable(
          () =>
            (opts.ask ?? askModel)(c, task, spec.kind, {
              signal: clock.signal,
              reasoning: opts.reasoning,
              modelSettings: opts.modelSettings,
              openRouterFreeOnly: opts.openRouterFreeOnly,
              history: opts.history,
              onDelta: (event: ModelDelta) => {
                if (!streaming || clock.signal.aborted) return;
                const channel = blocks[event.channel];
                channel.set(event.block, event.replace ? event.delta : (channel.get(event.block) ?? '') + event.delta);
                partial[event.channel] = [...channel]
                  .sort(([a], [b]) => a - b)
                  .map(([, text]) => text)
                  .join('');
                notify(event);
              },
            }),
          clock.signal,
        );
        clock.signal.throwIfAborted();
        if (!out.text.trim()) throw new Error('接口返回空答案，未形成有效作答');
        solveMs = retryMs + out.latencyMs;
        break;
      } catch (e) {
        out = null;
        lastErr = e;
        streaming = false;
        if (opts.control?.abort.signal.aborted) throw e;
        if (state.withdrawal) throw e;
        state.failures++;
        if (clock.expired()) {
          withdraw('timeout', (e as Error).message);
          throw e;
        }
        if (e instanceof OpenRouterRequestError && e.scope === 'daily') quotaExhausted(e.message);
        if (e instanceof OpenRouterRequestError || e instanceof ModelRequestError) {
          if (!e.retryable) {
            withdraw('unavailable', `接口不可用，已退赛：${e.message}`);
            throw e;
          }
        }
        if (state.failures >= MATCH_LIMITS.failures) {
          withdraw('failures', `本场累计调用失败 ${state.failures} 次，已弃权`);
          throw e;
        }
        if (attempt < retries) {
          notify({ status: 'retrying', error: e instanceof Error ? e.message : String(e) });
          await delay(
            Math.max(
              1000 * 2 ** attempt,
              e instanceof OpenRouterRequestError || e instanceof ModelRequestError ? (e.retryAfterMs ?? 0) : 0,
            ),
            clock.signal,
          );
        }
      } finally {
        streaming = false;
      }
    }
    if (!out) {
      attempt = retries;
      throw lastErr;
    }
    clock.clear();
    const metrics = {
      solveMs,
      attempts: previous?.attempts ?? attempt + 1,
      usageComplete: previous?.usageComplete ?? (attempt === 0 && !!out.usage),
    };
    if (opts.generationOnly) {
      notify({
        status: 'done',
        answer: out.text,
        reasoning: out.reasoning ?? '',
        ms: out.latencyMs,
        usage: out.usage,
        solveMs,
        usageComplete: metrics.usageComplete,
      });
      return {
        ...base,
        ...metrics,
        answer: out.text,
        reasoning: out.reasoning,
        score: 0,
        latencyMs: out.latencyMs,
        usage: out.usage,
      };
    }
    await opts.onCheckpoint?.({
      ...base,
      ...metrics,
      answer: out.text,
      reasoning: out.reasoning,
      score: 0,
      latencyMs: out.latencyMs,
      usage: out.usage,
      gradingStatus: 'pending',
    });
    notify({
      status: 'judging',
      answer: out.text,
      reasoning: out.reasoning ?? '',
      ms: out.latencyMs,
      usage: out.usage,
      solveMs,
      usageComplete: metrics.usageComplete,
    });
    // 裁判调用独立通道：裁判故障 ≠ 蛐蛐弃权——保留答案文本（可离线重判），error 记录照常剔除出 Elo/avg
    let verdict;
    const judgeClock = deadline(opts.judgeTimeoutMs ?? MATCH_LIMITS.judgeMs, '裁判评分超时，已保留答案', signals);
    try {
      verdict = await abortable(
        () =>
          judgeAnswer(def, task, out!.text, judgeModels, judgeClock.signal, {
            modelSettings: opts.modelSettings,
            openRouterFreeOnly: opts.openRouterFreeOnly,
            ask: opts.judgeAsk,
          }),
        judgeClock.signal,
      );
      judgeClock.signal.throwIfAborted();
      opts.control?.abort.signal.throwIfAborted();
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      notify({
        status: opts.control?.abort.signal.aborted ? 'stopped' : state.withdrawal ? 'withdrawn' : 'error',
        error,
      });
      return {
        ...base,
        ...metrics,
        answer: out.text,
        reasoning: out.reasoning,
        score: 0,
        error,
        ...(state.withdrawal ? { withdrawal: state.withdrawal } : {}),
        note: opts.control?.abort.signal.aborted
          ? '比赛已中止，答案未评分'
          : state.withdrawal
            ? '选手已退赛，答案未评分'
            : '裁判弃权（调用失败）',
        latencyMs: out.latencyMs,
        usage: out.usage,
      };
    } finally {
      judgeClock.cancel();
    }
    notify({ status: 'done', score: verdict.score, note: verdict.note });
    return {
      ...base,
      ...metrics,
      answer: out.text,
      reasoning: out.reasoning,
      score: verdict.score,
      note: verdict.note,
      dispute: verdict.dispute,
      votes: verdict.votes,
      latencyMs: out.latencyMs,
      usage: out.usage,
    };
  } catch (e) {
    if (!opts.control?.abort.signal.aborted && !state.withdrawal && clock.expired())
      withdraw('timeout', (clock.signal.reason as Error).message);
    const error = state.withdrawal?.message ?? (e instanceof Error ? e.message : String(e));
    solveMs = Date.now() - solveStarted;
    notify({
      status: opts.control?.abort.signal.aborted ? 'stopped' : state.withdrawal ? 'withdrawn' : 'error',
      error,
      solveMs,
    });
    return {
      ...base,
      ...partial,
      solveMs,
      attempts: attempt + 1,
      usageComplete: false,
      score: 0,
      error,
      ...(state.withdrawal ? { withdrawal: state.withdrawal } : {}),
      note: opts.control?.abort.signal.aborted
        ? '比赛已中止'
        : state.withdrawal
          ? state.withdrawal.message
          : '选手本题弃权（调用失败）',
    };
  } finally {
    clock.clear();
  }
}

/** 简单并发池 */
export async function pool<T>(items: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const cur = i++;
      results[cur] = await items[cur]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export interface BattleOptions {
  resumeRecords?: BattleRecord[];
  resumeFailures?: Record<string, number>;
  completedRecords?: string[];
  onCheckpoint?: (record: BattleRecord) => void | Promise<void>;
  history?: AskOptions['history'];
  generationOnly?: boolean;
  matchId?: string;
  matchJudge?: MatchJudge;
  grader?: TaskGrader;
  gradingCwd?: string;
  taskBudgetMs?: number;
  onStage?: (task: ArenaTask, roundIndex: number, total: number, prompt: string) => void;
  onGrading?: (record: BattleRecord, status: 'working' | 'pending' | 'graded') => void;
  modelSettings?: AskOptions['modelSettings'];
  openRouterFreeOnly?: boolean;
  roundSync?: boolean;
  control?: BattleControl;
  timeoutMs?: number;
  judgeTimeoutMs?: number;
  reasoning?: AskOptions['reasoning'];
  ask?: typeof askModel;
  judgeAsk?: typeof askModel;
  onRound?: (task: ArenaTask, index: number, total: number) => void;
  onRoundEnd?: (task: ArenaTask) => void;
  onModelEvent?: (event: FightEvent) => void;
  onWithdrawal?: (withdrawal: ContestantWithdrawal) => void;
  judgeModel?: string; // llm 裁判模型，逗号分隔多个即多裁判，默认 mock:laoshi-k2
  concurrency?: number; // 默认 8
  limit?: number; // 只跑前 N 题（调试）
  retries?: number; // 默认最多重试 2 次，仍受全场累计 3 次失败上限约束
  /** 演示节拍：每条交战记录落账后延迟 ms（围观/录屏用，mock 赛是瞬完的） */
  paceMs?: number;
  onProgress?: (done: number, total: number, rec: BattleRecord) => void | Promise<void>;
}

export async function runBattle(
  def: ArenaDef,
  tasks: ArenaTask[],
  contestants: Contestant[],
  opts: BattleOptions = {},
): Promise<BattleResult> {
  if (def.mode && def.mode !== 'qa') return runTaskBattle(def, tasks, contestants, opts);
  const judgeModels = (opts.judgeModel ?? 'mock:laoshi-k2')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // 数值旗标钳位：concurrency=0 会 0 工人崩榜（records 空洞），retries<0 会全场静默弃权污染生涯库（审查 P3）
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const retries = Math.min(MATCH_LIMITS.failures - 1, Math.max(0, opts.retries ?? 2));
  if (!Number.isFinite(concurrency) || !Number.isFinite(opts.retries ?? 2))
    throw new Error('concurrency/retries 必须是有限数字');
  for (const value of [opts.timeoutMs, opts.judgeTimeoutMs])
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error('超时必须为正数');
  // 上限值本身可配置（QUQU_QUESTION_TIMEOUT_MS / QUQU_JUDGE_TIMEOUT_MS，见 battle-resilience.ts），默认仍 60s；
  // 调用方传入的值仍受同一上限钳制——Math.min 是有意设计（防不合作适配器永久占槽），勿删。
  opts = {
    ...opts,
    timeoutMs: Math.min(opts.timeoutMs ?? MATCH_LIMITS.questionMs, MATCH_LIMITS.questionMs),
    judgeTimeoutMs: Math.min(opts.judgeTimeoutMs ?? MATCH_LIMITS.judgeMs, MATCH_LIMITS.judgeMs),
  };
  if (opts.limit !== undefined && (!Number.isFinite(opts.limit) || opts.limit <= 0))
    throw new Error('limit 必须是正整数（NaN/0 会静默跑全罐——审查实证）');
  const availableTasks = requirePlayableTasks(def, tasks);
  const battleTasks = (opts.limit ? availableTasks.slice(0, opts.limit) : availableTasks)
    // 题面前缀：taskPrefix → conditionPrefix[维度] → input；模型所见与战绩 prompt 均为完整题面
    .map((t) =>
      def.taskPrefix || def.conditionPrefix?.[t.condition]
        ? { ...t, input: (def.taskPrefix ?? '') + (def.conditionPrefix?.[t.condition] ?? '') + t.input }
        : t,
    );
  const startedAt = new Date();
  const t0 = Date.now();

  const total = battleTasks.length * contestants.length;
  let done = 0;
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
  const withdraw = (c: Contestant, task: ArenaTask, reason: ContestantWithdrawal['reason'], message: string) => {
    const state = states.get(c.id)!;
    if (state.withdrawal) return;
    state.withdrawal = { modelId: c.id, taskId: task.id, reason, message, failures: state.failures, at: Date.now() };
    state.abort.abort(new Error(message));
    opts.onWithdrawal?.(state.withdrawal);
  };
  const fight = (task: ArenaTask, c: Contestant) => async (): Promise<BattleRecord | null> => {
    const saved = opts.resumeRecords?.find(
      (r) =>
        r.taskId === task.id &&
        r.model === c.id &&
        opts.completedRecords?.includes(JSON.stringify([r.taskId, r.model])),
    );
    if (saved) {
      done++;
      await opts.onProgress?.(done, total, saved);
      return structuredClone(saved);
    }
    const state = states.get(c.id)!;
    if (state.withdrawal || opts.control?.abort.signal.aborted) return null;
    const rec = await oneFight(
      def,
      task,
      c,
      judgeModels,
      retries,
      opts,
      state,
      (reason, message) => withdraw(c, task, reason, message),
      (message) => {
        for (const model of contestants)
          if (model.provider === 'openrouter' && (opts.openRouterFreeOnly || model.modelId?.endsWith(':free')))
            withdraw(model, task, 'unavailable', `OpenRouter 免费额度已耗尽，已退赛：${message}`);
      },
    );
    rec.finishedMs = Date.now() - t0; // 完成时刻：回放真实节奏用
    done++;
    await opts.onProgress?.(done, total, rec);
    if (opts.paceMs) {
      await delay(opts.paceMs, opts.control?.abort.signal).catch(() => {});
    }
    return rec;
  };
  let records: BattleRecord[];
  if (opts.roundSync) {
    records = [];
    for (const [index, task] of battleTasks.entries()) {
      await opts.control?.checkpoint();
      if (opts.control?.abort.signal.aborted) break;
      if ([...states.values()].every((s) => s.withdrawal) && !opts.resumeRecords?.some((r) => r.taskId === task.id))
        continue;
      opts.onRound?.(task, index, battleTasks.length);
      for (const c of contestants)
        if (!states.get(c.id)!.withdrawal)
          opts.onModelEvent?.({
            taskId: task.id,
            modelId: c.id,
            attempt: 0,
            status: 'waiting',
            failures: states.get(c.id)!.failures,
          });
      const round = await pool(
        contestants.map((c) => fight(task, c)),
        concurrency,
      );
      records.push(...round.filter((r): r is BattleRecord => r !== null));
      if (!opts.control?.abort.signal.aborted) opts.onRoundEnd?.(task);
    }
  } else {
    records = (
      await pool(
        battleTasks.flatMap((task) => contestants.map((c) => fight(task, c))),
        concurrency,
      )
    ).filter((r): r is BattleRecord => r !== null);
  }

  return {
    id: opts.matchId ?? randomUUID(),
    arena: def,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - t0,
    contestants,
    records,
    withdrawals: [...states.values()].flatMap((s) => (s.withdrawal ? [s.withdrawal] : [])),
    ...(opts.control?.abort.signal.aborted ? { status: 'stopped' as const } : {}),
    meta: {
      arenaFingerprint: arenaFingerprint(def, tasks), // 指纹锁定全量题库，--limit 不影响
      judgeModels,
      toolVersion: ARENA_VERSION,
      plannedTasks: battleTasks.length,
      rankingPolicy: RANKING_POLICY,
      // 免费演示档（开赛时只走免费渠道）落盘标 free-tier，供结算层把演示档挡在主榜外（T-003）。
      ...(opts.openRouterFreeOnly ? { source: 'free-tier' as const } : {}),
      execution: {
        schedule: opts.roundSync ? 'rounds' : 'pool',
        concurrency,
        reasoning: opts.reasoning ?? 'provider-default',
        timeoutMs: opts.timeoutMs!,
        failureLimit: MATCH_LIMITS.failures,
        judgeTimeoutMs: opts.judgeTimeoutMs,
      },
    },
  };
}
