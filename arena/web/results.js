// @ts-check
const resultSearch = /** @type {HTMLInputElement} */ (document.getElementById('resultSearch'));
const groups = /** @type {HTMLDetailsElement[]} */ ([...document.querySelectorAll('.result-group')]);
const clearResults = document.getElementById('clearResults');
const initialOpen = new Map();
let searching = false;
const total = document.querySelectorAll('[data-search]').length;
const filterResults = () => {
  const query = resultSearch.value.trim().toLowerCase();
  if (query && !searching) for (const group of groups) initialOpen.set(group, group.open);
  let matched = 0;
  for (const group of groups) {
    const items = /** @type {HTMLElement[]} */ ([...group.querySelectorAll('[data-search]')]);
    let visible = 0;
    for (const item of items) {
      item.hidden = !item.dataset.search.includes(query);
      if (!item.hidden) visible++;
    }
    group.hidden = visible === 0;
    if (query) group.open = visible > 0;
    else if (searching) group.open = initialOpen.get(group);
    group.querySelector('.group-count').textContent = query
      ? visible + ' / ' + items.length + ' 项'
      : items.length + ' 项';
    matched += visible;
  }
  searching = !!query;
  clearResults.hidden = resultSearch.value.length === 0;
  document.getElementById('resultCount').textContent = query
    ? '找到 ' + matched + ' / ' + total + ' 项'
    : '共 ' + total + ' 项';
  document.getElementById('resultEmpty').hidden = matched !== 0 || total === 0;
};
const resetResults = () => {
  resultSearch.value = '';
  filterResults();
  resultSearch.focus();
};
resultSearch.addEventListener('input', filterResults);
resultSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    resetResults();
  }
});
clearResults.addEventListener('click', resetResults);
window.addEventListener('pageshow', filterResults);
