import type { ArenaMode } from './types.ts';
import { MODE_LABELS } from './task-mode.ts';
/**
 * 蛐蛐个人页 —— 一只蛐蛐的生涯一页装下（profile --html / 服务器 /cricket/<id>）
 *
 * 内容创作场景：每只蛐蛐都是可分享的"球员卡"——维度雷达（SVG 多边形）、
 * 场均走势（sparkline）、成就墙、宿敌榜、近期战绩。纯 SVG/CSS 零依赖。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { CareerBook } from './career.ts';
import { profileView, rivalriesOf } from './career.ts';
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

/** 少量维度用雷达；维度密集时逐项展示，避免标签互相遮挡。 */
function renderDimensions(radar: { cond: string; avg: number }[]): string {
  const n = radar.length;
  if (!n) return '<p class="muted">暂无维度记录</p>';
  if (n < 3 || n > 8)
    return `<div class="dimension-list" role="list" aria-label="各维度均分">${radar.map((c) => `<div class="dimension-row" role="listitem"><span class="dimension-label" title="${esc(c.cond)}">${esc(c.cond)}</span><span class="dimension-track" aria-hidden="true"><i style="width:${Math.max(0, Math.min(1, c.avg)) * 100}%"></i></span><span class="dimension-score">${pct(c.avg)}</span></div>`).join('')}</div>`;
  const R = 90;
  const cx = 110;
  const cy = 110;
  const pt = (i: number, v: number) => {
    const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
    return `${(cx + Math.cos(ang) * R * v).toFixed(1)},${(cy + Math.sin(ang) * R * v).toFixed(1)}`;
  };
  const rings = [0.33, 0.66, 1].map(
    (r) =>
      `<polygon points="${radar.map((_, i) => pt(i, r)).join(' ')}" fill="none" stroke="var(--line)" stroke-width="1"/>`,
  );
  const poly = radar.map((c, i) => pt(i, Math.max(0.04, c.avg))).join(' ');
  const labels = radar
    .map((c, i) => {
      const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
      const x = cx + Math.cos(ang) * (R + 16);
      const y = cy + Math.sin(ang) * (R + 16);
      const side = Math.cos(ang);
      const anchor = Math.abs(side) < 0.15 ? 'middle' : side > 0 ? 'start' : 'end';
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="12" fill="var(--muted)" text-anchor="${anchor}"><title>${esc(c.cond)} · ${pct(c.avg)}</title>${esc(c.cond.length > 18 ? c.cond.slice(0, 17) + '…' : c.cond)}</text>`;
    })
    .join('');
  return `<svg viewBox="-100 -20 420 260" width="420" height="260" role="img" aria-label="维度雷达">
  ${rings.join('')}
  <polygon points="${poly}" fill="rgba(193,68,30,.25)" stroke="var(--accent)" stroke-width="2"/>
  ${labels}
</svg>`;
}

/** SVG 场均走势 sparkline */
function sparkline(history: { avg: number }[]): string {
  if (history.length < 2) return '<p class="muted">样本不足</p>';
  const w = 260;
  const h = 60;
  const pts = history.map(
    (h2, i) => `${((i / (history.length - 1)) * (w - 8) + 4).toFixed(1)},${(h - 6 - h2.avg * (h - 12)).toFixed(1)}`,
  );
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="场均走势">
  <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2"/>
</svg>`;
}

export function renderCricket(
  book: CareerBook,
  id: string,
  web = false,
  modelNames: Readonly<Record<string, string>> = {},
  mode: ArenaMode = 'qa',
  conditionNames: Readonly<Record<string, string>> = {},
): string {
  const v = profileView(book, id);
  if (!v || (web && id.startsWith('mock:'))) throw new Error(web ? `模型档案不存在：${id}` : `蛐蛐棚里没有 ${id}`);
  const displayName = web ? modelDisplayName(v.id, v.name, modelNames) : v.name;
  const rivals = rivalriesOf(book, id).filter((r) => !web || !r.id.startsWith('mock:'));
  const earned = v.achievements ?? [];
  const hist = (v.history ?? []).slice(-16);
  const achievementLabels: Record<string, string> = {
    first_title: '首次夺冠',
    debut_champion: '首次参赛夺冠',
    three_titles: '三次夺冠',
    ten_battles: '十场比赛',
    podium_regular: '五次前三',
    giant_killer: '低评级逆转',
    executioner: '大比分领先',
    subject_king: '专项领先',
    blood_survivor: '高难题获胜',
    flawless: '零失误',
    rock_bottom: '评级低于 1000',
  };

  const achHtml = earned.length
    ? earned
        .map((a) => {
          const d = ACHIEVEMENTS[a.id];
          const description = web
            ? (d?.desc ?? '')
                .replaceAll('蛐蛐', '模型')
                .replace('身价', '评级')
                .replace('屠杀局', '比赛')
                .replace('团灭题的修罗场', '全员未得分题的比赛')
            : (d?.desc ?? '');
          return `<span class="ach" title="${esc(description)}">${web ? '' : `${d?.icon ?? '❔'} `}${esc(web ? (achievementLabels[a.id] ?? a.id) : (d?.name ?? a.id))}</span>`;
        })
        .join('')
    : '<p class="muted">尚未解锁成就</p>';

  const rivalHtml = rivals.length
    ? rivals
        .slice(0, 5)
        .map(
          (r) =>
            `<tr><td>${esc(web ? modelDisplayName(r.id, r.name, modelNames) : r.name)}</td><td>${r.n} 战</td><td>${r.ahead}${web ? ' 次领先' : ' 压过'}</td><td>${pct(r.winRate)}</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="4" class="muted">${web ? '暂无交手记录' : '还没有宿敌'}</td></tr>`;

  const histRows = hist
    .slice()
    .reverse()
    .map((h) => {
      const sign = h.delta >= 0 ? `+${h.delta}` : `${h.delta}`;
      return `<tr><td>${esc(h.at.slice(0, 10))}</td><td>${esc(h.arena)}</td><td>${pct(h.avg)}</td><td>第 ${h.place}/${h.field}</td><td class="${h.delta >= 0 ? 'win' : 'lose'}">${sign}</td></tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(displayName)} · ${web ? '模型档案' : '蛐蛐档案'} · AI斗兽场</title>
<style>
  :root { --ink:#2b2622; --muted:#8a8177; --accent:#c1442e; --gold:#b98a1c; --bg:#faf6f0; --card:#fff; --line:#e8e0d5; --soft:#fbf8f3; --tag-bg:#f3ece1; --tag-ink:#c0b39e; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 28px 40px 64px; }
  .hero { text-align:center; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:28px; margin-bottom:16px; }
  .hero .big { font-size: 40px; font-weight: 900; margin: 6px 0; }
  .hero .elo { font-size: 26px; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
  .hero .elo small { font-size: 14px; font-weight: 400; color: var(--muted); }
  h2 { font-size: 18px; margin: 28px 0 12px; padding-left: 12px; border-left: 4px solid var(--accent); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; padding: 6px 8px; border-bottom: 2px solid var(--line); }
  td { padding: 8px; border-bottom: 1px solid var(--line); }
  .muted { color: var(--muted); font-size: 12px; }
  .ach { display:inline-block; background:var(--tag-bg); color:var(--tag-ink); border-radius:8px; padding:6px 12px; margin: 4px 6px 0 0; font-size: 13px; }
  .win { color:#1a7f4b; font-weight:600; } .lose { color:var(--accent); }
  .radar-box { min-width:0; }
  .dimension-heading { display:flex; justify-content:space-between; gap:12px; margin-bottom:14px; font-size:14px; }
  .dimension-list { max-height:230px; overflow-y:auto; scrollbar-gutter:stable; padding-right:8px; }
  .dimension-row { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(50px,1fr) 46px; gap:10px; align-items:center; padding:7px 0; border-bottom:1px solid var(--line); font-size:11px; }
  .dimension-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dimension-track { height:5px; background:var(--line); border-radius:4px; overflow:hidden; }
  .dimension-track i { display:block; height:100%; background:var(--accent); }
  .dimension-score { text-align:right; color:var(--muted); font-variant-numeric:tabular-nums; }
  .hero > .muted:first-child { overflow-wrap:anywhere; }
  .card svg { max-width:100%; }
  td:first-child, td:nth-child(n+3) { white-space:nowrap; }
  td:nth-child(2) { overflow-wrap:anywhere; }
  .hero h1.big { font-size:36px; overflow-wrap:anywhere; }
  footer { text-align:center; color:var(--muted); font-size:12px; margin-top:40px; }
  ${THEME_CSS}
</style></head>
<body><div class="wrap" role="main">${THEME_TOGGLE}
  ${web ? siteNav('stable') + `<p class="muted" style="margin-bottom:16px"><a href="/stable?mode=${mode}" style="color:var(--accent)">← 返回${MODE_LABELS[mode]}战绩</a></p>` : ''}
  <div class="hero">
    <div class="muted">${esc(v.id)}</div>
    <h1 class="big">${web ? '' : `${v.icon} `}${esc(displayName)}</h1>
    <div class="muted">${web ? `评级 ${esc(modelRatingName(v.rank))}` : esc(v.rank)}${v.nextRank ? ` · 距${web ? `评级 ${esc(modelRatingName(v.nextRank.rank))}` : `「${esc(v.nextRank.rank)}」`}还差 ${v.nextRank.min - v.elo} 分` : web ? ' · 最高评级' : ' · 已封顶'}</div>
    <div class="elo">${v.glicko ? `Glicko ${v.glicko.r} <small>±${Math.round(2 * v.glicko.rd)}${v.provisional ? ' · 暂定' : ''}</small>` : 'Glicko —'}</div>
    <div class="muted">积分 ${v.elo}${v.eloCI !== undefined ? ` ±${v.eloCI}` : ''}</div>
    <div class="muted">${v.battles} 场 · ${v.titles} 冠 · ${v.podiums} 次前三 · 夺冠率 ${pct(v.winRate)} · 生涯均分 ${pct(v.avgScore)}</div>
  </div>

  <div class="grid">
    <div class="card radar-box"><div class="dimension-heading"><b>维度表现</b><span class="muted">${v.condRadar.length} 个维度 · 均分</span></div>${renderDimensions(v.condRadar.map((c) => ({ ...c, cond: conditionLabel(c.cond, conditionNames) })))}</div>
    <div class="card"><b>📈 场均走势</b><div style="margin-top:8px">${sparkline(hist)}</div><div class="muted">近 ${hist.length} 场场均</div></div>
  </div>

  <h2>${web ? '比赛里程碑' : '🏅 成就墙'}（${earned.length}/${Object.keys(ACHIEVEMENTS).length}）</h2>
  <div class="card">${achHtml}</div>

  <h2>${web ? '对手交手记录' : '⚔️ 宿敌榜'}</h2>
  <div class="card"><table><thead><tr><th>对手</th><th>交手</th><th>${web ? '领先次数' : '压过'}</th><th>${web ? '领先比例' : '压过率'}</th></tr></thead><tbody>${rivalHtml}</tbody></table></div>

  <h2>📜 近期战绩</h2>
  <div class="card"><table><thead><tr><th>日期</th><th>${web ? '题库' : '擂台'}</th><th>场均</th><th>名次</th><th>积分变动</th></tr></thead><tbody>${histRows || '<tr><td colspan="5" class="muted">暂无</td></tr>'}</tbody></table></div>

  <footer>AI斗兽场 QuQuArena · ${web ? '模型档案' : '蛐蛐档案 · 数据来自 career.json'}</footer>
</div></body></html>`;
}

export async function writeCricket(book: CareerBook, id: string, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const v = profileView(book, id);
  const file = path.join(outDir, `蛐蛐-${(v?.name ?? id).replace(/[\\/:*?"<>|]/g, '_')}.html`);
  await writeFile(file, renderCricket(book, id), 'utf8');
  return file;
}
