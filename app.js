/* ==== Endpoints con locale ==== */
const ENDPOINTS = {
  // iNaturalist v1 (añadimos &locale=<es|ca>)
  taxa: (q, locale) =>
    `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&rank=species&locale=${locale}`,
  observations: (p, locale) => {
    const base = [
      p.taxon_id ? `taxon_id=${p.taxon_id}` : null,
      p.place_id ? `place_id=${p.place_id}` : null,
      (p.lat != null && p.lng != null) ? `lat=${p.lat}&lng=${p.lng}` : null,
      p.radius ? `radius=${p.radius}` : null,
      p.iconic_taxa ? `iconic_taxa=${encodeURIComponent(p.iconic_taxa)}` : null,
      `locale=${locale}`,
      "order=desc", "order_by=created_at", "geo=true", "verifiable=true",
      `per_page=${p.per_page ?? 200}`
    ].filter(Boolean).join("&");
    return `https://api.inaturalist.org/v1/observations?${base}`;
  },
  speciesCounts: (p, locale) => {
    const base = [
      p.place_id ? `place_id=${p.place_id}` : null,
      (p.lat != null && p.lng != null) ? `lat=${p.lat}&lng=${p.lng}` : null,
      p.radius ? `radius=${p.radius}` : null,
      p.iconic_taxa ? `iconic_taxa=${encodeURIComponent(p.iconic_taxa)}` : null,
      `locale=${locale}`,
      "per_page=50"
    ].filter(Boolean).join("&");
    return `https://api.inaturalist.org/v1/observations/species_counts?${base}`;
  },
  places: (q, locale) =>
    `https://api.inaturalist.org/v1/places/autocomplete?q=${encodeURIComponent(q)}&locale=${locale}`
};

/* ==== NUEVO: endpoint taxon por id ==== */
ENDPOINTS.taxon = (id, locale) =>
  `https://api.inaturalist.org/v1/taxa/${id}?locale=${locale}`;


// Wikipedia REST v1 search + summary
const WIKI = {
  searchTitle: (lang, q) =>
    `https://${lang}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=1`,
  pageSummary: (lang, key) =>
    `https://${lang}.wikipedia.org/w/rest.php/v1/page/summary/${encodeURIComponent(key)}`
};

// ==== i18n ====
const I18N = {
  es: {
    legend_points: "Observaciones recientes",
    search_title: "Buscar",
    mode_animal: "Animal",
    mode_species: "Especie",
    mode_place: "Zona",
    btn_search: "Buscar",
    search_hint: "Clica el globo para ver especies de la zona seleccionada.",
    results_title: "Resultados"
  },
  ca: {
    legend_points: "Observacions recents",
    search_title: "Cercar",
    mode_animal: "Animal",
    mode_species: "Espècie",
    mode_place: "Zona",
    btn_search: "Cercar",
    search_hint: "Clica el globus per veure espècies de la zona seleccionada.",
    results_title: "Resultats"
  }
};
let lang = "es"; // 'es' | 'ca'

// ==== Utils ====
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function setLang(next){
  lang = next;
  $$('.lang-btn').forEach(b=>b.classList.toggle('active', b.dataset.lang===lang));
  $$('[data-i]').forEach(el=>{
    const k = el.getAttribute('data-i');
    el.textContent = I18N[lang][k] || el.textContent;
  });
}
$$('.lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
setLang('es');

async function fetchJSON(url){
  const r = await fetch(url); // sin headers para evitar CORS
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  console.log("[DATA]", data); // solo datos
  return data;
}

/* ===== Traducción automática opcional (fallback) =====
   Usa LibreTranslate público para traducir resúmenes cuando no existen en ES/CAT.
   targetLang: 'es' | 'ca'
*/
async function autoTranslate(text, targetLang){
  try{
    if(!text || (targetLang !== 'es' && targetLang !== 'ca')) return text;
    const res = await fetch('https://libretranslate.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'en', target: targetLang })
    });
    if(!res.ok) return text;
    const j = await res.json();
    return j?.translatedText || text;
  }catch(_){ return text; }
}

/* ===== Wikipedia summary multi-idioma con fallback + traducción ===== */
async function getWikiSummary(preferred){
  // Primero intenta en lang actual, luego 'ca', 'es', y por último 'en'
  const order = lang === 'es' ? ['es','ca','en'] : ['ca','es','en'];
  for(const L of order){
    try{
      const s = await fetchJSON(WIKI.searchTitle(L, preferred));
      const key = s?.pages?.[0]?.key;
      if(!key) continue;
      const j = await fetchJSON(WIKI.pageSummary(L, key));
      let extract = j?.extract || '';
      const pageLang = j?.lang || L; // algunos summaries incluyen lang
      // Si acabamos con inglés pero el usuario quiere es/ca, traducimos
      if((lang === 'es' || lang === 'ca') && pageLang === 'en'){
        extract = await autoTranslate(extract, lang);
      }
      return {
        url: j?.content_urls?.desktop?.page,
        extract,
        thumb: j?.thumbnail?.source || ''
      };
    }catch(_){}
  }
  return {};
}

/* ==== Filtros de iconic taxa ==== */
let currentIconic = "";               // "" = todos
window.__lastArea = null;             // { lat, lng, radius }
window.__lastTaxon = null;            // { id, t }

function withIconic(params){
  return currentIconic ? { ...params, iconic_taxa: currentIconic } : params;
}

// barra de filtros (requiere <div id="filters"> con .chip[data-iconic])
const filtersEl = $('#filters');
if(filtersEl){
  filtersEl.addEventListener('click', (e)=>{
    const btn = e.target.closest('.chip');
    if(!btn) return;
    [...filtersEl.querySelectorAll('.chip')].forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentIconic = btn.dataset.iconic || "";
    if(window.__lastArea){
      loadSpeciesByArea(window.__lastArea);
    } else if(window.__lastTaxon){
      searchByTaxon(window.__lastTaxon);
    }
  });
}

// ==== Globo ====
const globe = Globe()
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .pointAltitude(0.01)
  .pointRadius(0.15)
  .pointColor(() => '#f59e0b')   // naranja
  .backgroundColor('#eef2f7')
  .polygonsData([])              // selección visual
  .polygonCapColor(()=>'rgba(34,197,94,0.25)')
  .polygonSideColor(()=>'rgba(34,197,94,0.6)')
  (document.getElementById('globe'));

let points = [];
function renderPoints(arr){
  globe.pointsData(arr);
  globe.pointLat(d=>d.latitude).pointLng(d=>d.longitude);
}
function flyTo(lat,lng,alt=1.8){ globe.pointOfView({ lat, lng, altitude: alt }, 1000); }

// círculo geodésico aproximado para marcar selección
function circleGeo(lat, lng, radiusKm=250, segments=128){
  const R = 6371;
  const ang = radiusKm / R;
  const pts = [];
  for(let i=0;i<=segments;i++){
    const brng = 2*Math.PI*i/segments;
    const lat1 = lat*Math.PI/180, lon1 = lng*Math.PI/180;
    const lat2 = Math.asin( Math.sin(lat1)*Math.cos(ang) + Math.cos(lat1)*Math.sin(ang)*Math.cos(brng) );
    const lon2 = lon1 + Math.atan2(Math.sin(brng)*Math.sin(ang)*Math.cos(lat1), Math.cos(ang)-Math.sin(lat1)*Math.sin(lat2));
    pts.push([ (lon2*180/Math.PI + 540)%360-180, lat2*180/Math.PI ]);
  }
  return { type:"Feature", geometry:{ type:"Polygon", coordinates:[pts] } };
}
function setSelection(lat,lng,r){
  const g = circleGeo(lat,lng,r);
  globe.polygonsData([g]).polygonGeoJsonGeometry(d=>d.geometry);
}

// ==== UI resultados ====
function li(item){
  const el = document.createElement('li');
  el.innerHTML = `<img src="${item.thumb||''}" alt="">
  <div><div><strong>${item.title||''}</strong></div><div class="muted">${item.subtitle||''}</div></div>`;
  el.addEventListener('click', ()=> openModalForTaxon(item.id, item));
  return el;
}

function showDetails(item, pan=false){
  $('#details').hidden = false;
  $('#title').textContent = item.title || '';
  $('#sci').textContent = item.subtitle || '';
  $('#rank').textContent = item.rank ? `Rango: ${item.rank}` : '';
  $('#summary').textContent = item.summary || '';
  $('#thumb').src = item.thumb || '';
  const a = $('#wiki');
  a.href = item.wiki || '#';
  a.style.display = item.wiki ? 'inline-block' : 'none';
  if(pan && item.firstPoint) flyTo(item.firstPoint.lat, item.firstPoint.lng, 2.2);
}

// ==== Flujos ====
// Click en globo -> especies + puntos (aplica filtro y locale)
globe.onGlobeClick(async ({lat, lng})=>{
  const radius = Number($('#radiusKm').value || 250);
  setSelection(lat,lng,radius);
  window.__lastArea = { lat, lng, radius };
  window.__lastTaxon = null;
  await loadSpeciesByArea(window.__lastArea);
});

async function loadSpeciesByArea({lat, lng, radius}){
  $('#list').innerHTML = '<li>Cargando…</li>';
  $('#details').hidden = true;

  try{
    const sc = await fetchJSON(ENDPOINTS.speciesCounts(withIconic({ lat, lng, radius }), lang));
    const items = [];
    for(const s of (sc.results||[])){
      const t = s.taxon || {};
      const common = t.preferred_common_name || t.name;
      const wikiTitle = (t.wikipedia_url && t.wikipedia_url.split('/').pop()) || t.name;
      const { url, extract, thumb } = await getWikiSummary(wikiTitle);
      items.push({
        id: t.id, title: common, subtitle: t.name, rank: t.rank,
        wiki: url || t.wikipedia_url, summary: extract || '', thumb: thumb || t.default_photo?.square_url
      });
    }
    $('#list').innerHTML = '';
    items.slice(0,50).forEach(it=> $('#list').appendChild(li(it)));

    const obs = await fetchJSON(ENDPOINTS.observations(withIconic({ lat, lng, radius, per_page: 200 }), lang));
    points = (obs.results||[]).map(o=>({ latitude:o.geojson?.coordinates[1], longitude:o.geojson?.coordinates[0] }))
              .filter(p=>Number.isFinite(p.latitude));
    renderPoints(points);
    flyTo(lat, lng, 1.6);
  }catch(err){
    $('#list').innerHTML = `<li>Error: ${String(err.message||err)}</li>`;
    renderPoints([]);
  }
}

// Búsqueda por animal/especie/zona (aplica filtro y locale)
$('#searchForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const mode = new FormData(e.target).get('mode');
  const q = $('#q').value.trim();
  $('#list').innerHTML = '';
  $('#details').hidden = true;

  try{
    if(mode === 'place'){
      const places = await fetchJSON(ENDPOINTS.places(q, lang));
      if(!places.results?.length){ $('#list').innerHTML = '<li>Sin resultados</li>'; renderPoints([]); return; }
      const place = places.results[0];
      const radius = Number($('#radiusKm').value || 250);
      setSelection(place.latitude, place.longitude, radius);
      window.__lastArea = { lat: place.latitude, lng: place.longitude, radius };
      window.__lastTaxon = null;
      await loadSpeciesByArea(window.__lastArea);
    } else {
      const taxa = await fetchJSON(ENDPOINTS.taxa(q, lang));
      if(!taxa.results?.length){ $('#list').innerHTML = '<li>Sin resultados</li>'; renderPoints([]); return; }
      const t = taxa.results[0];
      window.__lastArea = null;
      window.__lastTaxon = { id: t.id, t };
      await searchByTaxon(window.__lastTaxon);
    }
  }catch(err){
    $('#list').innerHTML = `<li>Error: ${String(err.message||err)}</li>`;
  }
});

async function searchByTaxon({ id, t }){
  const common = t.preferred_common_name || t.name;
  const wikiTitle = (t.wikipedia_url && t.wikipedia_url.split('/').pop()) || t.name;
  const { url, extract, thumb } = await getWikiSummary(wikiTitle);
  const item = {
    id, title: common, subtitle: t.name, rank: t.rank,
    wiki: url || t.wikipedia_url, summary: extract || '', thumb: thumb || t.default_photo?.square_url
  };
  $('#list').innerHTML = '';
  $('#list').appendChild(li(item));

  const obs = await fetchJSON(ENDPOINTS.observations(withIconic({ taxon_id: id, per_page: 200 }), lang));
  const pts = (obs.results||[]).map(o=>({ latitude:o.geojson?.coordinates[1], longitude:o.geojson?.coordinates[0] }))
                .filter(p=>Number.isFinite(p.latitude));
  renderPoints(pts);
  if(pts[0]) flyTo(pts[0].latitude, pts[0].longitude, 2.0);
  $('#details').hidden = false;
  showDetails(item);
}



// ==== Modal helpers ====
const modal = document.getElementById('modal');
const modalClose = document.getElementById('modalClose');

function openModal(){ modal.hidden = false; document.body.style.overflow='hidden'; }
function closeModal(){ modal.hidden = true; document.body.style.overflow=''; }

modal.addEventListener('click', e=>{ if(e.target === modal) closeModal(); });
modalClose.addEventListener('click', closeModal);
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !modal.hidden) closeModal(); });

// ==== Cargar detalles ampliados de iNaturalist + Wikipedia ====
async function openModalForTaxon(id, seed){
  try{
    openModal();
    // placeholder rápido
    fillModal({
      title: seed?.title || '',
      sci: seed?.subtitle || '',
      rank: seed?.rank || '',
      summary: seed?.summary || '',
      thumb: seed?.thumb || '',
      iconic_taxon_name: '',
      conservation_status: null,
      ancestry: [],
      photos: [],
      wiki: seed?.wiki || '',
      inatUrl: `https://www.inaturalist.org/taxa/${id}`
    });

    // 1) iNaturalist taxa/:id
    const tResp = await fetchJSON(ENDPOINTS.taxon(id, lang));
    const t = tResp?.results?.[0] || {};

    // 2) Wikipedia summary preferente usando nombre científico si aún no hay
    let wikiData = { url: seed?.wiki, extract: seed?.summary, thumb: seed?.thumb };
    if(!wikiData.extract){
      const wikiTitle = (t.wikipedia_url && t.wikipedia_url.split('/').pop()) || t.name || seed?.subtitle;
      wikiData = await getWikiSummary(wikiTitle || '');
    }

    // 3) Construcción de datos enriquecidos
    const ancestry = (t.ancestors || []).map(a => a.name).filter(Boolean);
    const photos = (t.taxon_photos || [])
      .map(tp => tp.photo?.url?.replace('square', 'medium'))
      .filter(Boolean)
      .slice(0, 12); // galería

    const status = t.conservation_status?.status || t.conservation_status?.iucn_status || null;
    const iconic = t.iconic_taxon_name || '';

    fillModal({
      title: t.preferred_common_name || t.name || seed?.title || '',
      sci: t.name || seed?.subtitle || '',
      rank: t.rank || seed?.rank || '',
      summary: wikiData.extract || '',
      thumb: wikiData.thumb || t.default_photo?.square_url || seed?.thumb || '',
      iconic_taxon_name: iconic,
      conservation_status: status,
      ancestry,
      photos,
      wiki: wikiData.url || t.wikipedia_url || seed?.wiki || '',
      inatUrl: `https://www.inaturalist.org/taxa/${id}`
    });

  }catch(err){
    console.error(err);
    fillModal({ summary:`Error: ${String(err.message||err)}` });
  }
}

function fillModal(d){
  // cabecera
  document.getElementById('mThumb').src = d.thumb || '';
  document.getElementById('modalTitle').textContent = d.title || '';
  document.getElementById('mSci').textContent = d.sci || '';
  document.getElementById('mRank').textContent = d.rank ? `Rango: ${d.rank}` : '';

  // badges
  const mIconic = document.getElementById('mIconic');
  const mStatus = document.getElementById('mStatus');
  mIconic.textContent = d.iconic_taxon_name ? `Iconic: ${d.iconic_taxon_name}` : '';
  mIconic.style.display = d.iconic_taxon_name ? 'inline-block' : 'none';
  mStatus.textContent = d.conservation_status ? `Estatus: ${d.conservation_status}` : '';
  mStatus.style.display = d.conservation_status ? 'inline-block' : 'none';

  // resumen
  document.getElementById('mSummary').textContent = d.summary || '';

  // jerarquía
  const anc = document.getElementById('mAncestry');
  anc.innerHTML = '';
  if (Array.isArray(d.ancestry) && d.ancestry.length){
    d.ancestry.forEach((name,i)=>{
      const span = document.createElement('span');
      span.textContent = name;
      if(i < d.ancestry.length-1) span.classList.add('sep');
      anc.appendChild(span);
    });
  }

  // galería
  const gal = document.getElementById('mGallery');
  gal.innerHTML = '';
  (d.photos||[]).forEach(src=>{
    const img = new Image();
    img.src = src;
    gal.appendChild(img);
  });

  // links
  const mWiki = document.getElementById('mWiki');
  const mINat = document.getElementById('mINat');
  if(d.wiki){ mWiki.href = d.wiki; mWiki.style.display='inline-block'; } else { mWiki.style.display='none'; }
  if(d.inatUrl){ mINat.href = d.inatUrl; mINat.style.display='inline-block'; } else { mINat.style.display='none'; }
}
