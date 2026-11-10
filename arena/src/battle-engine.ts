/**
 * 战斗引擎（BattleEngine）——斗兽场的「运行器」域：比赛队列、SSE 广播、开战/回放编排
 *
 * 架构边界（ports & adapters）：引擎是纯编排——只依赖 ctx 的两个目录，
 * 不 import http/URL/路由概念；HTTP 只是它的一种驱动者（server.ts），
 * CLI/测试可以直接驱动它而不起服务器。
 */
import path from 'node:path';
import { GameCompetitions } from './game-competition.ts';
import { readFile } from 'node:fs/promises';
import { loadBattle } from './results-store.ts';
import { loadArena, requirePlayableTasks } from './arena-loader.ts';
import { resolveContestant } from './models.ts';
import { runBattle } from './runner.ts';
import { buildLeaderboard, findBloodbaths } from './leaderboard.ts';
import { writeReport } from './report.ts';
import { loadCareer, settleBattle } from './career-store.ts';
import { eloSnapshot, rankOf } from './career.ts';
import { openPrediction, settlePrediction } from './prediction-store.ts';
import { BET_WINDOW_MS } from './prediction-types.ts';
import { commentate } from './commentary.ts';
import { oddsFromElo } from './odds.ts';
import { displayMark } from './record-state.ts';
import type { BoardEntry, BattleRecord, BattleResult, ContestantWithdrawal } from './types.ts';
import { pct } from './theme.ts';
import { randomUUID } from 'node:crypto';
import { BattleControl } from './battle-control.ts';
import { LiveState, EventJournal, readTimeline } from './live-state.ts';
import { Commentator } from './commentator.ts';
import { delay } from './streams.ts';
import type { AgentId } from './agents.ts';
import type { BattleEvent, EventDraft, CommentaryEntry } from './battle-events.ts';
import { readModelSettings, openRouterKey, modelDisplayName } from './model-settings.ts';
import { openRouterCatalog } from './openrouter.ts';
import { assertOpenRouterAvailable } from './openrouter-limits.ts';
import { describeScoring, buildSettlement, requiresModelJudge } from './scoring-summary.ts';
import { RANKING_POLICY, performanceMetrics, tracksEfficiency } from './performance.ts';
import { preflightJudge } from './task-grading.ts';
import { retryGrading } from './grading-retry.ts';
import type { MatchJudge } from './types.ts';
import { EvaluationStore, recordKey } from './evaluation-store.ts';
export type { BattleEvent } from './battle-events.ts';

/** 引擎上下文：只需要两个目录——罐从哪来，战绩往哪写 */
export interface ServerCtx {
  arenasDir: string;
  resultsDir: string;
  modelSettingsFile?: string;
}

/** 全场共享的 SSE 广播器（事件带 battle id，观众按 id 过滤）
 *  环形回放缓冲：直播本无回放，晚接入的观众丢历史（排队态/竞猜卡/实况开头），
 *  已三次咬人。缓冲每场最近 500 事件，接入时同步补发后再挂监听——
 *  单线程下补发与订阅之间不可能插入新事件：无间隙、无重复。 */
export class BattleBus {
  private listeners = new Set<(e: BattleEvent) => void>();
  private bufs = new Map<string, BattleEvent[]>();
  private recency: string[] = []; // battle id 近用序，超出上限连缓冲一起淘汰
  private static readonly CAP_EVENTS = 500;
  private static readonly CAP_BATTLES = 8;

  emit(e: BattleEvent): void {
    let buf = this.bufs.get(e.battle);
    if (!buf) {
      buf = [];
      this.bufs.set(e.battle, buf);
      this.recency.push(e.battle);
      if (this.recency.length > BattleBus.CAP_BATTLES) this.bufs.delete(this.recency.shift()!);
    }
    buf.push(e);
    if (buf.length > BattleBus.CAP_EVENTS) buf.splice(1, 1); // 挤掉次老的：start（槽位 0）永不被淘汰——大罐场次>500 事件时晚接入观众靠它建场（题数×蛐蛐数超限实证：metacog-gate 600）
    for (const fn of this.listeners) fn(e);
  }

  /** 订阅；replayBattle 给定时先同步补发该场缓冲的全部事件 */
  subscribe(fn: (e: BattleEvent) => void, replayBattle?: string | null): () => void {
    if (replayBattle) for (const e of this.bufs.get(replayBattle) ?? []) fn(e);
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

/** 比赛队列：同时只打一场；后来的排队观赛当前场，轮到自己自动切入 */
export interface BattleJob {
  id: string;
  q: URLSearchParams;
  /** 录像回放：直接重放该战绩 JSON，不开新赛、不结算生涯 */
  replayFile?: string;
  /** 完整请求路径（幂等去重键：同 URL 重复打开复用同一份 job——连拍跳转与双击开拍都不再造新赛） */
  href: string;
}

export interface BattleEngine {
  evaluations: EvaluationStore;
  resumeEvaluation(id: string): void;
  competitions: GameCompetitions;
  retryGrading(battle: string, file: string): Promise<void>;
  liveSnapshot(battle: string): ReturnType<LiveState['snapshot']> | undefined;
  control(battle: string, action: 'pause' | 'resume' | 'stop'): void;
  commentator(battle: string, agent: string, enabled: boolean): void;
  askCommentator(battle: string, question: string, reference?: CommentaryEntry['reference']): void;
  dispose(): void;
  close(): Promise<void>;
  /** SSE 订阅：fn 收全部事件；replayBattle 先补发该场缓冲 */
  subscribe(fn: (e: BattleEvent) => void, replayBattle?: string | null): () => void;
  /** 队列/在飞场快照（/queue/status 与 SSE 接入快照的数据源） */
  snapshot(): EngineSnapshot;
  /** 幂等开赛：同语义 URL 复用既有 job（规范化键，参数序/编码/呈现参数不分叉） */
  enqueue(pathname: string, q: URLSearchParams, replayFile?: string): { job: BattleJob; created: boolean };
}

/** 快照行：job id + 罐名（队列表/队列卡展示用；回放场 arena 为空则标「回放」） */
export interface EngineJobSnapshot {
  id: string;
  arena: string;
}

export interface EngineSnapshot {
  running: EngineJobSnapshot | null;
  queue: EngineJobSnapshot[];
  runningContestants: string[] | null;
}

export function createBattleEngine(ctx: ServerCtx): BattleEngine {
  const competitions = new GameCompetitions(ctx);
  const evaluations = new EvaluationStore(ctx.resultsDir);
  const bus = new BattleBus();
  const queue: BattleJob[] = [];
  let running: BattleJob | null = null;
  let runningContestants: string[] | null = null; // 供 status 快照：接入即知道当前场阵容
  let seq = 0;
  const sessions = new Map<
    string,
    {
      state: LiveState;
      control: BattleControl;
      commentator: Commentator;
      began: number;
      journal?: EventJournal;
      timelineFile?: string;
    }
  >();
  const gradingAbort = new AbortController();
  let closing = false;
  let work: Promise<void> = Promise.resolve();

  /** 分布式 Omit：联合每个成员各自去掉 battle 字段 */
  function emit(job: BattleJob, e: EventDraft, broadcast = true): BattleEvent {
    const session = sessions.get(job.id);
    const event = {
      ...e,
      battle: job.id,
      seq: (session?.state.seq ?? 0) + 1,
      at: Date.now() - (session?.began ?? Date.now()),
    } as BattleEvent;
    session?.state.accept(event);
    session?.journal?.push(event);
    if (broadcast) {
      bus.emit(event);
      session?.commentator.observe(event);
    }
    return event;
  }
  async function finish(job: BattleJob, e: EventDraft) {
    const event = emit(job, e, false);
    await sessions.get(job.id)?.journal?.flush();
    bus.emit(event);
    sessions.get(job.id)?.commentator.observe(event);
    const checkpoint = evaluations.states.get(job.id);
    if (checkpoint) {
      checkpoint.status =
        e.type === 'done' ? (e.stopped ? 'stopped' : e.pendingGrades ? 'pending_grading' : 'completed') : 'interrupted';
      Object.assign(checkpoint, sessions.get(job.id)!.state.snapshot());
      evaluations.save(checkpoint);
    }
  }
  function emitTaskResults(job: BattleJob, result: BattleResult) {
    for (const taskId of new Set(result.records.filter((r) => r.rounds).map((r) => r.taskId))) {
      const records = result.records.filter((r) => r.taskId === taskId);
      const record = records[0]!;
      emit(job, {
        type: 'round-end',
        taskId,
        target: record.target,
        scoring: describeScoring(
          record.judge ?? result.arena.judge,
          result.meta?.judgeModels,
          record.judge ? 'task-override' : 'arena-default',
          true,
          result.meta?.rankingPolicy,
        ),
        metrics: Object.fromEntries(performanceMetrics({ ...result, records })),
      });
    }
  }

  async function startBattle(job: BattleJob): Promise<void> {
    const q = job.q;
    const arenaName = q.get('arena') ?? '';
    if (!arenaName || /[/\\]|\.\./.test(arenaName))
      throw new Error('非法罐名——HTTP 入口只接受罐名（路径形态仅 CLI 可用，防任意目录读）');
    const dir = path.join(ctx.arenasDir, arenaName);
    const checkpoint = evaluations.states.get(job.id);
    const { def, tasks: allTasks } =
      checkpoint?.def && checkpoint.tasks ? { def: checkpoint.def, tasks: checkpoint.tasks } : await loadArena(dir);
    if (checkpoint) {
      checkpoint.def = def;
      checkpoint.tasks = allTasks;
      checkpoint.status = 'running';
      evaluations.save(checkpoint);
    }
    const tasks = requirePlayableTasks(def, allTasks);
    const session = sessions.get(job.id)!;
    session.timelineFile = `timeline-${randomUUID()}.jsonl`;
    session.journal = new EventJournal(path.join(ctx.resultsDir, session.timelineFile));
    // Preserve pre-exit evidence in the final replay, including completed answers.
    for (const event of checkpoint?.frames ?? []) session.journal.push(event);
    const modelsSpec = q.get('models');
    const contestants = (
      modelsSpec ? modelsSpec.split(',') : ['mock:xueba-o9', 'mock:huatou-72b', 'mock:jianglv-7b', 'mock:laoshi-k2']
    )
      .map((s) => s.trim())
      .filter(Boolean)
      .map(resolveContestant);
    const nameOf = new Map(contestants.map((c) => [c.id, c.name])); // 实况上屏用花名（rec.model 是 id，openrouter 的 id 截尾会只剩 "free"）
    if (!contestants.length) throw new Error('至少需要 1 只参赛蛐蛐（models 为空即误用）');
    if (new Set(contestants.map((c) => c.id)).size !== contestants.length)
      throw new Error('同一个模型不能重复参赛，请调整赛前阵容');
    const limitRaw = Number(q.get('limit') ?? 0);
    const selectedTasks = Number.isFinite(limitRaw) && limitRaw > 0 ? tasks.slice(0, limitRaw) : tasks;
    const effLimit = selectedTasks.length;
    const needsJudge = selectedTasks.some((task) => requiresModelJudge(task.judge ?? def.judge));
    const taskMode = !!def.mode && def.mode !== 'qa';
    if (q.has('judgeAgent') && !['codex', 'claude'].includes(q.get('judgeAgent')!))
      throw new Error('请选择 Codex 或 Claude 正式裁判');
    const matchJudge: MatchJudge | undefined = taskMode
      ? q.get('judgeAgent') || !q.get('judge')
        ? { kind: 'agent', agent: (q.get('judgeAgent') ?? 'codex') as AgentId }
        : { kind: 'api', model: q.get('judge')! }
      : undefined;
    const judgeModels = matchJudge
      ? [matchJudge.kind === 'agent' ? `agent:${matchJudge.agent}` : matchJudge.model]
      : (q.get('judge') ?? 'mock:laoshi-k2')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
    if (
      !taskMode &&
      needsJudge &&
      contestants.some((c) => c.kind !== 'mock') &&
      (!q.get('judge')?.trim() ||
        !judgeModels.length ||
        judgeModels.some((id) => resolveContestant(id).kind === 'mock'))
    ) {
      throw new Error('所选题目包含模型裁判评分。请先选择已配置的真实裁判模型；真实比赛不能使用离线模拟裁判。');
    }
    const connections = [
      ...contestants,
      ...(needsJudge && matchJudge?.kind !== 'agent' ? judgeModels.map(resolveContestant) : []),
    ];
    const modelSettings = await readModelSettings(ctx.modelSettingsFile);
    const openRouterFreeOnly = q.get('freeOnly') === '1';
    if (connections.some((c) => c.provider === 'openrouter')) {
      if (!openRouterKey(modelSettings)) throw new Error('请先在首页配置 OpenRouter API Key');
      if (openRouterFreeOnly || connections.some((c) => c.modelId?.endsWith(':free')))
        await openRouterCatalog.get(true);
      for (const c of connections)
        if (c.provider === 'openrouter' && (openRouterFreeOnly || c.modelId!.endsWith(':free'))) {
          assertOpenRouterAvailable(openRouterKey(modelSettings));
          await openRouterCatalog.requireFree(c.modelId!);
        }
    }
    for (const c of connections)
      if (c.provider === 'custom') {
        const custom = modelSettings.custom.find((m) => m.id === c.id);
        if (!custom) throw new Error('自定义模型已删除，请重新选择阵容或裁判');
        if (c.name === c.modelId) {
          const named = modelDisplayName(modelSettings, c.id, custom.name);
          c.name = named;
          nameOf.set(c.id, named);
        }
        c.modelId = custom.modelId;
        if (matchJudge?.kind === 'api' && matchJudge.model === c.id)
          matchJudge.connection = { baseUrl: custom.baseUrl, modelId: custom.modelId };
      }
    if (matchJudge)
      await preflightJudge(
        matchJudge,
        { cwd: path.join(ctx.resultsDir, '.grading', job.id), modelSettings, openRouterFreeOnly },
        session.control.abort.signal,
      );
    const career = await loadCareer(ctx.resultsDir, def.mode);
    const preElo = eloSnapshot(career);
    // 赛前赔率：Glicko 评分（与 Elo 同量纲）→ softmax 夺冠概率 → 公平赔率。
    // 不用生涯积分：积分随场次无界累加，老选手会仅凭出场多被当成热门
    const odds = oddsFromElo(contestants.map((c) => ({ name: c.name, elo: career.entries[c.id]?.glicko?.r ?? 1500 })));
    // 盘口竞猜：开赛即开盘（对战盘，开赛 +10s 硬封窗）。竞猜是观赛调味料——
    // 开盘失败绝不掀翻比赛，只留日志；回放不开盘（结果已知）在 startReplay 侧天然满足。
    try {
      openPrediction(ctx.resultsDir, {
        id: `battle:${job.id}`,
        kind: 'battle',
        title: `《${def.title}》`,
        openedAt: new Date().toISOString(),
        closesAt: new Date(Date.now() + BET_WINDOW_MS).toISOString(),
        demo: contestants.some((c) => c.id.startsWith('mock:')),
        entries: contestants.map((c, i) => ({
          id: c.id,
          name: c.name,
          prob: odds[i]!.prob,
          odds: odds[i]!.odds,
        })),
      });
    } catch (e) {
      console.error('⚠️  竞猜开盘失败（不影响比赛）：', e instanceof Error ? e.message : e);
    }
    // start 事件在校验通过后才发——非法请求只看到 error，不会先 start 后 error
    emit(job, {
      type: 'start',
      mode: def.mode ?? 'qa',
      matchJudge,
      title: `《${def.title}》`,
      total: effLimit * contestants.length,
      contestants: contestants.map((c) => c.name),
      roster: contestants.map(({ id, name }) => ({ id, name })),
      odds,
      icons: Object.fromEntries(contestants.map((c) => [c.name, rankOf(preElo.get(c.id) ?? 1500).icon])),
      scoring: describeScoring(def.judge, judgeModels, 'arena-default', false, RANKING_POLICY),
      launch: {
        arena: arenaName,
        models: contestants.map((c) => c.id),
        limit: effLimit,
        ...(matchJudge?.kind === 'agent'
          ? { judgeAgent: matchJudge.agent }
          : needsJudge
            ? { judge: judgeModels.join(',') }
            : {}),
      },
    });
    if (q.get('commentator') === 'codex' || q.get('commentator') === 'claude')
      session.commentator.configure(q.get('commentator') as AgentId, true);
    runningContestants = contestants.map((c) => c.name); // 状态快照用：中途接入的观众也能看到阵容
    // 选手入场节拍（录制模式专属）：先报幕再开战，视频开场有落点
    if (q.get('pace')) {
      emit(job, {
        type: 'milestone',
        text: `🎙️ 欢迎来到《${def.title}》——${tasks.length} 题 × ${contestants.length} 只蛐蛐同场竞技`,
      });
      for (const c of contestants) {
        emit(job, {
          type: 'milestone',
          text: `🎙️ 选手入场：${rankOf(preElo.get(c.id) ?? 1500).icon} ${c.name}（积分 ${preElo.get(c.id) ?? 1500}）`,
        });
        await delay(350, session.control.abort.signal).catch(() => {});
        if (session.control.abort.signal.aborted) break;
      }
    }

    const collected: BattleRecord[] = [];
    const withdrawals: ContestantWithdrawal[] = [];
    let milestone = 0;
    let lastLead: string | null = null; // 领跑易主快报：领袖更替是直播的核心叙事
    let leadChanges = 0;
    let sprintSent = false;
    const highlights: { text: string; at: number }[] = []; // 高光时刻：与实况同步收集（带交战序号，终局成回放索引）
    // 🎙️ 解说叙事检测器：连胜/连败、团灭题、全场唯一答对的冷门——录制模式的解说流素材
    const wrongOf = new Map<string, number>();
    const answeredOf = new Map<string, number>();
    const streakOf = new Map<string, number>();
    const favId = contestants.reduce((a, b) => ((preElo.get(b.id) ?? 1500) > (preElo.get(a.id) ?? 1500) ? b : a)).id;
    const interimResult = () => ({
      arena: def,
      startedAt: '',
      durationMs: 0,
      contestants,
      records: collected,
      withdrawals,
    });
    const result = await runBattle(def, allTasks, contestants, {
      resumeRecords: checkpoint?.records,
      resumeFailures: Object.fromEntries(
        contestants.map((c) => [
          c.id,
          Math.max(
            0,
            ...(checkpoint?.frames ?? []).flatMap((e) =>
              e.type === 'model' && e.modelId === c.id ? [e.failures ?? 0] : [],
            ),
          ),
        ]),
      ),
      completedRecords: checkpoint?.completed,
      onCheckpoint: checkpoint
        ? (record) => {
            if (session.control.abort.signal.aborted) return;
            const key = recordKey(record),
              at = checkpoint.records.findIndex((r) => recordKey(r) === key);
            if (at < 0) checkpoint.records.push(structuredClone(record));
            else checkpoint.records[at] = structuredClone(record);
            Object.assign(checkpoint, session.state.snapshot());
            evaluations.save(checkpoint);
          }
        : undefined,
      matchId: job.id,
      matchJudge,
      gradingCwd: path.join(ctx.resultsDir, '.grading', job.id),
      onStage: (task, roundIndex, roundTotal, prompt) =>
        emit(job, {
          type: 'stage',
          taskId: task.id,
          roundId: task.rounds?.[roundIndex]?.id ?? 'r1',
          roundIndex,
          roundTotal,
          title: task.rounds?.[roundIndex]?.title ?? '完整答卷',
          prompt,
        }),
      onGrading: (record, status) =>
        emit(job, {
          type: 'grading',
          taskId: record.taskId,
          modelId: record.model,
          status,
          judge: matchJudge!,
          grade: record.grade,
          error: record.gradingError,
        }),
      modelSettings,
      openRouterFreeOnly,
      roundSync: true,
      control: session.control,
      reasoning: 'medium',
      judgeModel: q.get('judge') ?? undefined,
      onRound: (task, index, total) =>
        emit(job, {
          type: 'round',
          taskId: task.id,
          prompt: task.input,
          index,
          total,
          scoring: describeScoring(
            task.judge ?? def.judge,
            judgeModels,
            task.judge ? 'task-override' : 'arena-default',
            false,
            RANKING_POLICY,
          ),
        }),
      onRoundEnd: (task) =>
        emit(job, {
          type: 'round-end',
          taskId: task.id,
          target: task.target,
          scoring: describeScoring(
            task.judge ?? def.judge,
            judgeModels,
            task.judge ? 'task-override' : 'arena-default',
            true,
            RANKING_POLICY,
          ),
          metrics: Object.fromEntries(
            performanceMetrics({ ...interimResult(), records: collected.filter((r) => r.taskId === task.id) }),
          ),
        }),
      onModelEvent: (event) => emit(job, { type: 'model', ...event }),
      onWithdrawal: (withdrawal) => {
        withdrawals.push(withdrawal);
        emit(job, { type: 'withdrawal', withdrawal });
        emit(job, {
          type: 'milestone',
          text: `${nameOf.get(withdrawal.modelId) ?? withdrawal.modelId} · ${withdrawal.message}`,
        });
      },
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? effLimit : undefined,
      paceMs: Number(q.get('pace') ?? 120),
      concurrency: 8,
      onProgress: (done, total, rec) => {
        if (checkpoint && !session.control.abort.signal.aborted) {
          const key = recordKey(rec),
            at = checkpoint.records.findIndex((r) => recordKey(r) === key);
          if (at < 0) checkpoint.records.push(structuredClone(rec));
          else checkpoint.records[at] = structuredClone(rec);
          if (!checkpoint.completed.includes(key)) checkpoint.completed.push(key);
          Object.assign(checkpoint, session.state.snapshot());
          evaluations.save(checkpoint);
        }
        collected.push(rec);
        const mark = displayMark(rec);
        emit(job, {
          type: 'progress',
          done,
          total,
          mark,
          model: nameOf.get(rec.model) ?? rec.model.split(':').pop() ?? rec.model,
          modelId: rec.model,
          taskId: rec.taskId,
          answer: (rec.error ? `弃权：${rec.error}` : rec.answer).slice(0, 60),
          note: (rec.note ?? '').slice(0, 60),
          prompt: rec.prompt.replace(/\s+/g, ' ').slice(0, 240),
          ms: rec.latencyMs,
        });
        if (taskMode) return; // New tracks announce outcomes only after complete formal grading.
        // 领跑易主快报：15% 进度后开局噪声收敛，易主才值得上解说
        if (done >= Math.ceil(total * 0.15) && done < total) {
          const interim = buildLeaderboard(interimResult());
          const lead = interim[0];
          if (lead && lead.answered > 0) {
            if (lastLead !== null && lead.model !== lastLead && leadChanges < 4) {
              {
                const txt = `⚡ 领跑易主：${lead.name} 以 ${pct(lead.avg)} 反超`;
                highlights.push({ text: txt, at: done });
                emit(job, { type: 'milestone', text: txt });
              }
            }
            if (lead.model !== lastLead) {
              lastLead = lead.model;
              leadChanges++;
            }
          }
        }
        if (!sprintSent && done / total >= 0.9 && done < total) {
          sprintSent = true;
          emit(job, { type: 'milestone', text: '🏁 冲刺阶段：最后一成交战，名次仍可能翻盘' });
        }
        // 🎙️ 解说流：连胜/连败与团灭/冷门瞬间（每个事件按构造至多触发一次）
        {
          const nm = nameOf.get(rec.model) ?? rec.model;
          const st = streakOf.get(rec.model) ?? 0;
          const s2 =
            rec.error || rec.score <= 0.01 ? Math.min(-1, st - 1) : rec.score >= 0.99 ? Math.max(1, st + 1) : 0;
          streakOf.set(rec.model, s2);
          if (s2 === 3) emit(job, { type: 'milestone', text: `🎙️ ${nm} 手感火热，连下三城！` });
          if (s2 === 5) {
            const txt = `🎙️ ${nm} 五连绝世——无人能挡！`;
            highlights.push({ text: txt, at: done });
            emit(job, { type: 'milestone', text: txt });
          }
          if (s2 === -3) emit(job, { type: 'milestone', text: `🎙️ ${nm} 连吞三蛋，状态堪忧……` });
          const ans = (answeredOf.get(rec.taskId) ?? 0) + 1;
          answeredOf.set(rec.taskId, ans);
          if (rec.error || rec.score <= 0.01) wrongOf.set(rec.taskId, (wrongOf.get(rec.taskId) ?? 0) + 1);
          if (ans === contestants.length) {
            if ((wrongOf.get(rec.taskId) ?? 0) === contestants.length) {
              {
                const txt = `🎙️ 💥 团灭！${rec.taskId} 全军覆没——这题今晚要上热搜`;
                highlights.push({ text: txt, at: done });
                emit(job, { type: 'milestone', text: txt });
              }
            } else if (contestants.length >= 3) {
              const winners = collected.filter((r) => r.taskId === rec.taskId && r.score >= 0.99);
              if (winners.length === 1 && winners[0]!.model !== favId) {
                {
                  const txt = `🎙️ 冷门！${rec.taskId} 全场只有 ${nameOf.get(winners[0]!.model) ?? winners[0]!.model} 答对——热门集体翻车`;
                  highlights.push({ text: txt, at: done });
                  emit(job, { type: 'milestone', text: txt });
                }
              }
            }
          }
        }
        if (done / total >= milestone + 1 / 3 && done < total) {
          milestone = Math.floor((done / total) * 3) / 3;
          const interim = buildLeaderboard(interimResult());
          const baths = findBloodbaths(interimResult());
          if (interim.length >= 2 && interim[0]!.answered >= contestants.length) {
            emit(job, {
              type: 'milestone',
              text: `战况快报：${interim[0]!.name} ${pct(interim[0]!.avg)} 暂时领跑${baths.length ? `；${baths.length} 道团灭题正在酝酿` : ''}`,
            });
          }
        }
      },
    });
    if (checkpoint && closing) {
      checkpoint.status = 'waiting';
      Object.assign(checkpoint, session.state.snapshot());
      evaluations.save(checkpoint);
      await session.journal.flush();
      return;
    }
    if (checkpoint) result.startedAt = checkpoint.createdAt;
    const board = buildLeaderboard(result);
    result.timelineFile = session.timelineFile;
    await session.journal.flush();
    // 产物先于结算落盘：写报告失败不再留「已结算无战绩」的幻影生涯条目（战报因此不带生涯净值列——诚实边界优先于装饰）
    const lines =
      result.status === 'pending_grading'
        ? ['正式评分尚未完成，答卷已保存。请重试失败评分。']
        : commentate(result, board, preElo);
    const gridTasks = [...new Set(result.records.map((r) => r.taskId))]; // 矩阵只含实际交战题（limit 截断后不为全量）
    const reportFile = await writeReport(result, ctx.resultsDir, { commentary: lines });
    const deltas = result.status === 'stopped' ? [] : await settleBattle(result, board, ctx.resultsDir);
    // 竞猜结算：有冠军且评分完整才判输赢；停止/评分未完/全员未答 → 作废退注；
    // 押中退赛选手的注单独退（弃权≠押错）。结算失败不掀翻赛果——如实留日志，悬挂盘有 24h 兜底。
    const pendingGrades = result.records.filter((r) => r.gradingStatus === 'pending').length;
    try {
      const betReport = settlePrediction(ctx.resultsDir, `battle:${job.id}`, {
        winner:
          result.status === 'stopped' || result.status === 'pending_grading' || pendingGrades > 0
            ? null
            : board[0] && board[0].answered > 0
              ? board[0].model
              : null,
        withdrawn: withdrawals.map((w) => w.modelId),
      });
      for (const r of betReport.results)
        if (r.newAchievements.length)
          emit(job, { type: 'milestone', text: `🎲 竞猜解锁成就：${r.newAchievements.join('、')}` });
    } catch (e) {
      console.error('⚠️  竞猜结算失败（不影响赛果）：', e instanceof Error ? e.message : e);
    }
    await finish(job, {
      type: 'done',
      resultFile: path
        .basename(reportFile)
        .replace(/^战报-/, '战绩-')
        .replace(/\.html$/, '.json'),
      pendingGrades,
      stopped: result.status === 'stopped',
      settlement: buildSettlement(result, board, { expectedTasks: effLimit, deltas, preElo }),
      board: board.map((e: BoardEntry) => ({
        name: e.name,
        avg: e.avg,
        elo: deltas.find((d) => d.id === e.model)?.after ?? e.elo,
        delta: deltas.find((d) => d.id === e.model)?.delta ?? 0,
      })),
      commentary: lines,
      reportFile: `/results/${encodeURIComponent(path.basename(reportFile))}`,
      grid: {
        tasks: gridTasks,
        names: contestants.map((c) => c.name),
        cells: contestants.map((c) =>
          gridTasks.map((tid) => {
            const r = result.records.find((x) => x.model === c.id && x.taskId === tid);
            return !r || r.error ? -1 : r.score >= 0.99 ? 1 : r.score <= 0.01 ? 0 : 0.5;
          }),
        ),
      },
      highlights,
      next: queue[0]?.href,
    });
  }
  /** 录像回放：重放战绩 JSON 的交战过程，不开新赛、不结算生涯
      真实节奏：v0.8 起战绩记录 finishedMs，按原始时间轴重放；旧战绩无 finishedMs 退化为存储顺序等速。
      speed=倍速（默认 5x）；speed=0 或带 pace= 时匀速 pace ms/条 */
  async function startReplay(job: BattleJob): Promise<void> {
    // 真实节奏：v0.8 起战绩记录 finishedMs（距开赛时刻），按原始时间轴重放；
    // 旧战绩无 finishedMs 时退化为存储顺序等速。speed=倍速（默认 5x，0=匀速 60ms/条）
    const result = await loadBattle(job.replayFile!);
    const judgeModels = result.meta?.judgeModels ?? [];
    const rematchNeedsJudge =
      judgeModels.some((id) => !id.startsWith('mock:')) ||
      requiresModelJudge(result.arena.judge) ||
      result.records.some((r) => r.judge && requiresModelJudge(r.judge));
    const scoringFor = (taskId: string, ended: boolean) => {
      const rec = result.records.find((r) => r.taskId === taskId);
      return describeScoring(
        rec?.judge ?? result.arena.judge,
        judgeModels,
        rec?.judge ? 'task-override' : result.meta?.plannedTasks !== undefined ? 'arena-default' : 'legacy-default',
        ended,
        result.meta?.rankingPolicy,
      );
    };
    const nameOf = new Map(result.contestants.map((c) => [c.id, c.name]));
    const speed = Number(job.q.get('speed') ?? 5);
    const ordered = [...result.records].sort((a, b) => (a.finishedMs ?? 0) - (b.finishedMs ?? 0));
    const hasTiming = ordered.some((r) => r.finishedMs !== undefined);
    const fixedPace = Math.max(0, Number(job.q.get('pace') ?? 60));
    const total = ordered.length;
    const from = Math.min(ordered.length, Math.max(0, Number(job.q.get('from') ?? 0))); // 高光猎手：跳到第 N 条记录开拍（矩阵/高光仍按全场算）
    const slice = ordered.slice(from);
    const playTotal = slice.length;
    const book = await loadCareer(ctx.resultsDir, result.arena.mode);
    const replayIcons = Object.fromEntries(
      result.contestants.map((c) => [c.name, rankOf(book.entries[c.id]?.elo ?? 1500).icon]),
    );
    runningContestants = result.contestants.map((c) => c.name);
    emit(job, {
      type: 'start',
      mode: result.arena.mode ?? 'qa',
      matchJudge: result.meta?.judge,
      title: `《${result.arena.title}》`,
      total: playTotal,
      contestants: runningContestants,
      roster: result.contestants.map(({ id, name }) => ({ id, name })),
      icons: replayIcons,
      replay: true,
      scoring: describeScoring(
        result.arena.judge,
        judgeModels,
        result.meta?.plannedTasks !== undefined ? 'arena-default' : 'legacy-default',
        false,
        result.meta?.rankingPolicy,
      ),
      launch: {
        arena: result.arena.name,
        models: result.contestants.map((c) => c.id),
        limit: result.meta?.plannedTasks ?? new Set(result.records.map((r) => r.taskId)).size,
        ...(result.meta?.judge?.kind === 'agent'
          ? { judgeAgent: result.meta.judge.agent }
          : rematchNeedsJudge && judgeModels.length
            ? { judge: judgeModels.join(',') }
            : {}),
      },
    });
    const control = sessions.get(job.id)!.control;
    const timeline =
      result.timelineFile && from === 0 ? await readTimeline(ctx.resultsDir, result.timelineFile).catch(() => []) : [];
    let prevMs = from ? (ordered[from - 1]!.finishedMs ?? 0) : 0;
    if (timeline.length) {
      const callBegan = new Map<string, number>();
      for (const original of timeline) {
        if (['start', 'done', 'queued', 'control', 'commentator'].includes(original.type)) continue;
        await control.checkpoint();
        if (control.abort.signal.aborted) break;
        const wait =
          speed === 0
            ? fixedPace
            : Math.min(2000, Math.max(0, ((original.at ?? prevMs) - prevMs) / Math.max(0.1, speed)));
        prevMs = original.at ?? prevMs;
        await delay(wait, control.abort.signal).catch(() => {});
        if (control.abort.signal.aborted) break;
        const { battle: _battle, seq: _seq, at: _at, ...event } = original;
        if (event.type === 'round' || event.type === 'round-end')
          event.scoring ??= scoringFor(event.taskId, event.type === 'round-end');
        if (event.type === 'model') {
          const key = JSON.stringify([event.taskId, event.modelId, event.attempt, event.roundId]);
          if (event.status === 'generating') callBegan.set(key, original.at ?? 0);
          if (callBegan.has(key)) event.ms ??= Math.max(0, (original.at ?? 0) - callBegan.get(key)!);
          delete event.startedAt;
        }
        emit(job, event);
      }
    } else
      for (let i = 0; i < slice.length; i++) {
        await control.checkpoint();
        if (control.abort.signal.aborted) break;
        const rec = slice[i]!;
        if (hasTiming && speed !== 0) {
          const wait = Math.min(2000, Math.max(0, ((rec.finishedMs ?? 0) - prevMs) / Math.max(0.1, speed)));
          prevMs = rec.finishedMs ?? prevMs;
          if (wait) await delay(wait, control.abort.signal).catch(() => {});
        } else if (fixedPace) {
          await delay(fixedPace, control.abort.signal).catch(() => {});
        }
        if (control.abort.signal.aborted) break;
        const mark = displayMark(rec);
        const taskIds = [...new Set(result.records.map((r) => r.taskId))];
        emit(job, {
          type: 'round',
          taskId: rec.taskId,
          prompt: rec.prompt,
          index: taskIds.indexOf(rec.taskId),
          total: taskIds.length,
          scoring: scoringFor(rec.taskId, false),
        });
        if (rec.rounds?.length) {
          for (const [roundIndex, stage] of rec.rounds.entries()) {
            emit(job, {
              type: 'stage',
              taskId: rec.taskId,
              roundId: stage.roundId,
              roundIndex,
              roundTotal: rec.taskSnapshot?.rounds?.length ?? 1,
              title: stage.title,
              prompt: stage.prompt,
            });
            emit(job, {
              type: 'model',
              taskId: rec.taskId,
              modelId: rec.model,
              attempt: stage.attempts - 1,
              roundId: stage.roundId,
              roundIndex,
              roundTitle: stage.title,
              status: stage.error ? 'error' : 'done',
              answer: stage.answer,
              reasoning: stage.reasoning,
              ms: stage.latencyMs,
              solveMs: stage.solveMs,
              usage: stage.usage,
              usageComplete: stage.usageComplete,
              error: stage.error,
            });
          }
        } else
          emit(job, {
            type: 'model',
            taskId: rec.taskId,
            modelId: rec.model,
            attempt: 0,
            status: rec.error ? 'error' : 'done',
            answer: rec.answer,
            reasoning: rec.reasoning ?? '',
            score: rec.score,
            note: rec.note,
            error: rec.error,
            ms: rec.latencyMs,
            solveMs: rec.solveMs,
            usage: rec.usage,
            usageComplete: rec.usageComplete,
          });
        emit(job, {
          type: 'round-end',
          taskId: rec.taskId,
          target: rec.target,
          scoring: scoringFor(rec.taskId, true),
          ...(tracksEfficiency(result.meta?.rankingPolicy)
            ? {
                metrics: Object.fromEntries(
                  performanceMetrics({ ...result, records: result.records.filter((r) => r.taskId === rec.taskId) }),
                ),
              }
            : {}),
        });
        emit(job, {
          type: 'progress',
          done: i + 1,
          total: playTotal,
          mark,
          model: nameOf.get(rec.model) ?? rec.model.split(':').pop() ?? rec.model,
          modelId: rec.model,
          taskId: rec.taskId,
          answer: (rec.error ? `弃权：${rec.error}` : rec.answer).slice(0, 60),
          ms: rec.latencyMs,
          note: (rec.note ?? '').slice(0, 60),
          prompt: (rec.prompt ?? '').replace(/\s+/g, ' ').slice(0, 240),
        });
      }
    if (!control.abort.signal.aborted) {
      // Saved grades supersede an older timeline after grading was retried from a replay session.
      for (const rec of result.records)
        if (rec.gradingStatus && result.meta?.judge)
          emit(job, {
            type: 'grading',
            taskId: rec.taskId,
            modelId: rec.model,
            status: rec.gradingStatus,
            judge: result.meta.judge,
            grade: rec.grade,
            error: rec.gradingError,
          });
      emitTaskResults(job, result);
      for (const withdrawal of result.withdrawals ?? []) emit(job, { type: 'withdrawal', withdrawal });
    }
    const board = buildLeaderboard(result);
    // 回放高光批量复算（无生涯库：只算团灭与五连，不算冷门/易主）+ 答卷矩阵
    const hlReplay: { text: string; at: number }[] = [];
    if (!result.arena.mode || result.arena.mode === 'qa') {
      const byTask = new Map<string, typeof ordered>();
      for (const r of ordered) {
        const arr = byTask.get(r.taskId) ?? [];
        arr.push(r);
        byTask.set(r.taskId, arr);
      }
      for (const [tid, rs] of byTask) {
        if (rs.length >= result.contestants.length && rs.every((r) => r.error || r.score <= 0.01))
          hlReplay.push({ text: `🎙️ 💥 团灭！${tid} 全军覆没`, at: ordered.lastIndexOf(rs.at(-1)!) + 1 });
      }
      const streak = new Map<string, number>();
      for (const [ri, r] of ordered.entries()) {
        const st = streak.get(r.model) ?? 0;
        const s2 = r.error || r.score <= 0.01 ? Math.min(-1, st - 1) : r.score >= 0.99 ? Math.max(1, st + 1) : 0;
        streak.set(r.model, s2);
        if (s2 === 5) hlReplay.push({ text: `🎙️ ${nameOf.get(r.model) ?? r.model} 五连绝世——无人能挡！`, at: ri + 1 });
      }
    }
    const replayTaskIds = [...new Set(ordered.map((r) => r.taskId))];
    // 录像的战报文件名与战绩同戳：战绩-X-时间.json → 战报-X-时间.html
    const base = path
      .basename(job.replayFile!)
      .replace(/^战绩-/, '战报-')
      .replace(/\.json$/, '.html');
    emit(job, {
      type: 'done',
      resultFile: path.basename(job.replayFile!),
      pendingGrades: result.records.filter((r) => r.gradingStatus === 'pending').length,
      stopped: control.abort.signal.aborted || result.status === 'stopped',
      settlement: buildSettlement(result, board, { replay: true, stopped: control.abort.signal.aborted }),
      board: board.map((e) => ({ name: e.name, avg: e.avg, elo: e.elo, delta: 0 })),
      commentary: ['📼 本场为录像回放：分数为历史记录，生涯不重算。'],
      reportFile: `/results/${encodeURIComponent(base)}`,
      grid: {
        tasks: replayTaskIds,
        names: result.contestants.map((c) => c.name),
        cells: result.contestants.map((c) =>
          replayTaskIds.map((tid) => {
            const r = result.records.find((x) => x.model === c.id && x.taskId === tid);
            return !r || r.error ? -1 : r.score >= 0.99 ? 1 : r.score <= 0.01 ? 0 : 0.5;
          }),
        ),
      },
      highlights: hlReplay,
      next: queue[0]?.href,
    });
  }

  function dispatch(): void {
    if (running || closing) return;
    const next = queue.shift();
    if (!next) return;
    running = next;
    work = (next.replayFile ? startReplay(next) : startBattle(next))
      .catch(async (e) => {
        sessions.get(next.id)?.commentator.configure(sessions.get(next.id)!.commentator.agentId, false);
        await finish(next, { type: 'error', message: e instanceof Error ? e.message : String(e) }).catch(
          (writeError) => {
            const session = sessions.get(next.id);
            if (session) session.journal = undefined;
            emit(next, {
              type: 'error',
              message: `赛事记录写入失败：${writeError instanceof Error ? writeError.message : String(writeError)}`,
            });
          },
        );
      })
      .finally(() => {
        running = null;
        runningContestants = null;
        dispatch();
      });
  }

  function enqueue(job: BattleJob): number {
    const position = queue.length + (running ? 1 : 0); // 0 = 立即开
    // 队列上限：LAN 围观服务器不做无限排队——资源/配额保护（审查 P2）
    if (queue.length >= 16) {
      emit(job, { type: 'error', message: '演播队列已满（16 场）——打完再排' });
      return -1;
    }
    if (position > 0) emit(job, { type: 'queued', position });
    queue.push(job);
    dispatch();
    return position;
  }

  /** 规范化幂等键：只含影响赛果的参数（arena/models/judge/limit/file/from），排序后拼接——
      参数顺序/编码差异与 studio/binge 等呈现参数都不会把同一场比赛分叉成两个 job */
  function canonKey(pathname: string, q: URLSearchParams): string {
    const keys = ['arena', 'from', 'judge', 'judgeAgent', 'limit', 'models', 'file'].filter((k) => q.has(k)).sort();
    return pathname + '?' + keys.map((k) => `${k}=${q.getAll(k).sort().join(',')}`).join('&');
  }
  /** 幂等取 job：href 只做去重键；q 保留原始参数（pace/binge/studio 等运行参数不得被键化丢弃） */
  function ensureJob(
    href: string,
    q: URLSearchParams,
    replayFile?: string,
    restoredId?: string,
  ): { job: BattleJob; created: boolean } {
    const existing = (running?.href === href ? running : undefined) ?? queue.find((j) => j.href === href);
    if (existing) return { job: existing, created: false };
    if (q.get('native') === '1' && queue.length >= 16) throw new Error('演播队列已满（16 场）——打完再排');
    const job: BattleJob = { id: restoredId ?? `b${Date.now()}${++seq}`, q, href, replayFile };
    const state = new LiveState();
    if (restoredId) for (const event of evaluations.states.get(restoredId)!.frames) state.accept(event);
    const control = new BattleControl((value) => emit(job, { type: 'control', state: value }));
    const commentator = new Commentator(
      path.join(ctx.resultsDir, '.commentary', job.id),
      () => state.snapshot().frames,
      (event) => emit(job, event),
    );
    const elapsed = restoredId ? Math.max(0, ...state.snapshot().frames.map((e) => e.at ?? 0)) : 0;
    sessions.set(job.id, { state, control, commentator, began: Date.now() - elapsed });
    if (q.get('native') === '1' && !restoredId)
      evaluations.save({
        id: job.id,
        query: q.toString(),
        status: 'queued',
        createdAt: new Date().toISOString(),
        records: [],
        completed: [],
        frames: [],
        seq: 0,
      });
    if (sessions.size > 8) {
      for (const [id, old] of sessions) {
        if (id !== running?.id && !queue.some((q) => q.id === id) && id !== job.id) {
          old.commentator.dispose();
          sessions.delete(id);
          break;
        }
      }
    }
    enqueue(job);
    return { job, created: true };
  }

  return {
    evaluations,
    resumeEvaluation: (id) => {
      if (closing) throw new Error('服务正在保存退出');
      const saved = evaluations.states.get(id);
      if (!saved || !['waiting', 'interrupted'].includes(saved.status)) throw new Error('此评测不处于待继续状态');
      const q = new URLSearchParams(saved.query);
      if (running || queue.length) throw new Error('请等待当前评测队列结束后续赛');
      saved.status = 'queued';
      evaluations.save(saved);
      ensureJob(canonKey('/battle', q), q, undefined, id);
    },
    competitions,
    retryGrading: async (id, file) => {
      let session = sessions.get(id);
      const saved = evaluations.states.get(id);
      if (!session && saved) {
        const state = new LiveState();
        for (const event of saved.frames) state.accept(event);
        const job = { id, q: new URLSearchParams(), href: '' };
        const control = new BattleControl((value) => emit(job, { type: 'control', state: value }));
        const commentator = new Commentator(
          path.join(ctx.resultsDir, '.commentary', id),
          () => state.snapshot().frames,
          (event) => emit(job, event),
        );
        session = { state, control, commentator, began: Date.now() };
        sessions.set(id, session);
      }
      if (!session || running?.id === id) throw new Error('请在比赛结束后重试评分');
      const savedEnd = session.state.snapshot().frames.find((e) => e.type === 'done');
      if (savedEnd?.type !== 'done' || savedEnd.resultFile !== file)
        throw new Error('评分文件与当前比赛不一致，请打开对应回放');
      const job: BattleJob = { id, q: new URLSearchParams(), href: '' };
      const done = await retryGrading(ctx.resultsDir, file, {
        cwd: path.join(ctx.resultsDir, '.grading', id),
        modelSettings: await readModelSettings(ctx.modelSettingsFile),
        signal: gradingAbort.signal,
        onStatus: (record, status) =>
          emit(job, {
            type: 'grading',
            taskId: record.taskId,
            modelId: record.model,
            status,
            judge: (
              session.state.snapshot().frames.find((e) => e.type === 'start') as Extract<BattleEvent, { type: 'start' }>
            )?.matchJudge ?? { kind: 'agent', agent: 'codex' },
            grade: record.grade,
            error: record.gradingError,
          }),
      });
      emitTaskResults(job, done.result);
      await finish(job, {
        type: 'done',
        board: done.board.map((r) => ({
          name: r.name,
          avg: r.avg,
          elo: r.elo,
          delta: done.settlement.rows.find((s) => s.modelId === r.model)?.delta ?? 0,
        })),
        commentary: [done.settlement.reason],
        reportFile: `/results/${encodeURIComponent(path.basename(done.reportFile))}`,
        resultFile: file,
        pendingGrades: done.result.records.filter((r) => r.gradingStatus === 'pending').length,
        settlement: done.settlement,
      });
    },
    liveSnapshot: (id) => sessions.get(id)?.state.snapshot() ?? evaluations.states.get(id),
    control: (id, action) => {
      const session = sessions.get(id);
      if (!session || running?.id !== id) throw new Error('当前比赛未运行');
      session.control[action]();
      if (action === 'stop') session.commentator.configure(session.commentator.agentId, false);
    },
    commentator: (id, agent, enabled) => {
      const session = sessions.get(id);
      if (!session) throw new Error('比赛已不在当前会话中，请打开回放');
      session.commentator.configure(agent, enabled);
    },
    askCommentator: (id, question, reference) => {
      const session = sessions.get(id);
      if (!session) throw new Error('比赛会话不存在');
      session.commentator.ask(question, reference);
    },
    dispose: () => {
      closing = true;
      competitions.dispose();
      gradingAbort.abort();
      for (const [id, s] of sessions) {
        if (running?.id === id) s.control.stop();
        s.commentator.dispose();
      }
    },
    close: async () => {
      closing = true;
      gradingAbort.abort();
      for (const [id, s] of sessions) {
        if (running?.id === id) s.control.stop();
        s.commentator.dispose();
      }
      await Promise.all([competitions.close(), work]);
      await Promise.all([...sessions.values()].map((s) => s.journal?.flush()));
    },
    subscribe: (fn, replayBattle) => bus.subscribe(fn, replayBattle ?? null),
    snapshot: (): EngineSnapshot => ({
      running: running ? { id: running.id, arena: running.q.get('arena') ?? '回放' } : null,
      queue: queue.map((j) => ({ id: j.id, arena: j.q.get('arena') ?? '回放' })),
      runningContestants,
    }),
    enqueue: (pathname, q, replayFile) => {
      if (closing) throw new Error('服务正在保存退出');
      const href = canonKey(pathname, q);
      return ensureJob(href, q, replayFile);
    },
  };
}
