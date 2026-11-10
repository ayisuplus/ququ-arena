/**
 * 分享海报 —— 从战绩 JSON 渲出 900×1200 单屏 HTML 卡片
 *
 * 内容创作场景：赛后截图即社媒素材。一屏讲清三件事——
 * 谁赢了（冠军特写）、有多惨（名场面翻车引用）、凭什么信（指纹+CI）。
 */
import path from 'node:path';
import type { BattleResult } from './types.ts';
import { buildLeaderboard, findBloodbaths } from './leaderboard.ts';
import { writeFile, mkdir } from 'node:fs/promises';
import { rankOf } from './career.ts';
import { gapCI } from './stats.ts';
import { stampOf } from './stamp.ts';
import { esc, pct } from './theme.ts';

export function renderPoster(result: BattleResult): string {
  const board = buildLeaderboard(result);
  const baths = findBloodbaths(result);
  const top = board[0];
  // 不配段位名：RANKS 阈值按生涯 Elo 校准，本场 Elo 不同源——只标本场 Elo（同一只蛐蛐战报/海报两个段位的矛盾曾实证）
  const gap = board.length >= 2 ? gapCI(result.records, board[0].model, board[1].model) : undefined;
  const significant = gap ? !(gap.lo <= 0 && gap.hi >= 0) : false;
  const worst = baths[0];

  const rows = board
    .slice(0, 5)
    .map(
      (e, i) => `<div class="row${i === 0 ? ' first' : ''}">
    <span class="medal">${Number.isNaN(e.avg) ? '—' : ['🥇', '🥈', '🥉', '4.', '5.'][i]}</span>
    <span class="rname">${esc(e.name)}</span>
    <span class="rbar"><span style="width:${Number.isNaN(e.avg) ? 0 : (e.avg * 100).toFixed(0)}%"></span></span>
    <span class="rval">${Number.isNaN(e.avg) ? '弃权' : pct(e.avg)}</span>
  </div>`,
    )
    .join('');

  const bathHtml = worst
    ? `<div class="bath">
    <div class="bath-title">🩸 名场面 · 全场平均仅 ${pct(worst.avg)}</div>
    <div class="bath-prompt">${esc(worst.prompt.slice(0, 90))}${worst.prompt.length > 90 ? '…' : ''}</div>
    <div class="bath-meta">全场平均仅 ${pct(worst.avg)}${worst.target ? ` · 参考答案：${esc(worst.target.slice(0, 30))}` : ''}</div>
  </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta property="og:title" content="海报 · ${esc(result.arena.title)} · AI斗兽场">
<meta property="og:description" content="冠军 ${esc(top.name)} ${pct(top.avg)} · ${result.contestants.length} 只蛐蛐">
<title>海报 · ${esc(result.arena.title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { background:#26211c; display:flex; justify-content:center; padding:24px; font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; }
  .poster { width:900px; background:linear-gradient(160deg,#faf6f0 0%,#f3ece1 100%); border-radius:24px; padding:56px 64px; color:#2b2622; }
  .brand { text-align:center; color:#c1442e; letter-spacing:8px; font-size:15px; margin-bottom:10px; }
  h1 { text-align:center; font-size:44px; margin-bottom:6px; }
  .sub { text-align:center; color:#8a8177; font-size:15px; margin-bottom:44px; }
  .champ { text-align:center; background:#fff; border:2px solid #e8e0d5; border-radius:20px; padding:36px 0 30px; margin-bottom:36px; }
  .champ .crown { font-size:56px; }
  .champ .cname { font-size:40px; font-weight:800; margin:8px 0 2px; }
  .champ .cscore { font-size:64px; font-weight:900; color:#c1442e; font-variant-numeric:tabular-nums; line-height:1.1; }
  .champ .crank { font-size:17px; color:#8a8177; margin-top:6px; }
  .champ .csig { display:inline-block; margin-top:12px; font-size:13px; padding:4px 14px; border-radius:99px; background:${significant ? '#eaf5ee' : '#fbf0e8'}; color:${significant ? '#1a7f4b' : '#c1442e'}; }
  .row { display:flex; align-items:center; gap:14px; padding:10px 4px; font-size:19px; }
  .row .medal { width:44px; }
  .row .rname { width:200px; font-weight:600; }
  .row .rbar { flex:1; background:#efe7da; height:18px; border-radius:9px; overflow:hidden; }
  .row .rbar span { display:block; height:100%; background:linear-gradient(90deg,#d9a05b,#c1442e); }
  .row .rval { width:88px; text-align:right; font-variant-numeric:tabular-nums; color:#8a8177; }
  .row.first .rval { color:#c1442e; font-weight:700; }
  .bath { margin-top:36px; background:#fff; border-left:6px solid #c1442e; border-radius:14px; padding:22px 26px; }
  .bath-title { font-size:16px; font-weight:700; color:#c1442e; margin-bottom:10px; }
  .bath-prompt { font-size:15px; white-space:pre-wrap; background:#fbf8f3; border-radius:8px; padding:12px 14px; margin-bottom:10px; }
  .bath-meta { font-size:14px; color:#b98a1c; }
  footer { margin-top:44px; text-align:center; color:#8a8177; font-size:12px; line-height:2; }
  footer code { background:#efe7da; padding:2px 8px; border-radius:6px; }
</style></head>
<body><div class="poster">
  <div class="brand">电 子 蛐 蛐 · AI 斗 兽 场</div>
  <h1>🦗 ${esc(result.arena.title)}</h1>
  <div class="sub">${esc(result.startedAt.slice(0, 10))} · ${result.contestants.length} 只蛐蛐 × ${new Set(result.records.map((r) => r.taskId)).size} 道题</div>

  <div class="champ">
    <div class="crown">${Number.isNaN(top.avg) ? '💨' : '🦗'}</div>
    <div class="cname">${esc(top.name)}</div>
    <div class="cscore">${Number.isNaN(top.avg) ? '弃权' : pct(top.avg)}</div>
    <div class="crank">本场 Elo ${top.elo}</div>
    ${gap ? `<div class="csig">冠亚军分差 95% CI [${pct(gap.lo)}, ${pct(gap.hi)}] —— ${significant ? '优势统计显著' : '差距在噪声内，名次不足为凭'}</div>` : ''}
  </div>

  ${rows}
  ${bathHtml}

  <footer>
    题库指纹 <code>${esc(result.meta?.arenaFingerprint ?? 'unknown')}</code>
    · 裁判 ${esc(result.meta?.judgeModels.join(' + ') ?? 'unknown')}<br>
    AI斗兽场 QuQuArena v${esc(result.meta?.toolVersion ?? '0.3.0')}${result.arena.judge.kind === 'llm' ? '' : ' · 数据可复现：同指纹同阵容重跑结果一致'}
  </footer>
</div></body></html>`;
}

export async function writePoster(result: BattleResult, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const stamp = stampOf(result.startedAt);
  const file = path.join(outDir, `海报-${result.arena.name}-${stamp}.html`);
  await writeFile(file, renderPoster(result), 'utf8');
  return file;
}
