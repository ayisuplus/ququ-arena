const $ = (id) => document.getElementById(id);
const node = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const root = '/api/harness/authoring';
const states = {
  ready: '草稿已保存',
  running: 'Codex 正在开发',
  checking: '正在试运行',
  error: '需要处理',
  cancelled: '已停止',
  interrupted: '曾中断',
};
const working = (d) => ['running', 'checking'].includes(d?.status);

export function installExtensionAuthor(api, usePackage) {
  let draft,
    source,
    dirty = false,
    busy = false,
    loading = false,
    connection,
    file = '',
    renderedRevision,
    token = 0;
  const dialog = $('extensionAuthorDialog');
  const notify = (text) => {
    $('authorNotice').textContent = text;
    $('authorNotice').hidden = !text;
  };
  const revisionUrl = (id) => {
    const url = new URL(location.href);
    id ? url.searchParams.set('draft', id) : url.searchParams.delete('draft');
    history.replaceState(null, '', url.pathname + url.search);
  };
  function buttons() {
    const active = working(draft),
      ready = connection?.agent.status === 'ready' && connection?.runtime.ready;
    $('sendAuthor').disabled = busy || active || !ready;
    $('sendAuthor').textContent = draft?.turns.length ? '发送修改要求 ↗' : '让 Codex 创建 ↗';
    $('cancelAuthor').hidden = !active;
    $('cancelAuthor').disabled = busy;
    $('authorDraftName').disabled = busy || active;
    $('authorSource').disabled = busy || active || !draft;
    $('authorFlags').disabled = busy || active || !draft;
    $('saveAuthorEdits').disabled = !dirty || busy || active;
    $('discardAuthorEdits').hidden = !dirty;
    $('checkAuthor').disabled = !draft || busy || active || !connection?.runtime.ready;
    $('useAuthor').disabled = busy || active || dirty || !draft?.checkCurrent || !draft.checks.at(-1)?.passed;
    $('repairAuthor').disabled = busy || active || !ready;
    $('authorDraftList').disabled = busy;
    $('newAuthorDraft').disabled = busy;
    $('authorTurnState').textContent = draft
      ? (states[draft.status] || draft.status) + (active ? ' · 关闭面板仍会继续' : ' · 可继续追问修改')
      : '每轮最多 5 分钟 · 可随时停止';
    $('authorRevision').textContent = draft ? '修订 ' + draft.revision : '尚未创建草稿';
    const c = draft?.checks.at(-1);
    $('authorEditState').textContent = dirty
      ? '有手工修改尚未保存'
      : c && draft.checkCurrent
        ? `功能检查${c.passed ? '通过' : '未通过'} · ${c.cases.filter((x) => x.passed).length}/${c.cases.length} 个用例`
        : '草稿已保存 · 当前源码尚待检查';
  }
  function renderSource() {
    if (!source) return;
    const paths = Object.keys(source.files);
    if (!paths.includes(file)) file = paths.includes('index.ts') ? 'index.ts' : paths[0] || '';
    $('authorFile').replaceChildren(...paths.map((p) => new Option(p, p)));
    $('authorFile').value = file;
    $('authorSource').value = source.files[file] ?? '';
    $('authorFlags').value = JSON.stringify(source.flags, null, 2);
    $('authorDraftName').value = draft?.name || '';
  }
  function renderMessages() {
    const log = $('authorMessages'),
      atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 70;
    if (!draft?.turns.length) return;
    log.querySelector('.author-welcome')?.remove();
    for (const t of draft.turns) {
      let card = log.querySelector('[data-turn="' + t.id + '"]');
      if (!card) {
        card = node('article', undefined, 'author-turn');
        card.dataset.turn = t.id;
        const user = node('div', t.prompt, 'author-user'),
          reasoning = node('details', undefined, 'author-reasoning'),
          events = node('details', undefined, 'author-events');
        reasoning.append(node('summary', '公开推理摘要'), node('pre'));
        events.append(node('summary', '开发操作与检查'), node('pre'));
        card.append(
          user,
          node('span', 'CODEX', 'author-agent-label'),
          node('div', undefined, 'author-answer'),
          reasoning,
          events,
          node('small', undefined, 'author-turn-result'),
        );
        log.append(card);
      }
      card.querySelector('.author-answer').textContent =
        t.text || (t.status === 'running' ? '正在查看需求与草稿…' : '本轮没有文字回复，已写入内容保留在右侧。');
      card.querySelector('.author-reasoning').hidden = !t.reasoning;
      card.querySelector('.author-reasoning pre').textContent = t.reasoning;
      card.querySelector('.author-events pre').textContent = t.events.map((e) => e.text).join('\n');
      card.querySelector('.author-events summary').textContent = `开发操作与检查 · ${t.events.length} 条`;
      card.querySelector('.author-turn-result').textContent =
        t.error ||
        ({ completed: '本轮完成', cancelled: '本轮已停止', interrupted: '本轮曾中断', running: '正在开发' }[t.status] ??
          t.status);
    }
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  function renderChecks() {
    const target = $('authorChecks'),
      c = draft?.checks.at(-1),
      open = [...target.querySelectorAll('details[open]')].map((e) => e.dataset.case);
    target.replaceChildren(node('h3', '功能试运行'));
    if (!c) target.append(node('p', '使用合成材料检查工具与事件行为。尚未得到有效检查结果。', 'muted'));
    else {
      target.append(
        node(
          'p',
          `${c.passed ? '通过' : '未通过'} · ${c.cases.filter((x) => x.passed).length}/${c.cases.length} 个用例${draft.checkCurrent ? '' : ' · 源码已改变，需要重新检查'}`,
          c.passed && draft.checkCurrent ? 'author-pass' : 'author-fail',
        ),
      );
      if (c.capabilities)
        target.append(
          node(
            'p',
            '工具：' +
              (c.capabilities.tools.map((t) => t.name).join('、') || '无') +
              ' · 事件：' +
              (c.capabilities.events.join('、') || '无'),
            'muted',
          ),
        );
      for (const [i, item] of c.cases.entries()) {
        const detail = node('details');
        detail.dataset.case = String(i);
        detail.open = open.includes(String(i));
        detail.append(node('summary', (item.passed ? '✓ ' : '× ') + item.name));
        detail.append(
          node(
            'pre',
            item.steps.map((s) => `${s.passed ? '✓' : '×'} ${s.op}\n${s.error || s.actual || ''}`).join('\n\n') +
              (item.error ? '\n' + item.error : ''),
          ),
        );
        target.append(detail);
      }
    }
    if (draft?.error) target.append(node('p', draft.error, 'author-fail'));
    $('repairAuthor').hidden = !draft || working(draft) || (!draft.error && (!c || c.passed));
  }
  function render(value, force = false) {
    if (draft?.id === value.id && (value.revision < draft.revision || value.updatedAt < draft.updatedAt)) return;
    if (draft && draft.id !== value.id) {
      $('authorMessages').replaceChildren();
      renderedRevision = undefined;
    }
    draft = value;
    const option = [...$('authorDraftList').options].find((o) => o.value === value.id);
    if (option) option.textContent = value.name + ' · ' + states[value.status];
    if (!dirty && (force || renderedRevision !== value.revision)) {
      source = structuredClone(value.source);
      renderSource();
      renderedRevision = value.revision;
    }
    renderMessages();
    renderChecks();
    buttons();
    const known = value.turns.filter((t) => t.usage),
      input = known.reduce((n, t) => n + t.usage.input, 0),
      output = known.reduce((n, t) => n + t.usage.output, 0),
      seconds = value.turns.reduce((n, t) => n + (t.elapsedMs || 0), 0) / 1000;
    $('authorUsage').textContent =
      `开发记录 · ${value.turns.length} 轮 · ${seconds.toFixed(0)} 秒 · ${known.length ? '已知 Token ' + input.toLocaleString() + ' 输入 / ' + output.toLocaleString() + ' 输出' : 'Token 未报告'}${known.length < value.turns.length ? '（部分用量未报告）' : ''} · 不计入实验成绩`;
  }
  async function status() {
    $('authorConnection').textContent = '正在检测本机 Codex…';
    try {
      connection = await api(root + '/status');
      const a = connection.agent;
      $('authorConnection').textContent =
        a.status === 'ready'
          ? `● Codex 本机已登录${connection.runtime.ready ? ' · 试运行环境可用' : ' · 试运行环境未就绪'}`
          : `○ Codex · ${a.message || a.status}`;
    } catch (e) {
      connection = undefined;
      $('authorConnection').textContent = '无法连接本机执行器 · 草稿内容保留';
      notify(e.message);
    }
    buttons();
  }
  async function list() {
    const rows = await api(root + '/drafts');
    $('authorDraftList').replaceChildren(
      new Option('选择已有草稿…', ''),
      ...rows.map((d) => new Option(d.name + ' · ' + states[d.status], d.id)),
    );
    $('authorDraftList').value = draft?.id || '';
  }
  async function refresh() {
    if (!dialog.open || !draft || dirty || loading || busy) return;
    loading = true;
    const id = draft.id,
      generation = token;
    try {
      const value = await api(root + '/drafts/' + id);
      if (generation === token && draft?.id === id && !dirty && !busy) render(value);
    } catch (e) {
      if (generation === token) notify('进度同步暂时中断，草稿保留：' + e.message);
    } finally {
      loading = false;
    }
  }
  async function saveEdits() {
    if (!dirty || !draft) return;
    let flags;
    try {
      flags = JSON.parse($('authorFlags').value);
    } catch {
      throw new Error('运行参数需要有效 JSON，手工修改已保留');
    }
    const value = await api(root + '/drafts/' + draft.id + '/edit', {
      revision: draft.revision,
      name: $('authorDraftName').value,
      source: { ...source, flags },
    });
    dirty = false;
    render(value, true);
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    buttons();
    notify('');
    try {
      await fn();
    } catch (e) {
      notify(e.message);
    } finally {
      busy = false;
      buttons();
    }
  }
  async function send(prompt) {
    await action(async () => {
      if (!prompt.trim()) throw new Error('请先描述希望创建或修改的行为');
      await saveEdits();
      if (!draft) {
        render(
          await api(root + '/drafts', { name: $('authorDraftName').value.trim() || prompt.trim().slice(0, 24) }),
          true,
        );
        revisionUrl(draft.id);
      }
      const id = draft.id,
        value = await api(root + '/drafts/' + id + '/message', {
          prompt,
          revision: draft.revision,
          requestId: crypto.randomUUID(),
        });
      render(value);
      $('authorPrompt').value = '';
      await list();
    });
  }
  async function open(initial, name) {
    dialog.showModal();
    notify('');
    await action(async () => {
      if (initial) {
        if (dirty) throw new Error('请先保存或放弃当前手工修改，再派生其他扩展');
        token++;
        render(await api(root + '/drafts', { name: (name || '派生扩展').slice(0, 60), source: initial }), true);
        revisionUrl(draft.id);
      } else {
        const id = new URLSearchParams(location.search).get('draft');
        if (id && !dirty) {
          token++;
          render(await api(root + '/drafts/' + id), true);
        }
      }
      await Promise.all([status(), list()]);
    });
    $('authorPrompt').focus();
  }
  $('sendAuthor').onclick = () => send($('authorPrompt').value);
  $('authorPrompt').onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !$('sendAuthor').disabled) {
      e.preventDefault();
      void send($('authorPrompt').value);
    }
  };
  $('authorExample').onclick = () => {
    $('authorPrompt').value =
      '创建一个先读后写护栏：只有成功读取过文件，才允许修改该文件。读取失败不算已读。使用合成材料验证拒绝、允许和读取失败三个场景。';
    $('authorPrompt').focus();
  };
  $('authorFile').onchange = () => {
    file = $('authorFile').value;
    $('authorSource').value = source?.files[file] ?? '';
  };
  $('authorSource').oninput = () => {
    if (!source || !file) return;
    source.files[file] = $('authorSource').value;
    dirty = true;
    buttons();
  };
  for (const id of ['authorDraftName', 'authorFlags'])
    $(id).oninput = () => {
      if (draft) {
        dirty = true;
        buttons();
      }
    };
  $('saveAuthorEdits').onclick = () => action(saveEdits);
  $('discardAuthorEdits').onclick = () => {
    dirty = false;
    render(draft, true);
  };
  $('refreshAuthorConnection').onclick = () => action(status);
  $('checkAuthor').onclick = () =>
    action(async () => {
      await saveEdits();
      render(await api(root + '/drafts/' + draft.id + '/check', { revision: draft.revision }));
    });
  $('repairAuthor').onclick = () =>
    send('请根据当前草稿最近的真实功能检查结果修复扩展，保留原始需求和有意义的断言。修复后重新运行用例，并说明原因。');
  $('cancelAuthor').onclick = () =>
    action(async () => {
      render(await api(root + '/drafts/' + draft.id + '/cancel', {}));
    });
  $('useAuthor').onclick = () =>
    action(async () => {
      const result = await api(root + '/drafts/' + draft.id + '/export');
      await usePackage(result.source, result.name);
      dialog.close();
      revisionUrl();
    });
  $('closeExtensionAuthor').onclick = () => dialog.close();
  $('newAuthorDraft').onclick = () =>
    action(async () => {
      if (dirty) throw new Error('请先保存或放弃手工修改，当前内容仍保留');
      token++;
      draft = undefined;
      source = undefined;
      renderedRevision = undefined;
      file = '';
      $('authorMessages').replaceChildren(node('p', '描述下一个扩展的目标，Codex 会建立新的独立草稿。', 'muted'));
      $('authorSource').value = '';
      $('authorDraftName').value = '';
      $('authorFile').replaceChildren();
      $('authorFlags').value = '{}';
      $('authorPrompt').value = '';
      $('authorUsage').textContent = '开发用量单独记录，不计入实验成绩';
      revisionUrl();
      renderChecks();
      await list();
    });
  $('authorDraftList').onchange = () =>
    action(async () => {
      const id = $('authorDraftList').value;
      if (!id) return;
      if (dirty) {
        $('authorDraftList').value = draft.id;
        throw new Error('请先保存或放弃手工修改，当前内容仍保留');
      }
      token++;
      render(await api(root + '/drafts/' + id), true);
      revisionUrl(id);
    });
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  setInterval(() => {
    void refresh();
  }, 1500);
  if (new URLSearchParams(location.search).has('draft')) void open();
  return { open };
}
