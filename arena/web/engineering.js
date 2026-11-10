const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const labels = {
  queued: '等待执行',
  preparing: '准备环境',
  working: '修改与测试',
  verifying: '独立验收',
  passed: '交付通过',
  failed: '验收未通过',
  model_error: 'Agent 失败',
  environment_error: '环境失败',
  timed_out: '执行超时',
  cancelled: '已取消',
  interrupted: '已中断',
  running: '进行中',
  finished: '已完成',
};
const params = new URLSearchParams(location.search);
const view = params.get('view') || 'setup';
let catalog,
  run,
  evidence = 'trace',
  trialId = '',
  timer,
  pendingOutput = false;
async function api(url, body) {
  const response = await fetch(
    url,
    body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {},
  );
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || '请求失败');
  return value;
}
function notice(text = '') {
  $('labNotice').textContent = text;
  $('labNotice').hidden = !text;
}
function show(id) {
  ['labSetup', 'labTasks', 'labRuns', 'labRun', 'labText'].forEach((name) => ($(name).hidden = name !== id));
}
document
  .querySelectorAll('[data-view]')
  .forEach((a) => a.classList.toggle('active', a.dataset.view === view && !params.has('run')));
function brief() {
  const task = catalog.tasks.find((t) => t.id === $('engineeringTask').value);
  $('taskBrief').innerHTML =
    `<b>${esc(task.category)}</b><br>${esc(task.requirements)}<br><span class="muted">可编辑：${esc(task.writable.join(', '))} · ${task.checks.length} 项独立验收</span>`;
}
async function loadCatalog() {
  $('refreshEngineering').disabled = true;
  try {
    catalog = await api('/api/engineering/catalog?refresh=1');
    $('engineeringTask').innerHTML = catalog.tasks
      .map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`)
      .join('');
    if (catalog.tasks.some((t) => t.id === params.get('task'))) $('engineeringTask').value = params.get('task');
    $('engineeringAgents').innerHTML = catalog.agents
      .map(
        (a) =>
          `<label class="agent-choice"><input type="checkbox" name="agent" value="${esc(a.id)}" ${a.status === 'ready' ? 'checked' : 'disabled'}>${esc(a.name)}<small>${esc(a.status === 'ready' ? '已登录 · ' + a.version : a.message)}</small></label>`,
      )
      .join('');
    $('environmentStatus').textContent = catalog.environment.message;
    $('startEngineering').disabled = !catalog.environment.ready || !catalog.agents.some((a) => a.status === 'ready');
    $('engineeringTaskCards').innerHTML = catalog.tasks
      .map(
        (t) =>
          `<article class="task-card"><span class="eyebrow">${esc(t.category)}</span><h3>${esc(t.title)}</h3><p class="muted">${esc(t.provenance)}</p><details><summary>需求、验收与任务版本</summary><p>${esc(t.requirements)}</p><ul>${t.checks.map((c) => `<li>${esc(c.title)}</li>`).join('')}</ul><p>${esc(t.review)}</p><p>版本 ${esc(t.fingerprint.slice(0, 16))}<br>允许修改 ${esc(t.writable.join(', '))}</p></details><button data-task="${esc(t.id)}">用此任务开始实验 ↗</button></article>`,
      )
      .join('');
    brief();
  } catch (e) {
    notice(e.message);
  } finally {
    $('refreshEngineering').disabled = false;
  }
}
$('engineeringTask').addEventListener('change', brief);
$('refreshEngineering').addEventListener('click', loadCatalog);
$('engineeringTaskCards').addEventListener('click', (e) => {
  const b = e.target.closest('[data-task]');
  if (b) location.href = '/experiments?task=' + encodeURIComponent(b.dataset.task);
});
$('engineeringForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const agents = [...document.querySelectorAll('input[name=agent]:checked')].map((e) => e.value);
  if (!agents.length) return notice('请至少选择一个可连接的 Agent');
  $('startEngineering').disabled = true;
  notice('正在检查并冻结实验条件…');
  try {
    const result = await api('/api/engineering/runs', {
      task: $('engineeringTask').value,
      agents,
      repeats: Number($('engineeringRepeats').value),
      budgetMinutes: Number($('engineeringBudget').value),
    });
    location.href = '/experiments?run=' + result.id;
  } catch (e) {
    notice(e.message);
    $('startEngineering').disabled = false;
  }
});
function summaryTable(summary) {
  return `<table><thead><tr><th>Agent</th><th>交付通过 / 计划试验</th><th>实际开始</th><th>环境有效</th><th>平均执行耗时</th></tr></thead><tbody>${summary.map((s) => `<tr><td>${esc(s.agent)}</td><td>${s.passed} / ${s.planned}</td><td>${s.started}</td><td>${s.environmentValid}</td><td>${s.meanMs === null ? '—' : (s.meanMs / 1000).toFixed(1) + 's'}</td></tr>`).join('')}</tbody></table>`;
}
async function loadRuns() {
  try {
    const runs = await api('/api/engineering/runs');
    $('engineeringRunList').innerHTML = runs.length
      ? `<table><thead><tr><th>任务与时间</th><th>状态</th><th>交付通过</th><th>协议分组</th><th>证据</th></tr></thead><tbody>${runs.map((r) => `<tr><td>${esc(r.title)}<div class="muted">${esc(new Date(r.createdAt).toLocaleString())}</div></td><td>${esc(labels[r.status])}</td><td>${r.summary.map((s) => `${esc(s.agent)} ${s.passed}/${s.planned}`).join(' · ')}</td><td><code>${esc(r.protocolKey.slice(0, 12))}</code></td><td><a href="/experiments?run=${r.id}">打开记录 ↗</a></td></tr>`).join('')}</tbody></table>`
      : '<p class="lab-panel">还没有工程实验。选择任务和 Agent 后，即可开始。</p>';
    const options = runs
      .map((r) => `<option value="${r.id}">${esc(r.title)} · ${esc(new Date(r.createdAt).toLocaleString())}</option>`)
      .join('');
    $('compareA').innerHTML = options;
    $('compareB').innerHTML = options;
    if (runs.length > 1) $('compareB').selectedIndex = 1;
    $('compareEngineering').disabled = runs.length < 2;
  } catch (e) {
    notice(e.message);
  }
}
$('reloadEngineeringRuns').addEventListener('click', loadRuns);
$('compareEngineering').addEventListener('click', async () => {
  try {
    const c = await api(`/api/engineering/compare?a=${$('compareA').value}&b=${$('compareB').value}`);
    $('comparisonResult').hidden = false;
    $('comparisonResult').innerHTML =
      `<h3>同条件描述性比较</h3><b>实验 A</b>${summaryTable(c.a.summary)}<b>实验 B</b>${summaryTable(c.b.summary)}<p class="muted">${esc(c.note)}</p><details><summary>Agent 版本与未知参数</summary><pre>${esc(JSON.stringify({ A: c.a.agents, B: c.b.agents }, null, 2))}</pre></details>`;
    notice();
  } catch (e) {
    notice(e.message);
  }
});
function currentTrial() {
  return run.trials.find((t) => t.id === trialId) || run.trials[0];
}
function renderEvidence(force = false) {
  if (!run) return;
  const area = $('engineeringEvidence'),
    t = currentTrial();
  const following = area.scrollHeight - area.scrollTop - area.clientHeight < 70;
  if (!force && !following) {
    pendingOutput = true;
    $('followEngineering').hidden = false;
    return;
  }
  let html = '';
  if (evidence === 'trace') {
    const events = run.events.filter((e) => e.trial === t.id && e.kind !== 'text' && e.kind !== 'reasoning');
    html =
      events
        .map(
          (e) =>
            `<div class="trace-row"><span>${esc(new Date(e.at).toLocaleTimeString())} · ${esc(e.kind)}</span><pre>${esc(e.text)}</pre></div>`,
        )
        .join('') +
      `<div class="trace-row"><span>Agent 的交付说明</span><pre>${esc(t.text || '等待输出…')}</pre></div><details><summary>公开推理摘要</summary><pre>${esc(t.reasoning || '未提供')}</pre></details>`;
  } else if (evidence === 'patch')
    html = `<p class="muted">${t.patch ? '提交时冻结的文件变更。' : '提交尚未生成；进行中的文件操作可在执行轨迹查看。'}</p><pre>${esc(t.patch || '暂无补丁')}</pre>`;
  else if (evidence === 'checks')
    html = `<h3 class="${t.status === 'passed' ? 'status-pass' : 'status-fail'}">${esc(labels[t.status])}</h3><p class="muted">公开测试用于开发；以下为停止 Agent 后在全新容器运行的固定验收。语法与公开回归也必须通过。</p>${t.checks ? `<table><thead><tr><th>验收条件</th><th>结果</th></tr></thead><tbody>${t.checks.map((c) => `<tr><td>${esc(c.title)}</td><td class="${c.passed ? 'status-pass' : 'status-fail'}">${c.passed ? '通过' : '未通过'}</td></tr>`).join('')}</tbody></table>` : '<p>尚无正式验收结果。</p>'}${t.error ? `<pre>${esc(t.error)}</pre>` : ''}`;
  else if (evidence === 'artifacts')
    html = t.artifacts?.length
      ? `<table><thead><tr><th>产物</th><th>大小</th><th>SHA-256</th></tr></thead><tbody>${t.artifacts.map((a) => `<tr><td><a href="/api/engineering/runs/${run.id}/artifacts/${t.id}/${a.name}" download>${esc(a.name)} ↓</a></td><td>${a.bytes} B</td><td title="${a.sha256}"><code>${a.sha256.slice(0, 20)}…</code></td></tr>`).join('')}</tbody></table>`
      : '试验结束后保存补丁、日志、协议和执行轨迹。';
  else
    html = `<p class="muted">该记录冻结了任务和验收标准。供应商未返回的模型与采样字段保留为未知。</p><pre>${esc(JSON.stringify(run.protocol, null, 2))}</pre><h3>需求快照</h3><p>${esc(run.task.requirements)}</p>`;
  if (area.innerHTML !== html) area.innerHTML = html;
  if (force) area.scrollTop = 0;
  else if (following && evidence === 'trace') area.scrollTop = area.scrollHeight;
  pendingOutput = false;
  $('followEngineering').hidden = true;
}
$('followEngineering').addEventListener('click', () => {
  renderEvidence(true);
  $('engineeringEvidence').scrollTop = $('engineeringEvidence').scrollHeight;
});
$('engineeringEvidence').addEventListener('scroll', () => {
  if (
    pendingOutput &&
    $('engineeringEvidence').scrollHeight - $('engineeringEvidence').scrollTop - $('engineeringEvidence').clientHeight <
      50
  )
    renderEvidence();
});
document.querySelectorAll('[data-evidence]').forEach((b) =>
  b.addEventListener('click', () => {
    evidence = b.dataset.evidence;
    document.querySelectorAll('[data-evidence]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderEvidence(true);
  }),
);
$('engineeringTrial').addEventListener('change', () => {
  trialId = $('engineeringTrial').value;
  renderEvidence(true);
});
function renderRun() {
  $('runTitle').textContent = run.task.title + ' · ' + labels[run.status];
  $('cancelEngineering').hidden = run.status !== 'running';
  const completed = run.trials.filter(
    (t) => !['queued', 'preparing', 'working', 'verifying'].includes(t.status),
  ).length;
  $('runMetrics').innerHTML =
    `<div class="metric"><strong>${run.trials.filter((t) => t.status === 'passed').length} / ${run.trials.length}</strong>交付通过 / 计划试验（包含失败）</div><div class="metric"><strong>${completed} / ${run.trials.length}</strong>已结束试验 · ${run.protocol.repeats} 次重复</div><div class="metric"><strong>1</strong>独立开发任务 · 不外推总体能力</div><div class="metric"><strong>${run.protocol.budgetMs / 60000} min</strong>每次执行预算 · ${esc(run.protocol.runtime)}</div>`;
  const options = run.trials
    .map((t) => `<option value="${t.id}">${esc(t.agent)} · 第 ${t.repeat} 次 · ${esc(labels[t.status])}</option>`)
    .join('');
  if ($('engineeringTrial').innerHTML !== options) {
    $('engineeringTrial').innerHTML = options;
    if (trialId) $('engineeringTrial').value = trialId;
  }
  trialId = $('engineeringTrial').value;
  for (const a of run.protocol.agents) {
    const trials = run.trials.filter((t) => t.agent === a.id),
      t =
        trials.find((t) => ['preparing', 'working', 'verifying'].includes(t.status)) ||
        trials.findLast((t) => t.status !== 'queued') ||
        trials[0];
    let seat = $('seat-' + a.id);
    if (!seat) {
      seat = document.createElement('article');
      seat.className = 'engineering-seat';
      seat.id = 'seat-' + a.id;
      seat.innerHTML = '<h3></h3><progress></progress><div class="muted"></div><p></p>';
      $('engineeringSeats').append(seat);
    }
    seat.dataset.state = t.status;
    seat.querySelector('h3').innerHTML = `${esc(a.id)} <span>${esc(labels[t.status])}</span>`;
    const progress = seat.querySelector('progress');
    progress.max = trials.length;
    progress.value = trials.filter((t) => !['queued', 'preparing', 'working', 'verifying'].includes(t.status)).length;
    seat.querySelector('div').textContent =
      `第 ${t.repeat} 次 / ${run.protocol.repeats} · ${trials.filter((t) => t.status === 'passed').length} 次交付通过 · Token ${t.inputTokens === undefined ? '未提供' : t.inputTokens + (t.outputTokens ?? 0)}`;
    const p = seat.querySelector('p');
    const following = p.scrollHeight - p.scrollTop - p.clientHeight < 40;
    if (following) {
      p.textContent = t.error || t.text || '等待真实工具执行进展…';
      p.scrollTop = p.scrollHeight;
    }
  }
  renderEvidence();
}
async function poll() {
  try {
    run = await api('/api/engineering/runs/' + params.get('run'));
    notice();
    renderRun();
    if (run.status === 'running') timer = setTimeout(poll, 1500);
  } catch (e) {
    notice('暂时无法获取实验状态，正在重连：' + e.message);
    timer = setTimeout(poll, 4000);
  }
}
$('cancelEngineering').addEventListener('click', async () => {
  $('cancelEngineering').disabled = true;
  notice('正在停止 Agent 与容器，保存已有产物…');
  try {
    await api('/api/engineering/runs/' + run.id + '/cancel', {});
    clearTimeout(timer);
    await poll();
  } catch (e) {
    notice(e.message);
  } finally {
    $('cancelEngineering').disabled = false;
  }
});
$('watchEngineering').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('labRun').requestFullscreen();
  } catch {
    notice('浏览器未允许全屏，当前实验继续运行。');
  }
});
async function loadText() {
  try {
    const records = await api('/api/engineering/text-records');
    const options = records
      .map(
        (r) =>
          `<option value="${esc(r.file)}">${esc(r.title)} · ${esc(new Date(r.at).toLocaleString())} · ${r.tasks}题</option>`,
      )
      .join('');
    $('textA').innerHTML = options;
    $('textB').innerHTML = options;
    if (records.length > 1) $('textB').selectedIndex = 1;
    $('compareText').disabled = records.length < 2;
    const groups = [...new Map(records.map((r) => [r.arena + ':' + r.protocolKey, r])).values()];
    $('textGroup').innerHTML = groups
      .map(
        (r) =>
          `<option value="${esc(JSON.stringify({ arena: r.arena, protocol: r.protocolKey }))}">${esc(r.title)} · ${esc(r.protocolKey)}</option>`,
      )
      .join('');
    $('diagnoseText').disabled = !groups.length;
    if (!records.length) $('textDiagnosis').textContent = '还没有文本战绩，完成文本比赛后会显示在这里。';
  } catch (e) {
    notice(e.message);
  }
}
$('compareText').addEventListener('click', async () => {
  try {
    const r = await api(
      '/api/engineering/text-compare?a=' +
        encodeURIComponent($('textA').value) +
        '&b=' +
        encodeURIComponent($('textB').value),
    );
    $('textComparison').hidden = false;
    $('textComparison').innerHTML =
      r.warnings.map((w) => `<p class="science-note">${esc(w)}</p>`).join('') +
      `<table><thead><tr><th>模型</th><th>共同题数</th><th>A 均分</th><th>B 均分</th><th>A−B 区间</th></tr></thead><tbody>${r.models.map((m) => `<tr><td>${esc(m.name)}</td><td>${m.sharedTasks}</td><td>${(m.avgA * 100).toFixed(1)}%</td><td>${(m.avgB * 100).toFixed(1)}%</td><td>${m.ci ? `[${(m.ci.lo * 100).toFixed(1)}, ${(m.ci.hi * 100).toFixed(1)}] 百分点` : '样本不足'}</td></tr>`).join('')}</tbody></table><p class="muted">区间不含 0 仅描述本卷配对观测；共同作答的口径不包含单侧调用失败，不能替代端到端可靠性比较。</p>`;
    notice();
  } catch (e) {
    notice(e.message);
  }
});
$('diagnoseText').addEventListener('click', async () => {
  try {
    const q = JSON.parse($('textGroup').value),
      r = await api('/api/engineering/text-diagnosis?' + new URLSearchParams(q));
    $('textDiagnosis').innerHTML =
      `<p class="muted">${r.battles} 场 · 分组 ${esc(r.protocol)}</p><table><thead><tr><th>题目</th><th>平均得分</th><th>作答观测 n</th><th>题分与其余题均分相关</th></tr></thead><tbody>${r.tasks.map((t) => `<tr><td>${esc(t.taskId)}</td><td>${(t.mean * 100).toFixed(1)}%</td><td>${t.n}</td><td>${t.r === null ? '样本不足或不可定义' : t.r.toFixed(2)}</td></tr>`).join('')}</tbody></table>`;
    notice();
  } catch (e) {
    notice(e.message);
  }
});
if (params.has('run')) {
  show('labRun');
  poll();
} else if (view === 'text') {
  show('labText');
  loadText();
} else if (view === 'runs') {
  show('labRuns');
  loadRuns();
} else {
  show(view === 'tasks' ? 'labTasks' : 'labSetup');
  loadCatalog();
}
