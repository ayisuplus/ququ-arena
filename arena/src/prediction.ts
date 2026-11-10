/**
 * 盘口竞猜 —— 观赛的第二本图鉴：判断力有实锤
 *
 * 机制：赛前按 Glicko 开出公平赔率（odds.ts），观众押一只（固定注），
 * 押中按封盘时锁定的赔率连本派彩，押错没收。押冷门赚的是信息差——
 * 赔率是公众共识，题库契合度是你独有的情报。
 *
 * 数值 rationale：
 * - 公平赔率（odds = 1/prob）无水位：零和期望，赚钱靠判断不靠盘剥。
 * - 固定注 STAKE=100：注金不是决策变量，押谁才是——去掉无意义的下注量 UI。
 * - 预测段位按净收益（不是命中率）：命中率奖励无脑押热门（高胜率零收益），
 *   净收益才度量"敢押分歧、押对了"的判断力。
 * - 破产救济：竞猜是调味料不是主菜，死局=流失；补到 RESCUE 让玩家有翻本筹码。
 * - 演示盘（mock 阵容）照常结算豆：mock 对战结果仍由 Glicko 定价，无系统性可刷面；
 *   若日后要收紧口径，把 DEMO_COUNTS_STATS 翻成 false 即可（成就/段位只认非演示盘）。
 *
 * 边界（诚实口径）：
 * - 无冠军（停止/评分未完/平局）→ 作废全额退注；押中退赛选手 → 退注（没比完不算押错）。
 * - 幂等结算：market.status 落 'settled'/'void' 后重复结算是 no-op（对齐 settledMatches 模式）。
 * - 回放不开盘（结果已知）。
 */
import type { PredictBook, PredictMarket, BettorProfile, BetOutcome } from './prediction-types.ts';

export {
  STAKE,
  BANK_START,
  BANK_RESCUE,
  BET_WINDOW_MS,
  type PredictBook,
  type PredictMarket,
  type PredictEntry,
  type PredictBet,
  type BettorProfile,
  type BetHistoryItem,
  type BetOutcome,
  type BettorRank,
} from './prediction-types.ts';
import { STAKE, BANK_START, BANK_RESCUE } from './prediction-types.ts';

/** 演示盘战绩是否计入段位/成就（false = 只认真实对战口径） */
export const DEMO_COUNTS_STATS = true;

/** 竞猜成就表（id → 定义）；判定见 checkBetAchievements */
export const BET_ACHIEVEMENTS: Record<string, { name: string; icon: string; desc: string }> = {
  first_blood: { name: '开门红', icon: '🎯', desc: '首注命中' },
  hot_hand: { name: '手气正旺', icon: '🔥', desc: '连中三注' },
  giant_slayer: { name: '冷面杀手', icon: '🗡️', desc: '命中赔率 ≥4 的大冷门' },
  prophet: { name: '神机妙算', icon: '📿', desc: '20 注命中率 ≥70%' },
  comeback: { name: '绝地翻盘', icon: '🛟', desc: '领过救济金后豆数重回 1000' },
};

/** 预测段位：净收益 + 最小样本（无样本门槛的段位是伪信号） */
const PREDICTOR_RANKS: { minNet: number; minBets: number; rank: string; icon: string }[] = [
  { minNet: 1500, minBets: 20, rank: '半仙', icon: '🔮' },
  { minNet: 600, minBets: 12, rank: '神算子', icon: '🧙' },
  { minNet: 200, minBets: 6, rank: '明眼人', icon: '🧐' },
  { minNet: -Infinity, minBets: 0, rank: '看客', icon: '🎲' },
];

export function predictorRank(p: { net: number; bets: number }): { rank: string; icon: string } {
  return PREDICTOR_RANKS.find((r) => p.bets >= r.minBets && p.net >= r.minNet)!;
}

/** 空账本（冷启动） */
export function emptyPredictBook(): PredictBook {
  return { version: 1, markets: {}, bettors: {} };
}

export function emptyProfile(id: string, name = id): BettorProfile {
  return {
    id,
    name,
    bank: BANK_START,
    bets: 0,
    wins: 0,
    net: 0,
    streak: 0,
    bestStreak: 0,
    bailouts: 0,
    achievements: [],
    history: [],
  };
}

/** 账本用普通对象按 ID 索引，不能把原型属性当作竞猜者档案。 */
export function validBettorId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id) && !Object.hasOwn(Object.prototype, id);
}

export interface OpenMarketSpec {
  id: string;
  kind: 'battle' | 'competition';
  title: string;
  openedAt: string;
  /** 硬封盘时刻（对战盘=开赛+10s）；null=事件封盘（捧杯盘等到首场开打由 sealMarket 封） */
  closesAt: string | null;
  demo: boolean;
  entries: PredictMarket['entries'];
}

export function openMarket(book: PredictBook, spec: OpenMarketSpec): PredictMarket {
  if (book.markets[spec.id]) throw new Error('盘口已存在');
  if (!spec.entries.length) throw new Error('盘口至少需要 1 位选手');
  const ids = new Set(spec.entries.map((e) => e.id));
  if (ids.size !== spec.entries.length) throw new Error('盘口选手不能重复');
  const market: PredictMarket = { ...spec, bets: {}, status: 'open' };
  book.markets[spec.id] = market;
  return market;
}

/** 盘口是否仍在下注窗口（时间窗 + 事件封盘双闸，服务端硬校验） */
export function isBettable(market: PredictMarket, now: string): boolean {
  return market.status === 'open' && !market.sealedAt && (!market.closesAt || now <= market.closesAt);
}

/** 事件封盘（首场开打/对局开始）；已封/已结是 no-op */
export function sealMarket(book: PredictBook, marketId: string, now: string): void {
  const m = book.markets[marketId];
  if (m && m.status === 'open' && !m.sealedAt) m.sealedAt = now;
}

export interface PlaceBetInput {
  bettor: string;
  name?: string;
  pick: string;
}

/**
 * 下注（一市场一注，封盘前可改注=覆盖，改注不重复扣豆）。
 * 扣注即时落账：bank −= STAKE（押中再连本返还），破产先发救济金。
 */
export function betOnMarket(
  book: PredictBook,
  marketId: string,
  input: PlaceBetInput,
  now: string,
): { bet: PredictMarket['bets'][string]; profile: BettorProfile; rescued: boolean } {
  const market = book.markets[marketId];
  if (!market) throw new Error('盘口不存在');
  if (!isBettable(market, now)) throw new Error('已封盘——下次手快点');
  const entry = market.entries.find((e) => e.id === input.pick);
  if (!entry) throw new Error('本盘没有这位选手');
  const id = String(input.bettor ?? '');
  if (!validBettorId(id)) throw new Error('非法竞猜者标识');
  const profile = (book.bettors[id] ??= emptyProfile(id));
  if (input.name && typeof input.name === 'string' && input.name.length <= 32) profile.name = input.name;
  const existing = market.bets[id];
  let rescued = false;
  if (!existing) {
    // 破产救济：豆不够下注才有救济（改注不重复触发），补到 RESCUE 后照常扣注
    if (profile.bank < STAKE) {
      profile.bank = BANK_RESCUE;
      profile.bailouts++;
      rescued = true;
    }
    profile.bank -= STAKE;
  }
  market.bets[id] = {
    bettor: id,
    name: profile.name,
    pick: entry.id,
    pickName: entry.name,
    odds: entry.odds,
    stake: STAKE,
    at: now,
  };
  return { bet: market.bets[id]!, profile, rescued };
}

export interface SettleOutcome {
  /** 冠军选手 id；null=无冠军（停止/评分未完/平局）→ 整盘作废退注 */
  winner: string | null;
  /** 退赛选手 id：押中他们按"没比完"退注（弃权≠押错） */
  withdrawn?: string[];
  settledAt: string;
}

export interface SettleReport {
  status: 'settled' | 'void' | 'noop';
  results: { bettor: string; outcome: BetOutcome; payout: number; newAchievements: string[] }[];
}

/** 结算（幂等）：连本派彩 round(STAKE×odds)、押错没收、作废/退赛退注 */
export function settleMarket(book: PredictBook, marketId: string, out: SettleOutcome): SettleReport {
  const market = book.markets[marketId];
  if (!market) throw new Error('盘口不存在');
  if (market.status !== 'open') return { status: 'noop', results: [] };
  market.settledAt = out.settledAt;
  market.winner = out.winner;
  market.status = out.winner ? 'settled' : 'void';
  const withdrawn = new Set(out.withdrawn ?? []);
  const results: SettleReport['results'] = [];
  for (const bet of Object.values(market.bets)) {
    const profile = book.bettors[bet.bettor];
    if (!profile) continue;
    let outcome: BetOutcome;
    let payout = 0;
    if (!out.winner) {
      outcome = 'refund';
      payout = bet.stake; // 作废退注
    } else if (bet.pick === out.winner) {
      outcome = 'win';
      payout = Math.round(bet.stake * bet.odds); // 公平赔率连本派彩
    } else if (withdrawn.has(bet.pick)) {
      outcome = 'refund';
      payout = bet.stake; // 押中退赛选手：没比完不算押错
    } else {
      outcome = 'lose';
      payout = 0;
    }
    profile.bank += payout;
    const counts = DEMO_COUNTS_STATS || !market.demo;
    if (counts && outcome !== 'refund') {
      // 退注（作废/退赛）不计战绩：没比完不算押错，也不算押对
      profile.bets++;
      if (outcome === 'win') {
        profile.wins++;
        profile.streak++;
        profile.bestStreak = Math.max(profile.bestStreak, profile.streak);
      } else {
        profile.streak = 0;
      }
      profile.net += payout - bet.stake;
    }
    profile.history.unshift({
      at: out.settledAt,
      market: market.id,
      title: market.title,
      pick: bet.pick,
      pickName: bet.pickName,
      odds: bet.odds,
      stake: bet.stake,
      payout,
      outcome,
      demo: market.demo,
    });
    if (profile.history.length > 50) profile.history.length = 50;
    const newAchievements = checkBetAchievements(profile, { market, outcome, payout, won: outcome === 'win' });
    for (const id of newAchievements) profile.achievements.push({ id, at: out.settledAt, market: market.id });
    results.push({ bettor: bet.bettor, outcome, payout, newAchievements });
  }
  return { status: market.status === 'settled' ? 'settled' : 'void', results };
}

/** 逐条判定本注新解锁的竞猜成就（一次性；口径=已结算的统计字段） */
export function checkBetAchievements(
  profile: BettorProfile,
  ctx: { market: PredictMarket; outcome: BetOutcome; payout: number; won: boolean },
): string[] {
  const owned = new Set(profile.achievements.map((a) => a.id));
  const out: string[] = [];
  const unlock = (id: string, cond: boolean) => {
    if (cond && !owned.has(id)) out.push(id);
  };
  const counts = DEMO_COUNTS_STATS || !ctx.market.demo;
  if (!counts) return out;
  if (ctx.outcome === 'refund') return out;
  unlock('first_blood', ctx.won && profile.wins === 1);
  unlock('hot_hand', ctx.won && profile.streak >= 3);
  unlock('giant_slayer', ctx.won && ctx.payout >= 4 * STAKE);
  unlock('prophet', profile.bets >= 20 && profile.wins / profile.bets >= 0.7);
  unlock('comeback', profile.bailouts > 0 && profile.bank >= 1000 && ctx.won);
  return out;
}

/**
 * 悬挂盘兜底：开盘超 24 小时仍未结算（进程中断/漏钩子）→ 作废退注。
 * 盘口永不悬挂：注金不会被吊死在无人结算的市场里。
 */
export function voidStale(book: PredictBook, now: string, maxAgeMs = 24 * 3600_000): string[] {
  const out: string[] = [];
  for (const m of Object.values(book.markets)) {
    if (m.status !== 'open') continue;
    if (new Date(now).getTime() - new Date(m.openedAt).getTime() <= maxAgeMs) continue;
    settleMarket(book, m.id, { winner: null, settledAt: now });
    out.push(m.id);
  }
  return out;
}

/** API/页面视图：档案 + 段位 + 成就 */
export function profileView(profile: BettorProfile) {
  return {
    id: profile.id,
    name: profile.name,
    bank: profile.bank,
    bets: profile.bets,
    wins: profile.wins,
    net: profile.net,
    streak: profile.streak,
    bestStreak: profile.bestStreak,
    bailouts: profile.bailouts,
    rank: predictorRank(profile),
    achievements: profile.achievements.map((a) => ({ ...a, ...(BET_ACHIEVEMENTS[a.id] ?? {}) })),
    history: profile.history,
  };
}
