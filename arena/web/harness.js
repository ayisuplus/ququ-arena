import { installExtensionAuthor } from './extension-author.js';
const $ = (id) => document.getElementById(id);
const node = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const number = (x) => (x == null ? '未报告' : Math.round(x).toLocaleString());
const pct = (x) => (x == null ? '待完成' : (x * 100).toFixed(1) + '%');
const signed = (x, suffix = '') => (x == null ? '—' : (x > 0 ? '+' : '') + x.toFixed(1) + suffix);
const labels = {
  queued: '等待',
  preparing: '准备',
  running: '执行中',
  grading: '评分中',
  completed: '完成',
  pending_grading: '待评分',
  failed: '失败',
  cancelled: '中止',
  interrupted: '中断',
};
let catalog,
  models = [],
  current,
  selectedTrial,
  manualTrial = false,
  loading = false,
  busy = false;
let draftNative = [],
  nativeRevision = 0;
const selectedTasks = new Set(),
  selectedProfiles = new Set();
function notice(text) {
  $('harnessNotice').textContent = text;
  $('harnessNotice').hidden = !text;
}
async function api(path, body) {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: 'no-store' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}
const bench = () => catalog?.benchmarks.find((b) => b.id === $('harnessBenchmark').value);
function plan() {
  $('harnessTaskCount').textContent = `已选 ${selectedTasks.size} / ${bench()?.tasks.length ?? 0}`;
  const total = selectedTasks.size * (selectedProfiles.size + 1) * Number($('harnessRepeats').value);
  $('harnessPlanSize').textContent =
    `${selectedTasks.size} 题 × ${selectedProfiles.size + 1} 配置 × ${$('harnessRepeats').value} 次 = ${total} 个试验`;
  $('harnessBudgetBrief').textContent =
    `${$('harnessMinutes').value} 分钟 · ${$('harnessCalls').value} 次调用 · 重复 ${$('harnessRepeats').value} 次`;
  $('startHarness').disabled =
    busy || !catalog || !selectedTasks.size || !selectedProfiles.size || !$('harnessModel').value || total > 120;
}
function tasks() {
  const b = bench();
  $('harnessTasks').replaceChildren();
  for (const t of b?.tasks ?? []) {
    const label = node('label'),
      input = node('input');
    input.type = 'checkbox';
    input.checked = selectedTasks.has(t.id);
    input.dataset.task = t.id;
    input.onchange = () => {
      input.checked ? selectedTasks.add(t.id) : selectedTasks.delete(t.id);
      plan();
    };
    label.append(input, node('span', t.title));
    $('harnessTasks').append(label);
  }
  $('harnessJudgeField').hidden = !b?.judgeRequired;
  plan();
}
function profiles() {
  $('harnessProfiles').replaceChildren();
  const seen = new Set();
  for (const p of catalog.profiles
    .filter((p) => p.id !== 'baseline')
    .sort((a, b) => Number(!!b.nativeExtensions?.length) - Number(!!a.nativeExtensions?.length))) {
    const label = node('label', undefined, 'variant-card'),
      input = node('input');
    input.type = 'checkbox';
    input.checked = selectedProfiles.has(p.id);
    input.dataset.profile = p.id;
    const detail = node('div');
    detail.append(
      node('b', p.name),
      node(
        'small',
        [
          ...(p.nativeExtensions ?? []).map((e) => `${e.name} v${e.version}`),
          ...p.extensions.map((e) => `${e.title} v${e.version}`),
        ].join(' + ') || '无扩展',
      ),
    );
    detail.append(node('span', p.nativeExtensions?.length ? 'PI 原生扩展' : '提示词阶段', 'extension-kind'));
    if (p.nativeExtensions?.length && !catalog.nativeRuntime?.ready) {
      input.disabled = true;
      input.checked = false;
      selectedProfiles.delete(p.id);
      detail.append(node('small', '原生扩展环境未就绪'));
    }
    input.onchange = () => {
      input.checked ? selectedProfiles.add(p.id) : selectedProfiles.delete(p.id);
      plan();
    };
    const actions = node('span', undefined, 'profile-actions'),
      edit = node('button', '派生'),
      exp = node('button', '导出');
    edit.type = exp.type = 'button';
    edit.onclick = (e) => {
      e.preventDefault();
      openProfile(p);
    };
    exp.onclick = (e) => {
      e.preventDefault();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify({ format: 'pi-harness-profile/v2', piVersion: '0.85.1', profile: p }, null, 2)], {
          type: 'application/json',
        }),
      );
      const link = node('a');
      link.href = url;
      link.download = 'harness-profile.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    actions.append(edit, exp);
    label.append(input, detail, actions);
    $('harnessProfiles').append(label);
    seen.add(p.id);
  }
  for (const id of selectedProfiles) if (!seen.has(id)) selectedProfiles.delete(id);
  plan();
}
async function loadCatalog() {
  [catalog, { models }] = await Promise.all([api('/api/harness/catalog'), api('/api/models')]);
  const model = $('harnessModel').value,
    judge = $('harnessJudge').value,
    benchmark = $('harnessBenchmark').value;
  for (const select of [$('harnessModel'), $('harnessJudge')]) {
    select.replaceChildren(new Option('选择已配置的模型', ''));
    for (const m of models.filter((m) => m.ready && !m.hidden)) select.add(new Option(m.name, m.id));
  }
  $('harnessModel').value = model;
  $('harnessJudge').value = judge;
  $('harnessBenchmark').replaceChildren(
    ...catalog.benchmarks.map((b) => new Option(`${b.title} · ${b.tasks.length} 题`, b.id)),
  );
  if (catalog.benchmarks.some((b) => b.id === benchmark)) $('harnessBenchmark').value = benchmark;
  if (!selectedTasks.size) for (const t of bench().tasks.slice(0, 2)) selectedTasks.add(t.id);
  if (!selectedProfiles.size)
    selectedProfiles.add(
      catalog.profiles.find((p) =>
        catalog.nativeRuntime?.ready ? p.nativeExtensions?.length : p.extensions.length === 1,
      )?.id,
    );
  $('nativeRuntimeStatus').textContent = catalog.nativeRuntime?.ready
    ? `pi ${catalog.nativeRuntime.version} · 原生扩展环境可用`
    : '原生扩展环境未就绪 · 提示词阶段仍可使用';
  $('newHarnessProfile').disabled = false;
  $('importHarnessProfile').disabled = false;
  tasks();
  profiles();
}
$('harnessBenchmark').onchange = () => {
  selectedTasks.clear();
  for (const t of bench().tasks.slice(0, 2)) selectedTasks.add(t.id);
  $('harnessMinutes').value = bench().mode === 'code' ? '10' : '3';
  tasks();
};
$('harnessAllTasks').onclick = () => {
  for (const t of bench().tasks) selectedTasks.add(t.id);
  tasks();
};
$('harnessClearTasks').onclick = () => {
  selectedTasks.clear();
  tasks();
};
for (const id of ['harnessModel', 'harnessMinutes', 'harnessRepeats', 'harnessCalls', 'harnessTokens'])
  $(id).addEventListener('change', plan);
$('harnessForm').onsubmit = async (e) => {
  e.preventDefault();
  if (busy) return;
  busy = true;
  notice('');
  plan();
  try {
    const run = await api('/api/harness/runs', {
      model: $('harnessModel').value,
      benchmark: bench().id,
      tasks: [...selectedTasks],
      profiles: [...selectedProfiles],
      repeats: Number($('harnessRepeats').value),
      split: $('harnessSplit').value,
      judge: $('harnessJudge').value || undefined,
      budget: {
        timeMs: Number($('harnessMinutes').value) * 60000,
        maxCalls: Number($('harnessCalls').value),
        maxOutputTokens: Number($('harnessTokens').value),
      },
    });
    history.pushState(null, '', '/harness?run=' + run.id);
    current = run;
    selectedTrial = undefined;
    manualTrial = false;
    await renderRun(run);
  } catch (e) {
    notice(e.message + '。若请求中断，请先检查实验记录，避免重复启动。');
  } finally {
    busy = false;
    plan();
  }
};
function showRun() {
  $('harnessSetup').hidden = true;
  $('harnessRecords').hidden = true;
  $('harnessRun').hidden = false;
}
async function renderRun(run) {
  current = run;
  showRun();
  $('harnessRunTitle').textContent = run.benchmark.title;
  $('harnessRunMeta').textContent =
    `${run.protocol.model.name} · pi-agent ${run.protocol.piVersion} · ${run.protocol.split === 'development' ? '开发集' : '保留集'} · ${labels[run.status]} · ${run.trials.filter((t) => !['queued', 'running', 'grading', 'preparing'].includes(t.status)).length}/${run.trials.length}`;
  $('cancelHarness').hidden = !['running', 'grading'].includes(run.status);
  $('retryHarnessGrading').hidden =
    ['running', 'grading'].includes(run.status) || !run.trials.some((t) => t.status === 'pending_grading');
  $('exportHarness').href = `/api/harness/runs/${run.id}/export`;
  const table = node('table'),
    header = node('tr');
  for (const t of ['配置', '质量', '相对基线', '平均执行耗时', '模型调用 / Token', '缓存命中'])
    header.append(node('th', t));
  table.append(header);
  for (const s of run.summary) {
    const row = node('tr'),
      name = node('td', s.name);
    name.append(node('small', `${s.completed}/${s.planned} 完成 · ${s.failures} 失败 · ${s.pending} 待评分`));
    row.append(name, node('td', pct(s.score)));
    const delta = node(
      'td',
      s.id === 'baseline' ? '基线' : signed(s.delta == null ? null : s.delta * 100, ' pp'),
      s.delta > 0 ? 'delta-positive' : s.delta < 0 ? 'delta-negative' : '',
    );
    if (s.id !== 'baseline')
      delta.append(
        node(
          'small',
          s.interval
            ? `探索性 95% 区间 [${(s.interval[0] * 100).toFixed(1)}, ${(s.interval[1] * 100).toFixed(1)}] · ${s.independentTasks} 题`
            : '独立任务不足或试验未完成',
        ),
      );
    row.append(delta);
    const time = node('td', s.elapsedMs == null ? '—' : (s.elapsedMs / 1000).toFixed(1) + ' s');
    if (s.id !== 'baseline')
      time.append(node('small', signed(s.timeDeltaMs == null ? null : s.timeDeltaMs / 1000, ' s')));
    row.append(time);
    const tokens = node('td', `${s.usage.calls} 次 / ${s.usage.complete ? '' : '已知 ≥ '}${number(s.usage.total)}`);
    tokens.append(
      node(
        'small',
        `${s.usage.knownCalls}/${s.usage.calls} 次返回用量` +
          (s.tokenDelta == null || s.id === 'baseline' ? '' : ` · Δ ${signed(s.tokenDelta)}`),
      ),
    );
    if (s.judgeCalls.length)
      tokens.append(
        node(
          'small',
          `另计评分 ${s.judgeCalls.length} 次 / 已知 ${number(s.judgeCalls.reduce((n, c) => n + (c.usage?.input ?? 0) + (c.usage?.output ?? 0), 0))} Token`,
        ),
      );
    row.append(tokens);
    const cache = node('td', s.usage.cacheRate == null ? '未报告' : pct(s.usage.cacheRate));
    cache.append(node('small', `${s.usage.cacheKnownCalls}/${s.usage.calls} 次有缓存字段`));
    row.append(cache);
    table.append(row);
  }
  $('harnessSummary').replaceChildren(table);
  $('harnessProtocol').textContent = JSON.stringify(
    { ...run.protocol, profiles: run.profiles, interpretation: run.summary[0]?.note },
    null,
    2,
  );
  const paired = node('table'),
    heading = node('tr');
  heading.append(node('th', '任务'));
  for (const s of run.summary) heading.append(node('th', s.name));
  paired.append(heading);
  for (const task of run.benchmark.tasks) {
    const row = node('tr');
    row.append(node('td', task.title));
    for (const s of run.summary) {
      const result = s.tasks.find((t) => t.id === task.id),
        cell = node('td', pct(result?.score));
      if (s.id !== 'baseline')
        cell.append(node('small', signed(result?.delta == null ? null : result.delta * 100, ' pp')));
      row.append(cell);
    }
    paired.append(row);
  }
  $('harnessTaskComparison').replaceChildren(paired);
  if (!manualTrial || !run.trials.some((t) => t.id === selectedTrial))
    selectedTrial =
      run.trials.find((t) => ['running', 'grading', 'preparing'].includes(t.status))?.id ??
      selectedTrial ??
      run.trials[0]?.id;
  const list = $('harnessTrials'),
    scroll = list.scrollTop;
  list.className = 'harness-trial-list';
  list.replaceChildren();
  for (const t of run.trials) {
    const button = node('button', run.profiles.find((p) => p.id === t.profileId)?.name, 'harness-trial-row');
    button.setAttribute('aria-current', String(t.id === selectedTrial));
    button.dataset.trial = t.id;
    button.append(
      node('small', `${t.taskId} · 第 ${t.repeat} 次`),
      node('small', labels[t.status] + (t.score == null ? '' : ' · ' + pct(t.score))),
    );
    button.onclick = () => {
      manualTrial = true;
      selectedTrial = t.id;
      void renderRun(current);
    };
    list.append(button);
  }
  list.scrollTop = scroll;
  if (selectedTrial) {
    const requested = selectedTrial,
      trial = await api(`/api/harness/runs/${run.id}/trials/${requested}`);
    if (current.id === run.id && selectedTrial === requested) renderTrial(trial);
  }
}
let renderedTrial = '';
function renderTrial(t) {
  const container = $('harnessTrial'),
    key = current.id + '/' + t.id,
    same = key === renderedTrial;
  const positions = same
    ? new Map([...container.querySelectorAll('pre')].map((e) => [e.dataset.key, e.scrollTop]))
    : new Map();
  const opens = same ? new Set([...container.querySelectorAll('details[open]')].map((e) => e.dataset.key)) : new Set();
  const pre = (value, key) => {
    const p = node('pre', value);
    p.dataset.key = key;
    return p;
  };
  const fragment = document.createDocumentFragment();
  $('harnessTrialTitle').textContent = `${t.taskId} · ${labels[t.status]}`;
  $('exportHarnessTrial').hidden = false;
  $('exportHarnessTrial').href = `/api/harness/runs/${current.id}/trials/${t.id}`;
  if (t.error) fragment.append(node('p', t.error, 'delta-negative'));
  for (const r of t.rounds) {
    fragment.append(node('h4', r.title), pre(r.answer, 'answer-' + r.roundId));
  }
  if (t.checks) fragment.append(node('p', t.checks.map((c) => `${c.passed ? '✓' : '×'} ${c.title}`).join(' · ')));
  if (t.grade) fragment.append(pre(JSON.stringify(t.grade, null, 2), 'grade'));
  if (t.judgeCalls?.length) {
    const d = node('details');
    d.dataset.key = 'judge-usage';
    d.open = opens.has(d.dataset.key);
    d.append(node('summary', '独立评分调用用量'), pre(JSON.stringify(t.judgeCalls, null, 2), 'judge-usage'));
    fragment.append(d);
  }
  if (t.patch) fragment.append(node('h4', '交付补丁'), pre(t.patch, 'patch'));
  for (const [name, content] of Object.entries(t.logs ?? {})) {
    const d = node('details');
    d.dataset.key = name;
    d.open = opens.has(name);
    d.append(node('summary', name), pre(content, name));
    fragment.append(d);
  }
  fragment.append(node('h4', `调用轨迹 · ${t.calls.length} 次`));
  for (const c of t.calls) {
    const d = node('details', undefined, 'harness-call');
    d.dataset.key = 'call-' + c.number;
    d.open = opens.has(d.dataset.key) || (!same && c.number === t.calls.length);
    d.append(
      node(
        'summary',
        `#${c.number} · ${c.round} · ${{ plan: '先规划', solve: '执行', review: '复核' }[c.phase] ?? c.phase} · ${c.status} · ${c.elapsedMs == null ? '进行中' : (c.elapsedMs / 1000).toFixed(1) + 's'}`,
      ),
    );
    d.append(
      node(
        'p',
        c.usage
          ? `输入 ${number(c.usage.input)} · 输出 ${number(c.usage.output)} · 缓存 ${number(c.usage.cachedInput)}`
          : '供应商未报告用量',
        'muted',
      ),
    );
    d.append(
      node(
        'p',
        `接口报告模型：${c.reportedModel || '未报告'}${c.reportedProvider ? ' · ' + c.reportedProvider : ''}`,
        'muted',
      ),
    );
    d.append(
      pre(c.text || '尚未提供答案', 'text-' + c.number),
      pre(c.reasoning || '未提供公开推理', 'reasoning-' + c.number),
    );
    if (c.error) d.append(node('p', c.error));
    fragment.append(d);
  }
  const trace = node('details');
  trace.dataset.key = 'tools';
  trace.open = opens.has('tools');
  trace.append(
    node('summary', '工具与状态事件'),
    pre(t.events.map((e) => `${e.at} [${e.kind}] ${e.text}`).join('\n'), 'tools'),
  );
  fragment.append(trace);
  container.replaceChildren(fragment);
  for (const e of container.querySelectorAll('pre')) e.scrollTop = positions.get(e.dataset.key) ?? 0;
  renderedTrial = key;
}
async function records() {
  $('harnessSetup').hidden = true;
  $('harnessRun').hidden = true;
  $('harnessRecords').hidden = false;
  const rows = await api('/api/harness/runs');
  $('harnessRunsList').replaceChildren();
  for (const r of rows) {
    const card = node('article', undefined, 'harness-panel harness-record'),
      info = node('div');
    info.append(
      node('h3', r.title),
      node(
        'p',
        `${r.model} · ${r.split === 'development' ? '开发集' : '保留集'} · ${new Date(r.createdAt).toLocaleString()}`,
      ),
      node('p', `${labels[r.status]} · ${r.summary.map((s) => `${s.name} ${pct(s.score)}`).join(' / ')}`),
    );
    const link = node('a', '查看配对结果与轨迹 ↗');
    link.href = '/harness?run=' + r.id;
    card.append(info, link);
    $('harnessRunsList').append(card);
  }
  if (!rows.length)
    $('harnessRunsList').append(node('p', '还没有 Harness 实验。选择同一个模型，先跑一次基础配置与扩展配置。'));
}
$('refreshHarnessRuns').onclick = () => records().catch((e) => notice(e.message));
$('cancelHarness').onclick = async () => {
  $('cancelHarness').disabled = true;
  try {
    await api(`/api/harness/runs/${current.id}/cancel`, {});
    await refresh();
  } catch (e) {
    notice(e.message);
  } finally {
    $('cancelHarness').disabled = false;
  }
};
$('retryHarnessGrading').onclick = async () => {
  $('retryHarnessGrading').disabled = true;
  try {
    await api(`/api/harness/runs/${current.id}/retry-grading`, {});
    await refresh();
  } catch (e) {
    notice(e.message);
  } finally {
    $('retryHarnessGrading').disabled = false;
  }
};
function openProfile(profile) {
  if (!catalog) {
    notice('配置目录正在加载，请稍后重试。');
    return;
  }
  $('harnessProfileForm').reset();
  $('harnessProfileError').textContent = '';
  $('harnessExtensionFields').replaceChildren();
  draftNative = structuredClone(profile?.nativeExtensions ?? []);
  nativeRevision++;
  renderNativePackages();
  $('nativeInspection').textContent = '检查将在独立容器加载扩展，不调用参赛模型。';
  $('nativeTemplate').replaceChildren(...(catalog.nativeTemplates ?? []).map((t, i) => new Option(t.title, String(i))));
  $('harnessProfileForm').querySelector('.legacy-stages').open = !!profile?.extensions.length;
  if (profile) $('harnessProfileName').value = profile.name.slice(0, 53) + ' · 新版本';
  for (const e of catalog.extensions) {
    const source = profile?.extensions.find((x) => x.id === e.id);
    const label = node('label', undefined, 'harness-toggle'),
      checkbox = node('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'extension';
    checkbox.value = e.id;
    checkbox.checked = !!source;
    label.append(checkbox, node('b', e.title));
    const text = node('textarea');
    text.dataset.extension = e.id;
    text.value = source?.prompt ?? e.prompt;
    text.maxLength = 4000;
    text.setAttribute('aria-label', e.title + '提示');
    $('harnessExtensionFields').append(label, text);
  }
  if (!$('harnessProfileDialog').open) $('harnessProfileDialog').showModal();
}
function nativeEdited() {
  nativeRevision++;
  $('nativeInspection').textContent = '内容已修改，需要重新检查。保存时会重新验证。';
}
function renderNativePackages() {
  const list = $('nativePackages');
  list.replaceChildren();
  if (!draftNative.length) list.append(node('p', '从示例开始，或导入自己的 pi 扩展源码。', 'muted'));
  draftNative.forEach((p, index) => {
    const card = node('article', undefined, 'native-package'),
      heading = node('div', undefined, 'native-package-heading');
    let manifest;
    try {
      manifest = JSON.parse(p.files?.['package.json'] ?? '{}');
    } catch {
      manifest = {};
    }
    heading.append(node('b', `${index + 1}. ${manifest.name || '待命名扩展'} · ${manifest.version || '待填写版本'}`));
    const action = (text, fn, disabled = false) => {
      const b = node('button', text);
      b.type = 'button';
      b.disabled = disabled;
      b.onclick = fn;
      heading.append(b);
    };
    if (author)
      action('让 Codex 修改', () => {
        const enabled = [...document.querySelectorAll('input[name=extension]:checked')].map((e) => e.value);
        authorProfile = {
          index,
          name: $('harnessProfileName').value,
          nativeExtensions: structuredClone(draftNative),
          extensions: catalog.extensions
            .filter((e) => enabled.includes(e.id))
            .map((e) => ({ ...e, prompt: document.querySelector('[data-extension="' + e.id + '"]').value })),
        };
        $('harnessProfileDialog').close();
        void author.open(p, manifest.name);
      });
    action(
      '上移',
      () => {
        [draftNative[index - 1], draftNative[index]] = [p, draftNative[index - 1]];
        nativeEdited();
        renderNativePackages();
      },
      index === 0,
    );
    action('移除', () => {
      draftNative.splice(index, 1);
      nativeEdited();
      renderNativePackages();
    });
    card.append(heading);
    card.append(
      node(
        'small',
        `入口：${(Array.isArray(manifest.pi?.extensions) ? manifest.pi.extensions : []).join('、') || '未声明'}${p.digest ? ' · 内容指纹 ' + p.digest.slice(0, 12) : ' · 尚未验证'}`,
      ),
    );
    if (p.capabilities) {
      card.append(
        node(
          'p',
          `工具：${p.capabilities.tools.map((t) => t.name).join('、') || '无'} · 事件：${p.capabilities.events.join('、') || '无'}`,
          'native-capabilities',
        ),
      );
      for (const f of p.capabilities.flags) {
        const label = node('label', f.description || f.name),
          input = node('input');
        label.append(node('small', '--' + f.name));
        input.type = f.type === 'boolean' ? 'checkbox' : 'text';
        input.setAttribute('aria-label', '扩展参数 ' + f.name);
        input.dataset.nativeFlag = f.name;
        if (f.type === 'boolean') input.checked = p.flags?.[f.name] ?? f.default ?? false;
        else input.value = p.flags?.[f.name] ?? f.default ?? '';
        input.onchange = () => {
          p.flags ??= {};
          p.flags[f.name] = f.type === 'boolean' ? input.checked : input.value;
          delete p.digest;
          nativeEdited();
        };
        label.append(input);
        card.append(label);
      }
    }
    const sources = node('details');
    sources.append(node('summary', `查看 / 编辑源码 · ${Object.keys(p.files ?? {}).length} 个文件`));
    for (const [file, source] of Object.entries(p.files ?? {})) {
      const label = node('label', file),
        editor = node('textarea');
      editor.value = source;
      editor.maxLength = 128000;
      editor.spellcheck = false;
      editor.dataset.nativeFile = file;
      editor.setAttribute('aria-label', '扩展源文件 ' + file);
      editor.oninput = () => {
        p.files[file] = editor.value;
        delete p.digest;
        delete p.capabilities;
        nativeEdited();
      };
      label.append(editor);
      sources.append(label);
    }
    card.append(sources);
    list.append(card);
  });
  $('inspectNativePackages').disabled = !draftNative.length;
}
$('addNativeTemplate').onclick = () => {
  const t = catalog.nativeTemplates[Number($('nativeTemplate').value)];
  if (!t) return;
  if (draftNative.length >= 4) {
    $('harnessProfileError').textContent = '每个配置最多 4 个原生扩展';
    return;
  }
  draftNative.push(structuredClone(t.package));
  nativeEdited();
  renderNativePackages();
};
$('inspectNativePackages').onclick = async () => {
  const revision = nativeRevision,
    button = $('inspectNativePackages');
  button.disabled = true;
  $('nativeInspection').textContent = '正在独立容器中加载扩展并检查注册项…';
  try {
    const data = await api('/api/harness/profiles/inspect', { nativeExtensions: draftNative });
    if (revision !== nativeRevision) {
      $('nativeInspection').textContent = '检查期间内容已修改，请重新检查当前版本。';
      return;
    }
    draftNative = data.nativeExtensions;
    renderNativePackages();
    $('nativeInspection').textContent = '加载检查通过 · 已列出实际工具、事件和参数。运行时错误仍会单独记录。';
  } catch (e) {
    $('nativeInspection').textContent = '检查失败：' + e.message;
  } finally {
    button.disabled = !draftNative.length;
  }
};
$('importNativeDirectory').onclick = () => $('nativeDirectoryFiles').click();
$('nativeDirectoryFiles').onchange = async () => {
  try {
    const files = [...$('nativeDirectoryFiles').files];
    if (!files.length) return;
    if (draftNative.length >= 4 || files.length > 32 || files.reduce((n, f) => n + f.size, 0) > 256000)
      throw new Error('目录最多 32 个文件、256KB；每个配置最多 4 个扩展');
    const contents = Object.fromEntries(
      await Promise.all(files.map(async (f) => [f.webkitRelativePath.split('/').slice(1).join('/'), await f.text()])),
    );
    if (!contents['package.json']) throw new Error('请选择 package.json 所在的扩展根目录');
    draftNative.push({ files: contents, flags: {} });
    nativeEdited();
    renderNativePackages();
  } catch (e) {
    $('harnessProfileError').textContent = e.message;
  } finally {
    $('nativeDirectoryFiles').value = '';
  }
};
$('newHarnessProfile').onclick = () => openProfile();
$('newHarnessProfile').disabled = true;
$('importHarnessProfile').disabled = true;
$('importHarnessProfile').onclick = () => $('harnessProfileFile').click();
$('harnessProfileFile').onchange = async () => {
  try {
    const file = $('harnessProfileFile').files[0];
    if (!file) return;
    if (file.size > 700000) throw new Error('配置文件超过 700KB');
    const text = await file.text();
    if (/\.(ts|m?js)$/.test(file.name)) {
      const name =
        file.name
          .replace(/\.(ts|m?js)$/, '')
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-') || 'my-extension';
      openProfile({
        name: file.name.slice(0, 50),
        extensions: [],
        nativeExtensions: [
          {
            files: {
              'package.json': JSON.stringify(
                {
                  name: /^[a-z0-9]/.test(name) ? name : 'my-extension',
                  version: '1.0.0',
                  pi: { extensions: ['./index.ts'] },
                },
                null,
                2,
              ),
              'index.ts': text,
            },
            flags: {},
          },
        ],
      });
    } else {
      const value = JSON.parse(text),
        p = value.profile;
      if (
        !['pi-harness-profile/v1', 'pi-harness-profile/v2'].includes(value.format) ||
        !p ||
        typeof p.name !== 'string' ||
        !p.name.trim() ||
        p.name.length > 60 ||
        !Array.isArray(p.extensions) ||
        (!p.extensions.length && !p.nativeExtensions?.length) ||
        p.extensions.some(
          (e) =>
            !catalog.extensions.some((x) => x.id === e.id) ||
            typeof e.prompt !== 'string' ||
            !e.prompt.trim() ||
            e.prompt.length > 4000,
        ) ||
        new Set(p.extensions.map((e) => e.id)).size !== p.extensions.length ||
        (p.nativeExtensions !== undefined && !Array.isArray(p.nativeExtensions))
      )
        throw new Error('需要本台导出的配置 JSON；pi 包请使用“导入扩展目录”');
      if (value.piVersion && value.piVersion !== catalog.nativeRuntime?.version)
        throw new Error('配置的 pi 版本与本机不同，请先核对版本再迁移');
      openProfile(p);
    }
  } catch (e) {
    notice(e.message);
  } finally {
    $('harnessProfileFile').value = '';
  }
};
$('closeHarnessProfile').onclick = () => $('harnessProfileDialog').close();
$('harnessProfileForm').onsubmit = async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  try {
    const extensions = [...document.querySelectorAll('input[name=extension]:checked')].map((e) => e.value),
      prompts = Object.fromEntries(
        [...document.querySelectorAll('[data-extension]')].map((e) => [e.dataset.extension, e.value]),
      );
    const revision = nativeRevision;
    const p = await api('/api/harness/profiles', {
      name: $('harnessProfileName').value,
      extensions,
      prompts,
      nativeExtensions: draftNative,
    });
    catalog.profiles.push(p);
    selectedProfiles.clear();
    selectedProfiles.add(p.id);
    profiles();
    if (revision === nativeRevision) $('harnessProfileDialog').close();
    else $('harnessProfileError').textContent = '已保存提交时的版本；随后编辑的内容尚未保存。';
  } catch (error) {
    $('harnessProfileError').textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
async function refresh() {
  if (loading) return;
  const id = new URLSearchParams(location.search).get('run');
  if (!id) return;
  loading = true;
  try {
    await renderRun(await api('/api/harness/runs/' + id));
  } catch (e) {
    notice(e.message);
  } finally {
    loading = false;
  }
}
async function init() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('run')) await refresh();
    else if (params.get('view') === 'runs') await records();
    else await loadCatalog();
  } catch (e) {
    notice(e.message);
  }
}
window.addEventListener('popstate', () => location.reload());
setInterval(() => {
  if (current && ['running', 'grading'].includes(current.status)) void refresh();
}, 1500);
let authorProfile;
// Hosted browser assets can update before the local executor supplies the new dialog HTML.
const author = $('extensionAuthorDialog')
  ? installExtensionAuthor(api, async (p, name) => {
      if (!catalog) await loadCatalog();
      const profile = authorProfile || { name, extensions: [], nativeExtensions: [p] };
      if (authorProfile) profile.nativeExtensions[authorProfile.index] = p;
      openProfile(profile);
      $('harnessProfileName').value = profile.name || name;
      authorProfile = undefined;
    })
  : undefined;
if (author)
  $('createWithCodex').onclick = () => {
    authorProfile = undefined;
    void author.open();
  };
void init();
