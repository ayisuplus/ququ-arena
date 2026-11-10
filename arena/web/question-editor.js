import { newRounds, rubricEditor, roundsEditor } from './task-editor.js';
const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s],
  );
const clone = (value) => structuredClone(value);
const newQuestion = () => ({
  id: `q-${crypto.randomUUID()}`,
  condition: 'general',
  input: '',
  ...(doc?.def.mode === 'multi_turn' ? { rounds: newRounds() } : {}),
});
const taskDefaults = JSON.parse($('taskDefaults').textContent);
let updateRoundPreview;
let name = new URLSearchParams(location.search).get('arena'),
  doc,
  selected = '',
  saved = '',
  saving = false,
  removed;
const task = () => doc?.tasks.find((t) => t.id === selected);
const signature = () => JSON.stringify({ def: doc.def, tasks: doc.tasks });
const dirty = () => doc && signature() !== saved;
const effectiveRule = () => task()?.judge ?? doc.def.judge;
const needsTarget = (r) =>
  ['exact', 'llm'].includes(r.kind) ||
  (r.kind === 'not' ? needsTarget(r.judge) : ['all', 'any'].includes(r.kind) && r.judges.some(needsTarget));
const ruleName = (rule) =>
  ({
    exact: '完整答案匹配',
    llm: '按标准评分',
    rubric: '匿名多维评审',
    contains: '关键词匹配',
    regex: '表达式匹配',
    all: '组合评分 · 全部条件',
    any: '组合评分 · 任一条件',
    not: '反向评分',
  })[rule.kind];

function message(text, success = false) {
  $('editorMessage').textContent = text;
  $('editorMessage').hidden = !text;
  $('editorMessage').dataset.success = String(success);
}
function confirmEdit(title, explanation, action, label) {
  const dialog = $('editorConfirm');
  $('confirmTitle').textContent = title;
  $('confirmMessage').textContent = explanation;
  $('confirmSubmit').textContent = label;
  dialog.returnValue = '';
  dialog.onclose = () => {
    if (dialog.returnValue === 'confirm') action();
  };
  dialog.showModal();
}
function changed() {
  $('saveState').textContent = saving ? '正在保存…' : dirty() ? '有未保存的修改' : '已保存到本机';
  $('saveState').dataset.dirty = String(!!dirty());
  $('saveBank').disabled = saving || !dirty();
  $('editorTitle').textContent = doc.def.title || '新建题库';
  $('bankSummary').textContent =
    `${doc.def.review?.blockedReason ? '暂停对战' : '已开放'} · 默认${ruleName(doc.def.judge)} · ${doc.tasks.length} 道题`;
  $('bankPauseField').hidden = !doc.def.review?.blockedReason;
  preview();
}
function review() {
  doc.def.review ??= { date: new Date().toISOString().slice(0, 10) };
  return doc.def.review;
}
function setPause(id, enabled, reason) {
  const r = review();
  r.date = new Date().toISOString().slice(0, 10);
  if (id) {
    const excluded = { ...r.excluded };
    if (enabled) delete excluded[id];
    else excluded[id] = reason.trim() || '等待人工修订';
    if (Object.keys(excluded).length) r.excluded = excluded;
    else delete r.excluded;
  } else if (enabled) delete r.blockedReason;
  else r.blockedReason = reason.trim() || '等待人工修订';
}
function preview() {
  const t = task();
  if (!t) return;
  updateRoundPreview?.();
  $('fullPrompt').textContent =
    `${doc.def.taskPrefix ?? ''}${doc.def.conditionPrefix?.[t.condition] ?? ''}${t.input}` ||
    '填写题目后，这里会显示完整内容。';
  $('targetHint').textContent = needsTarget(effectiveRule()) ? '必填' : '可选；此规则按自身条件判分';
  $('conditionSummary').textContent = doc.def.conditions?.[t.condition] || t.condition;
  $('questionAvailability').textContent = doc.def.review?.blockedReason
    ? '整库已暂停；请在题库设置中开放'
    : doc.def.review?.excluded?.[t.id]
      ? '本题已暂停，可修改后重新启用'
      : '保存后纳入下一场比赛';
}
function list() {
  const query = $('questionSearch').value.trim().toLowerCase();
  const shown = doc.tasks.filter((t) =>
    `${t.id} ${t.input} ${t.target ?? ''} ${t.condition}`.toLowerCase().includes(query),
  );
  const available = doc.def.review?.blockedReason
    ? 0
    : doc.tasks.filter((t) => !Object.hasOwn(doc.def.review?.excluded ?? {}, t.id)).length;
  $('questionCount').textContent = `${doc.tasks.length} 题 · ${available} 题可用`;
  $('questionList').innerHTML =
    shown
      .map((t) => {
        const paused = !!doc.def.review?.blockedReason || Object.hasOwn(doc.def.review?.excluded ?? {}, t.id);
        return `<button type="button" class="question-item" data-id="${escape(t.id)}" aria-current="${t.id === selected}"><span class="ordinal">${String(doc.tasks.indexOf(t) + 1).padStart(2, '0')}</span><span class="item-content"><strong>${escape(t.input.trim().slice(0, 160) || '未填写题目')}</strong><small class="${paused ? 'paused' : ''}">${paused ? '暂停' : '可用'} · ${escape(doc.def.conditions?.[t.condition] || t.condition)}</small></span></button>`;
      })
      .join('') || '<p class="empty-list">没有匹配的题目。可清除搜索或添加题目。</p>';
  $('undoDelete').hidden = !removed;
}
function describe(rule) {
  switch (rule.kind) {
    case 'exact':
      return `完整答案匹配：去空白、全角英数与圈码数字标准化后比对。${rule.trimPunct === false ? '保留首尾标点。' : '忽略首尾标点（纯标点答案除外）。'}${rule.ignoreCase ? '忽略英文字母大小写。' : '区分英文字母大小写。'}${rule.alternatives?.length ? '\n可接受答案：\n' + rule.alternatives.join('\n') : ''}`;
    case 'llm':
      return `模型裁判按 0–${rule.scale ?? 10} 分评分。\n${rule.rubric}`;
    case 'contains':
      return '必须包含全部关键词：\n' + rule.keywords.join('\n');
    case 'regex':
      return '区分大小写，多行匹配：\n' + rule.pattern;
    case 'all':
    case 'any':
      return (
        (rule.kind === 'all' ? '取全部条件的最低分：' : '取全部条件的最高分：') +
        '\n' +
        rule.judges.map((j, i) => `${i + 1}. ${describe(j)}`).join('\n')
      );
    case 'not':
      return '得分 = 1 − 以下规则得分：\n' + describe(rule.judge);
  }
}

// Existing compound rules round-trip unchanged. Simple rules have human-facing forms.
function ruleEditor(hostId, getRule, setRule, inherit = false) {
  if (doc.def.mode && doc.def.mode !== 'qa') {
    rubricEditor($(hostId), getRule, setRule, () => doc.def.judge, changed, inherit);
    return;
  }
  const host = $(hostId),
    original = clone(getRule()),
    id = hostId + 'Kind';
  const customRule = original,
    drafts = new Map(original ? [[original.kind, original]] : []);
  function draw() {
    const ownRule = getRule(),
      rule = ownRule ?? doc.def.judge,
      kind = rule.kind,
      selection = ownRule?.kind ?? 'inherit';
    const complex = !['exact', 'llm', 'contains', 'regex'].includes(kind);
    const options = [
      ...(inherit ? [['inherit', '沿用题库默认评分']] : []),
      ['exact', '完整答案匹配'],
      ['llm', '按标准评分 · 模型裁判'],
      ['contains', '全部关键词匹配'],
      ['regex', '表达式匹配'],
      ...(customRule && !['exact', 'llm', 'contains', 'regex'].includes(customRule.kind)
        ? [[customRule.kind, '沿用现有组合评分']]
        : []),
    ];
    let fields = '';
    if (kind === 'exact')
      fields = `<label>其他可接受答案 · 每行一个<textarea data-field="alternatives" rows="4" placeholder="例如：北京\n北京市">${escape((rule.alternatives ?? []).join('\n'))}</textarea></label><label class="check"><input data-field="ignoreCase" type="checkbox"${rule.ignoreCase ? ' checked' : ''}>忽略英文字母大小写</label><label class="check"><input data-field="trimPunct" type="checkbox"${rule.trimPunct !== false ? ' checked' : ''}>忽略答案首尾标点</label><p class="rule-hint">去空白、全角英数和圈码数字标准化后，完整匹配参考答案或其他可接受答案。纯标点答案保留标点。</p>`;
    else if (kind === 'llm')
      fields = `<label>评分标准<textarea data-field="rubric" rows="6" placeholder="写明满分条件、部分得分条件，以及哪些错误应扣分。">${escape(rule.rubric)}</textarea></label><label>满分<input data-field="scale" type="number" min="1" max="1000" value="${escape(rule.scale ?? 10)}"></label><p class="rule-hint">开赛时需要选择评分模型，会产生额外调用。填写清楚的评分标准有助于保持一致。</p>`;
    else if (kind === 'contains')
      fields = `<label>必须出现的关键词 · 每行一个<textarea data-field="keywords" rows="4">${escape(rule.keywords.join('\n'))}</textarea></label><p class="rule-hint">只检查是否包含全部关键词，不判断语义或否定句。需要语义判断时请选择“按标准评分”。</p>`;
    else if (kind === 'regex')
      fields = `<label>匹配表达式<textarea data-field="pattern" rows="4" spellcheck="false">${escape(rule.pattern)}</textarea></label><p class="rule-hint">对原始回答执行区分大小写的多行匹配。只有熟悉表达式时才建议使用。</p>`;
    else
      fields = `<p class="rule-hint rule-details">${escape(describe(rule ?? doc.def.judge))}</p><p class="rule-hint">${complex ? '此题保留已有组合规则。也可切换为上方的评分方式。' : '调整此题的答案写法时，可切换到“完整答案匹配”单独设置。'}</p>`;
    host.innerHTML = `<label for="${id}">评分方式<select id="${id}">${options.map(([value, label]) => `<option value="${value}"${value === selection ? ' selected' : ''}>${label}</option>`).join('')}</select></label>${inherit ? '<p class="rule-hint">修改下方选项仅对本题生效。</p>' : '<p class="rule-hint">影响所有沿用默认评分的题目。</p>'}<div class="rule-fields">${fields}</div>`;
    $(id).onchange = (event) => {
      const next = event.target.value;
      const current = getRule();
      if (current) drafts.set(current.kind, clone(current));
      const defaults = {
        inherit: undefined,
        exact: { kind: 'exact' },
        llm: { kind: 'llm', rubric: '', scale: 10 },
        contains: { kind: 'contains', keywords: [] },
        regex: { kind: 'regex', pattern: '' },
      };
      const value = drafts.has(next) ? clone(drafts.get(next)) : defaults[next];
      setRule(value);
      draw();
      changed();
    };
    host.querySelectorAll('[data-field]').forEach((input) =>
      input.addEventListener('input', () => {
        const next = clone(getRule() ?? doc.def.judge),
          field = input.dataset.field;
        next[field] =
          input.type === 'checkbox'
            ? input.checked
            : input.type === 'number'
              ? Number(input.value)
              : ['alternatives', 'keywords'].includes(field)
                ? input.value
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                : input.value;
        setRule(next);
        $(id).value = next.kind;
        changed();
      }),
    );
  }
  draw();
}
function groupFields() {
  const t = task();
  $('conditionLabel').value = doc.def.conditions?.[t.condition] ?? '';
  $('conditionPrefix').value = doc.def.conditionPrefix?.[t.condition] ?? '';
}
function showQuestion(id) {
  updateRoundPreview = undefined;
  selected = id;
  const t = task();
  $('emptyQuestion').hidden = !!t;
  $('questionForm').hidden = !t;
  if (!t) {
    list();
    changed();
    return;
  }
  const index = doc.tasks.indexOf(t);
  $('questionNumber').textContent = `QUESTION ${String(index + 1).padStart(2, '0')} / ${doc.tasks.length}`;
  $('questionId').textContent = t.id;
  $('questionInput').value = t.input;
  $('questionTarget').value = t.target ?? '';
  $('questionCondition').value = t.condition;
  $('conditionOptions').replaceChildren(
    ...[...new Set([...Object.keys(doc.def.conditions ?? {}), ...doc.tasks.map((q) => q.condition)])].map(
      (c) => new Option(doc.def.conditions?.[c] ?? c, c),
    ),
  );
  groupFields();
  const reason = doc.def.review?.excluded?.[t.id];
  $('questionEnabled').checked = !reason;
  $('questionPauseReason').value = reason ?? '';
  $('questionPauseField').hidden = !reason;
  $('moveUp').disabled = index === 0;
  $('moveDown').disabled = index === doc.tasks.length - 1;
  ruleEditor(
    'taskRule',
    () => task().judge,
    (value) => {
      if (value) task().judge = value;
      else delete task().judge;
    },
    true,
  );
  $('taskRounds').hidden = doc.def.mode !== 'multi_turn';
  if (t.rounds)
    updateRoundPreview = roundsEditor(
      $('taskRounds'),
      t,
      () => `${doc.def.taskPrefix ?? ''}${doc.def.conditionPrefix?.[t.condition] ?? ''}${t.input}`,
      changed,
    );
  $('questionTarget').placeholder =
    doc.def.mode && doc.def.mode !== 'qa'
      ? '可选示例；允许其他满足评分条件的合理答案。'
      : '填写正确答案与可接受的写法。';
  list();
  changed();
}
function draw() {
  $('bankMode').value = doc.def.mode ?? 'qa';
  $('bankMode').disabled = !!name;
  $('modeHint').textContent =
    (name ? '本库赛制已固定。需要其他赛制时新建题库。' : '创建时选定赛制；每场使用同一赛制。') +
    (doc.def.mode === 'multi_turn'
      ? ' 每轮 3 分钟，整项任务累计 10 分钟。'
      : doc.def.mode === 'open'
        ? ' 每题 3 分钟；参考答案可选，评分标准必填。'
        : ' 单题限时 60 秒。');
  $('bankTitle').value = doc.def.title;
  $('bankDescription').value = doc.def.description;
  $('bankPrefix').value = doc.def.taskPrefix ?? '';
  $('bankEnabled').checked = !doc.def.review?.blockedReason;
  $('bankPauseReason').value = doc.def.review?.blockedReason ?? '';
  ruleEditor(
    'defaultRule',
    () => doc.def.judge,
    (value) => {
      doc.def.judge = value;
      if (task() && !task().judge)
        ruleEditor(
          'taskRule',
          () => task().judge,
          (r) => {
            if (r) task().judge = r;
            else delete task().judge;
          },
          true,
        );
    },
  );
  showQuestion(doc.tasks.some((t) => t.id === selected) ? selected : (doc.tasks[0]?.id ?? ''));
}

async function api(url, init) {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '请求失败，请重试');
  return body;
}
async function load() {
  $('editorFields').disabled = true;
  $('saveBank').disabled = true;
  message('');
  try {
    doc = name
      ? await api('/api/question-banks/' + encodeURIComponent(name))
      : {
          def: { name: '', title: '', description: '', judge: { kind: 'exact' }, conditions: { general: '通用' } },
          tasks: [newQuestion()],
        };
    saved = signature();
    removed = undefined; // 新建题库以空白稿为基线：未编辑前不提示未保存、离开不拦截
    draw();
    $('editorFields').disabled = false;
    if (!name) {
      $('bankSettings').open = true;
      $('bankTitle').focus();
    }
  } catch (error) {
    message(error.message);
    $('saveState').textContent = '加载失败';
  }
}
$('saveBank').addEventListener('click', async () => {
  if (!doc || saving) return;
  if (!doc.def.title.trim()) {
    $('bankSettings').open = true;
    $('bankTitle').focus();
    message('请先填写题库名称');
    return;
  }
  if (!doc.tasks.length) {
    message('题库至少需要一道题，请添加题目或撤销删除');
    return;
  }
  const invalid = doc.tasks.find(
    (t) => !t.input.trim() || !t.condition.trim() || (needsTarget(t.judge ?? doc.def.judge) && !t.target?.trim()),
  );
  if (invalid) {
    showQuestion(invalid.id);
    message('请填写本题的题目内容、分组和参考答案后再保存');
    $('questionInput').focus();
    return;
  }
  saving = true;
  changed();
  $('editorFields').disabled = true;
  $('reloadBank').disabled = true;
  message('');
  try {
    doc = await api('/api/question-banks' + (name ? '/' + encodeURIComponent(name) : ''), {
      method: name ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(doc),
    });
    name = doc.def.name;
    history.replaceState(null, '', '/questions?arena=' + encodeURIComponent(name));
    saved = signature();
    removed = undefined;
    draw();
    message(`已保存「${doc.def.title}」：${doc.tasks.length} 道题，${doc.playable} 道可用于对战。`, true);
  } catch (error) {
    message(error.message);
  } finally {
    saving = false;
    $('editorFields').disabled = false;
    $('reloadBank').disabled = false;
    changed();
  }
});
$('reloadBank').onclick = () => {
  if (dirty()) confirmEdit('重新加载题库？', '这会放弃当前页面未保存的修改。', () => void load(), '放弃修改并加载');
  else void load();
};
$('questionList').onclick = (event) => {
  const button = event.target.closest('[data-id]');
  if (button) showQuestion(button.dataset.id);
};
$('questionSearch').oninput = list;
$('addQuestion').onclick = () => {
  const next = newQuestion();
  doc.tasks.push(next);
  $('questionSearch').value = '';
  showQuestion(next.id);
  $('questionInput').focus();
};
$('deleteQuestion').onclick = () => {
  const current = task(),
    index = doc.tasks.indexOf(current);
  confirmEdit(
    `删除第 ${index + 1} 道题？`,
    '保存前可撤销本次删除；保存时也会备份原题库。',
    () => {
      removed = { task: clone(current), index, reason: doc.def.review?.excluded?.[current.id] };
      doc.tasks.splice(index, 1);
      if (doc.def.review?.excluded) delete doc.def.review.excluded[current.id];
      showQuestion(doc.tasks[Math.min(index, doc.tasks.length - 1)]?.id ?? '');
    },
    '删除题目',
  );
};
$('undoDelete').onclick = () => {
  if (!removed) return;
  const restored = removed;
  removed = undefined;
  doc.tasks.splice(Math.min(restored.index, doc.tasks.length), 0, restored.task);
  if (restored.reason) setPause(restored.task.id, false, restored.reason);
  $('questionSearch').value = '';
  showQuestion(restored.task.id);
};
for (const [id, offset] of [
  ['moveUp', -1],
  ['moveDown', 1],
])
  $(id).onclick = () => {
    const index = doc.tasks.indexOf(task()),
      next = index + offset;
    if (next < 0 || next >= doc.tasks.length) return;
    [doc.tasks[index], doc.tasks[next]] = [doc.tasks[next], doc.tasks[index]];
    showQuestion(selected);
  };
for (const [id, key] of [
  ['bankTitle', 'title'],
  ['bankDescription', 'description'],
  ['bankPrefix', 'taskPrefix'],
])
  $(id).oninput = () => {
    doc.def[key] = $(id).value;
    changed();
  };
for (const [id, key] of [
  ['questionInput', 'input'],
  ['questionTarget', 'target'],
  ['questionCondition', 'condition'],
])
  $(id).oninput = () => {
    const value = $(id).value;
    if (key === 'target' && !value) delete task().target;
    else task()[key] = value;
    if (key === 'condition') groupFields();
    list();
    changed();
  };
for (const [id, key] of [
  ['conditionLabel', 'conditions'],
  ['conditionPrefix', 'conditionPrefix'],
])
  $(id).oninput = () => {
    doc.def[key] = { ...doc.def[key], [task().condition]: $(id).value };
    list();
    changed();
  };
$('bankMode').onchange = () => {
  const mode = $('bankMode').value;
  doc.def.mode = mode;
  doc.def.judge = mode === 'qa' ? { kind: 'exact' } : clone(taskDefaults[mode]);
  for (const t of doc.tasks) {
    delete t.judge;
    if (mode === 'multi_turn') t.rounds ??= newRounds();
    else delete t.rounds;
  }
  draw();
  changed();
};
$('bankEnabled').onchange = () => {
  setPause('', $('bankEnabled').checked, $('bankPauseReason').value);
  $('bankPauseReason').value = doc.def.review?.blockedReason ?? '';
  list();
  changed();
};
$('bankPauseReason').oninput = () => {
  setPause('', false, $('bankPauseReason').value);
  changed();
};
$('questionEnabled').onchange = () => {
  setPause(selected, $('questionEnabled').checked, $('questionPauseReason').value);
  $('questionPauseField').hidden = $('questionEnabled').checked;
  list();
  changed();
};
$('questionPauseReason').oninput = () => {
  setPause(selected, false, $('questionPauseReason').value);
  changed();
};
window.addEventListener('beforeunload', (event) => {
  if (dirty() || saving) {
    event.preventDefault();
    event.returnValue = '';
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (!$('saveBank').disabled) $('saveBank').click();
  }
});
void load();
