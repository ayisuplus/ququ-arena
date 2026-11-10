/**
 * 战绩对比 —— 同指纹两场比赛的逐题回归分析（diff 命令）
 *
 * 场景：模型版本迭代回归测试、同一阵容不同时期的漂移检测。
 * 方法学：按 taskId 配对（paired bootstrap CI，复用 stats.gapCI 的题内对齐），
 * CI 含 0 = 变化在噪声内；摆动题清单按 |Δ| 降序，回归定位的直接线索。
 *
 * 硬约束：指纹不同即拒比——不同卷的分数不可比（benchmark 对比的第一原则）。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { BattleResult } from './types.ts';
import { gapCI, type CI } from './stats.ts';
import { stampOf } from './stamp.ts';
import { requireComparable, protocolWarnings } from './experiment-protocol.ts';

export interface ModelDiff {
  model: string;
  name: string;
  avgA: number;
  avgB: number;
  delta: number;
  ci: CI | undefined;
  /** significant: 'up' | 'down' | 'noise' */
  verdict: 'up' | 'down' | 'noise';
  /** 配对效应量 Cohen's dz = mean(Δ)/sd(Δ)；sd=0 时 null（恒定差距/无变化，效应量不可定义） */
  effect: number | null;
  sharedTasks: number;
}

export interface TaskSwing {
  taskId: string;
  model: string;
  scoreA: number;
  scoreB: number;
  delta: number;
}

export interface DiffReport {
  warnings: string[];
  arena: string;
  fingerprint: string;
  models: ModelDiff[];
  onlyA: string[];
  onlyB: string[];
  swings: TaskSwing[];
}

export function diffBattles(a: BattleResult, b: BattleResult): DiffReport {
  requireComparable(a, b);
  const fpA = a.meta?.arenaFingerprint;
  const fpB = b.meta?.arenaFingerprint;
  const idsA = new Set(a.contestants.map((c) => c.id));
  const idsB = new Set(b.contestants.map((c) => c.id));
  const shared = [...idsA].filter((id) => idsB.has(id));
  const nameOf = new Map([...a.contestants, ...b.contestants].map((c) => [c.id, c.name]));

  const models: ModelDiff[] = shared
    .map((id) => {
      const recsA = a.records.filter((r) => r.model === id && isAnswered(r));
      const recsB = b.records.filter((r) => r.model === id && isAnswered(r));
      // 只比"共同题"：A/B 场题量不同（如 --limit）时，各场均分口径不同会直接误导
      const taskIdsB = new Set(recsB.map((r) => r.taskId));
      const sharedA = recsA.filter((r) => taskIdsB.has(r.taskId));
      const taskIdsA = new Set(sharedA.map((r) => r.taskId));
      const sharedB = recsB.filter((r) => taskIdsA.has(r.taskId));
      const avgA = sharedA.length ? sharedA.reduce((s, r) => s + r.score, 0) / sharedA.length : 0;
      const avgB = sharedB.length ? sharedB.reduce((s, r) => s + r.score, 0) / sharedB.length : 0;
      // 合成双"模型"视图：A 场记录标 model='A'、B 场标 'B'，taskId 相同——gapCI 按题配对
      const merged = [
        ...sharedA.map((r) => ({ model: 'A', taskId: r.taskId, score: r.score })),
        ...sharedB.map((r) => ({ model: 'B', taskId: r.taskId, score: r.score })),
      ];
      const ci = gapCI(merged, 'A', 'B');
      const delta = avgA - avgB;
      // 配对效应量 Cohen's dz：逐题差分的均值/标准差（按 taskId 对齐配对）
      const bByTaskModel = new Map(sharedB.map((r) => [r.taskId, r.score]));
      const diffs = sharedA.map((r) => r.score - (bByTaskModel.get(r.taskId) ?? 0));
      const meanD = diffs.length ? diffs.reduce((s, x) => s + x, 0) / diffs.length : 0;
      const sdD =
        diffs.length > 1 ? Math.sqrt(diffs.reduce((s, x) => s + (x - meanD) ** 2, 0) / (diffs.length - 1)) : 0;
      const effect = sdD > 0 ? Math.round((meanD / sdD) * 100) / 100 : null;
      const verdict: ModelDiff['verdict'] = !ci || (ci.lo <= 0 && ci.hi >= 0) ? 'noise' : delta < 0 ? 'up' : 'down'; // 无配对数据 = noise，不得宣称升降
      return {
        model: id,
        name: nameOf.get(id) ?? id,
        avgA,
        avgB,
        delta,
        ci,
        verdict,
        effect,
        sharedTasks: sharedA.length,
      };
    })
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  // 摆动题：逐题逐模型 |Δ| 降序（回归定位线索）
  const swings: TaskSwing[] = [];
  const bByTask = new Map<string, Map<string, number>>();
  for (const r of b.records) {
    if (!isAnswered(r)) continue;
    if (!bByTask.has(r.taskId)) bByTask.set(r.taskId, new Map());
    bByTask.get(r.taskId)!.set(r.model, r.score);
  }
  for (const r of a.records) {
    if (!isAnswered(r) || !shared.includes(r.model)) continue;
    const scoreB = bByTask.get(r.taskId)?.get(r.model);
    if (scoreB === undefined) continue;
    if (r.score !== scoreB) {
      swings.push({ taskId: r.taskId, model: r.model, scoreA: r.score, scoreB, delta: scoreB - r.score });
    }
  }
  swings.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  return {
    warnings: [...new Set([...protocolWarnings(a), ...protocolWarnings(b)])],
    arena: a.arena.name,
    fingerprint: fpA ?? fpB ?? 'unknown',
    models,
    onlyA: [...idsA].filter((id) => !idsB.has(id)),
    onlyB: [...idsB].filter((id) => !idsA.has(id)),
    swings,
  };
}

// ─── 对比页（diff --html）───────────────────────────────────────
import { esc, THEME_CSS, THEME_TOGGLE, pct } from './theme.ts';
import { isAnswered } from './record-state.ts';

/** CI 可视化条：以 0 为原点的区间条，绿=显著进步 / 红=显著退步 / 灰=噪声 */
function ciBar(m: ModelDiff): string {
  if (!m.ci)
    return `<div class="cibar"><div class="cifill" style="left:50%;width:1.5%;background:var(--muted)"></div><div class="zero"></div></div>`; // 无配对数据：原点灰柱
  const lo = Math.max(-1, m.ci.lo);
  const hi = Math.min(1, m.ci.hi);
  const w = (hi - lo) * 100;
  const left = (lo + 1) * 50;
  const color = !m.ci || m.verdict === 'noise' ? 'var(--muted)' : m.verdict === 'up' ? '#1a7f4b' : 'var(--accent)';
  return `<div class="cibar"><div class="cifill" style="left:${left}%;width:${Math.max(1.5, w)}%;background:${color}"></div><div class="zero"></div></div>`;
}

export function renderDiff(a: BattleResult, b: BattleResult, rep: DiffReport): string {
  const rows = rep.models
    .map((m) => {
      const badge = !m.ci
        ? '<span class="tag">配对样本不足</span>'
        : m.verdict === 'noise'
          ? '<span class="tag">区间含 0</span>'
          : m.verdict === 'up'
            ? '<span class="tag up">本卷得分上升</span>'
            : '<span class="tag down">本卷得分下降</span>';
      return `<tr>
      <td class="name">${esc(m.name)}<div class="muted">${esc(m.model)}</div></td>
      <td>${pct(m.avgA)}</td><td>${pct(m.avgB)}</td>
      <td class="${m.delta <= 0 ? 'up' : 'down'}">${m.delta >= 0 ? '+' : ''}${pct(m.delta)}</td>
      <td class="muted">${m.ci ? `[${pct(m.ci.lo)}, ${pct(m.ci.hi)}]` : '—（无配对）'}</td>
      <td>${m.effect === null ? '<span class="muted">—（恒定）</span>' : m.effect}</td><td>${ciBar(m)}</td>
      <td>${badge}</td>
    </tr>`;
    })
    .join('\n');

  const swingRows = rep.swings
    .slice(0, 20)
    .map(
      (s) =>
        `<tr><td>${esc(s.taskId)}</td><td>${esc(rep.models.find((m) => m.model === s.model)?.name ?? s.model)}</td><td>${pct(s.scoreA)} → ${pct(s.scoreB)}</td><td class="${s.delta >= 0 ? 'up' : 'down'}">${s.delta >= 0 ? '+' : ''}${pct(s.delta)}</td></tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>同卷对比 · ${esc(a.arena.title)} · AI斗兽场</title>
<style>
  :root { --ink:#2b2622; --muted:#8a8177; --accent:#c1442e; --gold:#b98a1c; --bg:#faf6f0; --card:#fff; --line:#e8e0d5; --soft:#fbf8f3; --tag-bg:#f3ece1; --tag-ink:#c0b39e; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 40px 24px 64px; }
  header { text-align:center; margin-bottom: 32px; }
  .badge { display:inline-block; background:var(--accent); color:#fff; font-size:12px; letter-spacing:4px; padding:4px 14px; border-radius:99px; margin-bottom:14px; }
  h1 { font-size: 30px; margin: 0 0 8px; }
  .sub { color: var(--muted); font-size: 14px; }
  h2 { font-size: 19px; margin: 32px 0 12px; padding-left: 12px; border-left: 4px solid var(--accent); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; padding: 8px 10px; border-bottom: 2px solid var(--line); white-space: nowrap; }
  td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .name { font-weight: 600; }
  .muted { color: var(--muted); font-size: 12px; }
  .up { color: #1a7f4b; font-weight: 600; } .down { color: var(--accent); font-weight: 600; }
  .tag { display:inline-block; background:var(--tag-bg); color:var(--tag-ink); font-size:11px; padding:2px 10px; border-radius:6px; white-space:nowrap; }
  .tag.up { background:#eaf5ee; color:#1a7f4b; } .tag.down { background:#fbeae6; color:var(--accent); }
  [data-theme="dark"] .tag.up { background:#1e3a2a; color:#3ecf8e; } [data-theme="dark"] .tag.down { background:#3a2320; color:#e0603f; }
  .cibar { position: relative; width: 160px; height: 12px; background: var(--soft); border-radius: 6px; overflow: hidden; }
  .cifill { position: absolute; top: 0; bottom: 0; border-radius: 6px; }
  .zero { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--muted); }
  footer { text-align:center; color:var(--muted); font-size:12px; margin-top:44px; }
  ${THEME_CSS}
</style></head>
<body><div class="wrap" role="main">${THEME_TOGGLE}
${rep.warnings.map((w) => `<p class="muted">${esc(w)}</p>`).join('')}<p class="muted">区间以共同作答的题目为重采样单位，仅描述本卷观测。少量任务、同源题和重复观察不能直接支持总体能力结论。</p>
<header>
  <div class="badge">同 卷 对 比 · DIFF</div>
  <h1>🔀 ${esc(a.arena.title)}</h1>
  <div class="sub">A: ${esc(a.startedAt.slice(0, 16).replace('T', ' '))} → B: ${esc(b.startedAt.slice(0, 16).replace('T', ' '))} · 指纹 <code>${esc(rep.fingerprint)}</code> · 仅比共同题</div>
</header>

<h2>🏆 逐模型判定</h2>
<div class="card"><table>
<thead><tr><th>蛐蛐</th><th>A 场均</th><th>B 场均</th><th>Δ(A−B)</th><th>95% CI</th><th>效应量 d</th><th>区间图</th><th>判定</th></tr></thead>
<tbody>
${rows}
</tbody></table>
<p class="muted">CI 含 0 = 变化在噪声内。区间图以中轴为 0，绿=显著进步，红=显著退步，灰=噪声。</p></div>

${
  rep.swings.length
    ? `<h2>🌀 摆动题（|Δ| 降序 TOP 20）</h2>
<div class="card"><table>
<thead><tr><th>题目</th><th>蛐蛐</th><th>A → B</th><th>Δ</th></tr></thead>
<tbody>${swingRows}</tbody></table></div>`
    : ''
}

${rep.onlyA.length || rep.onlyB.length ? `<h2>👥 非同场蛐蛐</h2><div class="card"><p class="muted">${rep.onlyA.length ? `仅 A 场：${esc(rep.onlyA.join('、'))}　` : ''}${rep.onlyB.length ? `仅 B 场：${esc(rep.onlyB.join('、'))}` : ''}（不参与对比）</p></div>` : ''}

<footer>AI斗兽场 QuQuArena · 同卷对比 · 不同卷的分数不可比</footer>
</div></body></html>`;
}
export async function writeDiff(a: BattleResult, b: BattleResult, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const stamp = stampOf(b.startedAt);
  const file = path.join(outDir, `对比-${a.arena.name}-${stamp}.html`);
  await writeFile(file, renderDiff(a, b, diffBattles(a, b)), 'utf8');
  return file;
}
