/**
 * 盘口竞猜的账本结构与数值常量（types 层：域计算在 prediction.ts，IO 在 prediction-store.ts）
 */

/** 固定注：注金不是决策变量，押谁才是 */
export const STAKE = 100;
/** 起始豆 */
export const BANK_START = 1000;
/** 破产救济线（豆 < STAKE 时补到这个数） */
export const BANK_RESCUE = 500;
/** 对战盘硬封盘窗口（开赛起算，服务端按时间戳硬校验） */
export const BET_WINDOW_MS = 10_000;

export interface PredictEntry {
  id: string;
  name: string;
  /** softmax 夺冠概率（开赛时点） */
  prob: number;
  /** 公平赔率（十进制，押中连本得 odds 倍） */
  odds: number;
}

export interface PredictBet {
  bettor: string;
  name: string;
  pick: string;
  pickName: string;
  /** 封盘时锁定的赔率（结算按它派彩） */
  odds: number;
  stake: number;
  at: string;
}

export interface PredictMarket {
  id: string;
  kind: 'battle' | 'competition';
  title: string;
  openedAt: string;
  /** 硬封盘时刻；null=事件封盘 */
  closesAt: string | null;
  sealedAt?: string;
  /** 演示盘（mock 阵容/演示赛） */
  demo: boolean;
  entries: PredictEntry[];
  /** bettor → 注（一市场一注，改注=覆盖） */
  bets: Record<string, PredictBet>;
  status: 'open' | 'settled' | 'void';
  winner?: string | null;
  settledAt?: string;
}

export type BetOutcome = 'win' | 'lose' | 'refund';

export interface BetHistoryItem {
  at: string;
  market: string;
  title: string;
  pick: string;
  pickName: string;
  odds: number;
  stake: number;
  payout: number;
  outcome: BetOutcome;
  demo: boolean;
}

export interface BettorProfile {
  id: string;
  name: string;
  bank: number;
  /** 已结算注数（refund 不计） */
  bets: number;
  wins: number;
  /** 累计净收益 Σ(payout − stake)，段位刻度 */
  net: number;
  streak: number;
  bestStreak: number;
  /** 救济金次数 */
  bailouts: number;
  achievements: { id: string; at: string; market: string }[];
  /** 最近战绩（cap 50，含演示盘） */
  history: BetHistoryItem[];
}

export interface PredictBook {
  version: 1;
  markets: Record<string, PredictMarket>;
  bettors: Record<string, BettorProfile>;
}

export interface BettorRank {
  rank: string;
  icon: string;
}
