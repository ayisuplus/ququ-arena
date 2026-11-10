const byId = (id) => document.getElementById(id);
const STORAGE_KEY = 'ququ-lineup-presets';

// Presets contain stable model IDs only. The picker owns names, availability and selection.
export function initLineupPresets(picker) {
  let groups = [],
    activeId = '',
    state,
    editingId = '',
    storageError = '';
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const seen = new Set();
    for (const group of Array.isArray(saved?.groups) ? saved.groups : []) {
      if (
        !group ||
        typeof group.id !== 'string' ||
        !group.id ||
        seen.has(group.id) ||
        typeof group.name !== 'string' ||
        !group.name.trim() ||
        !Array.isArray(group.modelIds)
      )
        continue;
      const modelIds = [
        ...new Set(
          group.modelIds.filter((id) => typeof id === 'string' && id && !/[\s,=]/.test(id) && !id.startsWith('mock:')),
        ),
      ];
      if (!modelIds.length) continue;
      groups.push({ id: group.id, name: group.name.trim().slice(0, 40), modelIds });
      seen.add(group.id);
    }
    activeId = groups.some((group) => group.id === saved?.activeId) ? saved.activeId : '';
  } catch {
    storageError = '无法读取本机对战组，可继续使用临时阵容。';
  }
  const select = byId('lineupPreset'),
    dialog = byId('lineupPresetDialog');
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.textContent = '导出阵容到游戏';
  exportButton.onclick = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ groups, activeId }, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ququ-lineup-presets.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  select.after(exportButton);
  const active = () => groups.find((group) => group.id === activeId);
  const dirty = () => Boolean(active()) && JSON.stringify(active().modelIds) !== JSON.stringify(state.selected);
  const formMessage = (text) => {
    byId('lineupPresetMessage').textContent = text;
    byId('lineupPresetMessage').hidden = !text;
  };

  function render() {
    const group = active(),
      changed = dirty();
    select.replaceChildren(new Option('临时阵容', ''));
    for (const item of groups)
      select.add(
        new Option(
          `${item.name} · ${item.modelIds.length} 个${item.id === activeId && changed ? ' · 未保存' : ''}`,
          item.id,
        ),
      );
    select.value = activeId;
    byId('saveLineupPreset').disabled = !state.loaded || !state.selected.length;
    byId('saveLineupPreset').textContent = group ? '＋ 另存为新组' : '＋ 保存阵容';
    byId('updateLineupPreset').hidden = !group;
    byId('updateLineupPreset').disabled = !state.loaded || !state.selected.length || !changed;
    byId('updateLineupPreset').title = group ? `将当前阵容保存到「${group.name}」` : '';
    byId('manageLineupPreset').hidden = !group;
    const unavailable = state.loaded
      ? state.selected.filter((id) => !state.models.some((model) => model.id === id && model.ready && !model.hidden))
          .length
      : 0;
    byId('lineupPresetStatus').textContent =
      storageError ||
      (group
        ? `${changed ? '阵容已调整，点击“更新”保存' : '阵容已保存，切换分组可一键载入'}${unavailable ? ` · ${unavailable} 个模型不可用，请在右侧调整` : ''}`
        : '选择模型后保存成组，下次一键载入 · 本机保存');
    byId('lineupPresetStatus').dataset.warning = String(Boolean(storageError || unavailable));
  }

  function commit(nextGroups, nextId) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ groups: nextGroups, activeId: nextId }));
      groups = nextGroups;
      activeId = nextId;
      storageError = '';
      return true;
    } catch {
      storageError = '对战组未保存：浏览器本机存储不可用或空间不足。';
      render();
      return false;
    }
  }

  function open(manage) {
    const group = manage ? active() : null;
    editingId = group?.id || '';
    byId('lineupPresetTitle').textContent = group ? '管理对战组' : '保存对战组';
    byId('lineupPresetIntro').textContent = group
      ? `此组保存了 ${group.modelIds.length} 个模型。删除对战组后，本场阵容和模型配置仍会保留。`
      : `将当前 ${state.selected.length} 个模型保存成常用组合，下次从列表一键载入。`;
    byId('lineupPresetName').value = group?.name || '';
    byId('deleteLineupPreset').hidden = !group;
    byId('submitLineupPreset').textContent = group ? '保存名称' : '保存对战组';
    formMessage('');
    dialog.showModal();
    byId('lineupPresetName').focus();
  }

  select.onchange = () => {
    const group = groups.find((item) => item.id === select.value);
    if (commit(groups, group?.id || '')) {
      if (group) picker.setSelection(group.modelIds);
      else render();
    }
  };
  byId('saveLineupPreset').onclick = () => open(false);
  byId('manageLineupPreset').onclick = () => open(true);
  byId('updateLineupPreset').onclick = () => {
    if (!active() || !state.selected.length) return;
    if (
      commit(
        groups.map((group) => (group.id === activeId ? { ...group, modelIds: [...state.selected] } : group)),
        activeId,
      )
    )
      render();
  };
  byId('lineupPresetForm').onsubmit = (event) => {
    event.preventDefault();
    const name = byId('lineupPresetName').value.trim();
    if (!name) {
      formMessage('请输入对战组名称。');
      return;
    }
    if (groups.some((group) => group.id !== editingId && group.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      formMessage('已有同名对战组，请换一个名称。');
      return;
    }
    if (!editingId && !state.selected.length) {
      formMessage('请先选择参赛模型。');
      return;
    }
    const id = editingId || crypto.randomUUID();
    const next = editingId
      ? groups.map((group) => (group.id === id ? { ...group, name } : group))
      : [...groups, { id, name, modelIds: [...state.selected] }];
    if (!commit(next, id)) {
      formMessage(storageError);
      return;
    }
    dialog.close();
    render();
  };
  byId('deleteLineupPreset').onclick = () => {
    if (
      !editingId ||
      !commit(
        groups.filter((group) => group.id !== editingId),
        '',
      )
    ) {
      formMessage(storageError);
      return;
    }
    dialog.close();
    render();
  };
  picker.subscribe((next) => {
    state = next;
    render();
  });
}
