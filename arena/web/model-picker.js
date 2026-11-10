const byId = (id) => document.getElementById(id);
const element = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
};
const modelSpec = (m) => m.id + '=' + m.name.replaceAll(',', '，').replaceAll('=', '＝');
const specId = (spec) => spec.split('=')[0];
const specName = (spec) => (spec.includes('=') ? spec.slice(spec.indexOf('=') + 1) : spec);
const message = (id, text) => {
  byId(id).textContent = text;
  byId(id).hidden = !text;
};

export function initModelPicker() {
  let models = [],
    settings,
    catalog,
    loaded = false,
    loading = false,
    reloadRequested = false,
    forceRequested = false,
    settingsRevision = 0,
    source = 'all',
    editingId,
    catalogId,
    deletingModel;
  const selected = new Map();
  const listeners = new Set();
  const checkingModels = new Set();
  const publicState = () => ({
    loaded,
    selected: [...selected.keys()],
    models: models.map(({ id, name, ready, hidden, source, free }) => ({ id, name, ready, hidden, source, free })),
  });
  let saved = null;
  try {
    saved = localStorage.getItem('ququ-lineup');
  } catch {}
  for (const spec of (saved ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('mock:')))
    selected.set(specId(spec), spec);
  const findModel = (id) => models.find((m) => m.id === id);
  const providerOf = (m) => m.manufacturer || '未标注';
  const unavailable = () => [...selected.keys()].filter((id) => !findModel(id)?.ready || findModel(id)?.hidden);
  const inSource = (m) => (source === 'hidden' ? m.hidden : !m.hidden && (source === 'all' || m.source === source));
  function renderRouterStatus() {
    if (!settings) return;
    const status = settings.openrouter.availability;
    message('routerAvailability', status?.message || '免费模型共享账号额度，配置 Key 不代表接口当前可用。');
    byId('routerAvailability').dataset.state = status?.state || 'untested';
    if (!byId('routerCheck').dataset.checking) byId('routerCheck').disabled = !settings.openrouter.configured;
  }
  function applySettings(updated) {
    settingsRevision++;
    settings = updated;
    models = models
      .filter((m) => m.source !== 'custom')
      .map((m) => ({
        ...m,
        name: updated.catalog?.[m.id]?.name || m.defaultName || m.name,
        hidden: updated.catalog?.[m.id]?.hidden === true,
        ready:
          m.source === 'openrouter'
            ? updated.openrouter.configured && !catalog?.stale && !updated.openrouter.availability?.blocked
            : m.ready,
      }));
    models.push(...updated.custom.map((m) => ({ ...m, source: 'custom', free: false, ready: true })));
    for (const id of selected.keys()) {
      const model = findModel(id);
      if (model) selected.set(id, modelSpec(model));
    }
    renderModels();
  }

  function sync() {
    const value = [...selected.values()].join(',');
    byId('launchModels').value = value;
    for (const input of document.querySelectorAll('[data-shared-lineup]')) input.value = value;
    for (const label of document.querySelectorAll('[data-lineup-summary]'))
      label.textContent = `使用上方已选的 ${selected.size} 个模型`;
    byId('selectedModelCount').textContent = `已选 ${selected.size} 个模型`;
    byId('launchCount').textContent = selected.size
      ? `${selected.size} 个模型已选${selected.size > 8 ? ' · 超出 8 路的调用将等待' : ' · 同题同步开始'}`
      : '从左侧勾选模型即可开始';
    byId('clearModels').disabled = !selected.size;
    if (!byId('launchButton').dataset.submitting)
      byId('launchButton').disabled = !loaded || !selected.size || unavailable().length > 0;
    try {
      localStorage.setItem('ququ-lineup', value);
    } catch {}
    const chips = byId('selectedModels'),
      scrollTop = chips.scrollTop,
      focused = document.activeElement?.dataset.removeModel;
    chips.replaceChildren();
    for (const [id, spec] of selected) {
      const model = findModel(id);
      const name = model?.name || specName(spec),
        invalid = loaded && (!model?.ready || model.hidden);
      const chip = element('div', '', 'model-chip' + (invalid ? ' unavailable' : ''));
      const label = element('span', name, 'model-chip-name');
      label.title = name + '\n' + id;
      const remove = element('button', '移除', 'model-chip-remove');
      remove.type = 'button';
      remove.dataset.removeModel = id;
      remove.setAttribute('aria-label', `移除 ${name}`);
      remove.title = '只移出本场阵容，保留模型配置';
      remove.onclick = () => {
        const index = [...selected.keys()].indexOf(id);
        selected.delete(id);
        sync();
        const buttons = chips.querySelectorAll('button');
        (buttons[index] || buttons[index - 1] || byId('modelSearch')).focus({ preventScroll: true });
      };
      chip.append(label);
      if (invalid)
        chip.append(element('span', !model ? '已下架' : model.hidden ? '已隐藏' : '不可用', 'model-chip-note'));
      chip.append(remove);
      chips.append(chip);
    }
    chips.scrollTop = scrollTop;
    if (focused)
      [...chips.querySelectorAll('button')]
        .find((button) => button.dataset.removeModel === focused)
        ?.focus({ preventScroll: true });
    if (!selected.size) chips.append(element('span', '尚未选择模型', 'selection-empty'));
    for (const checkbox of byId('modelList').querySelectorAll('input[type="checkbox"]')) {
      checkbox.checked = selected.has(checkbox.dataset.modelId);
      checkbox.closest('.model-row').classList.toggle('selected', checkbox.checked);
    }
    let warning = '';
    if (loaded && unavailable().length) {
      warning =
        selected.size &&
        [...selected.keys()].some((id) => id.startsWith('openrouter:')) &&
        !settings.openrouter.configured
          ? '已选 OpenRouter 模型；配置 API Key 后即可开赛。'
          : [...selected.keys()].some((id) => id.startsWith('openrouter:')) && settings.openrouter.availability?.blocked
            ? settings.openrouter.availability.message
            : '部分已选模型已下架、被隐藏或目录待更新，请调整选择或刷新目录。';
    }
    message('modelSelectionStatus', warning);
    for (const listener of listeners) listener(publicState());
  }

  function renderModels() {
    renderRouterStatus();
    const list = byId('modelList'),
      scrollTop = list.scrollTop,
      focused = document.activeElement?.dataset.modelId;
    const provider = byId('modelProvider');
    const oldProvider = provider.value;
    provider.replaceChildren(new Option('全部厂商', ''));
    for (const p of [...new Set(models.filter(inSource).map(providerOf))].sort()) provider.add(new Option(p, p));
    provider.value = [...provider.options].some((o) => o.value === oldProvider) ? oldProvider : '';
    const terms = byId('modelSearch').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = models.filter(
      (m) =>
        inSource(m) &&
        (!provider.value || providerOf(m) === provider.value) &&
        terms.every((term) =>
          `${m.name} ${m.defaultName || ''} ${m.modelId} ${providerOf(m)} ${m.channel || ''}`
            .toLowerCase()
            .includes(term),
        ),
    );
    const fragment = document.createDocumentFragment();
    for (const model of matches) {
      const row = element('div', '', 'model-row');
      const label = element('label', '', 'model-choice');
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.modelId = model.id;
      checkbox.disabled = Boolean(model.hidden);
      checkbox.setAttribute('aria-label', `选择 ${model.name}`);
      checkbox.onchange = () => {
        if (checkbox.checked) selected.set(model.id, modelSpec(model));
        else selected.delete(model.id);
        sync();
      };
      const info = element('span', '', 'model-info');
      info.append(element('strong', model.name), element('small', model.modelId));
      info.append(
        element(
          'span',
          `厂商：${providerOf(model)} · 渠道：${model.channel || (model.source === 'openrouter' ? 'OpenRouter' : '自定义接口')}`,
          'model-origin',
        ),
      );
      const meta = [];
      if (model.contextLength) meta.push(`${Math.round(model.contextLength / 1024).toLocaleString()}K 上下文`);
      if (model.reasoning) meta.push('支持推理');
      if (model.source === 'custom') meta.push(model.hasApiKey ? 'Key 已保存' : '免认证连接');
      if (meta.length) info.append(element('span', meta.join(' · '), 'model-meta'));
      const connection = element(
        'span',
        checkingModels.has(model.id) ? '正在检测连接…' : model.connection?.message || '尚未检测连接',
        'model-connection',
      );
      connection.dataset.state = checkingModels.has(model.id) ? 'checking' : model.connection?.state || 'unknown';
      connection.setAttribute('role', 'status');
      if (model.connection)
        connection.title = `${new Date(model.connection.checkedAt).toLocaleString()} · ${model.connection.latencyMs} ms`;
      info.append(connection);
      label.append(checkbox, info);
      row.append(label);
      if (model.description) info.title = model.description;
      const limited = model.source === 'openrouter' && settings.openrouter.availability?.blocked;
      const badge = element(
        'span',
        limited
          ? settings.openrouter.availability.scope === 'daily'
            ? '额度耗尽'
            : '限流中'
          : model.source === 'openrouter'
            ? '免费'
            : model.source === 'custom'
              ? '自定义'
              : '已配置',
        limited ? 'model-limit-badge' : model.free ? 'free-badge' : 'model-source-badge',
      );
      row.append(badge);
      if (model.source === 'openrouter') {
        const link = element('a', '详情 ↗', 'model-details');
        link.href = 'https://openrouter.ai/' + model.modelId;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.setAttribute('aria-label', `查看 ${model.name} 的官方信息`);
        row.append(link);
      }
      const actions = element('div', '', 'model-row-actions');
      const check = element(
        'button',
        checkingModels.has(model.id) ? '检测中…' : '↻ 检测连接',
        'text-button model-check',
      );
      check.type = 'button';
      check.dataset.connectionCheck = model.id;
      check.disabled = checkingModels.has(model.id);
      check.setAttribute('aria-label', `检测连接 ${model.name}`);
      check.title = '向这个模型发送少量 Token 的真实请求';
      check.onclick = async () => {
        if (checkingModels.has(model.id)) return;
        checkingModels.add(model.id);
        renderModels();
        try {
          const response = await fetch('/api/model-settings/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: model.id }),
            signal: AbortSignal.timeout(30000),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || '检测请求失败');
          const current = findModel(model.id);
          if (current) current.connection = result;
        } catch (error) {
          const current = findModel(model.id);
          if (current)
            current.connection = {
              state: 'error',
              message: error.message || '检测未完成，请重试',
              checkedAt: new Date().toISOString(),
              latencyMs: 0,
            };
        } finally {
          checkingModels.delete(model.id);
          renderModels();
        }
      };
      actions.append(check);
      const action = (label, handler) => {
        const button = element('button', label, 'text-button');
        button.type = 'button';
        button.setAttribute('aria-label', `${label} ${model.name}`);
        button.onclick = handler;
        actions.append(button);
      };
      action('编辑', () => (model.source === 'custom' ? openCustom(model) : openCatalog(model)));
      if (model.source === 'custom') action('删除', () => openDelete(model));
      else action(model.hidden ? '恢复' : '隐藏', () => setHidden(model, !model.hidden, row));
      row.append(actions);
      fragment.append(row);
    }
    if (!matches.length)
      fragment.append(
        element(
          'p',
          source === 'hidden' && !terms.length
            ? '没有隐藏的模型。隐藏后可在这里恢复。'
            : source === 'custom' && !terms.length
              ? '还没有自定义模型，点击“＋ 添加模型”连接接口。'
              : '没有匹配的模型，试试其它关键词或刷新目录。',
          'model-empty',
        ),
      );
    list.replaceChildren(fragment);
    list.scrollTop = scrollTop;
    if (focused)
      [...list.querySelectorAll('input')]
        .find((input) => input.dataset.modelId === focused)
        ?.focus({ preventScroll: true });
    byId('catalogNote').hidden = source !== 'all';
    sync();
  }

  async function load(refresh = false) {
    if (loading) {
      reloadRequested = true;
      forceRequested ||= refresh;
      return;
    }
    loading = true;
    byId('refreshModels').disabled = true;
    byId('refreshModels').textContent = '同步中…';
    const revision = settingsRevision;
    try {
      const response = await fetch('/api/models' + (refresh ? '?refresh=1' : ''), {
        signal: AbortSignal.timeout(25_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '模型目录加载失败');
      if (revision !== settingsRevision) {
        reloadRequested = true;
        return;
      }
      models = data.models.filter((m) => m.source !== 'mock');
      settings = data.settings;
      catalog = data.catalog;
      loaded = true;
      for (const id of selected.keys()) {
        const model = findModel(id);
        if (model) selected.set(id, modelSpec(model));
      }
      const time = catalog.updatedAt
        ? new Date(catalog.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })
        : '尚未同步';
      byId('catalogStatus').textContent =
        settings.sources?.openrouter === false
          ? 'OpenRouter 免费目录已从名单隐藏 · 连接设置中可重新显示'
          : catalog.stale
            ? `目录更新失败 · 保留 ${catalog.count} 个历史条目`
            : `OpenRouter · ${catalog.count} 个免费模型 · ${time} 更新`;
      byId('catalogStatus').title = catalog.error || '';
      byId('routerSettings').textContent = settings.openrouter.configured ? 'Key 已配置 · 管理' : '配置 OpenRouter Key';
      renderModels();
    } catch (e) {
      byId('catalogStatus').textContent = '目录连接失败，请点击刷新重试';
      message('modelSelectionStatus', e.message);
    } finally {
      loading = false;
      byId('refreshModels').disabled = false;
      byId('refreshModels').textContent = '刷新';
      byId('addCustomModel').disabled = !loaded;
      if (reloadRequested) {
        const force = forceRequested;
        reloadRequested = forceRequested = false;
        void load(force);
      }
    }
  }

  function openRouter() {
    const form = byId('routerConfigForm');
    form.reset();
    byId('showOpenRouterModels').checked = settings?.sources?.openrouter !== false;
    byId('showBuiltinModels').checked = settings?.sources?.builtin !== false;
    byId('routerKeyStatus').textContent = settings?.openrouter.hasSavedKey
      ? '已保存 Key，留空可保持原值。'
      : settings?.openrouter.source === 'environment'
        ? '已使用本机环境变量中的 Key；填写后将优先使用新 Key。'
        : '尚未配置 Key。查看免费目录无需 Key，参赛调用需要。';
    byId('clearRouterKeyLabel').hidden = !settings?.openrouter.hasSavedKey;
    message('routerFormMessage', '');
    byId('routerDialog').showModal();
  }
  byId('routerCheck').onclick = async () => {
    const button = byId('routerCheck');
    button.disabled = true;
    button.dataset.checking = 'true';
    button.textContent = '检测中…';
    try {
      const response = await fetch('/api/model-settings/openrouter/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(25_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '检测失败');
      applySettings(data.settings);
      if (data.error) {
        message('routerAvailability', data.error);
        if (!data.settings.openrouter.availability?.blocked) byId('routerAvailability').dataset.state = 'error';
      }
    } catch (e) {
      message('routerAvailability', e.message);
      byId('routerAvailability').dataset.state = 'error';
    } finally {
      delete button.dataset.checking;
      button.disabled = !settings?.openrouter.configured;
      button.textContent = '检测免费接口';
    }
  };
  function openCustom(model) {
    editingId = model?.id;
    byId('customModelForm').reset();
    byId('customModelTitle').textContent = model ? '编辑自定义模型' : '添加自定义模型';
    byId('customModelName').value = model?.name || '';
    byId('customModelUrl').value = model?.baseUrl || '';
    byId('customModelId').value = model?.modelId || '';
    byId('customModelStream').checked = model?.stream !== false;
    byId('customKeyStatus').textContent = model?.hasApiKey
      ? '已保存 Key；留空保持原值，填写可替换。'
      : '密钥仅保存在本机服务端。';
    byId('clearCustomKeyLabel').hidden = !model?.hasApiKey;
    byId('deleteCustomModel').hidden = !model;
    byId('deleteCustomModel').textContent = '删除模型';
    delete byId('deleteCustomModel').dataset.confirm;
    message('customFormMessage', '');
    byId('customModelDialog').showModal();
  }
  function openCatalog(model) {
    catalogId = model.id;
    byId('catalogModelId').textContent = model.modelId;
    byId('catalogModelName').value = model.name === model.defaultName ? '' : model.name;
    byId('catalogModelName').placeholder = model.defaultName;
    message('catalogFormMessage', '');
    byId('catalogModelDialog').showModal();
  }
  function openDelete(model) {
    deletingModel = model;
    byId('customModelDialog').close();
    byId('deleteModelName').textContent = model.name;
    message('deleteFormMessage', '');
    byId('deleteModelDialog').showModal();
  }
  async function setHidden(model, hidden, row) {
    const updated = await save(
      '/api/model-settings/catalog',
      'PUT',
      { id: model.id, hidden },
      row,
      'modelActionStatus',
    );
    if (updated) {
      if (hidden) selected.delete(model.id);
      applySettings(updated);
      await load();
      message(
        'modelActionStatus',
        hidden ? `已隐藏 ${model.name}，可在“已隐藏”中恢复。` : `已恢复 ${model.name}，可在“全部模型”中选择。`,
      );
    }
  }
  async function save(url, method, body, form, messageId) {
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach((b) => {
      b.disabled = true;
    });
    message(messageId, '');
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存失败');
      return data.settings;
    } catch (e) {
      message(messageId, e.message);
      return null;
    } finally {
      buttons.forEach((b) => {
        b.disabled = false;
      });
    }
  }

  byId('routerSettings').onclick = openRouter;
  const saveSources = async () => {
    const updated = await save(
      '/api/model-settings/sources',
      'PUT',
      { openrouter: byId('showOpenRouterModels').checked, builtin: byId('showBuiltinModels').checked },
      byId('routerConfigForm'),
      'routerFormMessage',
    );
    if (updated) {
      applySettings(updated);
      await load();
      message('routerFormMessage', '名单来源已更新。');
    }
  };
  byId('showOpenRouterModels').onchange = saveSources;
  byId('showBuiltinModels').onchange = saveSources;
  byId('addCustomModel').onclick = () => {
    if (loaded) openCustom();
  };
  for (const button of document.querySelectorAll('[data-close-dialog]'))
    button.onclick = () => button.closest('dialog').close();
  for (const dialog of document.querySelectorAll('.model-dialog'))
    dialog.addEventListener('close', () => {
      for (const input of dialog.querySelectorAll('input[type="password"]')) input.value = '';
    });
  byId('routerConfigForm').onsubmit = async (event) => {
    event.preventDefault();
    const updated = await save(
      '/api/model-settings/openrouter',
      'PUT',
      { apiKey: byId('routerApiKey').value, clearApiKey: byId('clearRouterKey').checked },
      event.currentTarget,
      'routerFormMessage',
    );
    if (updated) {
      applySettings(updated);
      byId('routerDialog').close();
      await load();
    }
  };
  byId('resetModelName').onclick = () => {
    byId('catalogModelName').value = '';
    byId('catalogModelName').focus();
  };
  byId('catalogModelForm').onsubmit = async (event) => {
    event.preventDefault();
    const updated = await save(
      '/api/model-settings/catalog',
      'PUT',
      { id: catalogId, name: byId('catalogModelName').value },
      event.currentTarget,
      'catalogFormMessage',
    );
    if (updated) {
      applySettings(updated);
      byId('catalogModelDialog').close();
      await load();
      message('modelActionStatus', '显示名称已保存。');
    }
  };
  byId('customModelForm').onsubmit = async (event) => {
    event.preventDefault();
    const oldIds = new Set(settings?.custom.map((m) => m.id) || []),
      edited = editingId;
    const updated = await save(
      '/api/model-settings/custom' + (edited ? '/' + edited : ''),
      edited ? 'PUT' : 'POST',
      {
        name: byId('customModelName').value,
        modelId: byId('customModelId').value,
        baseUrl: byId('customModelUrl').value,
        apiKey: byId('customModelKey').value,
        clearApiKey: byId('clearCustomKey').checked,
        stream: byId('customModelStream').checked,
      },
      event.currentTarget,
      'customFormMessage',
    );
    if (updated) {
      const model = updated.custom.find((m) => (edited ? m.id === edited : !oldIds.has(m.id)));
      if (model && (!edited || selected.has(model.id))) selected.set(model.id, modelSpec(model));
      applySettings(updated);
      byId('customModelDialog').close();
      byId('modelSearch').value = '';
      chooseSource('custom');
      await load();
    }
  };
  byId('deleteCustomModel').onclick = () => {
    const model = findModel(editingId);
    if (model) openDelete(model);
  };
  byId('deleteModelForm').onsubmit = async (event) => {
    event.preventDefault();
    const model = deletingModel;
    const updated = await save(
      '/api/model-settings/custom/' + model.id,
      'DELETE',
      null,
      event.currentTarget,
      'deleteFormMessage',
    );
    if (updated) {
      selected.delete(model.id);
      applySettings(updated);
      byId('deleteModelDialog').close();
      await load();
      message('modelActionStatus', `${model.name} 已删除，历史战绩保留。`);
    }
  };
  function chooseSource(next) {
    source = next;
    byId('modelProvider').value = '';
    byId('modelList').scrollTop = 0;
    for (const button of document.querySelectorAll('[data-model-source]'))
      button.setAttribute('aria-pressed', String(button.dataset.modelSource === source));
    renderModels();
  }
  for (const button of document.querySelectorAll('[data-model-source]'))
    button.onclick = () => chooseSource(button.dataset.modelSource);
  byId('modelSearch').oninput = renderModels;
  byId('modelProvider').onchange = renderModels;
  byId('clearModels').onclick = () => {
    selected.clear();
    sync();
  };
  byId('refreshModels').onclick = () => load(true);
  let interval;
  const startPolling = () => {
    clearInterval(interval);
    interval = setInterval(() => {
      if (!document.hidden) void load();
    }, 5 * 60_000);
  };
  startPolling();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (!catalog?.updatedAt || Date.now() - Date.parse(catalog.updatedAt) > 5 * 60_000))
      void load();
  });
  window.addEventListener('pagehide', () => clearInterval(interval));
  window.addEventListener('pageshow', startPolling);
  sync();
  void load();
  return {
    sync,
    setSelection(ids) {
      const previous = new Map(selected);
      selected.clear();
      for (const id of ids) {
        const model = findModel(id);
        selected.set(id, model ? modelSpec(model) : previous.get(id) || id);
      }
      sync();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(publicState());
      return () => listeners.delete(listener);
    },
    validate() {
      if (!loaded || !selected.size || unavailable().length) {
        message(
          'modelSelectionStatus',
          !loaded
            ? '请等待模型目录加载，或点击刷新重试。'
            : !selected.size
              ? '请至少选择一个参赛模型。'
              : '请先配置已选模型的接口，或移除已失效的模型。',
        );
        byId('modelPicker').scrollIntoView({ block: 'center', behavior: 'smooth' });
        byId('modelSearch').focus({ preventScroll: true });
        return false;
      }
      sync();
      return true;
    },
  };
}
