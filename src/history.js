const KEY = 'wab_history';
const MAX = 10;

export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function addToHistory(query, mode) {
  if (!query.trim()) return;
  const list = getHistory().filter(h => !(h.query === query && h.mode === mode));
  list.unshift({ query, mode, ts: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

export function renderHistoryChips(container, onSelect) {
  const list = getHistory();
  container.innerHTML = '';
  if (!list.length) return;
  list.slice(0, 6).forEach(h => {
    const btn = document.createElement('button');
    btn.className = 'chip chip--history';
    btn.textContent = h.query;
    btn.type = 'button';
    btn.title = h.mode;
    btn.addEventListener('click', () => onSelect(h.query, h.mode));
    container.appendChild(btn);
  });
}
