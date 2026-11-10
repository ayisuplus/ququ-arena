/**
 * 战报生成 —— 单文件 HTML（榜单+CI / 维度对决 / 胜率矩阵 / 名场面 / 逐题明细）
 *              + Markdown 摘要（内容创作场景：直接粘到知乎/推/论文笔记）
 * 美观与科学性同炉：每个数字都带误差棒，每张图都是纯 CSS/SVG 零依赖。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stampOf } from './stamp.ts';
import type { BattleResult, BoardEntry } from './types.ts';
import { buildLeaderboard, findBloodbaths } from './leaderboard.ts';
import { rankOf, type CareerDelta } from './career.ts';
import { saveBattle } from './results-store.ts';
import { bootstrapCI, gapCI, winMatrix, judgeAgreement, cronbachAlpha } from './stats.ts';
import { ACHIEVEMENTS } from './achievements.ts';
import { esc, THEME_CSS, THEME_TOGGLE, pct, conditionLabel } from './theme.ts';
import { buildSettlement } from './scoring-summary.ts';
import { EFFICIENCY_POLICY, tracksEfficiency } from './performance.ts';

function medal(i: number): string {
  return ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;
}

export interface ReportExtras {
  /** 解说席台词（commentary.ts 产出） */
  commentary?: string[];
  /** 赛后生涯 Elo 变化（career.ts 产出） */
  deltas?: CareerDelta[];
}

/** 排行榜前的统计上下文：每只蛐蛐的均分 CI + top1-top2 分差 CI + 本卷信度 α */
function statsContext(result: BattleResult, board: BoardEntry[]) {
  const scoresOf = (model: string) => result.records.filter((r) => r.model === model && !r.error).map((r) => r.score);
  const ciOf = new Map(board.map((e) => [e.model, bootstrapCI(scoresOf(e.model))]));
  const topGap = board.length >= 2 ? gapCI(result.records, board[0].model, board[1].model) : undefined;
  const rel = cronbachAlpha(result.records);
  return { ciOf, topGap, rel };
}

export function renderReport(result: BattleResult, extras: ReportExtras = {}): string {
  const board = buildLeaderboard(result);
  const settlement = tracksEfficiency(result.meta?.rankingPolicy) ? buildSettlement(result, board) : undefined;
  const efficiencyRanked = result.meta?.rankingPolicy === EFFICIENCY_POLICY;
  const performanceHtml = settlement
    ? `<h2>${efficiencyRanked ? '竞技综合榜' : '效率参考（不决定名次）'}</h2><div class="card">${efficiencyRanked ? `<p>${esc(settlement.reason)}</p>` : ''}<table><thead><tr><th>名次</th><th>模型</th><th>综合分</th><th>答题均分</th><th>平均解题时间</th><th>记录Token</th><th>缓存命中</th><th>纳入题数：速度 / Token / 缓存</th></tr></thead><tbody>${settlement.rows
        .map((row) => {
          const metric = row.performance!;
          return `<tr><td>${row.rank ?? '—'}</td><td>${esc(row.name)}</td><td>${metric.score === null ? '—' : (metric.score * 100).toFixed(1)}</td><td>${row.avg === null ? '—' : pct(row.avg)}</td><td>${metric.avgSolveMs === null ? '未提供' : (metric.avgSolveMs / 1000).toFixed(1) + 's'}</td><td>${row.tokenUsage ? (row.usageComplete ? '' : '≥ ') + (row.tokenUsage.input + row.tokenUsage.output) : '未提供'}</td><td>${metric.cacheHitRate === null ? '未提供' : pct(metric.cacheHitRate) + `（${metric.cacheSamples}/${metric.scoredTasks}题）`}</td><td>${metric.included.speed} / ${metric.included.tokens} / ${metric.included.cache}（共${metric.scoredTasks}题）</td></tr>`;
        })
        .join(
          '',
        )}</tbody></table><details><summary>综合分公式与缺失数据处理</summary>${settlement.performanceRules!.map((line) => `<p>${esc(line)}</p>`).join('')}</details><p class="muted">${efficiencyRanked ? '下方答题质量榜与Elo单独统计，不等同于竞技综合排名。' : '名次以上方排行榜的答题均分为准；本表只比较同题的速度、Token 与缓存效率。'}</p></div>`
    : '';
  const baths = findBloodbaths(result);
  const conditions = [...new Set(result.records.map((r) => r.condition))];
  const condName = (c: string) => result.arena.conditions?.[c] ?? c;
  // 维度说明可能是一整句：表头只放括号/冒号前的短名，完整说明放悬停提示，避免表格撑出页面
  const condHead = (c: string) =>
    `<th title="${esc(condName(c))}">${esc(conditionLabel(c, result.arena.conditions))}</th>`;
  const nameOf = new Map(result.contestants.map((c) => [c.id, c.name]));
  const deltaOf = new Map((extras.deltas ?? []).map((d) => [d.id, d]));
  const { ciOf, topGap, rel } = statsContext(result, board);

  const boardRows = board
    .map((e, i) => {
      const d = deltaOf.get(e.model);
      const ci = ciOf.get(e.model);
      const starOfId = new Map((d?.starsUp ?? []).map((s) => [s.id, s]));
      const badges = (d?.newAchievements ?? [])
        .map((id) => ({ a: ACHIEVEMENTS[id], up: starOfId.get(id) }))
        .filter((x) => x.a)
        .map(
          ({ a, up }) =>
            `<span class="badge-ach" title="${up ? `升至 ${up.to} 星` : '本场达成'}：${esc(a!.name)}">${a!.icon}${up && up.to > 1 ? ` ★${up.to}` : ''}</span>`,
        )
        .join('');
      const revengeTag = (d?.revenge ?? [])
        .map((r) =>
          r.kind === 'revenged' ? ' <span class="tag">⚔️复仇成功</span>' : ' <span class="tag">💔遭复仇</span>',
        )
        .join('');
      return `<tr>
      <td>${e.withdrawal ? '退赛' : result.status === 'pending_grading' ? '待评分' : medal(i)}</td><td class="name">${esc(e.name)}${d?.isDebut ? ' <span class="tag">首秀</span>' : ''}${revengeTag}${badges}<div class="muted">${esc(e.model)}</div></td>
      <td class="score">${Number.isNaN(e.avg) ? '<span class="muted">弃权</span>' : pct(e.avg)}<div class="ci">${Number.isNaN(e.avg) ? '' : ci ? `[${pct(ci.lo)}, ${pct(ci.hi)}]` : '样本不足，不报告置信区间'}</div></td>
      ${conditions.map((c) => `<td>${e.byCondition[c] !== undefined ? pct(e.byCondition[c]) : '—'}</td>`).join('')}
      <td class="nw">${e.elo}</td>${
        d
          ? (() => {
              const { rank, icon } = rankOf(d.after);
              const sign = d.delta >= 0 ? `+${d.delta}` : `${d.delta}`;
              return `<td class="nw">${icon} ${rank}</td><td class="nw ${d.delta >= 0 ? 'win' : 'lose'}">${d.after} (${sign})</td>`;
            })()
          : '<td>—</td><td>—</td>'
      }<td class="nw">${e.answered}</td>
      ${e.errors ? `<td class="err nw">${e.errors} 次弃权</td>` : '<td>—</td>'}
    </tr>`;
    })
    .join('\n');

  const gapNote =
    !result.records.some((r) => r.gradingStatus === 'pending') && topGap
      ? `<p class="muted">前两名分差 95% CI：[${pct(topGap.lo)}, ${pct(topGap.hi)}] —— ${
          topGap.lo <= 0 && topGap.hi >= 0
            ? '含 0，冠亚军差距在统计噪声范围内，名次不足以下结论。'
            : '不含 0，冠军优势统计显著。'
        }</p>`
      : '';

  // 本卷信度：α 高=各题同向区分强弱；α 低=题目各测各的。m 小（<10）时波动大，仅供内部迭代
  const relNote =
    rel.alpha !== null
      ? `<p class="muted">本卷内部一致性 Cronbach's α = ${rel.alpha.toFixed(2)}（k=${rel.k} 题 × m=${rel.m} 模型${rel.m < 10 ? '；m<10 波动大，仅供内部参考' : ''}）——${rel.alpha >= 0.7 ? '本次题目得分同向变化较强，不证明测量有效性或总体能力。' : rel.alpha >= 0.4 ? '一致性中等，需结合任务覆盖解释。' : '一致性低，汇总均分的解释需谨慎（题诊 → analyze 命令）。'}</p>`
      : '';

  // 维度对决：每维度一组横向条形图，纯 CSS
  const dimHtml = conditions
    .map((c) => {
      const rows = board
        .filter((e) => e.byCondition[c] !== undefined)
        .map((e) => {
          const v = e.byCondition[c];
          return `<div class="dim-row"><span class="dim-name">${esc(e.name)}</span>
        <span class="dim-bar"><span class="dim-fill" style="width:${(v * 100).toFixed(1)}%"></span></span>
        <span class="dim-val">${pct(v)}</span></div>`;
        })
        .join('');
      return `<div class="dim-block"><div class="dim-title">${esc(condName(c))}</div>${rows}</div>`;
    })
    .join('\n');

  // 胜率矩阵：行对列胜率，热力着色（>50% 绿，<50% 红）
  const models = board.map((e) => e.model);
  const matrix = winMatrix(result.records, models);
  const matrixHtml =
    models.length >= 2
      ? `<div class="card" style="overflow-x:auto"><table class="matrix">
<thead><tr><th>行 \\ 列</th>${models.map((m) => `<th>${esc(nameOf.get(m) ?? m)}</th>`).join('')}</tr></thead>
<tbody>${models
          .map(
            (m) =>
              `<tr><td class="name">${esc(nameOf.get(m) ?? m)}</td>${models
                .map((o) => {
                  if (o === m) return '<td class="self">—</td>';
                  const w = matrix.get(m)?.get(o);
                  if (w === undefined || Number.isNaN(w)) return '<td class="self">—</td>';
                  const bg =
                    w > 0.5
                      ? `rgba(26,127,75,${((w - 0.5) * 1.4).toFixed(2)})`
                      : w < 0.5
                        ? `rgba(193,68,30,${((0.5 - w) * 1.4).toFixed(2)})`
                        : 'transparent';
                  return `<td style="background:${bg}">${pct(w)}</td>`;
                })
                .join('')}</tr>`,
          )
          .join('\n')}</tbody></table>
<p class="muted">行蛐蛐对列蛐蛐的同题胜率（胜=1 平=0.5），仅统计双方都有效作答的题。</p></div>`
      : '';

  // 裁判分歧榜：双裁判时公开分歧最大的交战记录
  const scale = result.arena.judge.kind === 'llm' ? (result.arena.judge.scale ?? 10) : 10;
  const disputes = result.records
    .filter((r) => r.dispute !== undefined)
    .sort((a, b) => (b.dispute ?? 0) - (a.dispute ?? 0))
    .slice(0, 8);
  const disputeHtml = disputes.length
    ? `<h2>⚖️ 裁判分歧榜</h2>
<div class="card"><table>
<thead><tr><th>题目</th><th>蛐蛐</th><th>得分</th><th>裁判分歧</th><th>双方理由</th></tr></thead>
<tbody>${disputes
        .map(
          (r) => `<tr>
  <td>${esc(r.taskId)}</td><td>${esc(nameOf.get(r.model) ?? r.model)}</td>
  <td>${pct(r.score)}</td><td class="${(r.dispute ?? 0) >= 0.3 ? 'lose' : ''}">${((r.dispute ?? 0) * scale).toFixed(1)}/${scale} 分</td>
  <td class="muted">${esc(r.note ?? '')}</td>
</tr>`,
        )
        .join('\n')}</tbody></table>
<p class="muted">分歧 = 双裁判分差（max-min）。分歧大的题是"出得暧昧"的题——出题人复查优先看这里。</p></div>`
    : '';

  const commentaryHtml = extras.commentary?.length
    ? `<h2>🎙️ 解说席</h2>
<div class="card"><ul class="cast">${extras.commentary.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`
    : '';

  const bathHtml = baths.length
    ? baths
        .map(
          (b) => `<div class="bath">
      <div class="bath-head"><span class="tag">${esc(condName(b.condition))}</span> 全场平均仅 <b>${pct(b.avg)}</b> —— ${esc(b.taskId)}</div>
      <div class="prompt">${esc(b.prompt)}</div>
      ${b.target ? `<div class="target">参考答案：${esc(b.target)}</div>` : ''}
      <ul>${b.answers
        .map(
          (a) =>
            `<li><b>${esc(a.name)}</b>（${pct(a.score)}）：${esc(a.answer.slice(0, 120)) || '<i>（空白）</i>'}</li>`,
        )
        .join('')}</ul>
    </div>`,
        )
        .join('\n')
    : '<p class="muted">本场没有集体翻车题，蛐蛐们表现稳健。</p>';

  const detailRows = result.records
    .map(
      (r) => `<tr>
      <td>${esc(r.taskId)}</td><td><span class="tag">${esc(condName(r.condition))}</span></td>
      <td>${esc(nameOf.get(r.model) ?? r.model)}</td>
      <td class="${r.error ? '' : r.score >= 0.99 ? 'win' : r.score <= 0.01 ? 'lose' : ''}">${r.gradingStatus === 'pending' ? '<span class="muted">待评分</span>' : r.error ? '<span class="muted">弃权</span>' : pct(r.score)}</td>
      <td class="answer">${esc(r.error ? `⚠ ${r.error}` : r.answer.slice(0, 100))}</td>
      <td class="muted">${r.latencyMs >= 1000 ? `${(r.latencyMs / 1000).toFixed(1)}s` : `${r.latencyMs}ms`}</td>
      <td class="muted">${esc(r.note ?? '')}</td>
    </tr>`,
    )
    .join('\n');

  const transcripts = result.records
    .filter((r) => r.rounds?.length)
    .map(
      (r, i) =>
        `<details class="card"><summary>${esc(r.taskId)} · ${esc(nameOf.get(r.model) ?? r.model)} · 完整逐轮答卷</summary>${r.rounds!.map((stage, j) => `<section id="submission-${i}-${j}"><h3>第 ${j + 1} 轮 · ${esc(stage.title)}</h3><pre class="prompt">${esc(stage.prompt)}</pre>${stage.reasoning ? `<details><summary>公开推理 / 摘要</summary><pre class="prompt">${esc(stage.reasoning)}</pre></details>` : ''}<pre class="prompt">${esc(stage.answer)}</pre><p>${esc(stage.error ?? '')} · ${(stage.solveMs / 1000).toFixed(1)}s</p></section>`).join('')}${r.grade ? `<h3>正式评分与引用</h3>${r.grade.dimensions.map((g) => `<p><b>${esc(g.id)} ${g.score}/10</b> ${esc(g.reason)}</p>${g.evidence.map((e) => `<p><a href="#submission-${i}-${r.rounds!.findIndex((s) => s.roundId === e.roundId)}">${esc(e.roundId)}</a>：${esc(e.quote)}</p>`).join('')}`).join('')}` : `<p>${esc(r.gradingError ?? r.error ?? '未评分')}</p>`}</details>`,
    )
    .join('');
  const usage = new Map<string, { input: number; output: number }>();
  for (const r of result.records) {
    if (!r.usage) continue;
    const u = usage.get(r.model) ?? { input: 0, output: 0 };
    u.input += r.usage.input;
    u.output += r.usage.output;
    usage.set(r.model, u);
  }

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="战报 · ${esc(result.arena.title)} · AI斗兽场">
<meta property="og:description" content="${result.contestants.length} 只蛐蛐 × ${new Set(result.records.map((r) => r.taskId)).size} 道题 · ${
    settlement
      ? esc(
          settlement.reason +
            ' ' +
            settlement.rows
              .filter((row) => settlement.leaderIds.includes(row.modelId))
              .map((row) => row.name)
              .join('、'),
        )
      : '冠军 ' + esc(board[0]?.name ?? '') + ' ' + pct(board[0]?.avg ?? 0)
  }">
<title>战报 · ${esc(result.arena.title)} · AI斗兽场</title>
<style>
  :root { --ink:#2b2622; --muted:#8a8177; --accent:#c1442e; --gold:#b98a1c; --bg:#faf6f0; --card:#fff; --line:#e8e0d5; --soft:#fbf8f3; --tag-bg:#f3ece1; --tag-ink:#7a6a52; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 40px 24px 80px; }
  header { text-align:center; margin-bottom: 36px; }
  .badge { display:inline-block; background:var(--accent); color:#fff; font-size:12px; letter-spacing:4px; padding:4px 14px; border-radius:99px; margin-bottom:14px; }
  h1 { font-size: 34px; margin: 0 0 8px; }
  .sub { color: var(--muted); font-size: 14px; }
  h2 { font-size: 20px; margin: 40px 0 14px; padding-left: 12px; border-left: 4px solid var(--accent); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; padding: 8px 10px; border-bottom: 2px solid var(--line); white-space: nowrap; }
  td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .name { font-weight: 600; }
  .nw { white-space: nowrap; }
  .score { font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ci { font-weight: 400; font-size: 11px; color: var(--muted); }
  .muted { color: var(--muted); font-size: 12px; }
  .err { color: var(--gold); font-size: 12px; }
  .tag { display:inline-block; background:var(--tag-bg); color:var(--tag-ink); font-size:11px; padding:2px 8px; border-radius:6px; }
  .badge-ach { margin-left: 4px; cursor: default; }
  .win { color:#1a7f4b; font-weight:600; } .lose { color:var(--accent); }
  .bath { border:1px solid var(--line); border-left:4px solid var(--accent); border-radius:10px; padding:14px 16px; margin-bottom:14px; background:var(--card); }
  .bath-head { font-size:14px; margin-bottom:8px; }
  .prompt { white-space:pre-wrap; background:var(--soft); border-radius:8px; padding:10px 12px; font-size:13px; margin-bottom:8px; }
  .target { font-size:13px; color:var(--gold); margin-bottom:8px; }
  .bath ul { margin:0; padding-left:18px; font-size:13px; color:var(--ink); opacity:.85; }
  .cast { margin:0; padding-left:20px; font-size:14px; line-height:2; }
  .answer { font-size:13px; max-width:320px; word-break: break-all; }
  details summary { cursor:pointer; color:var(--muted); font-size:14px; }
  footer { text-align:center; color:var(--muted); font-size:12px; margin-top:48px; line-height:1.9; }
  .dim-block { margin-bottom: 18px; }
  .dim-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .dim-row { display: flex; align-items: center; gap: 10px; margin: 3px 0; font-size: 13px; }
  .dim-name { width: 110px; text-align: right; color: var(--ink); flex: none; }
  .dim-bar { flex: 1; background: var(--soft); border-radius: 6px; height: 14px; overflow: hidden; }
  .dim-fill { display: block; height: 100%; background: var(--accent); border-radius: 6px; }
  .dim-val { width: 52px; font-variant-numeric: tabular-nums; color: var(--muted); flex: none; }
  .matrix td, .matrix th { text-align: center; padding: 8px 6px; font-size: 13px; }
  .matrix td.name { text-align: right; }
  .matrix td.self { color: var(--muted); }
  @media print {
    .theme-toggle { display: none; }
    .card, .bath { break-inside: avoid; }
    body { background: #fff; }
  }
  ${THEME_CSS}
</style></head>
<body><div class="wrap" role="main">${THEME_TOGGLE}
<header>
  <div class="badge">电 子 蛐 蛐 · 战 报</div>
  <h1>🦗 ${esc(result.arena.title)}</h1>
  ${result.status === 'stopped' ? '<div class="card">本场已中止，以下为已保存的部分记录，未结算生涯积分。</div>' : ''}
  <div class="sub">${esc(result.arena.description)}</div>
  <div class="sub" style="margin-top:6px">开赛时间 ${esc(result.startedAt)} · 用时 ${(result.durationMs / 1000).toFixed(1)}s · ${result.contestants.length} 只蛐蛐 × ${new Set(result.records.map((r) => r.taskId)).size} 道题</div>
</header>

${efficiencyRanked ? performanceHtml : ''}
${result.withdrawals?.length ? `<h2>退赛记录</h2><div class="card">${result.withdrawals.map((w) => `<p><b>${esc(result.contestants.find((c) => c.id === w.modelId)?.name ?? w.modelId)}</b> · ${esc(w.taskId)} · ${esc(w.message)}（累计失败 ${w.failures} 次）</p>`).join('')}<p>退赛选手不参与本场排名；已完成的有效答案保留，未作答题目不伪记为零分。</p></div>` : ''}
<h2>${efficiencyRanked ? '答题质量榜' : '🏆 排行榜'}</h2>
<div class="card" style="overflow-x:auto"><table>
<thead><tr><th>名次</th><th>蛐蛐</th><th>总分(95% CI)</th>${conditions.map(condHead).join('')}<th>本场Elo</th><th>段位</th><th>积分</th><th>完赛</th><th>备注</th></tr></thead>
<tbody>
${boardRows}
</tbody></table>
${settlement && !efficiencyRanked ? `<p class="muted">本场结论：${esc(settlement.reason)}</p>` : ''}${gapNote}${relNote}</div>
${efficiencyRanked ? '' : performanceHtml}

${commentaryHtml}

<h2>📊 维度对决</h2>
<div class="card">
${dimHtml}
</div>

${matrixHtml ? `<h2>🤼 胜率矩阵</h2>\n${matrixHtml}` : ''}

${disputeHtml}

<h2>🩸 名场面（集体翻车题）</h2>
${bathHtml}

${transcripts ? `<h2>逐轮答卷与正式评分</h2>${transcripts}` : ''}
<h2>🧾 逐题明细</h2>
<details><summary>展开全部 ${result.records.length} 条交战记录</summary>
<div class="card" style="margin-top:12px"><table>
<thead><tr><th>题目</th><th>维度</th><th>蛐蛐</th><th>得分</th><th>回答</th><th>耗时</th><th>裁判备注</th></tr></thead>
<tbody>
${detailRows}
</tbody></table></div></details>

<footer>
  AI斗兽场 QuQuArena v${esc(result.meta?.toolVersion ?? '0.1.x')} · 基于 earendil-works/pi Agent 底座 ·
  本次参战：${result.contestants.map((c) => esc(c.name)).join(' / ')}<br>
  ${result.meta ? `题库指纹 <code>${esc(result.meta.arenaFingerprint)}</code> · 裁判 ${esc(result.meta.judgeModels.join(' + '))}` : ''}
  ${(() => {
    const ag = judgeAgreement(result.records);
    return ag
      ? ` · 裁判相关性 r=${ag.pearson ?? '不可定义'}（n=${ag.n}，平均绝对分歧 ${ag.meanDispute}；相关不等于评分一致）`
      : '';
  })()}
  ${result.arena.canary ? `<br>canary <code>${esc(result.arena.canary)}</code>（训练语料过滤标记）` : ''}
  ${usage.size ? `<br>Token 用量：${[...usage].map(([m, u]) => `${esc(nameOf.get(m) ?? m)} ${u.input}+${u.output}`).join('，')}` : ''}
</footer>
</div></body></html>`;
}

export function renderMarkdown(result: BattleResult, extras: ReportExtras = {}): string {
  const board = buildLeaderboard(result);
  const settlement = tracksEfficiency(result.meta?.rankingPolicy) ? buildSettlement(result, board) : undefined;
  const efficiencyRanked = result.meta?.rankingPolicy === EFFICIENCY_POLICY;
  const performanceMd = settlement
    ? `## ${efficiencyRanked ? '竞技综合榜' : '效率参考（不决定名次）'}\n\n${efficiencyRanked ? settlement.reason + '\n\n' : ''}| 名次 | 模型 | 综合分 | 答题均分 | 平均解题时间 | 记录Token | 缓存命中 | 纳入题数：速度/Token/缓存 |\n|---|---|---|---|---|---|---|---|\n${settlement.rows
        .map((row) => {
          const m = row.performance!;
          return `| ${row.rank ?? '—'} | ${row.name.replaceAll('|', '\\|')} | ${m.score === null ? '—' : (m.score * 100).toFixed(1)} | ${row.avg === null ? '—' : pct(row.avg)} | ${m.avgSolveMs === null ? '未提供' : (m.avgSolveMs / 1000).toFixed(1) + 's'} | ${row.tokenUsage ? (row.usageComplete ? '' : '≥ ') + (row.tokenUsage.input + row.tokenUsage.output) : '未提供'} | ${m.cacheHitRate === null ? '未提供' : pct(m.cacheHitRate)} | ${m.included.speed}/${m.included.tokens}/${m.included.cache}（共${m.scoredTasks}题） |`;
        })
        .join(
          '\n',
        )}\n\n${settlement.performanceRules!.join('\n\n')}\n\n${efficiencyRanked ? '## 答题质量榜（独立于竞技综合排名）\n' : ''}`
    : '';
  const baths = findBloodbaths(result);
  const deltaOf = new Map((extras.deltas ?? []).map((d) => [d.id, d]));
  const { topGap, rel } = statsContext(result, board);
  const nameOf = new Map(result.contestants.map((c) => [c.id, c.name]));
  const condName = (c: string) => result.arena.conditions?.[c] ?? c;

  const boardMd = board
    .map((e, i) => {
      const d = deltaOf.get(e.model);
      const rank = d ? `${rankOf(d.after).icon}${rankOf(d.after).rank}` : '—';
      const elo = d ? `${d.after} (${d.delta >= 0 ? '+' : ''}${d.delta})` : '—';
      return `| ${e.withdrawal ? '退赛' : Number.isNaN(e.avg) ? '—' : medal(i)} | ${e.name}${d?.isDebut ? '🐣' : ''} | ${Number.isNaN(e.avg) ? '弃权' : pct(e.avg)} | ${e.elo} | ${rank} | ${elo} |`; // 弃权者不上奖牌不写 NaN%（审查实证：MD 曾输出 | 🥈 | 乙 | NaN% |…）
    })
    .join('\n');

  const bathMd = baths
    .slice(0, 3)
    .map(
      (b) => `### 「${b.taskId}」${condName(b.condition)} · 全场平均仅 ${pct(b.avg)}
> ${b.prompt.replace(/\n/g, '\n> ')}
${b.target ? `\n参考答案：${b.target}\n` : ''}
${b.answers.map((a) => `- **${a.name}**（${pct(a.score)}）：${a.answer.slice(0, 80) || '（空白）'}`).join('\n')}`,
    )
    .join('\n\n');

  return `# 🦗 战报 · ${result.arena.title}

${result.status === 'stopped' ? '> 本场已中止：仅包含已保存的部分记录，未结算生涯积分。\n' : ''}

> ${result.startedAt} · ${result.contestants.length} 只蛐蛐 × ${new Set(result.records.map((r) => r.taskId)).size} 道题 · 用时 ${(result.durationMs / 1000).toFixed(1)}s

${result.arena.description}

${efficiencyRanked ? performanceMd : ''}
${result.withdrawals?.length ? `## 退赛记录\n\n${result.withdrawals.map((w) => `- ${result.contestants.find((c) => c.id === w.modelId)?.name ?? w.modelId} · ${w.taskId} · ${w.message}（累计失败 ${w.failures} 次）`).join('\n')}\n\n退赛选手不参与本场排名；已完成的有效答案保留。\n` : ''}

${topGap ? `\n前两名分差 95% CI：[${pct(topGap.lo)}, ${pct(topGap.hi)}]（${topGap.lo <= 0 && topGap.hi >= 0 ? '含 0，差距在统计噪声内' : '不含 0，优势显著'}）。` : ''}${rel.alpha !== null ? `\n本卷信度 Cronbach's α = ${rel.alpha.toFixed(2)}（k=${rel.k} 题 × m=${rel.m} 蛐蛐）。` : ''}

| 名次 | 蛐蛐 | 总分 | 本场Elo | 段位 | 积分 |
|---|---|---|---|---|---|
${boardMd}
${
  settlement && !efficiencyRanked
    ? `
本场结论：${settlement.reason}

${performanceMd}`
    : ''
}

${extras.commentary?.length ? `## 🎙️ 解说席\n\n${extras.commentary.map((l) => `- ${l}`).join('\n')}` : ''}

${bathMd ? `## 🩸 名场面（集体翻车题）\n\n${bathMd}` : ''}

---
*AI斗兽场 QuQuArena v${result.meta?.toolVersion ?? '0.1.x'}* · 题库指纹 \`${result.meta?.arenaFingerprint ?? 'unknown'}\` · 裁判 ${result.meta?.judgeModels.join(' + ') ?? 'unknown'}
${result.arena.canary ? `canary \`${result.arena.canary}\`` : ''}
本次参战：${result.contestants.map((c) => nameOf.get(c.id) ?? c.id).join(' / ')}
`;
}

export async function writeReport(result: BattleResult, outDir: string, extras: ReportExtras = {}): Promise<string> {
  // 毫秒精度：淘汰赛/加赛连打时同秒场次不得互覆（战绩是引用完整性基石）
  const stamp = stampOf(result.startedAt);
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `战报-${result.arena.name}-${stamp}.html`);
  await writeFile(file, renderReport(result, extras), 'utf8');
  await saveBattle(result, outDir); // 战绩 JSON 是领域记录——唯一写入点在 results-store.ts
  const mdFile = path.join(outDir, `战报-${result.arena.name}-${stamp}.md`);
  await writeFile(mdFile, renderMarkdown(result, extras), 'utf8');
  return file;
}
