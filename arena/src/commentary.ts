/**
 * 赛后解说 —— 把爆冷、碾压、翻车名场面从数据里"喊"出来
 *
 * 设计原则：戏剧性优先于完整性。解说是放大器，不是数据源——
 * 所有判定都基于已算好的分数与 Elo，一个数字都不新造。
 * 纯模板生成，确定性可复现，不接 LLM（裁判公正与解说放飞分离）。
 * 判定阈值 rationale（v0.2 起统计化）：
 * - 神仙打架：top1-top2 分差的 paired bootstrap 95% CI 含 0 ——
 *   分差在噪声范围内才算"毫厘之差"，不再是拍脑袋的 2pp
 * - 屠杀局：首尾 avg 差 ≥ 40pp —— 接近"一只全对一只全错"的一半，肉眼可见的碾压
 * - 爆冷：赛前生涯 Elo 最高者跌出前二 / 最低者进前二 —— 排位与身价的显著背离
 * - 名场面：复用 findBloodbaths（全员均分 ≤ 0.4），取最惨一题播报
 * - 裁判吵架：双裁判分歧 ≥0.3（10 分制 3 分）的题数 —— 评分争议即题目暧昧信号
 */
import type { BattleResult, BoardEntry } from './types.ts';
import { findBloodbaths } from './leaderboard.ts';
import { gapCI } from './stats.ts';
import { hash } from './mock.ts';
import { isAnswered } from './record-state.ts';
import { pct } from './theme.ts';
import { buildSettlement } from './scoring-summary.ts';
import { EFFICIENCY_POLICY } from './performance.ts';

/** 措辞轮换：同一场比赛的解说确定可复现，不同场次换花样（种子=罐名+开赛时刻） */
function pick<T>(variants: T[], seed: number): T {
  return variants[seed % variants.length]!;
}

export function commentate(result: BattleResult, board: BoardEntry[], preElo: Map<string, number>): string[] {
  if (result.meta?.rankingPolicy === EFFICIENCY_POLICY) {
    const settled = buildSettlement(result, board);
    const leaders = settled.rows.filter((row) => settled.leaderIds.includes(row.modelId));
    return [
      leaders.length
        ? `本场${settled.outcome === 'tie' ? '并列第一' : '冠军'}：${leaders.map((row) => row.name).join('、')}，竞技综合分 ${(leaders[0]!.performance!.score! * 100).toFixed(1)}。`
        : settled.reason,
      '竞技综合分计入答题质量、速度、Token效率与缓存命中；答题均分和Elo单独展示，详细权重与数据覆盖见结算台。',
    ];
  }
  const lines: string[] = [];
  if (board.length < 2) return lines;

  const top = board[0];
  const second = board[1];
  const bottom = board.at(-1)!;
  const gap12 = top.avg - second.avg;
  const gapAll = top.avg - bottom.avg;

  // 冠军台词：先看分差是否在噪声内（统计意义上的神仙打架）
  const topScores = result.records.filter((r) => r.model === top.model && isAnswered(r)).map((r) => r.score);
  const gap = gapCI(result.records, top.model, second.model);
  const gapIsNoise = !gap || (gap.lo <= 0 && gap.hi >= 0); // 无配对数据（undefined）按噪声处理——不许下显著结论
  const seed = hash(`${result.arena.name}::${result.startedAt}`);
  if (gap && gap.lo <= 0 && gap.hi >= 0 && topScores.length >= 8) {
    // 引 CI 数值的分支必须有 gap
    lines.push(
      pick(
        [
          `⚔️ 神仙打架！${top.name} 与 ${second.name} 的分差 95% CI 为 [${pct(gap.lo)}, ${pct(gap.hi)}]，含 0——谁是冠军纯属运气。`,
          `⚔️ 神仙打架！${top.name} 跟 ${second.name} 杀到分差进了噪声（95% CI [${pct(gap.lo)}, ${pct(gap.hi)}] 含 0）——冠军归属等于掷硬币。`,
        ],
        seed,
      ),
    );
  } else if (gapIsNoise) {
    // 样本不足且 CI 含 0（无论横扫与否）：不许一边给含 0 的区间一边说"显著"或"横扫"（v1.7/v1.8 审计修复）
    lines.push(
      `👑 ${top.name} 以 ${pct(top.avg)} 暂居首位，但${gap ? `分差 95% CI [${pct(gap.lo)}, ${pct(gap.hi)}] 含 0，` : '与第二名没有共同有效题可做配对检验，'}样本不足，名次不下结论。`,
    );
  } else if (top.avg >= 0.9) {
    lines.push(
      pick(
        [
          `👑 ${top.name} 以 ${pct(top.avg)} 的恐怖战绩夺冠——这罐子对它来说像自家后院。`,
          `👑 ${top.name} ${pct(top.avg)} 横扫夺冠——这罐子对它没有秘密。`,
        ],
        seed,
      ),
    );
  } else {
    lines.push(
      pick(
        [
          `👑 ${top.name} 以 ${pct(top.avg)} 夺冠，领先 ${second.name} ${pct(gap12)}（分差 95% CI [${pct(gap!.lo)}, ${pct(gap!.hi)}]，显著）。`,
          `👑 ${top.name} 登顶（${pct(top.avg)}），甩开 ${second.name} ${pct(gap12)}——分差显著（95% CI [${pct(gap!.lo)}, ${pct(gap!.hi)}] 不含 0）。`,
        ],
        seed,
      ),
    );
  }

  // 屠杀局
  if (gapAll >= 0.4) {
    lines.push(
      pick(
        [
          `🩸 屠杀局：首尾差距 ${pct(gapAll)}，${bottom.name} 基本是被按在地上摩擦完整场的。`,
          `🩸 屠杀局：首尾 ${pct(gapAll)} 的鸿沟——${bottom.name} 今晚不宜出门。`,
        ],
        seed + 1,
      ),
    );
  }

  // 爆冷判定（基于赛前生涯 Elo；首秀蛐蛐 1500 视为"身价不明"）
  const ranked = board.map((e) => ({ e, pre: preElo.get(e.model) ?? 1500 }));
  const fav = ranked.reduce((a, b) => (b.pre > a.pre ? b : a)); // 赛前最大热门
  const dog = ranked.reduce((a, b) => (b.pre < a.pre ? b : a)); // 赛前最大冷门
  const favRank = board.findIndex((e) => e.model === fav.e.model);
  const dogRank = board.findIndex((e) => e.model === dog.e.model);
  if (board.length >= 3) {
    if (favRank >= 2 && fav.pre - dog.pre >= 50) {
      lines.push(
        pick(
          [
            `💥 大爆冷！赛前最大热门 ${fav.e.name}（积分 ${fav.pre}）仅列第 ${favRank + 1}，身价当场蒸发。`,
            `💥 大冷门！头号种子 ${fav.e.name}（积分 ${fav.pre}）只拿到第 ${favRank + 1}——观众席一片哗然。`,
          ],
          seed + 2,
        ),
      );
    }
    if (dogRank <= 1 && fav.pre - dog.pre >= 50 && dog.e.model !== fav.e.model) {
      lines.push(
        pick(
          [
            `🐴 黑马预警：赛前垫底的 ${dog.e.name}（积分 ${dog.pre}）杀进前二，今晚蛐蛐市场要变天。`,
            `🐴 下克上！身价垫底的 ${dog.e.name}（积分 ${dog.pre}）杀进前二——评级公司要加班了。`,
          ],
          seed + 3,
        ),
      );
    }
  }

  // 名场面：全员翻车最惨一题
  const baths = findBloodbaths(result);
  if (baths.length) {
    const b = baths[0];
    lines.push(
      pick(
        [
          `🎬 名场面：「${b.taskId}」全员翻车（均分 ${pct(b.avg)}）——${b.prompt.length > 50 ? b.prompt.slice(0, 50) + '…' : b.prompt}`,
          `🎬 集体翻车现场：「${b.taskId}」全场均分仅 ${pct(b.avg)}——${b.prompt.length > 50 ? b.prompt.slice(0, 50) + '…' : b.prompt}`,
        ],
        seed + 4,
      ),
    );
    if (baths.length >= 3)
      lines.push(
        pick(
          [
            `   本场共 ${baths.length} 道"团灭题"，这罐子的出题人是个狠角色。`,
            `   共 ${baths.length} 道团灭题——出题人今晚睡得着吗。`,
          ],
          seed + 5,
        ),
      );
  }
  // 虽败犹荣
  if (bottom.avg >= 0.5 && gapAll < 0.4) {
    lines.push(
      pick(
        [
          `🫡 虽败犹荣：${bottom.name} 垫底但也有 ${pct(bottom.avg)}，换个小点的罐子未必输。`,
          `🫡 站着输的：${bottom.name} 垫底仍拿到 ${pct(bottom.avg)}——输得体面。`,
        ],
        seed + 6,
      ),
    );
  }

  // 裁判吵架：多裁判高分歧题数（评分争议 = 题目质量信号）
  const disputed = result.records.filter((r) => (r.dispute ?? 0) >= 0.3);
  if (disputed.length) {
    const taskN = new Set(disputed.map((r) => r.taskId)).size;
    lines.push(`⚖️ 裁判吵架：${taskN} 道题双裁判分歧 ≥3 分（10 分制）——这些题出得暧昧，出题人值得复查。`);
  }

  return lines;
}
