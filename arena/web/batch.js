// @ts-check
// 批量评测页：进度、控制、成绩表与逐题答卷。观赛演出在 3D 客户端，这里只呈现研究需要的数据。
import { acceptEvent, boardRows, callsFor, createBattleState, gradeFor, isTerminal } from './batch-state.js';
import { renderTaskReview } from './task-review.js';

/** 页面骨架由 server.ts 的 BATCH_PAGE 生成，这些 id 必然存在；按 any 取用以免逐个断言元素类型 */
/** @type {(id: string) => any} */
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const pct = (x) => (typeof x === 'number' ? (x * 100).toFixed(1) + '%' : '—');
const battle = document.body.dataset.battle;
const state = createBattleState();
let currentTask = '',
  currentStage = '',
  renderTimer;

const STATUS = {
  connecting: '正在连接…',
  queued: '排队中',
  running: '进行中',
  pausing: '本题结束后暂停',
  paused: '已暂停',
  completed: '已完成',
  stopped: '已停止',
  error: '出错',
};
const CALL_STATUS = {
  waiting: '等待',
  generating: '作答中',
  judging: '评分中',
  retrying: '重试中',
  done: '完成',
  error: '失败',
  stopped: '已停止',
  withdrawn: '已退赛',
};

async function post(action, body) {
  const res = await fetch(`/api/battles/${battle}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `请求失败（${res.status}）`);
}
function notice(message) {
  $('notice').hidden = !message;
  $('notice').textContent = message;
}
const guarded = (fn) => async () => {
  notice('');
  try {
    await fn();
  } catch (e) {
    notice(e instanceof Error ? e.message : String(e));
  }
};

$('pauseBattle').onclick = guarded(() =>
  post('control', { action: ['paused', 'pausing'].includes(state.control) ? 'resume' : 'pause' }),
);
$('stopBattle').onclick = guarded(() => post('control', { action: 'stop' }));
$('retryGrading').onclick = guarded(async () => {
  $('retryGrading').disabled = true;
  try {
    await post('retry-grading', { file: state.done.resultFile });
  } finally {
    $('retryGrading').disabled = false;
  }
});
$('followRound').onchange = () => {
  if ($('followRound').checked) {
    currentTask = state.latestTask;
    currentStage = '';
  }
  schedule();
};
$('roundSelect').onchange = () => {
  currentTask = $('roundSelect').value;
  currentStage = '';
  $('followRound').checked = false;
  schedule();
};

function renderHeader() {
  const terminal = isTerminal(state);
  $('title').textContent = state.title || '对战';
  const status =
    state.control === 'queued'
      ? `排队中 · 前面还有 ${state.queuePosition} 场`
      : state.control === 'error'
        ? `出错：${state.error}`
        : (STATUS[state.control] ?? state.control);
  $('statusText').textContent = (state.replay ? '回放 · ' : '') + status;
  $('progressText').textContent = state.total ? `${state.progress} / ${state.total} 次作答` : '';
  const ratio = state.total ? Math.min(1, state.progress / state.total) : 0;
  $('progressBar').style.width = `${ratio * 100}%`;
  document.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  $('pauseBattle').hidden = $('stopBattle').hidden = terminal;
  $('pauseBattle').disabled = !['running', 'pausing', 'paused'].includes(state.control);
  $('pauseBattle').textContent = ['paused', 'pausing'].includes(state.control) ? '继续' : '暂停';
  $('stopBattle').disabled = state.control === 'connecting';
  const done = state.done;
  $('retryGrading').hidden = !done?.pendingGrades || done.stopped;
  $('reportLink').hidden = !done?.reportFile;
  if (done?.reportFile) $('reportLink').href = done.reportFile;
  $('nextLink').hidden = !done?.next;
  if (done?.next) $('nextLink').href = done.next;
}

function renderBoard() {
  const rows = boardRows(state),
    final = !!state.done?.settlement;
  const showPerformance = rows.some((r) => r.performance !== null);
  $('performanceHeading').hidden = !showPerformance;
  // 旧规则战绩的名次由综合分决定；现行规则下它只是效率参考
  $('performanceHeading').textContent =
    state.done?.settlement?.rankingPolicy === 'quality-efficiency-v1' ? '综合分（决定名次）' : '效率参考（不决定名次）';
  $('board').innerHTML =
    rows
      .map(
        (r, i) => `<tr>
    <td class="rank">${final ? (r.rank ?? '—') : i + 1}</td>
    <td class="name">${esc(r.name)}${r.withdrawal ? `<div class="muted">已退赛：${esc(r.withdrawal.message)}</div>` : ''}</td>
    <td>${r.answered}</td><td class="score">${pct(r.avg)}</td><td>${r.failures || '—'}</td>
    ${showPerformance ? `<td class="muted">${typeof r.performance === 'number' ? (r.performance * 100).toFixed(1) : '—'}</td>` : ''}
  </tr>`,
      )
      .join('') || '<tr><td colspan="6" class="muted">等待首批作答…</td></tr>';
  const settlement = state.done?.settlement;
  $('boardNote').textContent = settlement
    ? [settlement.reason, ...(settlement.warnings ?? [])].filter(Boolean).join('\n')
    : '进行中的均分只统计已评分的题，结束后以正式结算为准。';
}

function renderQuestion() {
  const tasks = [...state.rounds.values()].sort((a, b) => a.index - b.index);
  if ($('followRound').checked || !state.rounds.has(currentTask)) currentTask = state.latestTask;
  $('roundSelect').innerHTML = tasks
    .map(
      (r) =>
        `<option value="${esc(r.taskId)}"${r.taskId === currentTask ? ' selected' : ''}>第 ${r.index + 1} 题 · ${esc(r.taskId)}</option>`,
    )
    .join('');
  const round = state.rounds.get(currentTask);
  $('questionCard').hidden = !round;
  if (!round) return;
  const stages = [...(state.stages.get(currentTask)?.values() ?? [])].sort((a, b) => a.roundIndex - b.roundIndex);
  if (!stages.some((s) => s.roundId === currentStage)) currentStage = stages.at(-1)?.roundId ?? '';
  $('stageTabs').hidden = stages.length < 2;
  $('stageTabs').innerHTML = stages
    .map(
      (s) =>
        `<button type="button" data-stage="${esc(s.roundId)}" aria-pressed="${s.roundId === currentStage}">第 ${s.roundIndex}/${s.roundTotal} 轮 · ${esc(s.title)}</button>`,
    )
    .join('');
  for (const button of $('stageTabs').querySelectorAll('[data-stage]'))
    button.onclick = () => {
      currentStage = button.dataset.stage;
      $('followRound').checked = false;
      schedule();
    };
  const stage = stages.find((s) => s.roundId === currentStage);
  $('prompt').textContent = stage?.prompt ?? round.prompt ?? '';
  $('target').hidden = !round.ended || !round.target;
  $('target').textContent = round.target ? `参考答案：${round.target}` : '';
  const dimensions = round.scoring?.dimensions ?? state.scoring?.dimensions ?? [];
  // 流式增量会频繁重绘：记住展开的推理与评分详情，重绘后恢复
  const expanded = new Set(
    [...$('answers').querySelectorAll('.answer')]
      .flatMap((card) =>
        [...card.querySelectorAll('details')].map((d, i) => (d.open ? card.dataset.model + '#' + i : '')),
      )
      .filter(Boolean),
  );
  $('answers').innerHTML = state.roster
    .map((model) => {
      const call = callsFor(state, currentTask, model.id, stage ? currentStage : undefined).at(-1);
      const withdrawal = state.withdrawals.get(model.id);
      const status = call ? (CALL_STATUS[call.status] ?? call.status) : withdrawal ? '已退赛' : '未开始';
      const meta = [
        typeof call?.score === 'number' ? `得分 ${pct(call.score)}` : '',
        (call?.solveMs ?? call?.ms) ? `${((call.solveMs ?? call.ms) / 1000).toFixed(1)} 秒` : '',
        call?.usage ? `${call.usage.input + call.usage.output} tok` : '',
        call?.attempt > 1 ? `第 ${call.attempt} 次尝试` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `<article class="answer" data-model="${esc(model.id)}">
      <header><b>${esc(model.name)}</b><span class="call-status" data-status="${esc(call?.status ?? 'idle')}">${esc(status)}</span></header>
      ${meta ? `<p class="muted">${esc(meta)}</p>` : ''}
      <div class="answer-text">${call?.answer ? esc(call.answer) : '<span class="muted">暂无答案</span>'}</div>
      ${call?.error ? `<p class="error">${esc(call.error)}</p>` : ''}
      ${call?.reasoning ? `<details><summary>公开推理</summary><div class="reasoning">${esc(call.reasoning)}</div></details>` : ''}
      <div class="task-review" hidden></div>
    </article>`;
    })
    .join('');
  for (const card of $('answers').querySelectorAll('.answer')) {
    if (state.mode !== 'qa')
      renderTaskReview(
        card.querySelector('.task-review'),
        gradeFor(state, currentTask, card.dataset.model),
        (evidence) => {
          currentStage = evidence.roundId;
          $('followRound').checked = false;
          render();
        },
        dimensions,
      );
    card.querySelectorAll('details').forEach((details, i) => {
      if (expanded.has(card.dataset.model + '#' + i)) details.open = true;
    });
  }
}

function render() {
  renderHeader();
  renderBoard();
  renderQuestion();
}
function schedule() {
  renderTimer ??= setTimeout(() => {
    renderTimer = undefined;
    render();
  }, 60);
}

const stream = new EventSource(`/battle/stream?battle=${encodeURIComponent(battle)}&snapshot=1`);
stream.onmessage = (message) => {
  const event = JSON.parse(message.data);
  if (!acceptEvent(state, event, battle)) return;
  if (state.control === 'error') stream.close();
  schedule();
};
stream.onerror = () => {
  if (isTerminal(state)) stream.close();
  else $('statusText').textContent = '连接中断，正在重连…';
};
render();
