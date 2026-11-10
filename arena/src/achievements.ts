/**
 * 成就系统 —— long-term 循环的收集层：让一只蛐蛐的生涯有"图鉴"可集
 *
 * 设计原则：
 * - 成就一次性解锁，持久化在 career.json，是蛐蛐的永久资产。
 * - 判定全部基于当场已算好的数据（board / preElo / findBloodbaths），
 *   与解说同源：戏剧性来自真实数据，不来自额外随机。
 * - 阈值与 RANKS 段位表同尺度（mock 四蛐蛐 delta 分布约 -350 ~ +270）。
 */
import type { BattleResult, BoardEntry } from './types.ts';
import type { CareerEntry } from './career.ts';
import { findBloodbaths } from './leaderboard.ts';
import { isAnswered } from './record-state.ts';

export interface AchievementDef {
  name: string;
  icon: string;
  desc: string;
  /**
   * 星级语义（星级是纯函数，从已有数据推导，账本零新字段）：
   * - once：一次性壮举，解锁即 1 星封顶（首秀/首次登基这类只可能发生一次）
   * - count：可重复达成的壮举，按累计达成次数升星（每次达成都 push 一条成就记录）
   * - cumulative：按累计量升星（头衔/场次/上台次数，单调递增天然只升不降）
   */
  kind: 'once' | 'count' | 'cumulative';
  /** count/cumulative 的三档进度阈值（1/2/3 星）；once 不需要 */
  tiers?: [number, number, number];
}

/** 静态成就表（id → 定义）；判定逻辑见 checkAchievements，星级见 starsOf */
export const ACHIEVEMENTS: Record<string, AchievementDef> = {
  first_title: { name: '新王登基', icon: '👑', desc: '生涯首次夺冠', kind: 'once' },
  debut_champion: { name: '天降神兵', icon: '⚡', desc: '首秀即夺冠', kind: 'once' },
  three_titles: { name: '三冠王', icon: '🏆', desc: '累计三次夺冠', kind: 'cumulative', tiers: [3, 6, 10] },
  ten_battles: { name: '十场老将', icon: '🎖️', desc: '打满十场比赛', kind: 'cumulative', tiers: [10, 25, 50] },
  podium_regular: {
    name: '站台专业户',
    icon: '🍾',
    desc: '五次站上领奖台（前三）',
    kind: 'cumulative',
    tiers: [5, 12, 25],
  },
  giant_killer: {
    name: '下克上',
    icon: '🗡️',
    desc: '以全场最低身价（低 100+）逆袭夺冠',
    kind: 'count',
    tiers: [1, 3, 5],
  },
  executioner: { name: '处刑人', icon: '🩸', desc: '夺冠且首尾分差 ≥ 40pp 的屠杀局', kind: 'count', tiers: [1, 3, 5] },
  subject_king: {
    name: '偏科状元',
    icon: '📐',
    desc: '某维度 ≥80% 而全场其他蛐蛐 ≤40%',
    kind: 'count',
    tiers: [1, 3, 5],
  },
  blood_survivor: {
    name: '尸山血海',
    icon: '💀',
    desc: '在 3 道以上团灭题的修罗场中夺冠',
    kind: 'count',
    tiers: [1, 3, 5],
  },
  flawless: { name: '零失误', icon: '✨', desc: '单场平均分 ≥99%（至少 8 题）', kind: 'count', tiers: [1, 3, 5] },
  rock_bottom: { name: '万劫不复', icon: '📉', desc: '积分跌破 1000', kind: 'count', tiers: [1, 3, 5] },
};

export interface AchievementCtx {
  /** 本场结算后的生涯条目（battles/titles/elo 已更新） */
  entry: CareerEntry;
  isDebut: boolean;
  rankIdx: number;
  board: BoardEntry[];
  result: BattleResult;
  /** 赛前生涯 Elo 快照（首秀按 1500 计） */
  preElo: Map<string, number>;
}

/** 逐条判定，返回本场新解锁的成就 id */
export function checkAchievements(ctx: AchievementCtx): string[] {
  const { entry, isDebut, rankIdx, board, result, preElo } = ctx;
  const owned = new Set((entry.achievements ?? []).map((a) => a.id));
  const won = rankIdx === 0;
  const out: string[] = [];
  const unlock = (id: string, cond: boolean) => {
    if (!cond) return;
    // count 成就每次达成都记录一条（同 id 条数=达成次数=星级进度）；once/cumulative 只记解锁
    if (ACHIEVEMENTS[id].kind === 'count' || !owned.has(id)) out.push(id);
  };

  // 防刷门槛（审查实证：全弃权场可零作答刷首秀夺冠/下克上；连错 10 场刷十场老将；2 人场败者上台刷站台专业户）
  const myBoard = board[rankIdx];
  const answeredSomething = (myBoard?.answered ?? 0) > 0;
  const wonReal = won && answeredSomething; // 头衔类成就必须真作答
  unlock('first_title', wonReal && entry.titles === 1);
  unlock('debut_champion', wonReal && isDebut);
  unlock('three_titles', entry.titles >= 3);
  unlock('ten_battles', (entry.history?.length ?? 0) >= 10); // 按有效作答场次（history 只记 participated）计，弃权场不刷
  unlock('podium_regular', entry.podiums >= 5); // 上台口径已在 settle 侧收紧（≥3 人场才算前三）
  // 「跌入」是事件不是状态：赛前 ≥1000 本场后 <1000 才记一次——连续低位场不刷（回升再跌=第二次达成）
  unlock('rock_bottom', entry.elo < 1000 && (preElo.get(entry.id) ?? 1500) >= 1000);

  if (wonReal && board.length >= 3) {
    const pres = board.map((e) => preElo.get(e.model) ?? 1500);
    const myPre = preElo.get(entry.id) ?? 1500;
    unlock('giant_killer', myPre === Math.min(...pres) && Math.max(...pres) - myPre >= 100);
    unlock('executioner', board[0].avg - board.at(-1)!.avg >= 0.4);
    unlock('blood_survivor', findBloodbaths(result).length >= 3);
    const me = board[0];
    unlock('flawless', me.avg >= 0.99 && me.answered >= 8);
    unlock(
      'subject_king',
      Object.entries(me.byCondition).some(
        ([cond, avg]) =>
          avg >= 0.8 &&
          // 维度证据量下限 + 只对有效参赛者比较（弃权者缺维度不再白送通过——审查实证）
          result.records.filter((r) => r.condition === cond && isAnswered(r)).length >= 3 &&
          board
            .slice(1)
            .filter((o) => o.answered > 0)
            .every((o) => (o.byCondition[cond] ?? 0) <= 0.4),
      ),
    );
  }
  return out;
}

/** count/cumulative 的档位映射：进度 ≥ 第三档→3 星，依此类推 */
function tierOf(progress: number, tiers: [number, number, number]): number {
  return progress >= tiers[2] ? 3 : progress >= tiers[1] ? 2 : progress >= tiers[0] ? 1 : 0;
}

/**
 * 成就星级（纯函数，0-3）：从账本已有数据推导，零新字段。
 * - once：有记录=1 星；count：同 id 达成条数对照 tiers；cumulative：累计量对照 tiers。
 * - count 条数与 cumulative 累计量都单调递增 → 星级天然只升不降，旧档案（一枚一条）自动=1 星起步。
 */
export function starsOf(
  entry: Pick<CareerEntry, 'achievements' | 'titles' | 'podiums' | 'history'>,
  id: string,
): number {
  const def = ACHIEVEMENTS[id];
  if (!def) return 0;
  const hits = (entry.achievements ?? []).filter((a) => a.id === id).length;
  if (def.kind === 'once') return hits ? 1 : 0;
  if (def.kind === 'count') return tierOf(hits, def.tiers!);
  const total =
    id === 'three_titles' ? entry.titles : id === 'ten_battles' ? (entry.history?.length ?? 0) : entry.podiums;
  return tierOf(total, def.tiers!);
}

/** 图鉴集齐奖励：星级总分 + 藏家称号（纯荣誉，不进竞技数值——科学榜不发加成） */
export const CODEX_TITLES: { min: number; title: string; icon: string }[] = [
  { min: 22, title: '活体图鉴', icon: '📿' },
  { min: 15, title: '图鉴大家', icon: '📚' },
  { min: 8, title: '图鉴小成', icon: '📖' },
  { min: 3, title: '图鉴学徒', icon: '🌱' },
];

export function codexOf(entry: Pick<CareerEntry, 'achievements' | 'titles' | 'podiums' | 'history'>): {
  score: number;
  title: string;
  icon: string;
  stars: Record<string, number>;
} {
  const stars: Record<string, number> = {};
  let score = 0;
  for (const id of Object.keys(ACHIEVEMENTS)) {
    const s = starsOf(entry, id);
    stars[id] = s;
    score += s;
  }
  const t = CODEX_TITLES.find((x) => score >= x.min) ?? { title: '未入门', icon: '🥚' };
  return { score, title: t.title, icon: t.icon, stars };
}
