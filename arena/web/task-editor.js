const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const newRounds = () =>
  [1, 2].map((i) => ({ id: `r-${crypto.randomUUID()}`, title: i === 1 ? '初步交付' : '修订交付', input: '' }));
export function rubricEditor(host, getRule, setRule, defaultRule, changed, inherit) {
  function draw() {
    const rule = getRule() ?? defaultRule();
    host.innerHTML = `${inherit ? '<label class="check"><input type="checkbox" data-inherit>沿用题库默认评分</label>' : '<h3>多维评分标准</h3>'}<p class="rule-hint">各维度按 0–10 分评审。写明充分、部分满足及扣分条件，允许合理的不同答案。</p><div class="rubric-dimensions">${rule.dimensions.map((d, i) => `<fieldset class="rubric-dimension" data-dimension="${i}"><div><label>维度名称<input data-key="name" value="${esc(d.name)}" required></label><label class="weight">权重 %<input type="number" data-key="weight" min="1" max="100" value="${d.weight}" required></label><button type="button" data-remove="${i}" class="quiet" aria-label="删除维度 ${esc(d.name)}"${rule.dimensions.length <= 1 ? ' disabled' : ''}>×</button></div><label>得分条件<textarea data-key="criteria" rows="3" required>${esc(d.criteria)}</textarea></label></fieldset>`).join('')}</div><div class="rubric-total"><span role="status"></span><button type="button" data-add class="quiet"${rule.dimensions.length >= 12 ? ' disabled' : ''}>＋ 评分维度</button></div>`;
    const total = () => {
      const sum = (getRule() ?? defaultRule()).dimensions.reduce((n, d) => n + d.weight, 0);
      const label = host.querySelector('.rubric-total span');
      label.textContent = `权重合计 ${sum}% / 100%`;
      label.dataset.invalid = String(Math.abs(sum - 100) > 1e-8);
    };
    if (inherit) {
      const input = host.querySelector('[data-inherit]');
      input.checked = !getRule();
      input.onchange = () => {
        setRule(input.checked ? undefined : structuredClone(defaultRule()));
        draw();
        changed();
      };
    }
    host.querySelectorAll('[data-key]').forEach(
      (input) =>
        (input.oninput = () => {
          const next = structuredClone(getRule() ?? defaultRule()),
            index = Number(input.closest('[data-dimension]').dataset.dimension);
          next.dimensions[index][input.dataset.key] = input.type === 'number' ? Number(input.value) : input.value;
          setRule(next);
          if (inherit) host.querySelector('[data-inherit]').checked = false;
          total();
          changed();
        }),
    );
    host.querySelectorAll('[data-remove]').forEach(
      (button) =>
        (button.onclick = () => {
          const next = structuredClone(getRule() ?? defaultRule());
          next.dimensions.splice(Number(button.dataset.remove), 1);
          setRule(next);
          draw();
          changed();
        }),
    );
    host.querySelector('[data-add]').onclick = () => {
      const next = structuredClone(getRule() ?? defaultRule());
      next.dimensions.push({ id: `d-${crypto.randomUUID()}`, name: '新维度', weight: 10, criteria: '' });
      setRule(next);
      draw();
      changed();
    };
    total();
  }
  draw();
}
export function roundsEditor(host, task, material, changed) {
  function preview() {
    host.querySelectorAll('[data-preview]').forEach((node) => {
      const index = Number(node.dataset.preview);
      node.textContent =
        material() +
        task.rounds
          .slice(0, index + 1)
          .map(
            (r, i) =>
              `\n\n第 ${i + 1} 轮 · ${r.title}\n${r.input}${i < index ? '\n[这里携带该模型在本轮的实际回答]' : ''}`,
          )
          .join('');
    });
  }
  function draw() {
    host.innerHTML = `<div class="rounds-heading"><div><h3>预编排轮次</h3><p class="muted">所有模型收到相同要求；新一轮携带自己的历史回答。共 2–5 轮。</p></div><button type="button" data-add-round${task.rounds.length >= 5 ? ' disabled' : ''}>＋ 添加轮次</button></div>${task.rounds.map((r, i) => `<article class="round-editor" data-round="${i}"><header><b>第 ${i + 1} 轮</b><button type="button" data-move="-1" aria-label="第 ${i + 1} 轮上移"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" data-move="1" aria-label="第 ${i + 1} 轮下移"${i === task.rounds.length - 1 ? ' disabled' : ''}>↓</button><button type="button" data-delete-round aria-label="删除第 ${i + 1} 轮"${task.rounds.length <= 2 ? ' disabled' : ''}>删除</button></header><label>轮次标题<input data-round-key="title" value="${esc(r.title)}" required></label><label>本轮新增材料、约束与交付要求<textarea data-round-key="input" rows="5" required>${esc(r.input)}</textarea></label><details><summary>预览到第 ${i + 1} 轮的完整上下文</summary><pre data-preview="${i}"></pre></details></article>`).join('')}`;
    host.querySelector('[data-add-round]').onclick = () => {
      task.rounds.push({ id: `r-${crypto.randomUUID()}`, title: '新增要求', input: '' });
      draw();
      changed();
    };
    host.querySelectorAll('[data-round-key]').forEach(
      (input) =>
        (input.oninput = () => {
          task.rounds[Number(input.closest('[data-round]').dataset.round)][input.dataset.roundKey] = input.value;
          preview();
          changed();
        }),
    );
    host.querySelectorAll('[data-move]').forEach(
      (button) =>
        (button.onclick = () => {
          const i = Number(button.closest('[data-round]').dataset.round),
            j = i + Number(button.dataset.move);
          [task.rounds[i], task.rounds[j]] = [task.rounds[j], task.rounds[i]];
          draw();
          changed();
        }),
    );
    host.querySelectorAll('[data-delete-round]').forEach(
      (button) =>
        (button.onclick = () => {
          task.rounds.splice(Number(button.closest('[data-round]').dataset.round), 1);
          draw();
          changed();
        }),
    );
    preview();
  }
  draw();
  return preview;
}
