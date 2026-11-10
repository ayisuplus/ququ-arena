/**
 * 联赛模式 —— 一晚多罐巡回赛（league 命令）
 *
 * 游戏性场景：单场定英雄有运气成分，巡回赛是"赛季微缩版"——
 * 每罐按名次拿积分（第 1 名拿满场数分，递减），总积分定盟主。
 * 每场照常结算生涯/成就/战报，联赛页是额外的汇总陈列。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ArenaDef, BattleResult, BoardEntry, Contestant } from './types.ts';
import { seasonOf } from './career.ts';
import { esc, THEME_CSS, THEME_TOGGLE, pct } from './theme.ts';
import { stampOf } from './stamp.ts';

export interface LeagueLeg {
  def: ArenaDef;
  result: BattleResult;
  board: BoardEntry[];
}

export interface LeagueStanding {
  id: string;
  name: string;
  points: number;
  titles: number; // 分站冠军数
  totalAvg: number; // 各站场均的均值（平分决胜）
  places: number[]; // 各站名次（1-based，与 legs 同序）
}

/** 积分榜：每站第 i 名拿 (参赛数 - i) 分 */
export function computeStandings(legs: LeagueLeg[]): LeagueStanding[] {
  const map = new Map<string, LeagueStanding>();
  for (const leg of legs) {
    const field = leg.board.length;
    leg.board.forEach((e, i) => {
      if (Number.isNaN(e.avg)) return; // 弃权站不拿名次分不进场均（审查实证：NaN 沉底者曾三站白拿 4 分且污染 totalAvg 为 NaN）
      const s = map.get(e.model) ?? { id: e.model, name: e.name, points: 0, titles: 0, totalAvg: 0, places: [] };
      s.points += field - i;
      if (i === 0) s.titles += 1;
      s.totalAvg += e.avg;
      s.places.push(i + 1);
      map.set(e.model, s);
    });
  }
  const n = legs.length || 1;
  return [...map.values()]
    .map((s) => ({ ...s, totalAvg: s.totalAvg / Math.max(1, s.places.length) })) // 分母用该蛐蛐实际有效站数，不用总站数
    .sort((a, b) => b.points - a.points || b.totalAvg - a.totalAvg);
}

export function renderLeague(legs: LeagueLeg[], standings: LeagueStanding[], at: string): string {
  const season = seasonOf(at);
  const champ = standings[0]!;
  const podiums = standings.filter((s) => s.places.some((p) => p <= 3)).length;

  const standRows = standings
    .map(
      (s, i) => `<tr class="${i === 0 ? 'champ-row' : ''}">
      <td>${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</td>
      <td class="name">${esc(s.name)}<div class="muted">${esc(s.id)}</div></td>
      <td class="pts">${s.points}</td>
      <td>${s.titles} 冠</td>
      ${legs.map((_, li) => `<td class="place p${s.places[li]}">${s.places[li] ?? '—'}</td>`).join('')}
      <td>${pct(s.totalAvg)}</td>
    </tr>`,
    )
    .join('\n');

  const legHtml = legs
    .map((leg) => {
      const podium = leg.board.slice(0, 3);
      return `<div class="leg">
    <div class="leg-title">《${esc(leg.def.title)}》 <span class="muted">${new Set(leg.result.records.map((r) => r.taskId)).size} 题 · ${esc(leg.def.judge.kind)} 裁判 · 指纹 ${esc(leg.result.meta?.arenaFingerprint ?? '—')}</span></div>
    <div class="leg-podium">${podium.map((e, i) => `${['🥇', '🥈', '🥉'][i]} ${esc(e.name)} ${pct(e.avg)}`).join(' &nbsp;·&nbsp; ')}</div>
  </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>联赛战报 · ${esc(season)} 赛季 · AI斗兽场</title>
<style>
  :root { --ink:#2b2622; --muted:#8a8177; --accent:#c1442e; --gold:#b98a1c; --bg:#faf6f0; --card:#fff; --line:#e8e0d5; --soft:#fbf8f3; --tag-bg:#f3ece1; --tag-ink:#c0b39e; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 40px 24px 80px; }
  header { text-align:center; margin-bottom: 36px; }
  .badge { display:inline-block; background:var(--accent); color:#fff; font-size:12px; letter-spacing:4px; padding:4px 14px; border-radius:99px; margin-bottom:14px; }
  h1 { font-size: 34px; margin: 0 0 8px; }
  .sub { color: var(--muted); font-size: 14px; }
  h2 { font-size: 20px; margin: 40px 0 14px; padding-left: 12px; border-left: 4px solid var(--accent); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; padding: 8px 10px; border-bottom: 2px solid var(--line); white-space: nowrap; }
  td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: top; white-space: nowrap; }
  tr:last-child td { border-bottom: none; }
  .name { font-weight: 600; }
  .pts { font-weight: 800; font-size: 18px; color: var(--accent); font-variant-numeric: tabular-nums; }
  .champ-row { background: #fbf3e8; }
  .place { text-align: center; font-variant-numeric: tabular-nums; }
  .p1 { color: var(--accent); font-weight: 700; }
  .muted { color: var(--muted); font-size: 12px; }
  .champ-box { text-align:center; background:var(--card); border:2px solid var(--gold); border-radius:16px; padding:28px; margin-bottom:8px; }
  .champ-box .big { font-size: 40px; font-weight: 900; }
  .champ-box .score { font-size: 56px; font-weight: 900; color: var(--accent); }
  .leg { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; }
  .leg-title { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
  .leg-podium { font-size: 14px; }
  footer { text-align:center; color:var(--muted); font-size:12px; margin-top:48px; }
  ${THEME_CSS}
</style></head>
<body><div class="wrap" role="main">${THEME_TOGGLE}
<header>
  <div class="badge">巡 回 联 赛 · 战 报</div>
  <h1>🏟️ ${esc(season)} 赛季 · ${legs.length} 站巡回</h1>
  <div class="sub">${esc(at.slice(0, 16).replace('T', ' '))} · ${standings.length} 只蛐蛐 · ${podiums} 只上过领奖台</div>
</header>

<div class="champ-box">
  <div class="muted">盟 主</div>
  <div class="big">👑 ${esc(champ.name)}</div>
  <div class="score">${champ.points} 分</div>
  <div class="muted">${champ.titles} 个分站冠军 · 各站场均 ${pct(champ.totalAvg)}</div>
</div>

<h2>🏆 总积分榜</h2>
<div class="card"><table>
<thead><tr><th>名次</th><th>蛐蛐</th><th>积分</th><th>分冠</th>${legs.map((l) => `<th>${esc(l.def.title.slice(0, 8))}</th>`).join('')}<th>场均</th></tr></thead>
<tbody>
${standRows}
</tbody></table>
<p class="muted">积分规则：每站第 1 名拿 N 分（N=参赛数），第 2 名 N−1 分，依次递减；平分按各站场均决胜。</p></div>

<h2>📍 分站速览</h2>
${legHtml}

<footer>AI斗兽场 QuQuArena · 联赛战报 · 各站详细战报见同目录 战报-*.html</footer>
</div></body></html>`;
}

export async function writeLeague(
  legs: LeagueLeg[],
  standings: LeagueStanding[],
  at: string,
  outDir: string,
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const stamp = stampOf(at);
  const file = path.join(outDir, `联赛-${stamp}.html`);
  await writeFile(file, renderLeague(legs, standings, at), 'utf8');
  return file;
}
