/**
 * 蛐蛐生涯系统 —— 跨场持久化战绩，让每场 battle 都有 stakes
 *
 * 存储：results/career.json（Git 友好，可 diff 出一只蛐蛐的堕落史）
 *
 * 数值 rationale：
 * - 生涯积分（字段名沿用 elo）= 1500 + Σ(每场 delta)，delta = 本场 pairwise Elo - 1500
 *   理由：每场 stakes 一致，新蛐蛐空降不会被老油条的历史积累压死；
 *   场次数本身就是 progression 的来源（打得多、赢得稳的蛐蛐段位自然高）。
 *   [PLACEHOLDER] 不做时间衰减——场次 <20 时衰减无意义，赛季制（v0.3）再议。
 * - 段位阈值：以 mock 四蛐蛐单场 delta 分布（约 -350 ~ +270）为刻度，
 *   按"打 2-4 场能明显分层"校准。校准则见 docs 或本文件提交记录。
 */
import type { BattleResult, BoardEntry } from './types.ts';
import { checkAchievements, starsOf, codexOf } from './achievements.ts';
import {
  glickoUpdate,
  gamesFromBoard,
  conservativeRating,
  isProvisional,
  DEFAULT_RATING,
  type GlickoRating,
} from './glicko.ts';

export interface CareerEntry {
  id: string;
  name: string;
  /** 总参赛场次 */
  battles: number;
  /** 夺冠次数（本场 avg 第一） */
  titles: number;
  /** 前三次数 */
  podiums: number;
  /** 生涯积分：1500 + 每场 delta 累计。随场次无界增长，只驱动段位；排序用 glicko */
  elo: number;
  /** 累计有效答题数 */
  answered: number;
  /** 累计得分（生涯均分 = scoreSum / answered） */
  scoreSum: number;
  /** 分维度生涯统计 */
  byCondition: Record<string, { n: number; sum: number }>;
  /** 已解锁成就（一次性，v0.2 新增，旧档案可缺省） */
  achievements?: { id: string; at: string; arena: string }[];
  /** 最近战绩轨迹（堕落史/封神路，cap 50 场，v0.2 新增）；source：'benchmark' 主轨 / 'game-duel' 游戏赛轨，旧档案缺省=benchmark */
  history?: {
    at: string;
    arena: string;
    avg: number;
    place: number;
    field: number;
    delta: number;
    season?: string;
    source?: string;
  }[];
  /** 赛季归档：seasonId → 当季结算（v0.3 新增） */
  seasons?: Record<string, { battles: number; titles: number; elo: number; deltaSum?: number; eloFrom?: number }>; // deltaSum/eloFrom：赛季净涨跌的忠实口径（含跨季软重置位移），v3.21 新增，旧档案缺省
  /** 宿敌累计：对手 id → { n: 同场次数, ahead: 我名次压过对方的次数, streak: 对它当前连胜(正)/连败(负) }（v0.7 新增；streak v3.36 新增，旧档案缺省从 0 起算） */
  rivals?: Record<string, { n: number; ahead: number; streak?: number }>;
  /** Glicko-2 评级（研究向，v1.1 新增；旧档案缺省=DEFAULT_RATING 起步） */
  glicko?: GlickoRating;
  lastBattleAt: string;
}

export interface CareerBook {
  version: 1;
  entries: Record<string, CareerEntry>;
  settledMatches?: Record<string, CareerDelta[]>;
}

/** 段位表（阈值经 mock 连跑校准，见本模块头注释） */
const RANKS: { min: number; rank: string; icon: string }[] = [
  { min: 2200, rank: '虫王', icon: '🐲' },
  { min: 1800, rank: '大将军', icon: '🏯' },
  { min: 1500, rank: '骁骑', icon: '⚔️' },
  { min: 1200, rank: '老卒', icon: '🛡️' },
  { min: -Infinity, rank: '雏虫', icon: '🐣' },
];

/** 赛季 id：日历季度（UTC），如 2026-Q3。跨季首战触发软重置 */
export function seasonOf(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** 赛季软重置系数：跨季首战 Elo 向 1500 收 25%——保留 75% 历史功底，清掉虚高 */
const SEASON_DECAY = 0.25;

export function rankOf(elo: number): { rank: string; icon: string } {
  const r = RANKS.find((x) => elo >= x.min)!;
  return { rank: r.rank, icon: r.icon };
}

/** 赛前快照：id → 生涯 Elo（新蛐蛐 1500），供解说判断爆冷 */
export function eloSnapshot(book: CareerBook): Map<string, number> {
  const m = new Map<string, number>();
  for (const [id, e] of Object.entries(book.entries)) m.set(id, e.elo);
  return m;
}

export interface CareerDelta {
  id: string;
  name: string;
  before: number;
  after: number;
  delta: number;
  isDebut: boolean;
  /** 本场新解锁/再达成的成就 id（count 成就会重复出现=升星素材） */
  newAchievements: string[];
  /** 本场升星明细（from→to，仅升星时出现） */
  starsUp?: { id: string; from: number; to: number }[];
  /** 本场宿敌事件：revenged=终结对它的连败（复仇成功）/ avenged=连压被终结（遭复仇） */
  revenge?: { opp: string; kind: 'revenged' | 'avenged' }[];
  /** 本场是否触发赛季软重置（before 已含衰减） */
  decayed?: boolean;
}

/**
 * 赛后结算（纯函数）：把一场 battle 就地结算进传入的 book（调用方持有所有权），不碰盘。
 * IO 走 career-store.ts 的 settleBattle 包装（loadCareer → settleOnBook → saveCareer）。
 * @returns 每只参赛蛐蛐的 Elo 变化（供 CLI/战报展示）
 */
export function settleOnBook(
  result: BattleResult,
  board: BoardEntry[],
  book: CareerBook,
  opts: { awardTitles?: boolean } = {},
): CareerDelta[] {
  const awardTitles = opts.awardTitles ?? true; // 淘汰赛的非决赛轮不记头衔（4 人 bracket 曾一晚发 3 冠——审查实证）
  if (!board.length) return []; // 空赛不结算：0 参赛什么都不写

  // 赛前快照必须先于任何条目变更捕获——爆冷/下克上判定以赛前身价为准
  const eloSnapshotBefore = eloSnapshot(book);
  const deltas: CareerDelta[] = [];

  const season = seasonOf(result.startedAt);
  board.forEach((e, rankIdx) => {
    const existing = book.entries[e.model];
    const isDebut = !existing;
    // 赛季软重置：跨季首战先把身价向 1500 收 25%，再叠加本场 delta
    const decayed = Boolean(existing?.lastBattleAt && seasonOf(existing.lastBattleAt) !== season);
    const before = Math.round(
      decayed ? 1500 + ((existing?.elo ?? 1500) - 1500) * (1 - SEASON_DECAY) : (existing?.elo ?? 1500),
    );
    // 本场 delta：以 1500 为基准的 pairwise Elo 偏移
    const delta = e.elo - 1500;
    const after = before + delta;

    const entry: CareerEntry = book.entries[e.model] ?? {
      id: e.model,
      name: e.name,
      battles: 0,
      titles: 0,
      podiums: 0,
      elo: 1500,
      answered: 0,
      scoreSum: 0,
      byCondition: {},
      lastBattleAt: '',
    };
    entry.name = e.name; // 允许改名
    entry.battles += 1;
    // 全弃权（answered=0, avg=NaN）：场次照记，但夺冠/前三/得分/维度不结算——"没打"不是"全错"
    const participated = e.answered > 0 && !Number.isNaN(e.avg);
    if (awardTitles && participated && !e.withdrawal && rankIdx === 0) entry.titles += 1;
    if (awardTitles && participated && !e.withdrawal && rankIdx < 3 && board.length >= 3) entry.podiums += 1; // 2 人场败者不算「前三」（审查实证：连输 5 场 2 人场即可刷站台专业户）
    entry.elo = after;
    if (participated) {
      entry.answered += e.answered;
      entry.scoreSum += e.avg * e.answered;
    }
    for (const [cond, avg] of Object.entries(e.byCondition)) {
      const c = entry.byCondition[cond] ?? { n: 0, sum: 0 };
      // 本场该维度题数无法从 avg 还原，按 answered/维度数估算会失真；
      // 直接存"场次级"平均：n=场次数，sum=场均和。生涯维度均分 = sum/n
      c.n += 1;
      c.sum += avg;
      entry.byCondition[cond] = c;
    }
    // 战绩轨迹（仅有效参赛场入库；弃权场 NaN 会污染 JSON）
    if (participated) {
      entry.history = [
        ...(entry.history ?? []),
        {
          at: result.startedAt,
          arena: result.arena.name,
          avg: e.avg,
          place: rankIdx + 1,
          field: board.length,
          delta,
          season,
          source: result.meta?.source ?? 'benchmark',
        },
      ].slice(-50);
    }
    // 赛季归档（夺冠数同样仅计有效场）
    const s = entry.seasons?.[season] ?? { battles: 0, titles: 0, elo: 1500 };
    entry.seasons = {
      ...(entry.seasons ?? {}),
      // deltaSum 含跨季软重置位移（decay 从 prevElo 掉到 before 的量也计入）——赛季回顾的「净涨跌」不再与身价走势相反（审查实证）
      [season]: {
        battles: s.battles + 1,
        titles: s.titles + (awardTitles && participated && !e.withdrawal && rankIdx === 0 ? 1 : 0),
        elo: after,
        deltaSum: (s.deltaSum ?? 0) + delta - (decayed ? (existing?.elo ?? 1500) - before : 0),
        eloFrom: s.eloFrom ?? existing?.elo ?? 1500, // 赛季首场结算前的身价（含上季结转，未衰减）
      },
    };
    const newAchievements =
      awardTitles && !e.withdrawal
        ? checkAchievements({
            entry,
            isDebut,
            rankIdx,
            board,
            result,
            preElo: eloSnapshotBefore,
          })
        : []; // 非决赛轮不判成就（半决赛解锁「首秀即夺冠」曾实证）
    // 升星明细：push 达成记录前后各算一次星级（count 组条数=星级进度）
    const starsBefore = new Map(newAchievements.map((id) => [id, starsOf(entry, id)]));
    if (newAchievements.length) {
      entry.achievements = [
        ...(entry.achievements ?? []),
        ...newAchievements.map((id) => ({ id, at: result.startedAt, arena: result.arena.name })),
      ];
    }
    const starsUp = newAchievements
      .map((id) => ({ id, from: starsBefore.get(id)!, to: starsOf(entry, id) }))
      .filter((s) => s.to > s.from);
    entry.lastBattleAt = result.startedAt;
    book.entries[e.model] = entry;

    deltas.push({
      id: e.model,
      name: e.name,
      before,
      after,
      delta,
      isDebut,
      newAchievements,
      starsUp: starsUp.length ? starsUp : undefined,
      decayed,
    });
  });

  // 宿敌累计：同场即交手，名次靠前者记一次"压过"（任一方弃权不计——没打不算交手）
  // streak：我对它的连胜(正)/连败(负)——压过则连胜延伸/翻正，被压则连败延伸/翻负
  board.forEach((me, myIdx) => {
    if (me.answered === 0 || Number.isNaN(me.avg)) return;
    const entry = book.entries[me.model]!;
    const rivals = { ...(entry.rivals ?? {}) };
    const revenges: { opp: string; kind: 'revenged' | 'avenged' }[] = [];
    board.forEach((opp, oppIdx) => {
      if (opp.model === me.model || opp.answered === 0 || Number.isNaN(opp.avg)) return;
      const r = rivals[opp.model] ?? { n: 0, ahead: 0, streak: 0 };
      r.n += 1;
      const s = r.streak ?? 0;
      if (myIdx < oppIdx) {
        r.ahead += 1;
        r.streak = Math.max(0, s) + 1;
        if (s <= -2) revenges.push({ opp: opp.model, kind: 'revenged' }); // 被连压 ≥2 场被本场终结=复仇成功
      } else {
        r.streak = Math.min(0, s) - 1;
        if (s >= 2) revenges.push({ opp: opp.model, kind: 'avenged' }); // 连压 ≥2 场被本场终结=遭复仇
      }
      rivals[opp.model] = r;
    });
    entry.rivals = rivals;
    if (revenges.length) deltas[myIdx]!.revenge = revenges;
  });

  // Glicko-2 更新：本场比赛=一个评分期，两两对决（avg 高者胜，平 0.5）
  const games = gamesFromBoard(board, (id) => book.entries[id]?.glicko ?? DEFAULT_RATING);
  for (const e of board) {
    const entry = book.entries[e.model]!;
    entry.glicko = glickoUpdate(entry.glicko ?? DEFAULT_RATING, games.get(e.model) ?? []);
  }

  // 闲置回升：本场未参赛的在册蛐蛐只涨 RD——不打比赛，不确定性就该涨
  for (const [id, entry] of Object.entries(book.entries)) {
    if (!games.has(id) && entry.glicko) {
      entry.glicko = glickoUpdate(entry.glicko, []);
    }
  }

  return deltas;
}

/**
 * 生涯 Elo 的不确定区间：elo = 1500 + Σδi 是随机游走累计，
 * 每场 delta 的波动以 sd·√n 放大——elo ± 1.96·sd·√n 即"身价未必是这个数"的诚实区间。
 * 场次数 <2（样本方差不存在）返回 undefined——延续"首秀身价不明"的语义。
 */
export function eloCI(entry: CareerEntry): number | undefined {
  const deltas = (entry.history ?? []).map((h) => h.delta);
  const n = Math.max(entry.battles, deltas.length); // n = 累计结算场次数（history 截断 50 窗，老将不得因截断区间偏窄 √2 倍——审查实证）
  if (n < 2) return undefined;
  const mean = deltas.reduce((s, d) => s + d, 0) / n;
  const sd = Math.sqrt(deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / (n - 1));
  return Math.round(1.96 * sd * Math.sqrt(n));
}

/** 宿敌榜：交手最多的对手在前，同场次看压过率。grudge=苦主（被它连压 ≥2 场，下次同场即复仇战） */
export function rivalriesOf(
  book: CareerBook,
  id: string,
): { id: string; name: string; n: number; ahead: number; winRate: number; streak: number; grudge: boolean }[] {
  const e = book.entries[id];
  if (!e?.rivals) return [];
  return Object.entries(e.rivals)
    .map(([oid, r]) => {
      const streak = r.streak ?? 0;
      return {
        id: oid,
        name: book.entries[oid]?.name ?? oid,
        n: r.n,
        ahead: r.ahead,
        winRate: r.n ? r.ahead / r.n : 0,
        streak,
        grudge: streak <= -2,
      };
    })
    .sort((a, b) => b.n - a.n || b.winRate - a.winRate);
}

/**
 * 复仇判定（纯函数）：me 对 opp 的恩怨状态。
 * - 'revenge'：me 被 opp 连压 ≥2 场——哀兵复仇战（游戏轨开场气势加成的唯一触发条件）
 * - 'dominate'：me 对 opp 连压 ≥2 场——压制战（对方的复仇剧本）
 * 恩怨不足（streak ∈ [-1,1]）返回 undefined：普通对局不贴标签。
 */
export function revengeOn(book: CareerBook, meId: string, oppId: string): 'revenge' | 'dominate' | undefined {
  const s = book.entries[meId]?.rivals?.[oppId]?.streak ?? 0;
  return s <= -2 ? 'revenge' : s >= 2 ? 'dominate' : undefined;
}

/**
 * 蛐蛐棚总榜视图。排序按 Glicko 保守估计（r − 2·RD）：生涯积分（elo 字段）是逐场涨跌的累加，
 * 随场次无界增长，只驱动段位与叙事，不能作为"谁更强"的排序依据。
 * opts.kind：'human' 只看人类玩家（human: 选手，独立段位轨）、'model' 只看模型——两条轨互不混排。
 */
export function stableView(
  book: CareerBook,
  opts: { kind?: 'model' | 'human' } = {},
): (CareerEntry & {
  avgScore: number;
  winRate: number;
  rank: string;
  icon: string;
  eloCI?: number;
  bestCondition?: string;
  worstCondition?: string;
  rating: number;
  provisional: boolean;
})[] {
  const rows = Object.values(book.entries)
    .filter((e) => !opts.kind || (opts.kind === 'human') === e.id.startsWith('human:'))
    .map((e) => {
      const avgScore = e.answered ? e.scoreSum / e.answered : 0;
      const conds = Object.entries(e.byCondition);
      const sorted = conds.sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n);
      const { rank, icon } = rankOf(e.elo);
      return {
        ...e,
        avgScore,
        winRate: e.battles ? e.titles / e.battles : 0,
        rank,
        icon,
        eloCI: eloCI(e),
        bestCondition: sorted[0]?.[0],
        worstCondition: sorted.at(-1)?.[0],
        rating: conservativeRating(e.glicko),
        provisional: isProvisional(e.glicko),
      };
    });
  // 从未有效作答（全部弃权）的模型没有任何观测，停在先验评分上——不参与排名，排在最后
  const ranked = (r: { answered: number }) => (r.answered > 0 ? 1 : 0);
  return rows.sort((a, b) => ranked(b) - ranked(a) || b.rating - a.rating || b.elo - a.elo);
}

/** 段位进阶：当前段位的下一级门槛（虫王为封顶，返回 undefined） */
export function nextRankAt(elo: number): { rank: string; min: number } | undefined {
  const above = RANKS.filter((r) => r.min > elo);
  return above.length ? { rank: above.at(-1)!.rank, min: above.at(-1)!.min } : undefined;
}

/** 单只蛐蛐的生涯档案视图（profile 命令用） */
export function profileView(book: CareerBook, id: string) {
  const e = book.entries[id];
  if (!e) return undefined;
  const { rank, icon } = rankOf(e.elo);
  const conds = Object.entries(e.byCondition)
    .map(([cond, v]) => ({ cond, avg: v.sum / v.n }))
    .sort((a, b) => b.avg - a.avg);
  return {
    ...e,
    rank,
    icon,
    avgScore: e.answered ? e.scoreSum / e.answered : 0,
    winRate: e.battles ? e.titles / e.battles : 0,
    eloCI: eloCI(e),
    provisional: isProvisional(e.glicko),
    rivalries: rivalriesOf(book, id),
    nextRank: nextRankAt(e.elo),
    condRadar: conds,
    codex: codexOf(e),
  };
}
