/**
 * 赛季回顾 —— recap 命令：把赛季归档数据变成官方叙事产物
 *
 * 游戏性场景：赛季结算需要一个"颁奖典礼"。从 career.json 的 seasons 归档
 * 与 history 轨迹聚合：赛季冠军 / 最大涨幅 / 最大跌幅 / 全勤 / 新秀数。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { CareerBook } from './career.ts';
import { rankOf } from './career.ts';
import { esc, THEME_CSS, THEME_TOGGLE } from './theme.ts';

export interface RecapRow {
  id: string;
  name: string;
  battles: number;
  titles: number;
  deltaSum: number;
  finalElo: number;
}

export interface SeasonRecap {
  season: string;
  rows: RecapRow[];
  champion?: RecapRow;
  riser?: RecapRow;
  faller?: RecapRow;
  workhorse?: RecapRow;
  rookies: string[];
}

/** 聚合某赛季：seasons 归档给场次/冠军数/季末 Elo，history 轨迹给 delta 累计 */
export function recapData(book: CareerBook, season: string): SeasonRecap {
  const rows: RecapRow[] = [];
  for (const e of Object.values(book.entries)) {
    const s = e.seasons?.[season];
    if (!s) continue;
    // 优先读 seasons 归档的 deltaSum（含跨季重置位移，不截断）；旧档案缺字段才回退 history 窗口（审查实证：截断窗曾少算净涨跌、把老将伪造成新秀）
    const deltaSum =
      s.deltaSum ?? (e.history ?? []).filter((h) => h.season === season).reduce((sum, h) => sum + h.delta, 0);
    rows.push({ id: e.id, name: e.name, battles: s.battles, titles: s.titles, deltaSum, finalElo: s.elo });
  }
  rows.sort((a, b) => b.finalElo - a.finalElo || b.titles - a.titles);

  const byDeltaDesc = [...rows].sort((a, b) => b.deltaSum - a.deltaSum);
  const rookies = Object.values(book.entries)
    .filter((e) => Object.keys(e.seasons ?? {}).sort()[0] === season) // seasons 归档不截断——首季即出道季（history 截断窗曾把老将伪造成新秀）
    .map((e) => e.name);

  return {
    season,
    rows,
    champion: rows[0],
    riser: byDeltaDesc[0],
    faller: byDeltaDesc.at(-1),
    workhorse: [...rows].sort((a, b) => b.battles - a.battles)[0],
    rookies,
  };
}

export function renderRecap(rec: SeasonRecap): string {
  const card = (title: string, row?: RecapRow, sub = '') =>
    row
      ? `<div class="award"><div class="award-title">${title}</div><div class="award-name">${esc(row.name)}</div><div class="muted">${sub}</div></div>`
      : '';
  const rowsHtml = rec.rows
    .map((r, i) => {
      const { rank, icon } = rankOf(r.finalElo);
      const sign = r.deltaSum >= 0 ? `+${r.deltaSum}` : `${r.deltaSum}`;
      return `<tr><td>${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</td><td class="name">${esc(r.name)}</td><td>${r.finalElo}</td><td>${icon}${rank}</td><td>${r.battles}</td><td>${r.titles}</td><td class="${r.deltaSum >= 0 ? 'win' : 'lose'}">${sign}</td></tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>赛季回顾 · ${esc(rec.season)} · AI斗兽场</title>
<style>
  :root { --ink:#2b2622; --muted:#8a8177; --accent:#c1442e; --gold:#b98a1c; --bg:#faf6f0; --card:#fff; --line:#e8e0d5; --soft:#fbf8f3; --tag-bg:#f3ece1; --tag-ink:#c0b39e; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width: 860px; margin: 0 auto; padding: 40px 24px 64px; }
  header { text-align:center; margin-bottom: 32px; }
  .badge { display:inline-block; background:var(--accent); color:#fff; font-size:12px; letter-spacing:4px; padding:4px 14px; border-radius:99px; margin-bottom:14px; }
  h1 { font-size: 30px; margin: 0 0 8px; }
  .sub { color: var(--muted); font-size: 14px; }
  h2 { font-size: 19px; margin: 30px 0 12px; padding-left: 12px; border-left: 4px solid var(--accent); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; padding: 8px 10px; border-bottom: 2px solid var(--line); }
  td { padding: 10px; border-bottom: 1px solid var(--line); }
  .name { font-weight: 600; }
  .muted { color: var(--muted); font-size: 12px; }
  .awards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .award { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 18px; text-align: center; }
  .award-title { font-size: 13px; color: var(--muted); margin-bottom: 8px; }
  .award-name { font-size: 22px; font-weight: 800; }
  .win { color:#1a7f4b; font-weight:600; } .lose { color:var(--accent); font-weight:600; }
  footer { text-align:center; color:var(--muted); font-size:12px; margin-top:40px; }
  ${THEME_CSS}
</style></head>
<body><div class="wrap" role="main">${THEME_TOGGLE}
<header>
  <div class="badge">赛 季 回 顾</div>
  <h1>🏟️ ${esc(rec.season)} 赛季</h1>
  <div class="sub">${rec.rows.length} 只蛐蛐出战 · 新秀 ${rec.rookies.length} 只${rec.rookies.length ? `（${esc(rec.rookies.join('、'))}）` : ''}</div>
</header>

<div class="awards">
  ${card('👑 赛季冠军', rec.champion, `季末积分 ${rec.champion?.finalElo ?? ''}`)}
  ${rec.riser && rec.riser.deltaSum > 0 ? card('📈 最大涨幅', rec.riser, `赛季净涨 +${rec.riser.deltaSum}`) : ''}
  ${rec.faller && rec.faller.deltaSum < 0 ? card('📉 最大跌幅', rec.faller, `赛季净跌 ${rec.faller.deltaSum}`) : ''}
  ${card('🏃 全勤奖', rec.workhorse, `${rec.workhorse?.battles ?? 0} 场全勤`)}
</div>

<h2>🏆 赛季总榜</h2>
<div class="card"><table>
<thead><tr><th>名次</th><th>蛐蛐</th><th>季末积分</th><th>段位</th><th>场次</th><th>夺冠</th><th>净涨跌</th></tr></thead>
<tbody>
${rowsHtml}
</tbody></table></div>

<footer>AI斗兽场 QuQuArena · 赛季回顾 · 跨季首战触发软重置（积分向 1500 收 25%）</footer>
</div></body></html>`;
}

export async function writeRecap(rec: SeasonRecap, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `赛季回顾-${rec.season}.html`);
  await writeFile(file, renderRecap(rec), 'utf8');
  return file;
}
