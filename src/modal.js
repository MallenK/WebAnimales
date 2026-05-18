import { fetchJSON, ENDPOINTS, getWikiSummary, fetchTopObservers, fetchHistogram, fetchSounds } from './api.js';
import { lang, t } from './i18n.js';
import { isFavorite, toggleFavorite, updateFavBadge } from './favorites.js';

const modal = document.getElementById('modal');

const IUCN = {
  EX: { bg: '#1a1a1a', color: '#fff', label: 'Extinto' },
  EW: { bg: '#4a1a1a', color: '#fff', label: 'Ext. silvestre' },
  CR: { bg: '#dc2626', color: '#fff', label: 'En peligro crítico' },
  EN: { bg: '#ea580c', color: '#fff', label: 'En peligro' },
  VU: { bg: '#d97706', color: '#fff', label: 'Vulnerable' },
  NT: { bg: '#ca8a04', color: '#111', label: 'Casi amenazado' },
  LC: { bg: '#16a34a', color: '#fff', label: 'Preocupación menor' },
  DD: { bg: '#6b7280', color: '#fff', label: 'Datos insuficientes' },
  NE: { bg: '#9ca3af', color: '#111', label: 'No evaluado' }
};

export function openModal() {
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modal.querySelector('.modal__dialog').focus();
}

export function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
}

export function initModal() {
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
    else if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') lightboxNav(-1);
    else if (e.key === 'ArrowRight') lightboxNav(1);
  });
}

// ==== Lightbox ====
let _lbPhotos = [];
let _lbIndex = 0;

export function initLightbox() {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightboxPrev').addEventListener('click', () => lightboxNav(-1));
  document.getElementById('lightboxNext').addEventListener('click', () => lightboxNav(1));
  lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });
}

function openLightbox(photos, startIndex) {
  _lbPhotos = photos;
  _lbIndex = startIndex;
  renderLightboxImage();
  document.getElementById('lightbox').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').hidden = true;
  if (modal.hidden) document.body.style.overflow = '';
}

function lightboxNav(dir) {
  const lb = document.getElementById('lightbox');
  if (lb.hidden || !_lbPhotos.length) return;
  _lbIndex = (_lbIndex + dir + _lbPhotos.length) % _lbPhotos.length;
  renderLightboxImage();
}

function renderLightboxImage() {
  document.getElementById('lightboxImg').src = _lbPhotos[_lbIndex];
  document.getElementById('lightboxCounter').textContent = `${_lbIndex + 1} / ${_lbPhotos.length}`;
}

export async function openModalForTaxon(id, seed) {
  openModal();

  // Quick placeholder while data loads
  fillModal({
    id,
    title: seed?.title || seed?.name || '',
    sci: seed?.subtitle || seed?.name || '',
    rank: seed?.rank || '',
    summary: t('loading'),
    thumb: seed?.thumb || '',
    iconic_taxon_name: '',
    conservation_status: null,
    ancestry: [],
    photos: [],
    wiki: seed?.wiki || '',
    inatUrl: `https://www.inaturalist.org/taxa/${id}`
  });

  try {
    const tResp = await fetchJSON(ENDPOINTS.taxon(id, lang));
    const taxon = tResp?.results?.[0] || {};

    const wikiTitle = (taxon.wikipedia_url && taxon.wikipedia_url.split('/').pop()) || taxon.name || seed?.subtitle;
    const wikiData = await getWikiSummary(wikiTitle || '', lang);

    const payload = {
      id,
      title: taxon.preferred_common_name || taxon.name || seed?.title || '',
      sci: taxon.name || seed?.subtitle || '',
      rank: taxon.rank || seed?.rank || '',
      rank_level: taxon.rank_level,
      iconic_taxon_name: taxon.iconic_taxon_name || '',
      conservation_status: taxon.conservation_status?.status || taxon.conservation_status?.iucn_status || null,
      establishment_means: taxon.establishment_means || null,
      endemic: Boolean(taxon.endemic),
      introduced: Boolean(taxon.introduced),
      threatened: Boolean(taxon.threatened),
      extinct: Boolean(taxon.extinct),
      ancestry: (taxon.ancestors || []).map(a => a.name).filter(Boolean),
      photos: (taxon.taxon_photos || [])
        .map(tp => tp.photo?.url?.replace('square', 'medium'))
        .filter(Boolean)
        .slice(0, 12),
      summary: wikiData.extract || seed?.summary || '',
      thumb: wikiData.thumb || taxon.default_photo?.square_url || seed?.thumb || '',
      wiki: wikiData.url || taxon.wikipedia_url || seed?.wiki || '',
      inatUrl: `https://www.inaturalist.org/taxa/${id}`,
      scientificName: taxon.name || seed?.subtitle || ''
    };

    fillModal(payload);
    loadExtraData(id, payload.scientificName, taxon.iconic_taxon_name);

  } catch (err) {
    const el = document.getElementById('mSummary');
    if (el) el.textContent = `${t('error_retry')} (${err.message})`;
  }
}

async function loadExtraData(id, scientificName, iconicTaxon) {
  const [observers, histogram] = await Promise.all([
    fetchTopObservers(id),
    fetchHistogram(id)
  ]);
  if (observers.length) renderTopObservers(observers);
  if (histogram && Object.keys(histogram).length) renderTrends(histogram);

  if (iconicTaxon === 'Aves' && scientificName) {
    const sounds = await fetchSounds(scientificName);
    if (sounds.length) renderSounds(sounds);
  }
}

function fillModal(d) {
  document.getElementById('mThumb').src = d.thumb || '';
  document.getElementById('modalTitle').textContent = d.title || '';
  document.getElementById('mSci').textContent = d.sci || '';
  document.getElementById('mRank').textContent = d.rank ? `${t('rank')}: ${d.rank}` : '';

  // Favorite button
  const favBtn = document.getElementById('mFavBtn');
  if (favBtn && d.id) {
    const fav = isFavorite(d.id);
    favBtn.classList.toggle('active', fav);
    favBtn.title = fav ? t('remove_favorite') : t('add_favorite');
    favBtn.onclick = () => {
      toggleFavorite({
        id: d.id, title: d.title, sci: d.sci,
        thumb: d.thumb, rank: d.rank, wiki: d.wiki, inatUrl: d.inatUrl
      });
      updateFavBadge();
      const nowFav = isFavorite(d.id);
      favBtn.classList.toggle('active', nowFav);
      favBtn.title = nowFav ? t('remove_favorite') : t('add_favorite');
    };
  }

  // Iconic badge
  const mIconic = document.getElementById('mIconic');
  mIconic.textContent = d.iconic_taxon_name || '';
  mIconic.hidden = !d.iconic_taxon_name;

  // IUCN status badge with color
  const mStatus = document.getElementById('mStatus');
  if (d.conservation_status) {
    const s = IUCN[d.conservation_status] || { bg: '#e5e7eb', color: '#111', label: d.conservation_status };
    mStatus.textContent = `${s.label} · ${d.conservation_status}`;
    mStatus.style.cssText = `background:${s.bg};color:${s.color};border-color:${s.bg}`;
    mStatus.hidden = false;
  } else {
    mStatus.hidden = true;
  }

  // Summary
  document.getElementById('mSummary').textContent = d.summary || '';

  // Facts list
  const facts = [
    d.establishment_means ? `${t('establishment')}: ${d.establishment_means}` : null,
    d.endemic ? `✓ ${t('endemic')}` : null,
    d.introduced ? `⚠ ${t('introduced')}` : null,
    d.threatened ? `⚠ ${t('threatened')}` : null,
    d.extinct ? `✗ ${t('extinct')}` : null
  ].filter(Boolean);

  let factsEl = document.getElementById('mFacts');
  if (!factsEl) {
    factsEl = document.createElement('ul');
    factsEl.id = 'mFacts';
    factsEl.className = 'modal__facts';
    document.getElementById('mSummary').insertAdjacentElement('afterend', factsEl);
  }
  factsEl.innerHTML = facts.map(f => `<li>${f}</li>`).join('');
  factsEl.hidden = !facts.length;

  // Ancestry chain
  const anc = document.getElementById('mAncestry');
  anc.innerHTML = '';
  if (Array.isArray(d.ancestry) && d.ancestry.length) {
    d.ancestry.forEach((name, i) => {
      const span = document.createElement('span');
      span.textContent = name;
      if (i < d.ancestry.length - 1) span.classList.add('sep');
      anc.appendChild(span);
    });
  }

  // Photo gallery with lightbox
  const gal = document.getElementById('mGallery');
  gal.innerHTML = '';
  const photos = d.photos || [];
  photos.forEach((src, idx) => {
    const img = new Image();
    img.src = src;
    img.loading = 'lazy';
    img.alt = d.title || '';
    img.addEventListener('click', () => openLightbox(photos, idx));
    gal.appendChild(img);
  });

  // Links
  const mWiki = document.getElementById('mWiki');
  const mINat = document.getElementById('mINat');
  mWiki.hidden = !d.wiki;
  if (d.wiki) mWiki.href = d.wiki;
  mINat.hidden = !d.inatUrl;
  if (d.inatUrl) mINat.href = d.inatUrl;

  // Reset dynamic sections on each open
  ['mSounds', 'mObservers', 'mTrends'].forEach(elId => {
    const el = document.getElementById(elId);
    if (el) el.innerHTML = '';
  });
}

function getOrCreateSection(id, className, insertBefore) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = className;
    document.getElementById(insertBefore).insertAdjacentElement('beforebegin', el);
  }
  return el;
}

function renderSounds(recordings) {
  const container = getOrCreateSection('mSounds', 'modal__sounds', 'mLinks');
  container.innerHTML = `<h4 class="modal__section-title">${t('sounds')}</h4>`;
  recordings.forEach(r => {
    const wrap = document.createElement('div');
    wrap.className = 'sound-item';
    wrap.innerHTML = `
      <div class="sound-meta">${r.en || r.sp || ''}${r.loc ? ` — ${r.loc}` : ''}</div>
      <audio controls preload="none">
        <source src="https://xeno-canto.org/${r.id}/download" type="audio/mpeg">
      </audio>
    `;
    container.appendChild(wrap);
  });
}

function renderTopObservers(observers) {
  const container = getOrCreateSection('mObservers', 'modal__observers', 'mLinks');
  container.innerHTML = `
    <h4 class="modal__section-title">${t('top_observers')}</h4>
    <ul class="observers-list">
      ${observers.map(o => `
        <li class="observer-item">
          <img src="${o.user?.icon_url || ''}" alt="${o.user?.login || ''}" loading="lazy">
          <div>
            <div class="observer-name">${o.user?.name || o.user?.login || ''}</div>
            <div class="observer-count">${o.observation_count} ${t('observations')}</div>
          </div>
        </li>
      `).join('')}
    </ul>`;
}

function renderTrends(histogram) {
  const container = getOrCreateSection('mTrends', 'modal__trends', 'mLinks');

  const entries = Object.entries(histogram)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12);

  if (!entries.length) return;

  const values = entries.map(([, v]) => v);
  const max = Math.max(...values) || 1;
  const W = 280, H = 48;
  const barW = (W / entries.length) - 2;

  const bars = entries.map(([date, val], i) => {
    const barH = Math.max(2, (val / max) * H);
    const x = i * (W / entries.length);
    const y = H - barH;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="var(--accent2)" rx="2" opacity="0.85">
      <title>${date}: ${val}</title>
    </rect>`;
  }).join('');

  container.innerHTML = `
    <h4 class="modal__section-title">${t('trends')}</h4>
    <svg class="trends-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${bars}</svg>
    <div class="trends-labels">
      <span>${entries[0]?.[0]?.slice(0, 7) || ''}</span>
      <span>${entries.at(-1)?.[0]?.slice(0, 7) || ''}</span>
    </div>`;
}
