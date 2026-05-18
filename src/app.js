import { initLang, setLang, lang, t } from './i18n.js';
import { ENDPOINTS, fetchJSON, getWikiSummary, fetchSpeciesOfDay } from './api.js';
import { initGlobe, renderPoints, flyTo, setSelection, onGlobeClick, toggleHeatmap, setGlobeTheme } from './globe.js';
import { openModalForTaxon, initModal, initLightbox } from './modal.js';
import { isFavorite, toggleFavorite, renderFavoritesList, updateFavBadge } from './favorites.js';
import { addToHistory, renderHistoryChips } from './history.js';
import { encodeState, decodeState, copyShareLink } from './share.js';

// ==== State ====
let currentIconic = '';
let currentIUCN = '';
let currentView = 'list';
window.__lastArea = null;
window.__lastTaxon = null;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function withIconic(params) {
  return currentIconic ? { ...params, iconic_taxa: currentIconic } : params;
}

// ==== Bootstrap ====
document.addEventListener('DOMContentLoaded', async () => {
  initLang();
  initModal();
  initLightbox();
  initGlobe('globe');
  initFilters();
  initDarkMode();
  initHeatmapToggle();
  initFavoritesPanel();
  initShareBtn();
  initResultsFilter();
  initIUCNFilter();
  initViewToggle();
  initResultsTabs();
  refreshHistoryChips();
  updateFavBadge();
  loadSpeciesOfDay();

  onGlobeClick(async ({ lat, lng }) => {
    const radius = Number($('#radiusKm').value || 250);
    setSelection(lat, lng, radius);
    window.__lastArea = { lat, lng, radius };
    window.__lastTaxon = null;
    encodeState({ type: 'area', lat, lng, radius });
    await loadSpeciesByArea(window.__lastArea);
  });

  // Restore state from URL params
  const state = decodeState();
  if (state) {
    if (state.type === 'area') {
      setSelection(state.lat, state.lng, state.radius);
      window.__lastArea = state;
      await loadSpeciesByArea(state);
    } else if (state.type === 'taxon') {
      await openModalForTaxon(state.id, {});
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});

// ==== Species of the day ====
async function loadSpeciesOfDay() {
  const sod = document.getElementById('speciesOfDay');
  if (!sod) return;
  const species = await fetchSpeciesOfDay();
  if (!species) return;
  sod.innerHTML = `
    <img src="${species.thumb || ''}" alt="${species.title || ''}">
    <div>
      <div class="sod-label">🌟 Especie del día</div>
      <div class="sod-title">${species.title || ''}</div>
      <div class="sod-sci">${species.subtitle || ''}</div>
    </div>
  `;
  sod.hidden = false;
  sod.addEventListener('click', () => openModalForTaxon(species.id, species));
}

// ==== Results filter ====
function initResultsFilter() {
  const input = document.getElementById('resultsFilter');
  const countEl = document.getElementById('resultsCount');
  if (!input) return;
  input.addEventListener('input', applyListFilters);
}

function resetResultsFilter() {
  const input = document.getElementById('resultsFilter');
  const countEl = document.getElementById('resultsCount');
  if (input) input.value = '';
  if (countEl) countEl.textContent = '';
}

// ==== IUCN filter ====
function initIUCNFilter() {
  const container = document.getElementById('iucnFilters');
  if (!container) return;
  container.addEventListener('click', e => {
    const btn = e.target.closest('.chip[data-iucn]');
    if (!btn) return;
    container.querySelectorAll('.chip[data-iucn]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentIUCN = btn.dataset.iucn || '';
    applyListFilters();
  });
}

function applyListFilters() {
  const input = document.getElementById('resultsFilter');
  const countEl = document.getElementById('resultsCount');
  const q = input ? input.value.trim().toLowerCase() : '';
  const items = document.querySelectorAll('#list .list-item');
  let visible = 0;
  items.forEach(li => {
    const text = li.querySelector('.li-info')?.textContent.toLowerCase() || '';
    const iucn = li.dataset.iucn || '';
    const textMatch = !q || text.includes(q);
    const iucnMatch = !currentIUCN || iucn === currentIUCN;
    const show = textMatch && iucnMatch;
    li.hidden = !show;
    if (show) visible++;
  });
  if (countEl) {
    countEl.textContent = items.length ? `${visible} / ${items.length}` : '';
  }
}

// ==== View toggle (list / grid) ====
function initViewToggle() {
  const listBtn = document.getElementById('viewList');
  const gridBtn = document.getElementById('viewGrid');
  if (!listBtn || !gridBtn) return;
  listBtn.addEventListener('click', () => setViewMode('list'));
  gridBtn.addEventListener('click', () => setViewMode('grid'));
}

function setViewMode(mode) {
  currentView = mode;
  const list = document.getElementById('list');
  const listBtn = document.getElementById('viewList');
  const gridBtn = document.getElementById('viewGrid');
  if (!list) return;
  list.classList.toggle('list--grid', mode === 'grid');
  listBtn?.classList.toggle('active', mode === 'list');
  gridBtn?.classList.toggle('active', mode === 'grid');
}

// ==== Results tabs (Resultados / Guardados) ====
function initResultsTabs() {
  const tabs = document.querySelectorAll('.tab-btn[data-tab]');
  const resultsView = document.getElementById('resultsView');
  const savedView = document.getElementById('savedView');
  if (!tabs.length || !resultsView || !savedView) return;

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      resultsView.hidden = tab !== 'results';
      savedView.hidden = tab !== 'saved';
      if (tab === 'saved') renderSavedTab();
    });
  });

  // Saved filter
  const savedFilter = document.getElementById('savedFilter');
  if (savedFilter) {
    savedFilter.addEventListener('input', () => {
      const q = savedFilter.value.trim().toLowerCase();
      document.querySelectorAll('#savedList .list-item').forEach(li => {
        const text = li.querySelector('.li-info')?.textContent.toLowerCase() || '';
        li.hidden = q ? !text.includes(q) : false;
      });
    });
  }
}

function renderSavedTab() {
  const savedList = document.getElementById('savedList');
  if (!savedList) return;
  const { getFavorites } = window.__favModule || {};
  // Access favorites from localStorage directly
  const favs = JSON.parse(localStorage.getItem('wab_favorites') || '[]');
  savedList.innerHTML = '';
  if (!favs.length) {
    savedList.innerHTML = `<li class="list-state">${t('empty_favorites')}</li>`;
    return;
  }
  favs.forEach(fav => {
    const li = createListItem({
      id: fav.id,
      title: fav.title,
      subtitle: fav.sci,
      thumb: fav.thumb,
      wiki: fav.wiki,
      conservation_status: null
    });
    savedList.appendChild(li);
  });
}

// ==== Filters ====
function initFilters() {
  const filtersEl = $('#filters');
  if (!filtersEl) return;
  filtersEl.addEventListener('click', e => {
    const btn = e.target.closest('.chip[data-iconic]');
    if (!btn) return;
    $$('.chip[data-iconic]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentIconic = btn.dataset.iconic || '';
    if (window.__lastArea) loadSpeciesByArea(window.__lastArea);
    else if (window.__lastTaxon) searchByTaxon(window.__lastTaxon);
  });
}

// ==== Dark mode ====
function initDarkMode() {
  const btn = $('#darkToggle');
  if (!btn) return;
  const stored = localStorage.getItem('wab_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = stored || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);

  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('wab_theme', next);
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('#darkToggle');
  if (btn) btn.classList.toggle('active', theme === 'dark');
  setGlobeTheme(theme);
}

// ==== Heatmap toggle ====
function initHeatmapToggle() {
  const btn = $('#heatmapToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const active = btn.classList.toggle('active');
    toggleHeatmap(active);
    btn.textContent = active ? t('points_mode') : t('heatmap');
  });
}

// ==== Favorites panel ====
function initFavoritesPanel() {
  const toggleBtn = $('#favToggle');
  const panel = $('#favoritesPanel');
  const list = $('#favList');
  const closeBtn = $('#favClose');
  if (!toggleBtn || !panel) return;

  toggleBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = panel.classList.toggle('open');
    if (open && list) {
      renderFavoritesList(list, fav => {
        openModalForTaxon(fav.id, { title: fav.title, subtitle: fav.sci, thumb: fav.thumb, wiki: fav.wiki });
        panel.classList.remove('open');
      });
    }
  });

  closeBtn?.addEventListener('click', () => panel.classList.remove('open'));

  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && e.target !== toggleBtn) {
      panel.classList.remove('open');
    }
  });
}

// ==== Share button ====
function initShareBtn() {
  const btn = $('#shareBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const ok = await copyShareLink();
    const orig = btn.querySelector('span').textContent;
    btn.querySelector('span').textContent = ok ? t('copied') : '✗';
    setTimeout(() => { btn.querySelector('span').textContent = orig; }, 2000);
  });
}

// ==== History chips ====
function refreshHistoryChips() {
  const container = $('#historyChips');
  if (!container) return;
  renderHistoryChips(container, (query, mode) => {
    $('#q').value = query;
    const radio = document.querySelector(`input[name="mode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    $('#searchForm').dispatchEvent(new Event('submit'));
  });
}

// ==== Search form ====
$('#searchForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const mode = new FormData(e.target).get('mode');
  const q = $('#q').value.trim();
  if (!q) return;

  addToHistory(q, mode);
  refreshHistoryChips();

  setListLoading();
  $('#details').hidden = true;

  try {
    if (mode === 'place') {
      const places = await fetchJSON(ENDPOINTS.places(q, lang));
      if (!places.results?.length) { setListEmpty(); renderPoints([]); return; }
      const place = places.results[0];
      const radius = Number($('#radiusKm').value || 250);
      setSelection(place.latitude, place.longitude, radius);
      window.__lastArea = { lat: place.latitude, lng: place.longitude, radius };
      window.__lastTaxon = null;
      encodeState({ type: 'area', lat: place.latitude, lng: place.longitude, radius });
      await loadSpeciesByArea(window.__lastArea);
    } else {
      const taxa = await fetchJSON(ENDPOINTS.taxa(q, lang));
      if (!taxa.results?.length) { setListEmpty(); renderPoints([]); return; }
      const taxon = taxa.results[0];
      window.__lastArea = null;
      window.__lastTaxon = { id: taxon.id, taxonData: taxon };
      encodeState({ type: 'taxon', id: taxon.id });
      await searchByTaxon(window.__lastTaxon);
    }
  } catch {
    setListError();
  }
});

// ==== Data flows ====
async function loadSpeciesByArea({ lat, lng, radius }) {
  setListLoading();
  showGlobeLoader();
  $('#details').hidden = true;

  try {
    const sc = await fetchJSON(ENDPOINTS.speciesCounts(withIconic({ lat, lng, radius }), lang));
    const items = [];

    for (const s of (sc.results || [])) {
      const taxon = s.taxon || {};
      const common = taxon.preferred_common_name || taxon.name;
      const wikiTitle = (taxon.wikipedia_url && taxon.wikipedia_url.split('/').pop()) || taxon.name;
      const { url, extract, thumb } = await getWikiSummary(wikiTitle, lang);
      items.push({
        id: taxon.id,
        title: common,
        subtitle: taxon.name,
        rank: taxon.rank,
        wiki: url || taxon.wikipedia_url,
        summary: extract || '',
        thumb: thumb || taxon.default_photo?.square_url,
        conservation_status: taxon.conservation_status?.status || null
      });
    }

    $('#list').innerHTML = '';
    items.slice(0, 50).forEach(it => $('#list').appendChild(createListItem(it)));
    setViewMode(currentView);

    const obs = await fetchJSON(ENDPOINTS.observations(withIconic({ lat, lng, radius, per_page: 200 }), lang));
    const pts = (obs.results || [])
      .map(o => ({ latitude: o.geojson?.coordinates[1], longitude: o.geojson?.coordinates[0] }))
      .filter(p => Number.isFinite(p.latitude));
    renderPoints(pts);
  } catch {
    setListError();
    renderPoints([]);
  } finally {
    hideGlobeLoader();
  }
}

async function searchByTaxon({ id, taxonData }) {
  showGlobeLoader();
  const common = taxonData.preferred_common_name || taxonData.name;
  const wikiTitle = (taxonData.wikipedia_url && taxonData.wikipedia_url.split('/').pop()) || taxonData.name;
  const { url, extract, thumb } = await getWikiSummary(wikiTitle, lang);
  const item = {
    id,
    title: common,
    subtitle: taxonData.name,
    rank: taxonData.rank,
    wiki: url || taxonData.wikipedia_url,
    summary: extract || '',
    thumb: thumb || taxonData.default_photo?.square_url
  };

  $('#list').innerHTML = '';
  $('#list').appendChild(createListItem(item));
  setViewMode(currentView);

  const obs = await fetchJSON(ENDPOINTS.observations(withIconic({ taxon_id: id, per_page: 200 }), lang));
  const pts = (obs.results || [])
    .map(o => ({ latitude: o.geojson?.coordinates[1], longitude: o.geojson?.coordinates[0] }))
    .filter(p => Number.isFinite(p.latitude));
  renderPoints(pts);
  if (pts[0]) flyTo(pts[0].latitude, pts[0].longitude, 10);
  showDetails(item);
  hideGlobeLoader();
}

// ==== List item factory ====
function createListItem(item) {
  const li = document.createElement('li');
  const statusColor = IUCN_COLOR[item.conservation_status];
  li.className = 'list-item';
  if (item.conservation_status) li.dataset.iucn = item.conservation_status;
  li.innerHTML = `
    <img src="${item.thumb || ''}" alt="" loading="lazy">
    <div class="li-info">
      <strong>${item.title || ''}</strong>
      <div class="muted">${item.subtitle || ''}</div>
      ${statusColor ? `<span class="badge badge--iucn" style="background:${statusColor.bg};color:${statusColor.color}">${item.conservation_status}</span>` : ''}
    </div>
    <button class="fav-star${isFavorite(item.id) ? ' active' : ''}" type="button" aria-label="${t('add_favorite')}">★</button>
  `;
  li.querySelector('.fav-star').addEventListener('click', e => {
    e.stopPropagation();
    toggleFavorite({ id: item.id, title: item.title, sci: item.subtitle, thumb: item.thumb, wiki: item.wiki });
    e.currentTarget.classList.toggle('active');
    updateFavBadge();
  });
  li.addEventListener('click', e => {
    if (!e.target.classList.contains('fav-star')) openModalForTaxon(item.id, item);
  });
  return li;
}

const IUCN_COLOR = {
  EX: { bg: '#1a1a1a', color: '#fff' },
  EW: { bg: '#4a1a1a', color: '#fff' },
  CR: { bg: '#dc2626', color: '#fff' },
  EN: { bg: '#ea580c', color: '#fff' },
  VU: { bg: '#d97706', color: '#fff' },
  NT: { bg: '#ca8a04', color: '#111' },
  LC: { bg: '#16a34a', color: '#fff' },
  DD: { bg: '#6b7280', color: '#fff' }
};

// ==== Details panel ====
function showDetails(item) {
  $('#details').hidden = false;
  $('#title').textContent = item.title || '';
  $('#sci').textContent = item.subtitle || '';
  $('#rank').textContent = item.rank ? `${t('rank')}: ${item.rank}` : '';
  $('#summary').textContent = item.summary || '';
  $('#thumb').src = item.thumb || '';
  const a = $('#wiki');
  a.href = item.wiki || '#';
  a.style.display = item.wiki ? 'inline-block' : 'none';
}

// ==== Globe loader ====
function showGlobeLoader() {
  const el = document.getElementById('globeLoader');
  if (el) el.hidden = false;
}
function hideGlobeLoader() {
  const el = document.getElementById('globeLoader');
  if (el) el.hidden = true;
}

// ==== List state helpers ====
function setListLoading() {
  const skel = Array.from({ length: 5 }, () => `
    <li class="list-item list-item--skeleton">
      <div class="skel-img skel-anim"></div>
      <div class="li-info">
        <div class="skel-line skel-anim" style="width:62%"></div>
        <div class="skel-line skel-anim" style="width:40%;margin-top:6px"></div>
      </div>
    </li>
  `).join('');
  $('#list').innerHTML = skel;
  resetResultsFilter();
}
function setListEmpty() {
  $('#list').innerHTML = `<li class="list-state">${t('no_results')}</li>`;
  resetResultsFilter();
}
function setListError() {
  $('#list').innerHTML = `<li class="list-state list-state--error">${t('error_retry')}</li>`;
  resetResultsFilter();
}
