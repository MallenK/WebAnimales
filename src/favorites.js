const KEY = 'wab_favorites';

export function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function saveFavorites(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function isFavorite(id) {
  return getFavorites().some(f => f.id === id);
}

export function toggleFavorite(taxon) {
  const list = getFavorites();
  const idx = list.findIndex(f => f.id === taxon.id);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift({ ...taxon, savedAt: Date.now() });
  }
  saveFavorites(list);
  return idx < 0; // true = added
}

export function renderFavoritesList(container, onSelect) {
  const list = getFavorites();
  container.innerHTML = '';
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'fav-empty';
    p.setAttribute('data-i', 'empty_favorites');
    p.textContent = 'No tienes favoritos aún.';
    container.appendChild(p);
    return;
  }
  list.forEach(f => {
    const li = document.createElement('li');
    li.className = 'fav-item';
    li.innerHTML = `
      <img src="${f.thumb || ''}" alt="" loading="lazy">
      <div class="fav-item__info">
        <strong>${f.title || ''}</strong>
        <div class="muted">${f.sci || ''}</div>
      </div>
      <button class="fav-del" data-id="${f.id}" aria-label="Quitar">×</button>
    `;
    li.querySelector('.fav-item__info, img').addEventListener('click', () => onSelect(f));
    li.querySelector('.fav-del').addEventListener('click', e => {
      e.stopPropagation();
      toggleFavorite(f);
      renderFavoritesList(container, onSelect);
      updateFavBadge();
    });
    container.appendChild(li);
  });
}

export function updateFavBadge() {
  const badge = document.getElementById('fav-badge');
  if (!badge) return;
  const count = getFavorites().length;
  badge.textContent = count;
  badge.hidden = count === 0;
}
