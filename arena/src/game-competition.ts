import { randomInt, randomUUID, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ServerCtx } from './battle-engine.ts';
import type { ArenaDef, ArenaTask, BattleRecord, BattleResult, Contestant } from './types.ts';
import { loadArena, requirePlayableTasks } from './arena-loader.ts';
import { requiresModelJudge } from './scoring-summary.ts';
import { resolveContestant, askModel } from './models.ts';
import { gameAgents, type GameAgentModel, type GameNativeProvider } from './game-agents.ts';
import { oneFight, type FightEvent } from './runner.ts';
import { judgeAnswer } from './judge.ts';
import { readModelSettings, modelDisplayName } from './model-settings.ts';
import { BattleControl } from './battle-control.ts';
import { abortable, deadline, MATCH_LIMITS } from './battle-resilience.ts';
import { delay } from './streams.ts';
import { writeFileAtomicSync } from './atomic-file.ts';
import { analyzeArena } from './analyze.ts';
import { arenaFingerprint } from './fingerprint.ts';
import { loadCareer, settleBattle } from './career-store.ts';
import { openPrediction, sealPrediction, settlePrediction } from './prediction-store.ts';
import { oddsFromElo } from './odds.ts';
import { buildLeaderboard } from './leaderboard.ts';
import { HumanBridge, type HumanQuestion } from './human-play.ts';
import { revengeOn, type CareerDelta } from './career.ts';
import { drawPreview, type DrawPreview } from './game-seeding.ts';
import { Commentator } from './commentator.ts';
import { competitionFrames, COMMENTARY_KEEP, type GameCommentaryState } from './game-commentary.ts';
import type { CommentatorSession } from './agent-session.ts';
import type { BattleEvent, EventDraft } from './battle-events.ts';
import { parseTier, tierFreeOnly, tierSource, type BattleTier } from './battle-tier.ts';

export interface GameConfig {
  arena: string;
  models: string[];
  draw?: string[];
  limit: number;
  judge?: string;
  demo?: boolean;
  /** 开赛档位：'official' 正式档（可用 BYOK）/ 'free' 免费演示档；缺省沿用旧行为（免费档）。 */
  tier?: BattleTier;
  requestId: string;
  native?: GameAgentModel[];
  /** 开赛时的题库指纹，供赛后分析确认是同一份考卷 */ fingerprint?: string;
}
export interface GameQuestion {
  key: string;
  def: ArenaDef;
  task: ArenaTask;
  /** 载入时的完整题库指纹；旧存档可能缺省，补题保留各自版本。 */
  fingerprint?: string;
}
export interface GameAttack {
  attacker: string;
  target: string;
  damage: number;
}
export interface GameRound {
  id: string;
  index: number;
  overtime: boolean;
  question: GameQuestion;
  phase: string;
  records: (BattleRecord | null)[];
  live: { modelId: string; status: string; answer: string; reasoning: string; attempt: number; error?: string }[];
  settled: boolean;
  before: number[];
  after: number[];
  attacks: GameAttack[];
}
export interface GameDuel {
  id: string;
  stage: number;
  sources: string[];
  players: string[];
  hp: number[];
  status: 'blocked' | 'ready' | 'running' | 'waiting' | 'completed';
  reason: string;
  winner: string;
  regularLimit: number;
  overtime: boolean;
  overtimeUsed: number;
  questions: GameQuestion[];
  rounds: GameRound[];
}
export interface GameEvent {
  seq: number;
  type: string;
  competitionId: string;
  duelId?: string;
  at: number;
  round?: GameRound;
  duel?: GameDuel;
  message?: string;
  winner?: string;
  /** 生涯结算明细（career-settled 事件；游戏赛轨 career-game.json 的每人涨跌） */
  settlement?: CareerDelta[];
}
export interface GameCompetition {
  version: 1;
  id: string;
  createdAt: string;
  config: GameConfig;
  entrants: Contestant[];
  duels: GameDuel[];
  status: 'running' | 'paused' | 'waiting' | 'completed' | 'stopped';
  activeDuelId: string;
  winner: string;
  reason: string;
  seq: number;
  events: GameEvent[];
  /** 解说席状态；流式文本只更新这里，不逐字写进事件日志 */
  commentary?: GameCommentaryState;
}
export interface FightContext {
  competition: GameCompetition;
  duel: GameDuel;
  round: GameRound;
  player: Contestant;
  previous: BattleRecord | null;
  control: BattleControl;
  /** 本场是否仅走免费渠道（由开赛档位决定；缺省沿用旧行为=免费）。 */
  freeOnly: boolean;
  notify: (e: FightEvent) => void;
}
export interface GameOptions {
  fight?: (ctx: FightContext) => Promise<BattleRecord>;
  turnMs?: number;
  intervalMs?: number;
  agents?: GameNativeProvider;
  commentatorSession?: (agent: string) => CommentatorSession;
}

/** 对战数值（调手感只改这里，结算/开局逻辑不写魔数） */
export const MAX_HP = 100;
/** 满分 0 伤、零分 20 伤：damage = DAMAGE_SCALE * (1 - score) */
export const DAMAGE_SCALE = 20;
/** 加赛最多追加的题数：逐题首次分出高下即决胜；题库先耗尽才挂起补题 */
export const OVERTIME_LIMIT = 10;
/** 复仇气势：被对手连压 ≥2 场的一方开场 HP 加成（哀兵必胜，仅游戏轨恩怨，benchmark 科学榜零加成） */
export const REVENGE_HP_BONUS = 5;
/** 挂起态自动重试上限：持久性错误（欠费/断网）不无限空转 */
export const AUTO_RESUME_LIMIT = 2;

const clone = <T>(v: T): T => structuredClone(v);
function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
/**
 * 同一轮的对决共用一套题（不同晋级路线难度一致，也让同轮对比有意义）。
 * 常规题随机；加赛题按历史区分度从高到低排，更容易一题分出高下；没有区分度数据的题随机排在后面。
 */
export function stageQuestions(
  questions: GameQuestion[],
  regular: number,
  sharpness: ReadonlyMap<string, number>,
  order: <T>(items: T[]) => T[] = shuffle,
): GameQuestion[] {
  const shuffled = order(questions),
    rest = shuffled.slice(regular);
  rest.sort((a, b) => (sharpness.get(b.task.id) ?? -2) - (sharpness.get(a.task.id) ?? -2));
  return [...shuffled.slice(0, regular), ...rest];
}
const valid = (r: BattleRecord | null): r is BattleRecord =>
  !!r && !r.error && Number.isFinite(r.score) && r.score >= 0 && r.score <= 1;

/** Pure, simultaneous settlement. Display rounding never enters this calculation. */
export function settleGameRound(hp: number[], scores: number[]) {
  if (hp.length !== 2 || scores.length !== 2 || scores.some((s) => !Number.isFinite(s) || s < 0 || s > 1))
    throw new Error('需要双方有效评分');
  const damage = scores.map((s) => DAMAGE_SCALE * (1 - s));
  return { damage, after: hp.map((h, i) => Math.max(0, h - damage[i]!)) };
}

/** Durable game state is separate from benchmark rankings and career settlement. */
export class GameCompetitions {
  private ctx: ServerCtx;
  private options: GameOptions;
  private directory: string;
  private states = new Map<string, GameCompetition>();
  private commentators = new Map<string, Commentator>();
  private workers = new Map<string, { control: BattleControl; promise: Promise<void> }>();
  private human = new HumanBridge();
  private disposed = false;
  /** 挂起态自动恢复：每场对局的自动重试次数（内存态，进程重启重新计） */
  private autoRetries = new Map<string, number>();
  /** 自动续赛去抖：客户端轮询密集，同一赛事 1.5 秒内只调度一次 */
  private resumeScheduled = new Set<string>();
  constructor(ctx: ServerCtx, options: GameOptions = {}) {
    this.ctx = ctx;
    this.options = options;
    this.directory = path.join(ctx.resultsDir, 'game-competitions');
    for (const file of (existsSync(this.directory) ? readdirSync(this.directory) : []).filter((f) =>
      /^c[\da-f-]+\.json$/.test(f),
    )) {
      const c = JSON.parse(readFileSync(path.join(this.directory, file), 'utf8')) as GameCompetition;
      if (c.version !== 1 || `${c.id}.json` !== file) throw new Error(`赛事存档格式无效：${file}`);
      this.states.set(c.id, c);
      // 解说会话不跨进程：重启后解说席关闭，未写完的条目标为中断
      if (c.commentary) {
        c.commentary.enabled = false;
        for (const e of c.commentary.entries)
          if (e.status === 'working') {
            e.status = 'error';
            e.text = (e.text ? e.text + '\n\n' : '') + '后端已重启，本条解说中断';
          }
      }
      if (c.status === 'running' || c.status === 'paused') {
        c.status = 'waiting';
        c.reason = '后端已重启，请继续赛事';
        for (const d of c.duels)
          if (d.status === 'running') {
            d.status = 'waiting';
            d.reason = 'interrupted';
          }
        this.emit(c, 'pending', { message: c.reason });
      }
    }
  }
  private save(c: GameCompetition) {
    mkdirSync(this.directory, { recursive: true });
    const file = path.join(this.directory, `${c.id}.json`);
    writeFileAtomicSync(file, JSON.stringify(c));
  }
  private emit(
    c: GameCompetition,
    type: string,
    data: Omit<Partial<GameEvent>, 'seq' | 'competitionId' | 'type'> = {},
  ) {
    c.events.push(clone({ ...data, seq: ++c.seq, type, competitionId: c.id, at: Date.now() }));
    this.save(c);
    // 赛事进展驱动解说席的"有新内容"标记，解说席自己决定何时点评
    const commentator = this.commentators.get(c.id);
    if (commentator) {
      if (type === 'model') commentator.observe({ type: 'model' } as BattleEvent);
      else if (type === 'round-resolved') commentator.observe({ type: 'round-end' } as BattleEvent);
      else if (type === 'competition-end' && c.winner) commentator.observe({ type: 'done' } as BattleEvent);
    }
  }
  /** 区分度（point-biserial r，按题 id）；历史不足或混有多种实验协议时返回空表，加赛题退回随机顺序 */
  private async sharpness(arena: string): Promise<Map<string, number>> {
    try {
      return new Map(
        (await analyzeArena(arena, this.ctx.resultsDir)).tasks.flatMap((t) =>
          t.r === null ? [] : [[t.taskId, t.r] as [string, number]],
        ),
      );
    } catch {
      return new Map();
    }
  }
  /** 抽签预览：按短题竞速生涯的 Glicko 排种子并给出首轮预期胜率；mode=random 为纯随机抽签 */
  async draw(models: string[], mode: 'seeded' | 'random' = 'seeded'): Promise<DrawPreview> {
    if (
      !Array.isArray(models) ||
      ![2, 4, 8].includes(models.length) ||
      new Set(models).size !== models.length ||
      models.some((x) => typeof x !== 'string' || !x || x.length > 256)
    )
      throw new Error('请选择 2、4 或 8 位不同选手');
    if (mode !== 'seeded' && mode !== 'random') throw new Error('未知抽签方式');
    const book = await loadCareer(this.ctx.resultsDir, 'qa');
    return drawPreview(models, (id) => book.entries[id]?.glicko, mode, shuffle);
  }
  private get(id: string) {
    const c = this.states.get(id);
    if (!c) throw new Error('赛事不存在');
    return c;
  }
  list() {
    return [...this.states.values()].reverse().map((c) => ({
      id: c.id,
      title: `${c.entrants.length} 人赛 · ${c.config.arena}`,
      status: c.status,
      winner: c.winner,
      createdAt: c.createdAt,
    }));
  }
  read(id: string, after = 0) {
    if (!Number.isSafeInteger(after) || after < 0) throw new Error('非法事件游标');
    const c = this.get(id);
    // 挂起态自动恢复：客户端轮询即视为有人在看，中断/失败的对局自动续赛
    this.scheduleAutoResume(c);
    const { events, ...snapshot } = c;
    return clone({
      id,
      seq: c.seq,
      snapshot: { ...snapshot, pauseState: this.workers.get(id)?.control.state ?? '' },
      events: events.filter((e) => e.seq > after),
    });
  }
  private async bank(arena: string, demo: boolean, judge?: string): Promise<GameQuestion[]> {
    if (typeof arena !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(arena)) throw new Error('非法题库');
    const { def, tasks } = await loadArena(path.join(this.ctx.arenasDir, arena));
    if (def.mode && def.mode !== 'qa') throw new Error('3D 对决仅支持普通问答；工程和多阶段任务请使用工作台');
    const fingerprint = arenaFingerprint(def, tasks);
    return requirePlayableTasks(def, tasks)
      .map((t) => {
        if (requiresModelJudge(t.judge ?? def.judge) && (demo || !judge))
          throw new Error(demo ? '模拟赛不调用付费裁判，请选择规则评分题库' : '请选择模型裁判');
        const task = { ...t, input: (def.taskPrefix ?? '') + (def.conditionPrefix?.[t.condition] ?? '') + t.input };
        // Same prompt in a renamed supplemental bank is still the same question.
        const key = createHash('sha256').update(task.input.trim()).digest('hex');
        return { key, def, task, fingerprint };
      })
      .filter((q, i, all) => all.findIndex((x) => x.key === q.key) === i);
  }
  async create(config: GameConfig) {
    if (this.disposed) throw new Error('服务已关闭');
    if (
      !config ||
      !Array.isArray(config.models) ||
      ![2, 4, 8].includes(config.models.length) ||
      new Set(config.models).size !== config.models.length ||
      config.models.some((x) => typeof x !== 'string' || !x || x.length > 256 || /[,\s]/.test(x))
    )
      throw new Error('请选择 2、4 或 8 位不同选手');
    if (!Number.isInteger(config.limit) || config.limit < 1 || config.limit > 100)
      throw new Error('题数必须为 1 至 100');
    if (typeof config.requestId !== 'string' || !/^[\w-]{8,80}$/.test(config.requestId))
      throw new Error('缺少有效开赛标识');
    if (config.judge && (typeof config.judge !== 'string' || /[,\s]/.test(config.judge) || config.judge.length > 256))
      throw new Error('非法裁判');
    parseTier(config.tier); // HTTP body 可能传入任意值；非法档位明确报错，不静默退回默认（会把写错档位悄悄送进正式榜）
    if (config.models.some((x) => x.startsWith('mock:')) && !config.demo)
      throw new Error('模拟选手仅用于明确标注的体验赛');
    if (config.demo && (config.models.some((x) => !x.startsWith('mock:')) || config.judge))
      throw new Error('体验赛仅使用模拟选手及规则裁判');
    if (config.judge && resolveContestant(config.judge).kind === 'mock')
      throw new Error('真实比赛请选择正式裁判，不能使用模拟评分');
    const existing = [...this.states.values()].find((c) => c.config.requestId === config.requestId);
    if (existing) return { id: existing.id, created: false };
    const questions = await this.bank(config.arena, !!config.demo, config.judge);
    const sharpness = await this.sharpness(config.arena);
    const fingerprint = questions[0]!.fingerprint;
    const entrants = config.models.map(resolveContestant);
    if (entrants.some((c, i) => c.id !== config.models[i])) throw new Error('请使用唯一模型 ID，花名在形象设置中修改');
    const settings = await readModelSettings(this.ctx.modelSettingsFile);
    for (const entrant of entrants) entrant.name = modelDisplayName(settings, entrant.id, entrant.name);
    const nativeIds = [
      ...new Set([...config.models, ...(config.judge ? [config.judge] : [])].filter((id) => id.startsWith('agent:'))),
    ];
    const native: GameAgentModel[] = [];
    if (nativeIds.length) {
      const available = await (this.options.agents ?? gameAgents).catalog(true);
      for (const id of nativeIds) {
        const model = available.models.find((m) => m.id === id);
        if (!model?.ready) throw new Error(model?.message ?? '本机 Agent 模型不可用，请重新检测后选择');
        native.push(clone(model));
        const entrant = entrants.find((e) => e.id === id);
        if (entrant) entrant.name = model.name;
      }
    }
    const draw = config.draw ?? (await this.draw(config.models)).draw;
    if (
      draw.length !== entrants.length ||
      new Set(draw).size !== draw.length ||
      draw.some((x) => !config.models.includes(x))
    )
      throw new Error('抽签阵容不一致');
    // Recheck after asynchronous bank loading: concurrent identical POSTs create once.
    const raced = [...this.states.values()].find((c) => c.config.requestId === config.requestId);
    if (raced) return { id: raced.id, created: false };
    const c: GameCompetition = {
      version: 1,
      id: `c${randomUUID()}`,
      createdAt: new Date().toISOString(),
      config: clone({ ...config, native, draw, fingerprint, limit: Math.min(config.limit, questions.length) }),
      entrants,
      duels: [],
      status: 'running',
      activeDuelId: '',
      winner: '',
      reason: '',
      seq: 0,
      events: [],
    };
    let sources: GameDuel[] = [];
    let stage = 0;
    for (let count = draw.length / 2; count >= 1; count /= 2, stage++) {
      const level: GameDuel[] = [],
        shared = stageQuestions(questions, c.config.limit, sharpness);
      for (let i = 0; i < count; i++) {
        const d: GameDuel = {
          id: `m${c.duels.length + 1}`,
          stage,
          sources: stage ? sources.slice(i * 2, i * 2 + 2).map((x) => x.id) : [],
          players: stage ? [] : draw.slice(i * 2, i * 2 + 2),
          hp: [MAX_HP, MAX_HP],
          status: stage ? 'blocked' : 'ready',
          reason: '',
          winner: '',
          regularLimit: c.config.limit,
          overtime: false,
          overtimeUsed: 0,
          questions: [...shared],
          rounds: [],
        };
        c.duels.push(d);
        level.push(d);
      }
      sources = level;
    }
    this.states.set(c.id, c);
    // 复仇气势：首轮对阵已知，被对手连压 ≥2 场的一方开场 HP 加成（后续轮在 finish 填人后判定）
    for (const d of c.duels.filter((x) => x.players.length === 2)) await this.applyRevengeBonus(d);
    // 盘口竞猜：赛事捧杯盘（事件封盘——首场开打即封）。赔率与抽签预期同源（qa 轨 Glicko）。
    // 开盘失败绝不掀翻赛事；同步落盘让 create 返回时盘口已可押（重复 POST 幂等不重复开盘）。
    try {
      const book = await loadCareer(this.ctx.resultsDir, 'qa');
      const odds = oddsFromElo(entrants.map((e) => ({ name: e.id, elo: book.entries[e.id]?.glicko?.r ?? 1500 })));
      openPrediction(this.ctx.resultsDir, {
        id: `comp:${c.id}`,
        kind: 'competition',
        title: `${entrants.length} 人赛 · ${config.arena}`,
        openedAt: c.createdAt,
        closesAt: null,
        demo: !!config.demo,
        entries: entrants.map((e, i) => ({ id: e.id, name: e.name, prob: odds[i]!.prob, odds: odds[i]!.odds })),
      });
    } catch (e) {
      console.error('⚠️  竞猜开盘失败（不影响赛事）：', e instanceof Error ? e.message : e);
    }
    this.emit(c, 'competition-start', {
      message: config.limit === c.config.limit ? '对阵已锁定' : `题量不足，常规题数调整为 ${c.config.limit}`,
    });
    this.start(c);
    return { id: c.id, created: true };
  }
  control(id: string, action: string) {
    const c = this.get(id);
    if (c.status === 'completed' || c.status === 'stopped') throw new Error('赛事已结束');
    const worker = this.workers.get(id);
    if (action === 'stop') {
      c.status = 'stopped';
      c.reason = '用户停止，未决比赛不产生冠军';
      // 用户停止 → 捧杯盘作废全额退注（没打完不算押错）
      try {
        settlePrediction(this.ctx.resultsDir, `comp:${c.id}`, { winner: null });
      } catch {
        /* 竞猜作废失败不影响停止 */
      }
      this.emit(c, 'competition-end', { message: c.reason });
      worker?.control.stop();
    } else if (action === 'pause' && worker) {
      c.status = 'paused';
      worker.control.pause();
      this.emit(c, 'control', { message: '暂停：本题答卷保留，继续后结算' });
    } else if (action === 'resume' && c.status === 'paused' && worker) {
      c.status = 'running';
      worker.control.resume();
      this.emit(c, 'control', { message: '继续' });
    } else throw new Error('请从待续赛事选择继续，或重试失败环节');
  }
  async continue(id: string, duelId?: string, arena?: string) {
    const c = this.get(id);
    if (c.status === 'completed' || c.status === 'stopped') throw new Error('赛事已结束');
    if (this.workers.has(id)) throw new Error('请等待当前对局完成后续赛');
    const d = duelId ? c.duels.find((x) => x.id === duelId) : undefined;
    if (duelId && (!d || d.status !== 'waiting')) throw new Error('请选择待续对局');
    if (d) {
      if (d.reason === 'tie' || d.reason === 'questions') {
        if (!arena) throw new Error('请选择补充题库');
        const extra = await this.bank(arena, !!c.config.demo, c.config.judge);
        if (this.workers.has(id) || ['stopped', 'completed'].includes(this.get(id).status) || d.status !== 'waiting')
          throw new Error('赛事状态已改变');
        const used = new Set(d.rounds.map((r) => r.question.key));
        const fresh = shuffle(extra.filter((q) => !used.has(q.key)));
        if (!fresh.length) throw new Error('补充题库没有本场未答过的新题');
        d.questions = [...d.rounds.map((r) => r.question), ...fresh];
        if (d.reason === 'tie') {
          d.hp = [MAX_HP, MAX_HP];
          d.overtimeUsed = 0;
        }
      }
      d.status = 'ready';
      d.reason = '';
    } else {
      for (const match of c.duels)
        if (match.status === 'waiting' && match.reason === 'interrupted') {
          match.status = 'ready';
          match.reason = '';
        }
      if (!c.duels.some((x) => x.status === 'ready')) throw new Error('请选择待续对局及补充题库，或重试异常');
    }
    c.status = 'running';
    c.reason = '';
    this.emit(c, 'control', { message: '赛事继续' });
    this.start(c);
  }
  /**
   * 挂起态自动恢复：waiting 的中断/失败对局自动续赛，不再要求手动 ContinueDuel。
   * 边界（为什么这样收）：
   * - tie/questions 需要人工补充题库，绝不自动；
   * - 每场对局自动重试上限 2 次（AUTO_RESUME_LIMIT），防持久性错误（欠费/断网）无限空转烧额度；
   * - 借道客户端轮询触发：有人看才续，无人时不烧额度；去抖 1.5 秒防轮询风暴。
   */
  private scheduleAutoResume(c: GameCompetition) {
    if (this.disposed || this.workers.has(c.id) || c.status !== 'waiting') return;
    const stuck = c.duels.filter(
      (d) => d.status === 'waiting' && (d.reason === 'interrupted' || d.reason === 'failure'),
    );
    if (!stuck.some((d) => (this.autoRetries.get(this.retryKey(c.id, d.id)) ?? 0) < AUTO_RESUME_LIMIT)) return;
    if (this.resumeScheduled.has(c.id)) return;
    this.resumeScheduled.add(c.id);
    setTimeout(() => {
      this.resumeScheduled.delete(c.id);
      const fresh = this.states.get(c.id);
      if (this.disposed || this.workers.has(c.id) || !fresh || fresh.status !== 'waiting') return;
      let attempts = 0;
      for (const d of stuck) {
        const key = this.retryKey(c.id, d.id);
        const used = this.autoRetries.get(key) ?? 0;
        if (used >= AUTO_RESUME_LIMIT) continue;
        this.autoRetries.set(key, used + 1);
        d.status = 'ready'; // failure 对局就地重试：run() 只补失败环节，保留成功答卷
        d.reason = '';
        attempts++;
      }
      if (!attempts || !c.duels.some((x) => x.status === 'ready')) return;
      c.status = 'running';
      c.reason = '';
      this.emit(c, 'control', { message: `自动续赛（重试 ${attempts} 场）` });
      this.start(c);
    }, 1500).unref?.();
  }

  /** 对局 id 只在赛事内唯一；跨赛事共用同一个键会让两场赛事的 m1..mN 互相偷走重试额度。 */
  private retryKey(competitionId: string, duelId: string): string {
    return competitionId + '/' + duelId;
  }
  private start(c: GameCompetition) {
    if (this.workers.has(c.id) || this.disposed) return;
    const control = new BattleControl();
    // Schedule after registration so even instant mock completions cannot race worker ownership.
    const promise = Promise.resolve()
      .then(() => this.run(c, control))
      .catch((error) => {
        if (control.abort.signal.aborted || this.disposed) return;
        c.status = 'waiting';
        c.reason = error instanceof Error ? error.message : String(error);
        const d = c.duels.find((x) => x.id === c.activeDuelId);
        if (d?.status === 'running') {
          d.status = 'waiting';
          d.reason = 'interrupted';
        }
        this.emit(c, 'pending', { message: c.reason });
      })
      .finally(() => {
        this.workers.delete(c.id);
      });
    this.workers.set(c.id, { control, promise });
  }
  private async checkpoint(control: BattleControl) {
    await control.checkpoint();
    control.abort.signal.throwIfAborted();
    if (this.disposed) throw new Error('服务关闭');
  }
  private async pace(ms: number, control: BattleControl) {
    for (let left = ms; left > 0; left -= 100) {
      await this.checkpoint(control);
      await delay(Math.min(100, left), control.abort.signal);
    }
    await this.checkpoint(control);
  }
  private async fight(x: FightContext): Promise<BattleRecord> {
    if (this.options.fight) return this.options.fight(x);
    const settings = await readModelSettings(this.ctx.modelSettingsFile);
    const { def, task } = x.round.question;
    const judges = x.competition.config.judge ? [x.competition.config.judge] : [];
    const ask: typeof askModel = (player, question, kind, options = {}) => {
      if (!player.id.startsWith('agent:')) return askModel(player, question, kind, options);
      const selection = x.competition.config.native?.find((m) => m.id === player.id);
      if (!selection) throw new Error('存档缺少 Agent 开赛配置，请新建赛事；不会切换为 API');
      return (this.options.agents ?? gameAgents).ask(selection, question.input, options);
    };
    // A grading failure retains its answer; retrying never regenerates a successful call.
    if (x.previous?.answer && (x.previous.note?.includes('裁判') || x.previous.note?.includes('未评分'))) {
      const timer = deadline(MATCH_LIMITS.judgeMs, '裁判超时', [x.control.abort.signal]);
      try {
        x.notify({
          taskId: task.id,
          modelId: x.player.id,
          attempt: 0,
          status: 'judging',
          answer: x.previous.answer,
          reasoning: x.previous.reasoning,
        });
        const verdict = await abortable(
          () =>
            judgeAnswer(def, task, x.previous!.answer, judges, timer.signal, {
              modelSettings: settings,
              openRouterFreeOnly: x.freeOnly,
              ask,
            }),
          timer.signal,
        );
        return { ...x.previous, ...verdict, error: undefined, withdrawal: undefined };
      } catch (error) {
        return { ...x.previous, error: String(error), note: '裁判弃权（调用失败）' };
      } finally {
        timer.clear();
      }
    }
    // 玩家选手（human:）：答卷经 human-play 通道提交；评分与模型同一裁判标准，判分失败保留答卷只补判
    if (x.player.kind === 'human') {
      x.notify({ taskId: task.id, modelId: x.player.id, attempt: 0, status: 'waiting', answer: '', reasoning: '' });
      const { answer: pending } = this.human.request(
        {
          competitionId: x.competition.id,
          duelId: x.duel.id,
          roundId: x.round.id,
          playerId: x.player.id,
          prompt: task.input,
        },
        x.control.abort.signal,
      );
      this.emit(x.competition, 'human-question', {
        duelId: x.duel.id,
        round: x.round,
        message: `${x.player.name} 等你作答`,
      });
      const out = await pending;
      // 交卷即落盘未判分答卷：判分失败或后端重启只补判分，绝不要求玩家重答
      x.notify({
        taskId: task.id,
        modelId: x.player.id,
        attempt: 0,
        status: 'judging',
        answer: out.text,
        reasoning: out.reasoning ?? '',
      });
      const base: BattleRecord = {
        taskId: task.id,
        condition: task.condition,
        model: x.player.id,
        prompt: task.input,
        answer: out.text,
        reasoning: out.reasoning,
        score: 0,
        latencyMs: out.latencyMs,
        note: '答案未评分',
        error: '评分未完成',
      };
      const timer = deadline(MATCH_LIMITS.judgeMs, '裁判超时', [x.control.abort.signal]);
      try {
        const verdict = await abortable(
          () =>
            judgeAnswer(def, task, base.answer, judges, timer.signal, {
              modelSettings: settings,
              openRouterFreeOnly: x.freeOnly,
              ask,
            }),
          timer.signal,
        );
        return { ...base, ...verdict, error: undefined, withdrawal: undefined };
      } catch (error) {
        return { ...base, error: String(error), note: '裁判弃权（调用失败）' };
      } finally {
        timer.clear();
      }
    }
    return oneFight(
      def,
      task,
      x.player,
      judges,
      x.player.id.startsWith('agent:') ? 0 : 2,
      {
        ask,
        judgeAsk: ask,
        control: x.control,
        modelSettings: settings,
        openRouterFreeOnly: x.freeOnly,
        reasoning: 'medium',
        onModelEvent: x.notify,
      },
      { failures: 0, abort: new AbortController() },
      () => {},
      () => {},
    );
  }
  private async run(c: GameCompetition, control: BattleControl) {
    while (true) {
      await this.checkpoint(control);
      const d = c.duels.find((x) => x.status === 'ready');
      if (!d) {
        const final = c.duels.at(-1)!;
        c.status = final.winner ? 'completed' : 'waiting';
        c.winner = final.winner;
        c.activeDuelId = '';
        c.reason = final.winner ? '赛事结束' : '平局或异常待续；尚未产生冠军';
        // 捧杯盘结算：有冠军判输赢；待续（平局补题/异常）先不结——续赛后在此路径自然结算，
        // 彻底不续的悬挂盘由 24h 兜底作废退注。（成就展示在竞猜台页，不在解说席误路由）
        if (final.winner)
          try {
            settlePrediction(this.ctx.resultsDir, `comp:${c.id}`, { winner: final.winner });
          } catch (e) {
            console.error('⚠️  竞猜结算失败（不影响赛果）：', e instanceof Error ? e.message : e);
          }
        this.emit(c, final.winner ? 'competition-end' : 'pending', { winner: c.winner, message: c.reason });
        return;
      }
      c.activeDuelId = d.id;
      d.status = 'running';
      // 首场开打即封盘：捧杯盘窗口到此为止（幂等，后续对局重复封是 no-op）
      try {
        sealPrediction(this.ctx.resultsDir, `comp:${c.id}`);
      } catch {
        /* 竞猜封盘失败不影响比赛 */
      }
      this.emit(c, 'duel-start', { duelId: d.id, duel: d });
      while (d.status === 'running') {
        await this.checkpoint(control);
        if (d.winner) {
          await this.finish(c, d);
          break;
        }
        let r = d.rounds.at(-1);
        if (!r || r.settled) {
          const q = d.questions[d.rounds.length];
          if (!q) {
            d.status = 'waiting';
            d.reason = 'questions';
            this.emit(c, 'pending', { duelId: d.id, message: '加赛缺题，请补充题库' });
            break;
          }
          r = {
            id: `${d.id}-r${d.rounds.length + 1}`,
            index: d.rounds.length + 1,
            overtime: d.overtime,
            question: q,
            phase: 'solving',
            records: [null, null],
            live: d.players.map((modelId) => ({ modelId, status: 'waiting', answer: '', reasoning: '', attempt: 0 })),
            settled: false,
            before: [...d.hp],
            after: [...d.hp],
            attacks: [],
          };
          d.rounds.push(r);
          this.emit(c, 'round-start', { duelId: d.id, round: r });
        }
        const round = r;
        round.phase = 'solving';
        await Promise.all(
          d.players.map(async (id, i) => {
            if (valid(round.records[i]!)) return;
            let accepting = true;
            const blocks = { answer: new Map<number, string>(), reasoning: new Map<number, string>() };
            const notify = (e: FightEvent) => {
              if (!accepting || this.disposed || control.abort.signal.aborted || round.settled) return;
              const live = round.live[i]!;
              if (e.attempt < live.attempt) return;
              if (e.attempt > live.attempt || e.status === 'generating') {
                blocks.answer.clear();
                blocks.reasoning.clear();
                live.answer = '';
                live.reasoning = '';
              }
              live.attempt = e.attempt;
              if (e.status) live.status = e.status;
              if (e.channel) {
                const b = blocks[e.channel];
                b.set(e.block!, e.replace ? e.delta! : (b.get(e.block!) ?? '') + e.delta);
                live[e.channel] = [...b]
                  .sort(([a], [b]) => a - b)
                  .map(([, s]) => s)
                  .join('');
              }
              if (e.answer !== undefined) live.answer = e.answer;
              if (e.reasoning !== undefined) live.reasoning = e.reasoning;
              live.error = e.error;
              round.phase = round.live.every((a) => ['judging', 'done', 'error'].includes(a.status))
                ? 'judging'
                : 'solving';
              // Completed generation is a durable checkpoint even if the process dies during judging.
              if (e.status === 'judging' && e.answer)
                round.records[i] = {
                  taskId: round.question.task.id,
                  condition: round.question.task.condition,
                  model: id,
                  prompt: round.question.task.input,
                  answer: e.answer,
                  reasoning: e.reasoning,
                  score: 0,
                  latencyMs: e.ms ?? 0,
                  error: '评分未完成',
                  note: '答案未评分',
                };
              if (e.status) this.emit(c, 'model', { duelId: d.id, round });
            };
            const previous = round.records[i];
            try {
              // A new explicit retry may start attempt numbering from zero.
              round.live[i]!.attempt = 0;
              const record = await abortable(
                () =>
                  this.fight({
                    competition: c,
                    duel: d,
                    round,
                    player: c.entrants.find((p) => p.id === id)!,
                    previous: previous ?? null,
                    control,
                    freeOnly: tierFreeOnly(c.config.tier),
                    notify,
                  }),
                control.abort.signal,
              );
              if (control.abort.signal.aborted || this.disposed) return;
              round.records[i] = record;
              round.live[i] = {
                modelId: id,
                attempt: 0,
                status: valid(record) ? 'done' : 'error',
                answer: record.answer,
                reasoning: record.reasoning ?? '',
                error: record.error,
              };
              this.emit(c, 'model', { duelId: d.id, round });
            } catch (error) {
              if (control.abort.signal.aborted || this.disposed) return;
              round.records[i] = {
                taskId: round.question.task.id,
                condition: round.question.task.condition,
                model: id,
                prompt: round.question.task.input,
                answer: '',
                score: 0,
                latencyMs: 0,
                error: String(error),
              };
              round.live[i]!.status = 'error';
              round.live[i]!.error = String(error);
              this.emit(c, 'model', { duelId: d.id, round });
            } finally {
              accepting = false;
            }
          }),
        );
        await this.checkpoint(control);
        if (!round.records.every(valid)) {
          round.phase = 'error';
          d.status = 'waiting';
          d.reason = 'failure';
          this.emit(c, 'pending', { duelId: d.id, round, message: '调用或评分失败；保留成功答卷，重试失败环节' });
          break;
        }
        if (!round.settled) {
          const scores = round.records.map((x) => x!.score);
          const result = settleGameRound(d.hp, scores);
          round.before = [...d.hp];
          d.hp = result.after;
          round.after = [...d.hp];
          round.attacks = d.players.map((target, i) => ({
            target,
            attacker: d.players[1 - i]!,
            damage: result.damage[i]!,
          }));
          round.settled = true;
          round.phase = 'clash';
          // Settlement and outcome decision are persisted together before the presentation wait.
          if (d.overtime) {
            d.overtimeUsed++;
            if (scores[0] !== scores[1]) d.winner = d.players[scores[0]! > scores[1]! ? 0 : 1]!;
            else if (d.overtimeUsed >= OVERTIME_LIMIT) {
              d.status = 'waiting';
              d.reason = 'tie';
            }
          } else if ((d.hp[0] === 0) !== (d.hp[1] === 0)) d.winner = d.players[d.hp[0] === 0 ? 1 : 0]!;
          else if ((d.hp[0] === 0 && d.hp[1] === 0) || round.index >= d.regularLimit) {
            if (d.hp[0] !== d.hp[1]) d.winner = d.players[d.hp[0]! > d.hp[1]! ? 0 : 1]!;
            else {
              d.overtime = true;
              d.overtimeUsed = 0;
              d.hp = [MAX_HP, MAX_HP];
            }
          }
          this.emit(c, 'round-resolved', { duelId: d.id, round });
        }
        await this.pace(this.options.turnMs ?? 3000, control);
        round.phase = 'result';
        if (d.winner) await this.finish(c, d);
        else if (d.status === 'waiting')
          this.emit(c, 'pending', { duelId: d.id, message: `${OVERTIME_LIMIT} 题加赛仍平局，等待补充题库` });
      }
      this.emit(c, 'intermission', { duelId: d.id, message: '5 秒后进入下一场；可暂停' });
      await this.pace(this.options.intervalMs ?? 5000, control);
    }
  }
  /**
   * 复仇气势：被对手连压 ≥2 场（rivals.streak ≤ -2）的一方开场 HP+REVENGE_HP_BONUS（哀兵必胜）。
   * 恩怨数据在游戏赛账本 career-game.json；查询失败不掀比赛（气氛事小、对局事大）。
   * 加成只给开场满血（加赛/重置回 MAX_HP 不再给）——气势是开场 buff 不是常驻护盾。
   */
  private async applyRevengeBonus(d: GameDuel) {
    if (d.players.length !== 2 || d.players.some((p) => !p)) return;
    try {
      const book = await loadCareer(this.ctx.resultsDir, 'qa', 'game');
      for (let i = 0; i < 2; i++)
        if (revengeOn(book, d.players[i]!, d.players[1 - i]!) === 'revenge') d.hp[i] = MAX_HP + REVENGE_HP_BONUS;
    } catch {
      /* 恩怨只是氛围，查询失败按普通对局开打 */
    }
  }
  private async finish(c: GameCompetition, d: GameDuel) {
    d.status = 'completed';
    d.reason = '';
    for (const next of c.duels.filter((x) => x.sources.includes(d.id))) {
      const parents = next.sources.map((id) => c.duels.find((x) => x.id === id)!);
      if (parents.every((x) => x.status === 'completed' && x.winner)) {
        next.players = parents.map((x) => x.winner);
        await this.applyRevengeBonus(next);
        next.status = 'ready';
      }
    }
    this.emit(c, 'duel-end', { duelId: d.id, duel: d, winner: d.winner });
    this.emit(c, 'advancement', { duelId: d.id, winner: d.winner });
    await this.settleDuel(c, d);
  }
  /**
   * 游戏赛回流生涯：完成的对决结算进游戏赛账本 career-game.json（meta.source='game-duel' 分组成组，
   * 与 benchmark 科学榜 career.json 互不污染）。仅决赛记头衔/判成就（防半决赛刷冠）。
   * 演示赛（demo/mock）不入账——mock 不是真实作答，入账会污染段位与成就语义。
   */
  private async settleDuel(c: GameCompetition, d: GameDuel) {
    if (c.config.demo || !d.winner || d.status !== 'completed') return;
    try {
      const rounds = d.rounds.filter((r) => r.settled);
      const records = rounds.flatMap((r) => r.records).filter((r): r is BattleRecord => valid(r));
      const contestants = d.players
        .map((id) => c.entrants.find((e) => e.id === id))
        .filter((x): x is Contestant => !!x);
      if (!rounds.length || !records.length || contestants.length !== 2) return;
      const result: BattleResult = {
        id: `${c.id}:${d.id}`,
        status: 'completed',
        arena: rounds[0]!.question.def,
        startedAt: c.createdAt,
        durationMs: 0,
        contestants,
        records,
        meta: {
          arenaFingerprint: rounds[0]!.question.fingerprint ?? c.config.fingerprint ?? '',
          judgeModels: c.config.judge ? [c.config.judge] : [],
          toolVersion: 'game-competition',
          source: tierSource(c.config.tier) ?? 'game-duel',
        },
      };
      const board = buildLeaderboard(result);
      // 加赛按首道分差决胜，全场均分可能相反；头衔、名次和宿敌必须以实际胜者为准。
      if (board[0]?.model !== d.winner) board.reverse();
      const isFinal = !c.duels.some((x) => x.sources.includes(d.id));
      const deltas = await settleBattle(result, board, this.ctx.resultsDir, { awardTitles: isFinal, track: 'game' });
      if (deltas.length) this.emit(c, 'career-settled', { duelId: d.id, settlement: deltas });
    } catch (error) {
      // 结算失败不推翻赛果（赛果已持久化）：如实播报，可事后补结算
      this.emit(c, 'career-failed', {
        duelId: d.id,
        message: `生涯结算失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  async idle(id: string) {
    await this.workers.get(id)?.promise;
  }
  /** 开关解说席。解说与答题、评分使用独立会话，不影响胜负 */
  commentary(id: string, agentId: string, enabled: boolean) {
    this.commentatorFor(this.get(id)).configure(agentId, enabled);
  }
  /** 当前等待玩家作答的题（客户端轮询：拿 key 与题面，交卷走 submitHuman） */
  humanQuestions(id: string): HumanQuestion[] {
    this.get(id);
    return this.human.pending().filter((q) => q.competitionId === id);
  }
  /** 玩家交卷：key 必须是本赛事仍在等待中的题；空答/超长视为无效交卷 */
  submitHuman(id: string, key: string, answer: string, reasoning = '') {
    this.get(id);
    if (!this.human.pending().some((q) => q.key === key && q.competitionId === id))
      throw new Error('没有等待中的本题答卷，请刷新题目');
    if (!this.human.submit(key, answer, reasoning)) throw new Error('交卷失败：答案不能为空且不超过 2 万字符');
    return { ok: true };
  }
  ask(id: string, question: string) {
    this.commentatorFor(this.get(id)).ask(question);
  }
  private commentatorFor(c: GameCompetition): Commentator {
    const existing = this.commentators.get(c.id);
    if (existing) return existing;
    const state = (c.commentary ??= { enabled: false, agentId: 'pi', entries: [] });
    const commentator = new Commentator(
      path.join(this.ctx.resultsDir, '.commentary', c.id),
      () => competitionFrames(c),
      (draft: EventDraft) => {
        if (draft.type === 'commentary') {
          const at = state.entries.findIndex((e) => e.id === draft.entry.id);
          if (at >= 0) state.entries[at] = draft.entry;
          else state.entries.push(draft.entry);
          state.entries.splice(0, Math.max(0, state.entries.length - COMMENTARY_KEEP));
          // 流式文本只改快照；条目开始与结束各记一条事件并落盘，客户端据此刷新
          if (at < 0 || draft.entry.status !== 'working')
            this.emit(c, 'commentary', {
              message: draft.entry.status === 'working' ? '解说中' : draft.entry.text.slice(0, 200),
            });
        } else if (draft.type === 'commentator') {
          state.enabled = draft.enabled;
          state.agentId = draft.agentId;
          state.error = draft.error;
          this.emit(c, 'commentator', { message: draft.error ?? (draft.enabled ? '解说已开启' : '解说已关闭') });
        }
      },
      this.options.commentatorSession,
    );
    this.commentators.set(c.id, commentator);
    return commentator;
  }
  async close() {
    this.dispose();
    await Promise.all([...this.workers.values()].map((w) => w.promise));
  }
  dispose() {
    this.disposed = true;
    this.human.dispose();
    for (const commentator of this.commentators.values()) commentator.dispose();
    for (const [id, worker] of this.workers) {
      const c = this.get(id);
      if (c.status !== 'stopped' && c.status !== 'completed') {
        c.status = 'waiting';
        c.reason = '服务关闭，等待继续';
        for (const d of c.duels)
          if (d.status === 'running') {
            d.status = 'waiting';
            d.reason = 'interrupted';
          }
        this.emit(c, 'pending', { message: c.reason });
      }
      worker.control.stop();
    }
  }
}
