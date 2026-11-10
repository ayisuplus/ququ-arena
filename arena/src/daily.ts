/**
 * 每日一擂 —— 日期种子选今日擂台的唯一实现（CLI 与 Web 大厅共用）
 * 同一天全球同擂：hash("daily:YYYY-MM-DD") % 罐数（罐按 name 排序保证稳定）
 */
import { hash } from './mock.ts';
import type { ArenaDef } from './types.ts';
import type { CareerBook } from './career.ts';

type DailyArenas = { def: { name: string; review?: ArenaDef['review'] }; tasks?: { id: string }[] }[];

export function dailyArena<T extends { def: { name: string; review?: ArenaDef['review'] }; tasks?: { id: string }[] }>(
  arenas: T[],
  date: Date = new Date(),
): T | undefined {
  const available = arenas.filter(
    (a) =>
      !a.def.review?.blockedReason &&
      (!a.tasks || a.tasks.some((t) => !Object.hasOwn(a.def.review?.excluded ?? {}, t.id))),
  );
  if (!available.length) return undefined;
  const sorted = available.sort((a, b) => a.def.name.localeCompare(b.def.name));
  return sorted[hash(`daily:${date.toISOString().slice(0, 10)}`) % sorted.length];
}

/** 当日一行：今日最佳成绩（按最佳 avg 排序） */
export interface DailyRow {
  id: string;
  name: string;
  /** 今日最佳均分（0-1） */
  best: number;
  /** 今日场次 */
  runs: number;
  /** 最佳场名次（1 起） */
  place: number;
  /** 最佳场时间 */
  at: string;
}

const dayOf = (iso: string) => iso.slice(0, 10);

/** 日期差（天）：YYYY-MM-DD 字符串按 UTC 日界算 */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * 当日榜（纯视图零存储）：今天在今日擂台（指定罐）打过的所有选手，每人取最佳一场。
 * 数据源=career.history（与结算同源，戏剧性来自真实数据）；只收 benchmark 主轨有效场。
 */
export function dailyBoard(book: CareerBook, arenaName: string, date: string): DailyRow[] {
  const rows: DailyRow[] = [];
  for (const e of Object.values(book.entries)) {
    const today = (e.history ?? []).filter(
      (h) => dayOf(h.at) === date && h.arena === arenaName && (h.source ?? 'benchmark') === 'benchmark',
    );
    if (!today.length) continue;
    const best = today.reduce((a, b) => (b.avg > a.avg ? b : a));
    rows.push({
      id: e.id,
      name: e.name,
      best: best.avg,
      runs: today.length,
      place: best.place,
      at: best.at,
    });
  }
  return rows.sort((a, b) => b.best - a.best || a.at.localeCompare(b.at));
}

/** 每日一擂冠军日：date → 当天冠军（place=1 且罐=当天擂台；同日多场可并列） */
export function dailyChampionDays(
  book: CareerBook,
  arenas: DailyArenas,
): Map<string, { id: string; name: string; avg: number }[]> {
  const byDate = new Map<string, { id: string; name: string; avg: number }[]>();
  for (const e of Object.values(book.entries)) {
    for (const h of e.history ?? []) {
      if (h.place !== 1 || (h.source ?? 'benchmark') !== 'benchmark') continue;
      const date = dayOf(h.at);
      const todayArena = dailyArena(arenas as never, new Date(`${date}T00:00:00Z`));
      if (!todayArena || todayArena.def.name !== h.arena) continue; // 只认每日一擂的夺冠（普通赛不算）
      const list = byDate.get(date) ?? [];
      if (!list.some((x) => x.id === e.id)) list.push({ id: e.id, name: e.name, avg: h.avg });
      byDate.set(date, list);
    }
  }
  return byDate;
}

/** 日连胜：连续自然日每天至少在每日一擂夺冠一次 */
export function dailyStreaks(
  book: CareerBook,
  arenas: DailyArenas,
  now: Date = new Date(),
): { id: string; name: string; streak: number; best: number }[] {
  const days = dailyChampionDays(book, arenas);
  const wins = new Map<string, string[]>(); // id → 夺冠日期列表
  for (const [date, champs] of days) for (const c of champs) wins.set(c.id, [...(wins.get(c.id) ?? []), date]);
  const today = now.toISOString().slice(0, 10);
  const out: { id: string; name: string; streak: number; best: number }[] = [];
  for (const [id, dates] of wins) {
    const sorted = [...new Set(dates)].sort();
    let best = 1,
      run = 1;
    for (let i = 1; i < sorted.length; i++) {
      run = daysBetween(sorted[i - 1]!, sorted[i]!) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
    }
    const last = sorted.at(-1)!;
    // 连胜活着=最后夺冠日是今天或昨天；断档（前天以前）当前连胜归 0
    const streak = daysBetween(last, today) <= 1 ? run : 0;
    out.push({ id, name: book.entries[id]?.name ?? id, streak, best });
  }
  return out.sort((a, b) => b.streak - a.streak || b.best - a.best);
}

/** 历史冠军墙：每日期的冠军（近 limit 天在前） */
export function dailyWall(
  book: CareerBook,
  arenas: DailyArenas,
  limit = 10,
): { date: string; champions: { id: string; name: string; avg: number }[] }[] {
  return [...dailyChampionDays(book, arenas).entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
    .map(([date, champions]) => ({ date, champions }));
}
