import { initModelPicker } from './model-picker.js';
import { initLineupPresets } from './lineup-presets.js';
const picker = initModelPicker();
initLineupPresets(picker);
const search = document.getElementById('arenaSearch');
const launchArena = document.getElementById('launchArena');
const launchLimit = document.getElementById('launchLimit');
const chooser = document.getElementById('arenaChooser');
const quickSearch = document.getElementById('quickArenaSearch');
const quickChoices = [...document.querySelectorAll('[data-quick-arena]')];
const launchJudge = document.getElementById('launchJudge');
const judgeSource = document.getElementById('judgeSource');
const judgeAgent = document.getElementById('launchJudgeAgent');
let agentStatus = [];
const taskMode = () => launchArena.selectedOptions[0]?.dataset.mode || 'qa';
let preferences = {};
try {
  const saved = JSON.parse(localStorage.getItem('ququ-match-options') || '{}');
  if (saved && typeof saved === 'object') preferences = saved;
} catch {}
if ([...launchArena.options].some((o) => o.value === preferences.arena)) launchArena.value = preferences.arena;
if (Number.isInteger(preferences.limit) && preferences.limit > 0) launchLimit.value = preferences.limit;
let limitMode = preferences.limitMode === 'all' ? 'all' : 'number';
if (['codex', 'claude', 'api'].includes(preferences.judgeSource)) judgeSource.value = preferences.judgeSource;
let judgeChoice = typeof preferences.judge === 'string' ? preferences.judge : '';
let modelState = { loaded: false, selected: [], models: [] };
const rememberOptions = () => {
  try {
    localStorage.setItem(
      'ququ-match-options',
      JSON.stringify({
        arena: launchArena.value,
        limit: Number(launchLimit.value),
        limitMode,
        judge: judgeChoice,
        judgeSource: judgeSource.value,
      }),
    );
  } catch {}
};
const requiresJudge = (select) => [...select.selectedOptions].some((option) => option.dataset.requiresJudge === 'true');
function updateJudgeControls() {
  const required = requiresJudge(launchArena);
  document.getElementById('judgeField').hidden = !required;
  launchJudge.disabled = !required;
  launchJudge.required = required;
  const long = taskMode() !== 'qa',
    usingAgent = long && judgeSource.value !== 'api';
  document.getElementById('taskJudgeOptions').hidden = !long;
  document.getElementById('apiJudgeLabel').hidden = usingAgent;
  judgeSource.disabled = !long;
  judgeAgent.disabled = !usingAgent;
  judgeAgent.value = usingAgent ? judgeSource.value : '';
  if (usingAgent) {
    launchJudge.disabled = true;
    launchJudge.required = false;
  }
  document.getElementById('taskBudget').textContent =
    taskMode() === 'multi_turn'
      ? '每轮 3 分钟 · 整项任务累计 10 分钟（包含重试，不含排队与评分）'
      : '每题 3 分钟 · 完成后匿名评分';
  const available = modelState.models.filter((m) => m.ready && !m.hidden && !m.id.startsWith('mock:'));
  document.getElementById('judgeAvailability').textContent = usingAgent
    ? '开赛前检查裁判连接；连接失败会保留所选裁判并提示。'
    : !modelState.loaded
      ? '模型目录加载中…'
      : !available.length
        ? '暂无可连接的评分模型，请先配置接口。'
        : judgeChoice && modelState.selected.includes(judgeChoice)
          ? '按标准评分 · 额外调用 · 可能有自评偏差'
          : '按标准评分 · 额外调用 · 建议独立裁判';
}
judgeSource.onchange = () => {
  updateJudgeControls();
  rememberOptions();
};
function updateJudgeModels(state) {
  modelState = state;
  const available = state.models.filter((m) => m.ready && !m.hidden && !m.id.startsWith('mock:'));
  launchJudge.replaceChildren(new Option('请选择真实评分模型', ''));
  for (const model of available) launchJudge.add(new Option(model.name + (model.free ? ' · 免费' : ''), model.id));
  launchJudge.value = available.some((m) => m.id === judgeChoice) ? judgeChoice : '';
  if (state.loaded && !available.some((m) => m.id === judgeChoice)) judgeChoice = '';
  updateJudgeControls();
}
launchJudge.onchange = () => {
  judgeChoice = launchJudge.value;
  updateJudgeControls();
  rememberOptions();
};
const updateCount = () => {
  const count = Number(launchArena.selectedOptions[0]?.dataset.count || 0);
  document.getElementById('taskCountHint').textContent =
    `本库 ${count} 题 · 本场选 ${Number(launchLimit.value) || 0} 题`;
  for (const button of document.querySelectorAll('[data-question-limit]')) {
    const all = button.dataset.questionLimit === 'all',
      n = all ? count : Number(button.dataset.questionLimit);
    button.disabled = !count || n > count;
    button.setAttribute('aria-pressed', String(n === Number(launchLimit.value) && (all || n !== count)));
  }
};
const updateArena = () => {
  const option = launchArena.selectedOptions[0],
    count = Number(option?.dataset.count || 0);
  launchLimit.max = count;
  if (limitMode === 'all') launchLimit.value = count;
  if (Number(launchLimit.value) > count || Number(launchLimit.value) < 1) launchLimit.value = Math.min(5, count);
  document.getElementById('chosenArenaTitle').textContent = option?.dataset.title || '请选择题库';
  document.getElementById('chosenArenaMeta').textContent = option
    ? `${option.dataset.difficulty} · ${option.dataset.scoring}`
    : '';
  for (const button of quickChoices)
    button.setAttribute('aria-pressed', String(button.dataset.chooseArena === launchArena.value));
  updateCount();
  updateJudgeControls();
};
launchArena.hidden = true;
chooser.hidden = false;
updateArena();
launchArena.onchange = () => {
  updateArena();
  rememberOptions();
};
launchLimit.oninput = () => {
  limitMode = 'number';
  updateCount();
};
launchLimit.onchange = () => {
  updateArena();
  rememberOptions();
};
for (const button of document.querySelectorAll('[data-question-limit]'))
  button.onclick = () => {
    limitMode = button.dataset.questionLimit === 'all' ? 'all' : 'number';
    launchLimit.value = limitMode === 'all' ? launchLimit.max : button.dataset.questionLimit;
    updateCount();
    rememberOptions();
  };
quickSearch.oninput = () => {
  const terms = quickSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  for (const button of quickChoices) button.hidden = !terms.every((term) => button.dataset.search.includes(term));
  document.getElementById('quickArenaEmpty').hidden = quickChoices.some((button) => !button.hidden);
};
chooser.addEventListener('toggle', () => {
  if (chooser.open) quickSearch.focus({ preventScroll: true });
});
chooser.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    chooser.open = false;
    chooser.querySelector('summary').focus();
  }
});
document.addEventListener('click', (event) => {
  if (chooser.open && !chooser.contains(event.target)) chooser.open = false;
});
for (const button of document.querySelectorAll('[data-choose-arena]'))
  button.onclick = () => {
    if (button.disabled || ![...launchArena.options].some((o) => o.value === button.dataset.chooseArena)) return;
    launchArena.value = button.dataset.chooseArena;
    updateArena();
    rememberOptions();
    chooser.open = false;
    if (button.hasAttribute('data-quick-arena')) {
      chooser.querySelector('summary').focus({ preventScroll: true });
      return;
    }
    document.getElementById('arenaLibrary').open = false;
    document.getElementById('launchForm').scrollIntoView({ block: 'start', behavior: 'smooth' });
    chooser.querySelector('summary').focus({ preventScroll: true });
  };
document.querySelector('a[href="#arenaLibrary"]').onclick = () => {
  document.getElementById('arenaLibrary').open = true;
};
picker.subscribe(updateJudgeModels);
fetch('/api/agents')
  .then((r) => r.json())
  .then((agents) => {
    agentStatus = agents;
    const labels = { ready: '可连接', missing: '未安装', 'login-required': '待登录', error: '运行失败' };
    for (const agent of agents) {
      const option = [...judgeSource.options].find((o) => o.value === agent.id);
      option.textContent = agent.name + ' · ' + labels[agent.status];
      option.disabled = agent.status !== 'ready';
    }
    if (
      !preferences.judgeSource &&
      !agents.some((a) => a.id === 'codex' && a.status === 'ready') &&
      agents.some((a) => a.id === 'claude' && a.status === 'ready')
    )
      judgeSource.value = 'claude';
    updateJudgeControls();
  })
  .catch(() => {
    // 检测失败时不能一直显示"检测中"：标明失败，裁判选项保持不可用，API 评分不受影响
    for (const option of judgeSource.options)
      if (option.value !== 'api') {
        option.textContent = option.textContent.replace(/ · .*$/, '') + ' · 检测失败';
        option.disabled = true;
      }
    updateJudgeControls();
  });
const cards = [...document.querySelectorAll('.arena-card')];
const clearSearch = document.getElementById('clearSearch');
const judgeFilter = document.getElementById('arenaJudgeFilter');
const difficultyFilter = document.getElementById('arenaDifficultyFilter');
const filterArenas = () => {
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let visible = 0,
    tasks = 0;
  for (const card of cards) {
    const difficulty = difficultyFilter.value;
    card.hidden =
      !terms.every((term) => card.dataset.search.includes(term)) ||
      (judgeFilter.value && card.dataset.scoring !== judgeFilter.value) ||
      (difficulty &&
        (difficulty === 'unrated' ? Boolean(card.dataset.difficulty) : !card.dataset.difficulty.includes(difficulty)));
    if (!card.hidden) {
      visible++;
      tasks += Number(card.dataset.count);
    }
  }
  document.getElementById('arenaCount').textContent =
    `${visible} / ${cards.length} 个题库 · ${tasks.toLocaleString('zh-CN')} 题`;
  document.getElementById('arenaEmpty').hidden = visible !== 0 || cards.length === 0;
  clearSearch.hidden = search.value.length === 0;
};
const resetSearch = () => {
  search.value = '';
  judgeFilter.value = difficultyFilter.value = '';
  filterArenas();
  search.focus();
};
judgeFilter.onchange = difficultyFilter.onchange = filterArenas;
search.addEventListener('input', filterArenas);
search.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    resetSearch();
  }
});
clearSearch.addEventListener('click', resetSearch);
document.getElementById('resetSearch').addEventListener('click', resetSearch);
filterArenas();

// 表单通过原生校验后才锁定按钮；返回上一页时恢复，保留已填阵容。
for (const form of document.querySelectorAll('form[action]')) {
  form.addEventListener('submit', (event) => {
    if (
      form.id === 'launchForm' &&
      !judgeAgent.disabled &&
      !agentStatus.some((a) => a.id === judgeAgent.value && a.status === 'ready')
    ) {
      event.preventDefault();
      document.getElementById('judgeAvailability').textContent = '当前正式裁判不可连接，请登录后刷新或选择其他裁判。';
      return;
    }
    const judge = form.querySelector('select[name="judge"]');
    if (judge && !judge.disabled && !judge.value) {
      event.preventDefault();
      judge.reportValidity();
      return;
    }
    if (!picker.validate()) {
      event.preventDefault();
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.dataset.label = button.innerHTML;
    button.dataset.submitting = 'true';
    button.disabled = true;
    button.textContent = '正在进入…';
  });
}
window.addEventListener('pageshow', () => {
  for (const button of document.querySelectorAll('button[data-label]')) {
    button.innerHTML = button.dataset.label;
    delete button.dataset.submitting;
    button.disabled = false;
  }
  filterArenas();
  picker.sync();
});
