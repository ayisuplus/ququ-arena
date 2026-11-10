/** 首页只负责展示，题库、战绩与模型连接由各自模块提供。 */
import { esc, siteNav, modelDisplayName, modelRatingName, THEME_CSS, THEME_TOGGLE } from './theme.ts';
import { MODE_LABELS } from './task-mode.ts';
import type { ArenaMode } from './types.ts';
import { MODEL_PICKER_HTML, MODEL_DIALOGS_HTML } from './modelPickerHtml.ts';

export interface HomeData {
  arenas: {
    mode?: ArenaMode;
    name: string;
    title: string;
    desc: string;
    taskCount: number;
    judgeKind: string;
    fingerprint: string;
    difficulty?: string;
    requiresJudge?: boolean;
    pausedCount?: number;
    reviewNote?: string;
  }[];
  top: {
    id: string;
    name: string;
    icon: string;
    elo: number;
    rank: string;
    battles: number;
    titles: number;
    glicko?: { r: number; rd: number };
    provisional?: boolean;
  }[];
  results: string[];
  daily: { name: string; title: string; top?: { name: string; best: number }[] } | null;
  queueCard: string;
  modelNames?: Readonly<Record<string, string>>;
}

export function renderHome({ arenas, top, results, daily, queueCard, modelNames }: HomeData): string {
  const totalTasks = arenas.reduce((n, a) => n + a.taskCount, 0);
  const available = arenas.filter((a) => a.taskCount > 0);
  const pausedTasks = arenas.reduce((n, a) => n + (a.pausedCount ?? 0), 0);
  const defaultArena =
    available.find((a) => a.name === 'core-arena') ??
    available.find((a) => a.name === 'tongjia-pinyin') ??
    available[0];
  const needsJudge = (a: HomeData['arenas'][number]) => a.requiresJudge ?? ['llm', 'rubric'].includes(a.judgeKind);
  const scoring = (a: HomeData['arenas'][number]) =>
    needsJudge(a) ? '模型裁判 · 按公开标准评分' : a.judgeKind === 'exact' ? '默认标准答案判分' : '规则自动判分';
  const options = available
    .map(
      (a) =>
        `<option value="${esc(a.name)}" data-mode="${a.mode ?? 'qa'}" data-count="${a.taskCount}" data-title="${esc(a.title)}" data-difficulty="${esc(a.difficulty ?? '难度未标定')}" data-scoring="${esc(MODE_LABELS[a.mode ?? 'qa'] + ' · ' + scoring(a))}" data-requires-judge="${needsJudge(a)}"${a.name === defaultArena?.name ? ' selected' : ''}>${esc(a.title)} · ${a.taskCount} 题</option>`,
    )
    .join('');
  const choices = available
    .map(
      (a) =>
        `<button type="button" class="arena-choice" data-choose-arena="${esc(a.name)}" data-quick-arena data-search="${esc(`${a.title} ${a.name} ${a.desc} ${a.difficulty ?? ''} ${scoring(a)}`.toLowerCase())}" aria-pressed="${a.name === defaultArena?.name}"><strong>${esc(a.title)}</strong><span>${a.taskCount} 题 · ${MODE_LABELS[a.mode ?? 'qa']}</span><small>${esc(scoring(a))}${a.pausedCount ? ` · 已排除 ${a.pausedCount} 道待修订题` : ''}</small></button>`,
    )
    .join('');
  const cards = arenas
    .map(
      (
        a,
      ) => `<article class="card arena-card" data-search="${esc(`${a.title} ${a.name} ${a.desc} ${a.judgeKind} ${a.difficulty ?? ''} ${scoring(a)} ${a.reviewNote ?? ''} ${a.pausedCount ? '暂停修订' : ''}`.toLowerCase())}" data-scoring="${needsJudge(a) ? 'model' : 'rules'}" data-difficulty="${esc(a.difficulty ?? '')}" data-count="${a.taskCount}">
    <div class="arena-heading"><h3>${esc(a.title)}</h3><span class="tag${a.taskCount ? '' : ' review-paused'}">${a.taskCount ? `${a.taskCount} 题可用` : '暂停修订'}</span></div>
    <p class="arena-summary">${esc(a.desc.length > 100 ? a.desc.slice(0, 100) + '…' : a.desc)}</p><p class="arena-facts">${esc(a.difficulty ?? '难度未标定')} <span>·</span> ${esc(scoring(a))}</p>
    ${a.reviewNote ? `<p class="arena-review${a.taskCount ? '' : ' review-paused'}">${a.pausedCount ? `${a.pausedCount} 题暂停 · ` : '修订说明 · '}${esc(a.reviewNote)}</p>` : ''}
    <details class="arena-settings"><summary>题库说明</summary><p class="arena-description">${esc(a.desc)}</p><p class="muted">指纹 ${esc(a.fingerprint)}</p></details>
    <div class="arena-actions"><a href="/questions?arena=${encodeURIComponent(a.name)}" aria-label="编辑题库：${esc(a.title)}">编辑题库</a><a href="/pack/${encodeURIComponent(a.name)}.ququ.json" class="download-link">下载</a><button type="button" data-choose-arena="${esc(a.name)}" aria-label="使用题库：${esc(a.title)}"${a.taskCount ? '' : ' disabled'}>${a.taskCount ? '使用此题库 ↗' : '修订后开放'}</button></div>
  </article>`,
    )
    .join('');
  const topRows = top
    .filter((r) => !r.id.startsWith('mock:'))
    .map(
      (r, i) =>
        `<tr><td class="rank-number">${i + 1}</td><td><a href="/cricket/${encodeURIComponent(r.id)}">${esc(modelDisplayName(r.id, r.name, modelNames))}</a><div class="muted">${esc(modelRatingName(r.rank))} · ${r.battles} 场${r.provisional ? ' · 暂定' : ''}</div></td><td class="rank-score">${r.glicko ? `${r.glicko.r}<div class="muted">±${Math.round(2 * r.glicko.rd)}</div>` : '—'}</td></tr>`,
    )
    .join('');
  const resultLinks = results
    .slice(0, 4)
    .map((f) => {
      const replay = f.startsWith('战报-') ? f.replace(/^战报-/, '战绩-').replace(/\.html$/, '.json') : null;
      const dated = f.match(/^(.*)-(\d{4}-\d{2}-\d{2})T\d{2}-\d{2}-\d{2}-\d+\.html$/);
      const stem = dated?.[1] ?? f.replace(/\.html$/, '');
      const arena = stem.startsWith('战报-') ? arenas.find((a) => a.name === stem.slice(3)) : null;
      return `<li><a class="result-name" href="/results/${encodeURIComponent(f)}">${esc(arena?.title ?? stem)}${dated ? `<small>${esc(dated[2])}</small>` : ''}</a>${replay ? `<a href="/replay?file=${encodeURIComponent(replay)}" class="replay-link">回放 ↗</a>` : ''}</li>`;
    })
    .join('');

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI斗兽场 · 对战工作台</title><link rel="stylesheet" href="/web/home.css"><link rel="stylesheet" href="/web/model-picker.css"><style>${THEME_CSS}</style></head>
  <body>${THEME_TOGGLE}<div class="wrap">${siteNav('home')}
  <header class="page-header"><div><h1>选好模型，开始对战。</h1><p class="sub">同一道题，同时作答。观察公开推理与答案。</p></div><div class="home-header-tools"><a class="quiet-button header-link" href="#arenaLibrary"><b>${arenas.length} 个题库 · ${totalTasks.toLocaleString('zh-CN')} 道题</b><span>浏览全部题库 ↗</span></a></div></header>
  ${queueCard}
  <main>
  <form action="/battle" method="get" id="launchForm" class="launch-grid">
    <section class="card launch-console" aria-label="选择参赛模型">${MODEL_PICKER_HTML}</section>
    <section class="card launch-summary" aria-labelledby="launchHeading">
      <div class="launch-heading"><div><h2 id="launchHeading">本场对战</h2></div><span id="selectedModelCount" class="tag">已选 0 个</span></div>
      <div class="selected-heading"><span>参赛阵容</span><button type="button" id="clearModels" class="text-button" disabled>清空阵容</button></div>
      <div id="selectedModels" class="selected-models" aria-label="已选参赛模型"></div>
      <div class="launch-fields">
        <div class="field"><label for="launchArena">题库</label><select name="arena" id="launchArena" required>${options}</select><details class="arena-chooser" id="arenaChooser" hidden><summary aria-label="选择题库"><strong id="chosenArenaTitle">${esc(defaultArena?.title ?? '请选择题库')}</strong><span>⌄</span></summary><div class="arena-popover"><input id="quickArenaSearch" type="search" placeholder="搜索 ${arenas.length} 个题库…" aria-label="搜索可选题库" autocomplete="off"><div class="arena-select-list" aria-label="可选题库">${choices}</div><p id="quickArenaEmpty" class="muted" hidden>没有匹配的题库，请换个关键词。</p></div></details><span class="muted" id="chosenArenaMeta"></span></div>
        ${daily ? `<button type="button" class="text-button daily-choice" data-choose-arena="${esc(daily.name)}">今日推荐：${esc(daily.title)} ↗</button>${daily.top?.length ? `<p class="muted">今日榜：${daily.top.map((r) => `${esc(r.name)} ${(r.best * 100).toFixed(0)}%`).join(' · ')}</p>` : ''}` : ''}
        <div class="question-count"><label class="field">本场题数<input name="limit" id="launchLimit" type="number" value="5" min="1" step="1" required></label><span id="taskCountHint" class="muted">本库 ${defaultArena?.taskCount ?? 0} 题 · 本场选 5 题</span></div><div class="question-presets" aria-label="快捷选择题数"><button type="button" data-question-limit="5" aria-pressed="true">5 题</button><button type="button" data-question-limit="10" aria-pressed="false">10 题</button><button type="button" data-question-limit="20" aria-pressed="false">20 题</button><button type="button" id="allQuestions" data-question-limit="all" aria-pressed="false">全量</button></div>
        <div id="judgeField" class="judge-field" hidden><div id="taskJudgeOptions" hidden><label class="field">正式裁判<select id="judgeSource"><option value="codex">Codex · 检测中</option><option value="claude">Claude · 检测中</option><option value="api">API 评分模型</option></select></label><input type="hidden" name="judgeAgent" id="launchJudgeAgent" disabled><p class="muted">每份匿名答卷使用独立评分会话；开赛后固定裁判，切换解说不改变裁判。</p><p id="taskBudget" class="muted"></p></div><label class="field" id="apiJudgeLabel">评分模型<select name="judge" id="launchJudge" disabled><option value="">请选择真实评分模型</option></select></label><p id="judgeAvailability" class="muted" role="status" title="根据公开标准评分，会产生额外调用；同场参赛模型担任裁判时可能有自评偏差。"></p></div>
              </div>
      <div class="launch-actions"><p id="launchCount" class="muted" role="status">请先选择参赛模型</p><button type="submit" id="launchButton" disabled>开始对战 <span aria-hidden="true">↗</span></button><p id="modelSelectionStatus" class="model-message" role="status" hidden></p><span class="launch-footnote">比赛过程中可暂停或停止，结束后生成战报</span></div>
    </section>
  </form>
  <details class="card library-console" id="arenaLibrary"><summary><div><b>浏览题库</b><span class="muted">${arenas.length} 个题库 · ${totalTasks.toLocaleString('zh-CN')} 道题目</span></div><span class="disclosure">⌄</span></summary>
    <div class="section-heading"><h2>选择题库</h2><a href="/questions" class="quiet-button header-link">＋ 新建题库</a><span class="muted" id="arenaCount" role="status">共 ${arenas.length} 个</span></div>
    ${pausedTasks ? `<p class="arena-review">当前 ${totalTasks.toLocaleString('zh-CN')} 道题可用于对战；${pausedTasks} 道存在歧义或评分问题的题已暂停，原因见各题库。历史战绩保留当时的题面和得分。</p>` : ''}
    <div class="search-box"><span aria-hidden="true">⌕</span><input id="arenaSearch" type="search" placeholder="搜索题库名称或内容…" aria-label="搜索题库" autocomplete="off"><button type="button" id="clearSearch" class="quiet-button" hidden>清除</button></div>
    <div class="arena-filters"><label>评分<select id="arenaJudgeFilter"><option value="">全部评分方式</option><option value="rules">规则自动判分</option><option value="model">模型裁判</option></select></label><label>难度<select id="arenaDifficultyFilter"><option value="">全部难度</option><option value="基础">含基础题</option><option value="进阶">含进阶题</option><option value="unrated">未标定</option></select></label><span class="muted">难度来自题库标注，不代表模型实测水平。</span></div>
    <div id="arenaList">${cards || '<p class="empty-state">暂无题库</p>'}</div><div class="empty-state" id="arenaEmpty" hidden><p>没有找到匹配题库</p><button type="button" id="resetSearch" class="quiet-button">清除搜索</button></div>
  </details>
  <div class="overview-grid"><section class="card side-card"><div class="section-heading"><h2>短题竞速战绩</h2><a href="/stable">完整榜单 ↗</a></div><table class="top-table"><thead><tr><th>#</th><th>模型</th><th class="rank-score">Glicko</th></tr></thead><tbody>${topRows || '<tr><td colspan="3" class="muted">完成真实模型对战后，这里会显示战绩。</td></tr>'}</tbody></table></section>
    <section class="card side-card"><div class="section-heading"><h2>最近对战</h2><a href="/results">战报档案 ↗</a></div><ul class="result-list">${resultLinks || '<li class="muted">暂无对战记录</li>'}</ul></section></div>
  </main><footer>AI斗兽场 <span>本地工作台</span></footer>${MODEL_DIALOGS_HTML}<script type="module" src="/web/home.js"></script></div></body></html>`;
}
