/**
 * 3D 淘汰赛的种子排位与赛前预期。评分来自短题竞速生涯的 Glicko（研究层），
 * 游戏只拿它排种子、给观众一个"谁被看好"的预期——胜负仍只由本场答题决定。
 */
import { conservativeRating, winProbability, DEFAULT_RATING, isProvisional, type GlickoRating } from './glicko.ts';

/**
 * 标准单败淘汰的种子位置：返回首轮从左到右依次落位的种子序号（0 起）。
 * 8 人为 1-8、4-5、2-7、3-6：相邻两场的胜者再相遇，1、2 号种子只可能在决赛相遇。
 */
export function bracketOrder(size: number): number[] {
  if (![2, 4, 8].includes(size)) throw new Error('仅支持 2、4、8 人淘汰赛');
  let order = [0, 1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((seed) => [seed, n - 1 - seed]);
  }
  return order;
}

export interface SeedRating {
  r: number;
  rd: number;
  provisional: boolean;
}
export interface DrawPreview {
  draw: string[];
  mode: 'seeded' | 'random';
  ratings: Record<string, SeedRating>;
  /** 首轮每组对阵中左侧选手的预期胜率 */
  pairs: { players: [string, string]; probability: number }[];
}

type Shuffle = <T>(items: T[]) => T[];

/** 种子：按保守估计 r − 2·RD 从高到低；同分先随机打乱再稳定排序，避免总按 id 字母序占便宜 */
export function drawPreview(
  models: string[],
  ratingOf: (id: string) => GlickoRating | undefined,
  mode: 'seeded' | 'random',
  shuffle: Shuffle,
): DrawPreview {
  const rating = (id: string) => ratingOf(id) ?? DEFAULT_RATING;
  let draw: string[];
  if (mode === 'random') draw = shuffle(models);
  else {
    const seeds = shuffle(models).sort((a, b) => conservativeRating(rating(b)) - conservativeRating(rating(a)));
    draw = bracketOrder(models.length).map((seed) => seeds[seed]!);
  }
  const pairs: DrawPreview['pairs'] = [];
  for (let i = 0; i < draw.length; i += 2) {
    const players: [string, string] = [draw[i]!, draw[i + 1]!];
    pairs.push({ players, probability: winProbability(rating(players[0]), rating(players[1])) });
  }
  const ratings = Object.fromEntries(
    models.map((id) => {
      const g = rating(id);
      return [id, { r: g.r, rd: g.rd, provisional: isProvisional(g) }];
    }),
  );
  return { draw, mode, ratings, pairs };
}
