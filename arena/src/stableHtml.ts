import type { ArenaMode } from './types.ts';
import { MODE_LABELS } from './task-mode.ts';
/**
 * 蛐蛐棚总榜页 —— 生涯库渲成单文件 HTML（stable --html）
 *
 * 游戏性场景：棚是玩家的"基地"，总榜页是长期经营的陈列室——
 * 段位金字塔、成就陈列、赛季归档，一屏看完谁是一楼霸主。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { CareerBook } from './career.ts';
import { stableView, seasonOf } from './career.ts';
import { ACHIEVEMENTS } from './achievements.ts';
import {
  esc,
  siteNav,
  THEME_CSS,
  THEME_TOGGLE,
  pct,
  modelDisplayName,
  modelRatingName,
  conditionLabel,
} from './theme.ts';

export function renderStable(
  book: CareerBook,
  now = new Date(),
  web = false,
  modelNames: Readonly<Record<string, string>> = {},
  mode: ArenaMode = 'qa',
  conditionNames: Readonly<Record<string, string>> = {},
): string {
  const rows = stableView(book).filter((r) => !web || !r.id.startsWith('mock:'));
  const name = (r: { id: string; name: string; icon: string }) =>
    web ? esc(modelDisplayName(r.id, r.name, modelNames)) : `${r.icon} ${esc(r.name)}`;
  const season = seasonOf(now.toISOString());
  const nRanks = { total: rows.length, kings: rows.filter((r) => r.elo >= 2200).length };

  const bodyRows = rows
    .map((r, i) => {
      const ach = (r.achievements ?? [])
        .slice(-4)
        .map((a) => ACHIEVEMENTS[a.id])
        .filter(Boolean)
        .map(
          (a) =>
            `<span title="${web ? esc(a.desc.replaceAll('蛐蛐', '模型')) : `${esc(a.name)}：${esc(a.desc)}`}">${web ? '◆' : a.icon}</span>`,
        )
        .join('');
      const seasonElo = r.seasons?.[season]?.elo;
      return `<tr>
      <td>${r.answered > 0 ? (['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`) : '<span class="muted" title="尚无有效作答，不参与排名">—</span>'}</td>
      <td class="name">${web ? `<a href="/cricket/${encodeURIComponent(r.id)}?mode=${mode}">${name(r)}</a>` : name(r)}<div class="muted model-id" title="${esc(r.id)}">${esc(r.id)}</div></td>
      <td class="rating">${r.glicko ? `${r.glicko.r}<div class="muted">±${Math.round(2 * r.glicko.rd)}${r.provisional ? ' · 暂定' : ''}</div>` : '<span class="muted">—</span>'}</td>
      <td>${r.elo}${r.eloCI !== undefined ? `<div class="muted">±${r.eloCI}</div>` : ''}</td>
      <td>${esc(web ? modelRatingName(r.rank) : r.rank)}</td>
      <td>${seasonElo !== undefined ? seasonElo : '<span class="muted">未出战</span>'}</td>
      <td>${r.battles}</td><td>${r.titles} / ${r.podiums}</td>
      <td>${pct(r.avgScore)}</td>
      <td class="achievement-icons">${ach || '<span class="muted">—</span>'}</td>
      <td class="muted conditions">${r.bestCondition ? esc(conditionLabel(r.bestCondition, conditionNames)) : '-'} / ${r.worstCondition ? esc(conditionLabel(r.worstCondition, conditionNames)) : '-'}</td>
    </tr>`;
    })
    .join('\n');

  // 赛季归档时间线：每只蛐蛐每季的 Elo 落点
  const seasons = [...new Set(rows.flatMap((r) => Object.keys(r.seasons ?? {})))].sort();
  const seasonHtml = seasons.length
    ? `<h2>🍂 赛季归档</h2>
<div class="card"><table>
<thead><tr><th>${web ? '模型' : '蛐蛐'}</th>${seasons.map((s) => `<th>${esc(s)}${s === season ? '（进行中）' : ''}</th>`).join('')}</tr></thead>
<tbody>${rows
        .map(
          (r) =>
            `<tr><td class="name">${name(r)}</td>${seasons
              .map((s) => {
                const rec = r.seasons?.[s];
                return `<td>${rec ? `${rec.elo} <span class="muted">${rec.battles}场${rec.titles ? ` ${rec.titles}冠` : ''}</span>` : '<span class="muted">—</span>'}</td>`;
              })
              .join('')}</tr>`,
        )
        .join('\n')}</tbody></table>
<p class="muted">跨季首战触发软重置：积分向 1500 收 25%。</p></div>`
    : '';

  // 名人堂与耻辱柱：总榜两端是最有故事的两批蛐蛐
  const fame = rows.filter((r) => r.elo >= 1800).slice(0, 3);
  const shame = rows.filter((r) => r.elo < 1200).slice(-2);
  const fameHtml = fame.length
    ? `<div class="hall gold"><div class="hall-title">${web ? '领先模型' : '🏛️ 名人堂'}</div>${fame
        .map(
          (r) =>
            `<div class="hall-row"><span><b>${name(r)}</b></span><span class="muted">积分 ${r.elo} · ${r.titles} 冠 · ${(r.achievements ?? []).length} 成就</span></div>`,
        )
        .join('')}</div>`
    : '';
  const shameHtml = shame.length
    ? `<div class="hall dark"><div class="hall-title">${web ? '待提升模型' : '⛓️ 耻辱柱'}</div>${shame
        .map(
          (r) =>
            `<div class="hall-row"><span><b>${name(r)}</b></span><span class="muted">积分 ${r.elo} · ${r.battles} 场 · 场均 ${pct(r.avgScore)}</span></div>`,
        )
        .join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${web ? '模型战绩' : '蛐蛐棚 · 生涯总榜'} · AI斗兽场</title>
<style>
  :root { --ink:#2b2622; --muted:#8a8177; --accent:#c1442e; --bg:#faf6f0; --card:#fff; --line:#e8e0d5; --soft:#fbf8f3; --tag-bg:#f3ece1; --tag-ink:#c0b39e; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width: 1400px; min-width:1080px; margin: 0 auto; padding: 28px 40px 64px; }
  header { text-align:center; margin-bottom: 32px; }
  .badge { display:inline-block; background:var(--tag-bg); color:var(--accent); border:1px solid var(--line); font-size:11px; letter-spacing:3px; padding:4px 14px; border-radius:3px; margin-bottom:14px; }
  h1 { font-size:32px; margin: 0 0 8px; }
  .sub { color: var(--muted); font-size: 14px; }
  h2 { font-size: 20px; margin: 36px 0 14px; padding-left: 12px; border-left: 4px solid var(--accent); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; padding: 8px 10px; border-bottom: 2px solid var(--line); white-space: nowrap; }
  td { padding: 12px 10px; border-bottom: 1px solid var(--line); vertical-align: middle; white-space:nowrap; }
  tr:last-child td { border-bottom: none; }
  .name { font-weight: 600; white-space: nowrap; }
  .name a { color:var(--ink); text-decoration:none; }
  .name a:hover { color:var(--accent); text-decoration:underline; }
  .model-id { max-width:200px; overflow:hidden; text-overflow:ellipsis; font-weight:400; margin-top:3px; }
  .conditions { min-width:130px; max-width:190px; white-space:normal; overflow-wrap:anywhere; }
  .achievement-icons { letter-spacing:3px; }
  .hall-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:16px; }
  .hall-row { gap:16px; }
  .rating { font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
  .muted { color: var(--muted); font-size: 12px; }
  footer { text-align:center; color:var(--muted); font-size:12px; margin-top:48px; }
  .hall { border-radius: 12px; padding: 14px 20px; margin-bottom: 12px; }
  .hall.gold { background: linear-gradient(135deg, #fdf6e3, #f9ecd0); border: 1px solid #e5d3a8; }
  .hall.dark { background: #f3eeea; border: 1px solid #ddd0c4; }
  .hall-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
  .hall-row { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; }
  ${THEME_CSS}
  .track-tabs { display:flex; gap:8px; margin:20px 0 12px; }
  .track-tabs a { padding:9px 18px; border:1px solid var(--line); border-radius:6px; color:var(--muted); text-decoration:none; }
  .track-tabs a[aria-current=page] { color:var(--accent); border-color:var(--accent); background:var(--soft); }
</style></head>
<body><div class="wrap" role="main">${THEME_TOGGLE}
${
  web
    ? siteNav('stable') +
      `<nav class="track-tabs" aria-label="成绩赛道">${Object.entries(MODE_LABELS)
        .map(
          ([id, label]) => `<a href="/stable?mode=${id}" aria-current="${id === mode ? 'page' : 'false'}">${label}</a>`,
        )
        .join('')}</nav><p class="muted">${MODE_LABELS[mode]} · 本赛道独立统计成绩与评级</p>`
    : ''
}
<header>
  ${web ? '' : '<div class="badge">蛐 蛐 棚 · 生 涯 总 榜</div>'}
  <h1>${web ? '模型战绩' : '🦗 AI斗兽场 · 蛐蛐棚'}</h1>
  <div class="sub">${web ? `${nRanks.total} 个参赛模型 · S 级 ${nRanks.kings} 个` : `在册 ${nRanks.total} 只 · 虫王 ${nRanks.kings} 只`} · 当前赛季 ${esc(season)}</div>
</header>

<div class="hall-grid">${fameHtml}${shameHtml}</div>


<h2>${web ? '综合排名' : '🏆 生涯总榜'}</h2>
<div class="card"><table>
<thead><tr><th>名次</th><th>${web ? '模型' : '蛐蛐'}</th><th>Glicko</th><th>积分</th><th>${web ? '评级' : '段位'}</th><th>本赛季</th><th>场次</th><th>${web ? '夺冠/前三' : '冠/台'}</th><th>生涯均分</th><th>成就</th><th>擅长/短板</th></tr></thead>
<tbody>
${bodyRows || '<tr><td colspan="11" class="muted">还没有战绩，完成首场比赛后即可查看生涯总榜。</td></tr>'}
</tbody></table>
<p class="muted">排名按 Glicko 保守估计（评分 − 2 × 不确定度）。标"暂定"的${web ? '模型' : '蛐蛐'}不确定度超过 ±400，名次仅供参考。积分是每场涨跌的累计，会随场次持续增长，只用于${web ? '评级' : '段位'}。</p></div>

${seasonHtml}

<footer>AI斗兽场 QuQuArena · ${web ? '模型战绩' : '蛐蛐棚数据 career.json'} · 生成于 ${esc(now.toISOString().slice(0, 16))}</footer>
</div></body></html>`;
}

export async function writeStablePage(book: CareerBook, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const now = new Date();
  const file = path.join(outDir, `蛐蛐棚-${now.toISOString().slice(0, 10)}.html`);
  await writeFile(file, renderStable(book, now), 'utf8');
  return file;
}
