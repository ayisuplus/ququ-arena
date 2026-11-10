/**
 * Web 围观服务器 —— 零依赖（node:http + SSE），把斗兽场从 CLI 变成可围观的平台
 *
 * 路由：
 *   GET /                 首页（蛐蛐罐 + 虫王榜 + 近期战绩 + 开赛表单）
 *   GET /stable           蛐蛐棚总榜（实时从 career.json 渲染）
 *   GET /results/<file>   静态产物浏览（战报/海报/联赛/JSON/MD）
 *   GET /battle?arena=X&models=a,b&judge=J&pace=120   直播页（立即开赛）
 *   GET /battle/stream    SSE 事件流（progress / milestone / done / error）
 *
 * 并发约束：同一时刻只打一场（本地演示场景，排队比并发更诚实）。
 * 直播比赛照常结算生涯与战报——围观不改变赛制的严肃性。
 */
import http from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { listArenas, loadArena, playableTasks, requirePlayableTasks } from './arena-loader.ts';
import { createBattleEngine } from './battle-engine.ts';
import type { ArenaMode } from './types.ts';
import { loadCareer } from './career-store.ts';
import { stableView } from './career.ts';
import { arenaFingerprint } from './fingerprint.ts';
import { renderStable } from './stableHtml.ts';
import { renderHome } from './homeHtml.ts';
import { esc, siteNav, THEME_CSS, THEME_TOGGLE } from './theme.ts';
import { packArena } from './pack.ts';
import { renderCricket } from './cricketHtml.ts';
import { dailyArena, dailyBoard } from './daily.ts';
import { detectAgents } from './agents.ts';
import { requiresModelJudge } from './scoring-summary.ts';
import { ModelSettingsStore } from './model-settings.ts';
import { handleModelApi } from './model-api.ts';
import { handlePredictionApi } from './prediction-api.ts';
import { renderPredictionPage } from './predictionHtml.ts';
import { QuestionBankStore } from './question-bank-store.ts';
import { handleQuestionBankApi } from './question-bank-api.ts';
import { QUESTION_EDITOR_HTML } from './questionEditorHtml.ts';
import { EngineeringEngine } from './engineering/runner.ts';
import { handleEngineeringApi } from './engineering/api.ts';
import { ENGINEERING_HTML } from './engineering/html.ts';
import { HarnessEngine } from './harness/runner.ts';
import { handleHarnessApi } from './harness/api.ts';
import { ExtensionAuthor } from './harness/authoring.ts';
import { handleAuthoringApi } from './harness/authoring-api.ts';
import { HARNESS_HTML } from './harness/html.ts';
import { handleGameApi } from './game-api.ts';
import { requireCommentator } from './commentator-settings.ts';
import { isLocalSameOrigin } from './http-guard.ts';
import { handleDesktopApi } from './desktop-api.ts';
import { handleEvaluationApi } from './evaluation-api.ts';
import { Submissions } from './submissions.ts';
import { DesktopService, type DesktopLifecycle } from './desktop-service.ts';

/** 生涯页的赛道参数：只认 open / multi_turn，其余一律按短题竞速 */
const careerMode = (url: URL): ArenaMode => {
  const mode = url.searchParams.get('mode');
  return mode === 'open' || mode === 'multi_turn' ? mode : 'qa';
};

export interface ServerCtx {
  arenasDir: string;
  resultsDir: string;
  modelSettingsFile?: string;
}
// 批量评测页骨架：客户端逻辑在 web/batch.js（事件归约在 web/batch-state.js），id 必须与之一致。
// 观赛演出在 3D 客户端，这里只呈现进度、控制、成绩与逐题答卷。
const BATCH_PAGE = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>对战 · AI斗兽场</title>
<link rel="stylesheet" href="/web/batch.css">
<style>${THEME_CSS}</style>
</head><body>${THEME_TOGGLE}<div class="wrap" role="main">
  ${siteNav('home')}
  <header class="batch-header">
    <div><h1 id="title">对战</h1><p class="muted">多个模型同题作答，结束后生成战报；可随时暂停或停止，已完成的答卷会保留。</p></div>
    <div class="batch-actions">
      <button type="button" id="pauseBattle" disabled>暂停</button>
      <button type="button" id="stopBattle" class="danger" disabled>停止</button>
      <button type="button" id="retryGrading" hidden>重新评分</button>
      <a id="nextLink" hidden>下一场 ↗</a>
      <a id="reportLink" class="primary" hidden>查看战报 ↗</a>
    </div>
  </header>
  <div class="status-line"><span id="statusText" role="status">正在连接…</span><span id="progressText" class="muted"></span></div>
  <div class="bar" role="progressbar" aria-label="比赛进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="progressBar"></i></div>
  <p class="notice" id="notice" role="alert" hidden></p>
  <section class="card" aria-labelledby="boardHeading">
    <h2 id="boardHeading">成绩</h2>
    <table class="board"><thead><tr><th>名次</th><th>模型</th><th>已评分</th><th>答题均分</th><th>失败</th><th id="performanceHeading" hidden>效率参考（不决定名次）</th></tr></thead><tbody id="board"></tbody></table>
    <p class="muted" id="boardNote"></p>
  </section>
  <section class="card" id="questionCard" aria-labelledby="questionHeading" hidden>
    <div class="question-head"><h2 id="questionHeading">逐题答卷</h2><label class="follow"><input type="checkbox" id="followRound" checked> 跟随最新题</label><select id="roundSelect" aria-label="选择题目"></select></div>
    <div class="stages" id="stageTabs" hidden></div>
    <pre class="prompt" id="prompt"></pre>
    <p class="muted" id="target" hidden></p>
    <div class="answers" id="answers"></div>
  </section>
</div><script type="module" src="/web/batch.js"></script></body></html>`;

/** 渲染层只接收公开显示名，不传递模型连接配置或密钥。 */
async function currentModelNames(store: ModelSettingsStore): Promise<Record<string, string>> {
  const settings = await store.read();
  const names: Record<string, string> = {};
  for (const [id, item] of Object.entries(settings.catalog ?? {})) if (item.name) names[id] = item.name;
  for (const model of settings.custom) names[model.id] = model.name;
  return names;
}

/** 生涯只记维度 id（跨题库累计）：合并各题库维度字典，供战绩页显示中文名；同名 id 以先读到的题库为准 */
async function conditionNames(ctx: ServerCtx): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  for (const { def } of await listArenas(ctx.arenasDir))
    for (const [id, label] of Object.entries(def.conditions ?? {})) names[id] ??= label;
  return names;
}

async function homePage(
  ctx: ServerCtx,
  queueCard = '',
  modelNames: Readonly<Record<string, string>> = {},
): Promise<string> {
  // 路由层只收数据；HTML 合成在 homeHtml.ts（v3.25 外置——v3.22 只外置了直播页，首页漏网）
  const arenas = await listArenas(ctx.arenasDir);
  const book = await loadCareer(ctx.resultsDir);
  const top = stableView(book)
    .filter((r) => !r.id.startsWith('mock:'))
    .slice(0, 5);
  const htmlFiles = (await readdir(ctx.resultsDir).catch(() => [] as string[])).filter((f) => f.endsWith('.html'));
  const results = (
    await Promise.all(
      htmlFiles.map(async (file) => ({
        file,
        modified: (await stat(path.join(ctx.resultsDir, file)).catch(() => null))?.mtimeMs ?? 0,
      })),
    )
  )
    .sort((a, b) => b.modified - a.modified || b.file.localeCompare(a.file))
    .slice(0, 12)
    .map((entry) => entry.file);
  const today = dailyArena(arenas.filter((a) => playableTasks(a.def, a.tasks).length));
  // 今日擂台榜 top3（与结算同源的 career.history 现算）
  const dailyTop = today
    ? dailyBoard(book, today.def.name, new Date().toISOString().slice(0, 10))
        .slice(0, 3)
        .map((r) => ({ name: r.name, best: r.best }))
    : [];
  return renderHome({
    arenas: arenas.map((a) => ({
      name: a.def.name,
      title: a.def.title,
      desc: a.def.description,
      taskCount: playableTasks(a.def, a.tasks).length,
      pausedCount: a.tasks.length - playableTasks(a.def, a.tasks).length,
      reviewNote: a.def.review?.blockedReason ?? a.def.review?.note,
      judgeKind: a.def.judge.kind,
      mode: a.def.mode ?? 'qa',
      requiresJudge: playableTasks(a.def, a.tasks).some((task) => requiresModelJudge(task.judge ?? a.def.judge)),
      difficulty:
        a.tasks.length && a.tasks.every((task) => typeof task.meta?.difficulty === 'string')
          ? [...new Set(a.tasks.map((task) => task.meta!.difficulty))].join(' / ')
          : undefined,
      fingerprint: arenaFingerprint(a.def, a.tasks),
    })),
    top,
    results,
    daily: today ? { name: today.def.name, title: today.def.title, top: dailyTop } : null,
    queueCard,
    modelNames,
  });
}

export function createArenaServer(
  ctx: ServerCtx,
  desktopToken?: string,
  options: { lifecycle?: DesktopLifecycle; web?: boolean } = {},
): http.Server & { closeWorkers(): Promise<void>; tasks(): ReturnType<DesktopService['tasks']> } {
  const engine = createBattleEngine(ctx);
  const modelSettings = new ModelSettingsStore(ctx.modelSettingsFile);
  const questionBanks = new QuestionBankStore(ctx.arenasDir);
  const engineering = new EngineeringEngine(ctx.resultsDir);
  const harness = new HarnessEngine(ctx.resultsDir, ctx.arenasDir, modelSettings);
  const author = new ExtensionAuthor(ctx.resultsDir);
  const submissions = new Submissions(ctx.resultsDir);
  const desktop = new DesktopService(
    engine,
    engineering,
    harness,
    author,
    submissions,
    ctx.resultsDir,
    desktopToken,
    options.lifecycle,
  );
  let closing: Promise<void> | undefined;
  let stopping = false;
  const closeWorkers = () =>
    (closing ??= (async () => {
      stopping = true;
      engine.dispose();
      await submissions.idle();
      await Promise.all([engine.close(), engineering.close(), harness.close(), author.close()]);
    })().catch((error) => {
      closing = undefined;
      throw error;
    }));
  const checkArena = async (name: string) => {
    if (!name || /[/\\]|\.\./.test(name)) throw new Error('非法题库名称');
    const { def, tasks } = await loadArena(path.join(ctx.arenasDir, name));
    requirePlayableTasks(def, tasks);
  };

  const server = http
    .createServer((req, res) => {
      // 安全响应头：nosniff 防内容嗅探、DENY 防嵌框、no-referrer 防泄漏——LAN 围观服务器的真实硬化
      const rawWriteHead = res.writeHead.bind(res) as typeof res.writeHead;
      res.writeHead = ((code: number, headers?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[]) =>
        rawWriteHead(code, {
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'referrer-policy': 'no-referrer',
          ...(headers as http.OutgoingHttpHeaders),
        })) as typeof res.writeHead;
      const url = new URL(req.url ?? '/', 'http://localhost');
      void (async () => {
        if (stopping && req.method !== 'GET' && url.pathname !== '/api/game/runtime/shutdown') {
          res.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({ error: '后台正在保存退出' }));
          return;
        }
        if (
          options.web === false &&
          !url.pathname.startsWith('/api/') &&
          url.pathname !== '/queue/status' &&
          !url.pathname.startsWith('/results/') &&
          !url.pathname.startsWith('/pack/')
        ) {
          res.writeHead(404).end('网页维护入口未启用');
          return;
        }
        if (url.pathname === '/api/game/runtime/shutdown') {
          if (
            !desktopToken ||
            req.method !== 'POST' ||
            !isLocalSameOrigin(req) ||
            req.headers['x-arena-desktop-token'] !== desktopToken
          ) {
            res.writeHead(403).end();
            return;
          }
          res.once('finish', () => server.emit('desktop-exit'));
          res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
        } else if (
          url.pathname.startsWith('/api/game/runtime') ||
          url.pathname === '/api/tasks' ||
          url.pathname === '/api/workspace-settings' ||
          url.pathname.startsWith('/api/submissions/')
        ) {
          await desktop.handle(req, res, url);
        } else if (url.pathname === '/api/evaluations' || url.pathname.startsWith('/api/evaluations/')) {
          await handleEvaluationApi(req, res, url, engine, ctx, submissions);
        } else if (url.pathname.startsWith('/api/game/library/')) {
          await handleDesktopApi(req, res, url, ctx, questionBanks);
        } else if (url.pathname.startsWith('/api/game/')) {
          await handleGameApi(req, res, url, engine, ctx);
        } else if (url.pathname.startsWith('/api/harness/authoring/')) {
          await handleAuthoringApi(req, res, url, author, submissions);
        } else if (url.pathname.startsWith('/api/harness/')) {
          await handleHarnessApi(req, res, url, harness, submissions);
        } else if (url.pathname === '/harness') {
          res
            .writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            .end(HARNESS_HTML);
        } else if (url.pathname.startsWith('/api/engineering/')) {
          await handleEngineeringApi(req, res, url, engineering, submissions);
        } else if (url.pathname === '/experiments') {
          res
            .writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            .end(ENGINEERING_HTML);
        } else if (url.pathname === '/api/question-banks' || url.pathname.startsWith('/api/question-banks/')) {
          await handleQuestionBankApi(req, res, url, questionBanks);
        } else if (url.pathname === '/questions') {
          res
            .writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            .end(QUESTION_EDITOR_HTML);
        } else if (url.pathname === '/api/models' || url.pathname.startsWith('/api/model-settings/')) {
          await handleModelApi(req, res, url, modelSettings);
        } else if (url.pathname === '/api/agents') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(await detectAgents(url.searchParams.get('refresh') === '1')));
        } else if (url.pathname === '/api/predictions') {
          await handlePredictionApi(req, res, url, ctx.resultsDir);
        } else if (url.pathname === '/predictions') {
          res
            .writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            .end(renderPredictionPage());
        } else if (/^\/api\/battles\/b\d+\/(control|commentary|question|retry-grading)$/.test(url.pathname)) {
          if (!isLocalSameOrigin(req)) {
            res.writeHead(403).end('仅允许本机同源操作');
            return;
          }
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'POST' }).end();
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 16000) {
              res.writeHead(413).end('请求过长');
              return;
            }
            chunks.push(chunk);
          }
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const [, , , battle, action] = url.pathname.split('/');
            if (action === 'retry-grading') {
              if (typeof body.file !== 'string') throw new Error('请指定待评分战绩');
              await submissions.run(body.requestId, url.pathname, body, () => engine.retryGrading(battle, body.file));
            } else if (action === 'control') {
              if (!['pause', 'resume', 'stop'].includes(body.action)) throw new Error('未知控制操作');
              engine.control(battle, body.action);
            } else if (action === 'commentary') {
              if (typeof body.enabled !== 'boolean') throw new Error('无效解说开关');
              await requireCommentator(body.agentId, body.enabled);
              engine.commentator(battle, body.agentId, body.enabled);
            } else {
              if (typeof body.question !== 'string') throw new Error('请输入追问');
              if (
                body.reference &&
                (typeof body.reference.taskId !== 'string' ||
                  (body.reference.modelId !== undefined && typeof body.reference.modelId !== 'string'))
              )
                throw new Error('引用格式无效');
              engine.askCommentator(battle, body.question, body.reference);
            }
            res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
          } catch (e) {
            res
              .writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
              .end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
          }
        } else if (url.pathname === '/') {
          // 页面全部渲染成功后才写响应头：渲染抛错时外层 catch 仍能返回 500
          const snap = engine.snapshot();
          const queueCard =
            snap.running || snap.queue.length
              ? `<div class="card"><b>📺 演播队列</b> <span class="muted">${snap.running ? `进行中：${esc(snap.running.arena)}` : '空闲'}${snap.queue.length ? ` ｜ 排队 ${snap.queue.length} 场：${snap.queue.map((j) => esc(j.arena)).join('、')}` : ''}</span></div>`
              : '';
          const html = await homePage(ctx, queueCard, await currentModelNames(modelSettings));
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
        } else if (url.pathname === '/stable') {
          const mode = careerMode(url);
          const [book, names, conditions] = await Promise.all([
            loadCareer(ctx.resultsDir, mode),
            currentModelNames(modelSettings),
            conditionNames(ctx),
          ]);
          const html = renderStable(book, new Date(), true, names, mode, conditions);
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
        } else if (url.pathname.startsWith('/cricket/')) {
          const id = decodeURIComponent(url.pathname.slice('/cricket/'.length));
          const mode = careerMode(url);
          const [book, names, conditions] = await Promise.all([
            loadCareer(ctx.resultsDir, mode),
            currentModelNames(modelSettings),
            conditionNames(ctx),
          ]);
          let html: string;
          try {
            html = renderCricket(book, id, true, names, mode, conditions);
          } catch {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`蛐蛐棚里没有 ${id}`);
            return;
          }
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
        } else if (url.pathname.startsWith('/web/')) {
          // 静态资产只放行 web/ 根目录下的小写短横线命名 css/js，拒绝子目录与路径穿越
          const fname = decodeURIComponent(url.pathname.slice('/web/'.length));
          if (!/^[a-z-]+\.(css|js)$/.test(fname)) {
            res.writeHead(404).end('not found');
            return;
          }
          const file = await readFile(new URL(`../web/${fname}`, import.meta.url)).catch(() => null);
          if (file === null) {
            res.writeHead(404).end('not found');
            return;
          }
          res.writeHead(200, {
            'content-type': fname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
            'cache-control': 'no-cache',
          });
          res.end(file);
        } else if (url.pathname === '/results') {
          // 产物索引页：按类型分组，全部可点
          const entries = await readdir(ctx.resultsDir, { withFileTypes: true }).catch(() => []);
          const downloadable = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
          const files = entries
            .map((entry) => entry.name)
            .sort()
            .reverse();
          const groups = new Map<string, string[]>();
          for (const f of files) {
            const type = f.match(/^(战报|战绩|海报|联赛|淘汰赛|对比|赛季回顾|蛐蛐棚|蛐蛐)/)?.[1] ?? '其他';
            (groups.get(type) ?? groups.set(type, []).get(type)!).push(f);
          }
          const groupOrder = ['战报', '战绩', '海报', '联赛', '淘汰赛', '对比', '赛季回顾', '蛐蛐棚', '蛐蛐', '其他'];
          const groupHtml = [...groups.entries()]
            .sort(([a], [b]) => groupOrder.indexOf(a) - groupOrder.indexOf(b))
            .map(
              ([
                type,
                fs,
              ]) => `<details class="card result-group"${type === '战报' ? ' open' : ''}><summary><span>📁 ${esc(type)}</span><span class="muted group-count">${fs.length} 项</span></summary>
<ul>${fs
                .map((f) => {
                  const isHtml = f.endsWith('.html');
                  const replay = f.startsWith('战报-')
                    ? f.replace(/^战报-/, '战绩-').replace(/\.html$/, '.json')
                    : null;
                  return `<li data-search="${esc(f.toLowerCase())}">${downloadable.has(f) ? `<a class="file-link" href="/results/${encodeURIComponent(f)}"${isHtml ? '' : ' download'}>${esc(f)}</a>` : `<span class="file-link">${esc(f)}</span><span class="muted">文件夹</span>`}${replay && downloadable.has(replay) ? ` <a href="/replay?file=${encodeURIComponent(replay)}" class="replay-link" aria-label="回放：${esc(f)}">▶ 回放</a>` : ''}</li>`;
                })
                .join('')}</ul></details>`,
            )
            .join('\n');
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>战报档案 · AI斗兽场</title><style>
  * { box-sizing: border-box; }
  body { margin:0; font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width: 1200px; min-width:1040px; margin: 0 auto; padding: 28px 40px 64px; }
  h1 { font-size: 28px; } h2 { font-size: 18px; margin: 26px 0 10px; padding-left: 12px; border-left: 4px solid var(--accent); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px; margin-bottom:12px; }
  ul { margin: 14px 0 0; padding:0; list-style:none; font-size: 13px; max-height:420px; overflow:auto; scrollbar-gutter:stable; }
  li { display:flex; align-items:baseline; gap:16px; padding:9px 8px; border-top:1px solid var(--line); }
  li:hover { background:var(--soft); }
  .file-link { flex:1; min-width:0; overflow-wrap:anywhere; color:var(--ink); }
  .replay-link { flex-shrink:0; font-size:12px; }
  summary { cursor:pointer; font-size:15px; font-weight:600; }
  summary .group-count { float:right; font-weight:400; }
  .search-toolbar { display:flex; align-items:center; gap:14px; margin:22px 0 18px; }
  .search-toolbar input { min-width:0; flex:1; border:1px solid var(--line); border-radius:8px; padding:11px 14px; font-size:13px; }
  .search-toolbar button { padding:9px 14px; background:var(--card); color:var(--ink); border:1px solid var(--line); border-radius:7px; cursor:pointer; font-size:13px; }
  .search-toolbar input::-webkit-search-cancel-button { display:none; }
  [hidden] { display:none !important; }
  .empty-state { text-align:center; padding:32px; }
  a { color: var(--accent); text-decoration: none; }
  .muted { color: var(--muted); font-size: 12px; }
  ${THEME_CSS}
</style></head><body><div class="wrap" role="main">${THEME_TOGGLE}${siteNav('results')}<h1>战报档案</h1><p class="muted">浏览战报、回放与导出文件。点击分组展开，或按名称与日期查找。</p><div class="search-toolbar"><input id="resultSearch" type="search" aria-label="搜索产物" placeholder="搜索名称或日期，如 tongjia、2026-09-11…" autocomplete="off"><button type="button" id="clearResults" hidden>清除搜索</button><span class="muted" id="resultCount" role="status">共 ${files.length} 项</span></div>${groupHtml || '<div class="card empty-state">还没有产物，完成比赛后会在这里显示。</div>'}<div class="card empty-state" id="resultEmpty" hidden>没有找到匹配的产物，请更换关键词。</div><script src="/web/results.js"></script></div></body></html>`);
        } else if (url.pathname === '/battle' || url.pathname === '/replay') {
          const existing = url.searchParams.get('session');
          if (existing) {
            if (!/^b\d+$/.test(existing) || !engine.liveSnapshot(existing)) {
              res
                .writeHead(410, { 'content-type': 'text/html; charset=utf-8' })
                .end('<p>该现场会话已结束或服务已重启。请从<a href="/results">战报档案</a>打开回放。</p>');
              return;
            }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(BATCH_PAGE.replace('<body>', `<body data-battle="${existing}">`));
            return;
          }
          // 以下会入队新比赛（花费模型额度、结算生涯）：跨站 <img>/链接与局域网请求一律拒绝
          if (!isLocalSameOrigin(req)) {
            res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('仅允许本机同源开赛');
            return;
          }
          // /replay 的文件校验在引擎入队前（400 早退不产生 job）
          let replayFile: string | undefined;
          if (url.pathname === '/replay') {
            const file = url.searchParams.get('file');
            // searchParams 已解码一次——不得二次解码；% 直接拒（双解码攻击必含 %）；反斜杠同查；resolve 强制容器内
            if (!file || /[/\\%]|\.\./.test(file)) {
              res
                .writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
                .end('用法：/replay?file=战绩-xxx.json');
              return;
            }
            const resolved = path.resolve(ctx.resultsDir, file);
            if (!resolved.startsWith(path.resolve(ctx.resultsDir) + path.sep)) {
              res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('文件必须在产物目录内');
              return;
            }
            replayFile = resolved;
          }
          if (!replayFile) {
            try {
              await checkArena(url.searchParams.get('arena') ?? '');
            } catch (error) {
              res
                .writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
                .end(error instanceof Error ? error.message : String(error));
              return;
            }
          }
          const { job } = engine.enqueue(url.pathname, url.searchParams, replayFile);
          // 直播页带 id：排队时观赛当前场，轮到自己自动切入
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(BATCH_PAGE.replace('<body>', `<body data-battle="${job.id}">`));
        } else if (url.pathname.startsWith('/pack/')) {
          // 罐市场回路：动态打包下载——同伴 pull 这个 URL 即装
          const name = decodeURIComponent(url.pathname.slice('/pack/'.length)).replace(/\.ququ\.json$/, '');
          if (name.includes('..') || name.includes('/')) {
            res.writeHead(400).end('bad path');
            return;
          }
          try {
            const { def, tasks } = await loadArena(path.join(ctx.arenasDir, name));
            const pack = packArena(def, tasks);
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}.ququ.json`,
            });
            res.end(JSON.stringify(pack, null, 2));
          } catch {
            res.writeHead(404).end('没有这个罐');
          }
        } else if (url.pathname === '/queue/status') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(engine.snapshot()));
        } else if (url.pathname === '/battle/stream') {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          });
          res.write(': connected\n\n');
          // 接入即补发状态快照：直播无回放缓冲，排队态不能丢
          const snap = engine.snapshot();
          res.write(
            `data: ${JSON.stringify({ type: 'status', running: snap.running, queue: snap.queue, contestants: snap.runningContestants })}\n\n`,
          );
          // 心跳：真实模型慢赛时防代理/浏览器掐线
          const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
          // 接入即补发当前场缓冲（晚加入的观众看到完整开局：竞猜卡/实况/快报不丢）
          const selected = url.searchParams.get('battle');
          const materialized = url.searchParams.get('snapshot') === '1' && selected;
          if (materialized) {
            const state = engine.liveSnapshot(selected);
            if (!state) {
              clearInterval(heartbeat);
              res.end(
                `data: ${JSON.stringify({ type: 'error', battle: selected, message: '现场会话已结束或服务已重启，请从战报档案打开回放。' })}\n\n`,
              );
              return;
            }
            res.write(`data: ${JSON.stringify({ type: 'snapshot', battle: selected, ...state })}\n\n`);
          }
          const off = engine.subscribe(
            (e) => {
              if (!selected || e.battle === selected) res.write(`id: ${e.seq ?? ''}\ndata: ${JSON.stringify(e)}\n\n`);
            },
            materialized ? null : (snap.running?.id ?? null),
          );
          req.on('close', () => {
            clearInterval(heartbeat);
            off();
          });
        } else if (url.pathname.startsWith('/results/')) {
          const name = decodeURIComponent(url.pathname.slice('/results/'.length));
          if (name.includes('..') || name.includes('/') || name.includes('\\')) {
            // 与 /replay 同策略：反斜杠也拒（win32 下 \ 是分隔符，两条文件路由路径政策必须一致）
            res.writeHead(400).end('bad path');
            return;
          }
          const ext = path.extname(name);
          const mime: Record<string, string> = {
            '.html': 'text/html; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.md': 'text/markdown; charset=utf-8',
          };
          try {
            const content = await readFile(path.join(ctx.resultsDir, name));
            res.writeHead(200, { 'content-type': mime[ext] ?? 'application/octet-stream' });
            res.end(content);
          } catch {
            res.writeHead(404).end('not found');
          }
        } else {
          res.writeHead(404).end('not found');
        }
      })().catch((e) => {
        // 响应头已发出时不能再改状态码，只能断开连接；否则二次 writeHead 抛错会带崩整个进程
        if (res.headersSent) {
          res.destroy();
          return;
        }
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(e instanceof Error ? e.message : String(e));
      });
    })
    .on('desktop-shutdown', () => {
      void closeWorkers().catch(() => {});
    })
    .on('close', () => {
      void closeWorkers().catch(() => {});
    });
  return Object.assign(server, { closeWorkers, tasks: () => desktop.tasks() });
}
