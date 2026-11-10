// @ts-check
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function renderTaskReview(host, event, onEvidence, dimensions = []) {
  host.hidden = !event;
  if (!event) return;
  const signature = JSON.stringify([event, dimensions]);
  if (host.dataset.content === signature) return;
  host.dataset.content = signature;
  const judge = event.judge.kind === 'agent' ? event.judge.agent : event.judge.model;
  const dimensionLabel = (id) => {
    const d = dimensions.find((item) => item.id === id);
    return d ? `${d.name}（${d.weight}%）` : id;
  };
  host.innerHTML = `<header><b>${event.status === 'working' ? '正式评分中' : event.status === 'pending' ? '评分失败 · 待评分' : '任务正式评分 ' + (event.grade.score * 100).toFixed(1) + '%'}</b><span>${esc(judge)}</span></header>${event.error ? `<p>${esc(event.error)}</p>` : ''}${event.grade ? `<details><summary>查看分项理由与轮次证据</summary>${event.grade.dimensions.map((d, i) => `<article><strong>${esc(dimensionLabel(d.id))} · ${d.score}/10</strong><p>${esc(d.reason)}</p>${d.evidence.map((e, j) => `<button type="button" data-evidence="${i}:${j}" title="定位此轮原文">${esc(e.roundId)} · “${esc(e.quote)}” ↗</button>`).join('')}</article>`).join('')}</details>` : ''}`;
  host.querySelectorAll('[data-evidence]').forEach(
    (button) =>
      (button.onclick = () => {
        const [i, j] = button.dataset.evidence.split(':').map(Number);
        onEvidence(event.grade.dimensions[i].evidence[j]);
      }),
  );
}
