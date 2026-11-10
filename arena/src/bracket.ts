/**
 * 淘汰赛 —— bracket 命令：生涯 Elo 种子排位的单败淘汰
 *
 * 赛制设计：
 * - 种子：生涯 Elo 降序（首秀按 1500），1 号对末位、2 号对倒二——强强后遇
 * - 两两对决跑全罐（或 --limit 子集），avg 高者晋级
 * - 平局规则（下克上）：avg 完全相同时，生涯 Elo **低**者晋级——
 *   确定性优先于随机；下狗晋级自带爆冷叙事
 * - 每场对决照常结算生涯/成就/战报——淘汰赛是正式比赛，不是表演赛
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { BattleRecord, BattleResult, BoardEntry, Contestant } from './types.ts';
import { seasonOf } from './career.ts';
import { stampOf } from './stamp.ts';
import { esc, pct } from './theme.ts';

export interface Matchup {
  round: string;
  a: Contestant;
  b: Contestant;
  winnerId?: string;
  board?: BoardEntry[];
  result?: BattleResult;
  /** 平局爆冷标记（低身价者靠小分/最高单题分晋级） */
  upset?: boolean;
}

/** 种子配对：1vN、2v(N-1)…（位置 i 对位置 N-1-i） */
export function seedPairs(seeded: Contestant[]): [Contestant, Contestant][] {
  const pairs: [Contestant, Contestant][] = [];
  for (let i = 0; i < seeded.length / 2; i++) {
    pairs.push([seeded[i]!, seeded[seeded.length - 1 - i]!]);
  }
  return pairs;
}

/** 决胜：avg 高者晋级；完全相同 → 小分多者（同题对垒单题胜出数）→ 最高单题分 →
 *  生涯 Elo **高**者（平局不再奖励低 Elo，去「压低身价有优势」的逆激励）→ 种子靠前者。
 *  爆冷叙事保留在小分级：低身价者靠小分/最高单题分晋级仍标 upset。 */
export function decideWinner(
  a: Contestant,
  b: Contestant,
  board: BoardEntry[],
  preElo: Map<string, number>,
  records?: BattleRecord[],
): { winnerId: string; upset: boolean } {
  const ea = board.find((e) => e.model === a.id)?.avg ?? 0;
  const eb = board.find((e) => e.model === b.id)?.avg ?? 0;
  // 弃权沉底：avg=NaN 时 ?? 拦不住、NaN 比较恒 false 会把晋级判给对面——单方弃权则对方晋级，双弃权判无胜者（审查实证：弃权者曾可 0 作答夺冠）
  const an = Number.isNaN(ea),
    bn = Number.isNaN(eb);
  if (an && bn) return { winnerId: a.id, upset: false }; // 双弃权：种子靠前者，但 CLI 文案必须说清（下游判爆冷时用）
  if (an !== bn) return { winnerId: an ? b.id : a.id, upset: false };
  if (ea !== eb) return { winnerId: ea > eb ? a.id : b.id, upset: false };
  const scoreMap = (id: string) =>
    new Map((records ?? []).filter((r) => r.model === id && !r.error).map((r) => [r.taskId, r.score]));
  const sa = scoreMap(a.id);
  const sb = scoreMap(b.id);
  let aWins = 0;
  let bWins = 0;
  for (const [taskId, score] of sa) {
    const other = sb.get(taskId);
    if (other === undefined) continue;
    if (score > other) aWins += 1;
    else if (other > score) bWins += 1;
  }
  const pa = preElo.get(a.id) ?? 1500;
  const pb = preElo.get(b.id) ?? 1500;
  const win = (takeA: boolean): { winnerId: string; upset: boolean } => ({
    winnerId: takeA ? a.id : b.id,
    upset: (takeA ? pa : pb) < (takeA ? pb : pa), // 身价低者晋级＝爆冷
  });
  if (aWins !== bWins) return win(aWins > bWins);
  const best = (m: Map<string, number>) => (m.size ? Math.max(...m.values()) : 0);
  const ba = best(sa);
  const bb = best(sb);
  if (ba !== bb) return win(ba > bb);
  if (pa !== pb) return { winnerId: pa > pb ? a.id : b.id, upset: false }; // 全平：身价高者晋级（与生涯 Elo 正向 stakes 一致）
  return { winnerId: a.id, upset: false }; // 全同：种子靠前者（非爆冷——同 Elo 双首秀曾误报 upset）
}

export function renderBracket(arenaTitle: string, rounds: { name: string; matchups: Matchup[] }[], at: string): string {
  const final = rounds.at(-1)?.matchups[0];
  const champ = final?.winnerId ? (final.a.id === final.winnerId ? final.a : final.b) : undefined;

  const roundHtml = rounds
    .map(
      (r) => `<div class="round">
    <div class="round-name">${esc(r.name)}</div>
    ${r.matchups
      .map((m) => {
        const board = m.board ?? [];
        const scoreOf = (id: string) => board.find((e) => e.model === id);
        const row = (c: Contestant) => {
          const won = m.winnerId === c.id;
          const e = scoreOf(c.id);
          return `<div class="side${won ? ' won' : ''}"><span class="sname">${esc(c.name)}</span><span class="sscore">${e ? pct(e.avg) : '—'}</span></div>`;
        };
        return `<div class="match${m.upset ? ' upset' : ''}">
      ${row(m.a)}
      ${row(m.b)}
      ${m.upset ? '<div class="upset-tag">⚡ 平局爆冷</div>' : ''}
    </div>`;
      })
      .join('\n')}
  </div>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>淘汰赛 · ${esc(arenaTitle)} · AI斗兽场</title>
<style>
  :root { --ink:#2b2622; --muted:#8a8177; --accent:#c1442e; --gold:#b98a1c; --bg:#faf6f0; --card:#fff; --line:#e8e0d5; --soft:#fbf8f3; --tag-bg:#f3ece1; --tag-ink:#c0b39e; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 40px 24px 80px; }
  header { text-align:center; margin-bottom: 36px; }
  .badge { display:inline-block; background:var(--accent); color:#fff; font-size:12px; letter-spacing:4px; padding:4px 14px; border-radius:99px; margin-bottom:14px; }
  h1 { font-size: 32px; margin: 0 0 8px; }
  .sub { color: var(--muted); font-size: 14px; }
  .bracket { display: flex; gap: 28px; align-items: stretch; overflow-x: auto; padding: 8px 0 16px; }
  .round { display: flex; flex-direction: column; justify-content: space-around; gap: 16px; min-width: 240px; }
  .round-name { text-align: center; color: var(--muted); font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  .match { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .match.upset { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
  .side { display: flex; justify-content: space-between; padding: 10px 14px; font-size: 14px; }
  .side + .side { border-top: 1px solid var(--line); }
  .side.won { background: #eaf5ee; font-weight: 700; }
  [data-theme="dark"] .side.won { background: #1e3a2a; }
  .sscore { font-variant-numeric: tabular-nums; color: var(--muted); }
  .side.won .sscore { color: #1a7f4b; }
  .upset-tag { font-size: 11px; color: var(--gold); padding: 4px 14px 8px; }
  .champ-box { text-align:center; background:var(--card); border:2px solid var(--gold); border-radius:16px; padding:28px; margin-bottom:28px; }
  .champ-box .big { font-size: 38px; font-weight: 900; }
  footer { text-align:center; color:var(--muted); font-size:12px; margin-top:44px; }
</style></head>
<body><div class="wrap" role="main">
<header>
  <div class="badge">单 败 淘 汰 · 对 阵 图</div>
  <h1>🏆 ${esc(arenaTitle)} · 淘汰赛</h1>
  <div class="sub">${esc(seasonOf(at))} 赛季 · ${esc(at.slice(0, 16).replace('T', ' '))} · 种子按积分排位</div>
</header>

${champ ? `<div class="champ-box"><div class="muted">冠 军</div><div class="big">👑 ${esc(champ.name)}</div></div>` : ''}

<div class="bracket">
${roundHtml}
</div>

<footer>AI斗兽场 QuQuArena · 平局决胜：avg 相同先比小分，再比最高单题分，仍平积分高者晋级</footer>
</div></body></html>`;
}

export async function writeBracket(
  arenaTitle: string,
  rounds: { name: string; matchups: Matchup[] }[],
  at: string,
  outDir: string,
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const stamp = stampOf(at);
  const file = path.join(outDir, `淘汰赛-${stamp}.html`);
  await writeFile(file, renderBracket(arenaTitle, rounds, at), 'utf8');
  return file;
}
