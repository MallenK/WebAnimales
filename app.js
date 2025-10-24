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
  console.info("[i18n] idioma activo ->", lang);
}
$$('.lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
setLang('es');

async function fetchJSON(url){
  console.groupCollapsed("%c[HTTP] GET", "color:#0366d6;font-weight:700", url);
  console.time(`[HTTP] ${url}`);
  try{
    const r = await fetch(url); // sin headers para evitar CORS
    const ok = r.ok;
    const status = r.status;
    const textCloned = r.clone();
    let data;
    try{
      data = await r.json();
    }catch(e){
      console.warn("[HTTP] respuesta no-JSON");
      throw e;
    }
    const size = JSON.stringify(data)?.length ?? 0;
    console.info("[HTTP] status:", status, "ok:", ok, "bytes:", size);
    // muestra vista previa segura
    const preview = Array.isArray(data) ? data.slice(0,2) : (data?.results ? data.results.slice?.(0,2) : data);
    console.debug("[HTTP] preview:", preview);
    console.timeEnd(`[HTTP] ${url}`);
    console.groupEnd();
    if(!ok) throw new Error(`HTTP ${status}`);
    return data;
  }catch(err){
    console.timeEnd(`[HTTP] ${url}`);
    console.error("[HTTP] error:", err);
    console.groupEnd();
    throw err;
  }
}

/* ===== Traducción automática opcional (fallback) ===== */
async function autoTranslate(text, targetLang){
  try{
    if(!text || (targetLang !== 'es' && targetLang !== 'ca')) return text;
    console.groupCollapsed("%c[TR] LibreTranslate", "color:#a855f7;font-weight:700", { targetLang });
    console.time("[TR] request");
    const res = await fetch('https://libretranslate.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'en', target: targetLang })
    });
    if(!res.ok){
      console.warn("[TR] fallo HTTP:", res.status);
      console.timeEnd("[TR] request");
      console.groupEnd();
      return text;
    }
    const j = await res.json();
    console.info("[TR] ok");
    console.timeEnd("[TR] request");
    console.groupEnd();
    return j?.translatedText || text;
  }catch(err){
    console.warn("[TR] error:", err);
    return text;
  }
}

/* ===== Wikipedia summary multi-idioma con fallback + traducción ===== */
async function getWikiSummary(preferred){
  const order = lang === 'es' ? ['es','ca','en'] : ['ca','es','en'];
  console.groupCollapsed("%c[WIKI] summary", "color:#16a34a;font-weight:700", { preferred, order });
  for(const L of order){
    try{
      console.debug("[WIKI] search title ->", { L, preferred });
      const s = await fetchJSON(WIKI.searchTitle(L, preferred));
      const key = s?.pages?.[0]?.key;
      console.debug("[WIKI] found key:", key);
      if(!key) continue;
      const j = await fetchJSON(WIKI.pageSummary(L, key));
      let extract = j?.extract || '';
      const pageLang = j?.lang || L;
      if((lang === 'es' || lang === 'ca') && pageLang === 'en'){
        console.debug("[WIKI] traduciendo extract EN ->", lang);
        extract = await autoTranslate(extract, lang);
      }
      console.groupEnd();
      return {
        url: j?.content_urls?.desktop?.page,
        extract,
        thumb: j?.thumbnail?.source || ''
      };
    }catch(err){
      console.warn("[WIKI] intento fallido", { L, err: String(err) });
    }
  }
  console.groupEnd();
  return {};
}

/* ==== Filtros de iconic taxa ==== */
let currentIconic = "";               // "" = todos
window.__lastArea = null;             // { lat, lng, radius }
window.__lastTaxon = null;            // { id, t }

function withIconic(params){
  const out = currentIconic ? { ...params, iconic_taxa: currentIconic } : params;
  console.debug("[Filters] withIconic in/out", { in: params, iconic: currentIconic, out });
  return out;
}

// barra de filtros
const filtersEl = $('#filters');
if(filtersEl){
  filtersEl.addEventListener('click', (e)=>{
    const btn = e.target.closest('.chip');
    if(!btn) return;
    [...filtersEl.querySelectorAll('.chip')].forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentIconic = btn.dataset.iconic || "";
    console.info("[UI] filtro icónico cambiado ->", currentIconic);
    if(window.__lastArea){
      console.info("[UI] refrescando por área previa");
      loadSpeciesByArea(window.__lastArea);
    } else if(window.__lastTaxon){
      console.info("[UI] refrescando por taxón previo");
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
  console.debug("[GLOBE] render points:", { count: arr?.length ?? 0 });
  globe.pointsData(arr);
  globe.pointLat(d=>d.latitude).pointLng(d=>d.longitude);
}
function flyTo(lat,lng,alt=1.8){
  console.debug("[GLOBE] flyTo", { lat, lng, alt });
  globe.pointOfView({ lat, lng, altitude: alt }, 1000);
}

// círculo geodésico aproximado
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
  console.info("[GLOBE] selection", { lat, lng, radiusKm:r });
  const g = circleGeo(lat,lng,r);
  globe.polygonsData([g]).polygonGeoJsonGeometry(d=>d.geometry);
}

// ==== UI resultados ====
function li(item){
  const el = document.createElement('li');
  el.innerHTML = `<img src="${item.thumb||''}" alt="">
  <div><div><strong>${item.title||''}</strong></div><div class="muted">${item.subtitle||''}</div></div>`;
  el.addEventListener('click', ()=>{
    console.info("[UI] click resultado -> abrir modal", { id:item.id, title:item.title });
    openModalForTaxon(item.id, item);
  });
  return el;
}

function showDetails(item, pan=false){
  console.debug("[UI] showDetails", { item, pan });
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
// Click en globo -> especies + puntos
globe.onGlobeClick(async ({lat, lng})=>{
  const radius = Number($('#radiusKm').value || 250);
  console.info("[UI] globe click", { lat, lng, radiusKm:radius, lang, iconic: currentIconic });
  setSelection(lat,lng,radius);
  window.__lastArea = { lat, lng, radius };
  window.__lastTaxon = null;
  await loadSpeciesByArea(window.__lastArea);
});

async function loadSpeciesByArea({lat, lng, radius}){
  console.groupCollapsed("%c[FLOW] loadSpeciesByArea", "color:#f59e0b;font-weight:700", { lat, lng, radius, lang, iconic: currentIconic });
  $('#list').innerHTML = '<li>Cargando…</li>';
  $('#details').hidden = true;

  try{
    const scURL = ENDPOINTS.speciesCounts(withIconic({ lat, lng, radius }), lang);
    console.debug("[FLOW] speciesCounts URL:", scURL);
    const sc = await fetchJSON(scURL);

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
    console.info("[FLOW] species items:", items.length);
    $('#list').innerHTML = '';
    items.slice(0,50).forEach(it=> $('#list').appendChild(li(it)));

    const obsURL = ENDPOINTS.observations(withIconic({ lat, lng, radius, per_page: 200 }), lang);
    console.debug("[FLOW] observations URL:", obsURL);
    const obs = await fetchJSON(obsURL);
    points = (obs.results||[]).map(o=>({ latitude:o.geojson?.coordinates[1], longitude:o.geojson?.coordinates[0] }))
              .filter(p=>Number.isFinite(p.latitude));
    console.info("[FLOW] obs points:", points.length);
    renderPoints(points);
    flyTo(lat, lng, 1.6);
  }catch(err){
    console.error("[FLOW] loadSpeciesByArea error:", err);
    $('#list').innerHTML = `<li>Error: ${String(err.message||err)}</li>`;
    renderPoints([]);
  }finally{
    console.groupEnd();
  }
}

// Búsqueda por animal/especie/zona
$('#searchForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const mode = new FormData(e.target).get('mode');
  const q = $('#q').value.trim();
  console.groupCollapsed("%c[FLOW] submit search", "color:#22c55e;font-weight:700", { mode, q, lang, iconic: currentIconic });
  $('#list').innerHTML = '';
  $('#details').hidden = true;

  try{
    if(mode === 'place'){
      const placesURL = ENDPOINTS.places(q, lang);
      console.debug("[FLOW] places URL:", placesURL);
      const places = await fetchJSON(placesURL);
      if(!places.results?.length){
        console.info("[FLOW] places sin resultados");
        $('#list').innerHTML = '<li>Sin resultados</li>'; renderPoints([]); console.groupEnd(); return;
      }
      const place = places.results[0];
      const radius = Number($('#radiusKm').value || 250);
      console.info("[FLOW] place seleccionado", place);
      setSelection(place.latitude, place.longitude, radius);
      window.__lastArea = { lat: place.latitude, lng: place.longitude, radius };
      window.__lastTaxon = null;
      await loadSpeciesByArea(window.__lastArea);
    } else {
      const taxaURL = ENDPOINTS.taxa(q, lang);
      console.debug("[FLOW] taxa URL:", taxaURL);
      const taxa = await fetchJSON(taxaURL);
      if(!taxa.results?.length){
        console.info("[FLOW] taxa sin resultados");
        $('#list').innerHTML = '<li>Sin resultados</li>'; renderPoints([]); console.groupEnd(); return;
      }
      const t = taxa.results[0];
      console.info("[FLOW] taxón seleccionado", t?.id, t?.name);
      window.__lastArea = null;
      window.__lastTaxon = { id: t.id, t };
      await searchByTaxon(window.__lastTaxon);
    }
  }catch(err){
    console.error("[FLOW] submit error:", err);
    $('#list').innerHTML = `<li>Error: ${String(err.message||err)}</li>`;
  }finally{
    console.groupEnd();
  }
});

async function searchByTaxon({ id, t }){
  console.groupCollapsed("%c[FLOW] searchByTaxon", "color:#2563eb;font-weight:700", { id, lang, iconic: currentIconic });
  const common = t.preferred_common_name || t.name;
  const wikiTitle = (t.wikipedia_url && t.wikipedia_url.split('/').pop()) || t.name;
  const { url, extract, thumb } = await getWikiSummary(wikiTitle);
  const item = {
    id, title: common, subtitle: t.name, rank: t.rank,
    wiki: url || t.wikipedia_url, summary: extract || '', thumb: thumb || t.default_photo?.square_url
  };
  console.debug("[FLOW] detalle item (lista):", item);

  $('#list').innerHTML = '';
  $('#list').appendChild(li(item));

  const obsURL = ENDPOINTS.observations(withIconic({ taxon_id: id, per_page: 200 }), lang);
  console.debug("[FLOW] observations by taxon URL:", obsURL);
  const obs = await fetchJSON(obsURL);
  const pts = (obs.results||[]).map(o=>({ latitude:o.geojson?.coordinates[1], longitude:o.geojson?.coordinates[0] }))
                .filter(p=>Number.isFinite(p.latitude));
  console.info("[FLOW] puntos por taxón:", pts.length);
  renderPoints(pts);
  if(pts[0]) flyTo(pts[0].latitude, pts[0].longitude, 2.0);
  $('#details').hidden = false;
  showDetails(item);
  console.groupEnd();
}



// ==== Modal helpers ====
const modal = document.getElementById('modal');
const modalClose = document.getElementById('modalClose');

function openModal(){ 
  console.debug("[MODAL] open");
  modal.hidden = false; 
  document.body.style.overflow='hidden'; 
}
function closeModal(){ 
  console.debug("[MODAL] close");
  modal.hidden = true; 
  document.body.style.overflow=''; 
}

modal.addEventListener('click', e=>{ if(e.target === modal) closeModal(); });
modalClose.addEventListener('click', closeModal);
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !modal.hidden) closeModal(); });

// ==== Cargar detalles ampliados de iNaturalist + Wikipedia ====
async function openModalForTaxon(id, seed){
  console.groupCollapsed("%c[MODAL] openModalForTaxon", "color:#ea580c;font-weight:700", { id, seed });
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
    const taxonURL = ENDPOINTS.taxon(id, lang);
    console.debug("[MODAL] taxon URL:", taxonURL);
    const tResp = await fetchJSON(taxonURL);
    const t = tResp?.results?.[0] || {};
    console.info("[MODAL] taxon data recibido", { id: t?.id, name: t?.name });

    // 2) Wikipedia
    let wikiData = { url: seed?.wiki, extract: seed?.summary, thumb: seed?.thumb };
    if(!wikiData.extract){
      const wikiTitle = (t.wikipedia_url && t.wikipedia_url.split('/').pop()) || t.name || seed?.subtitle;
      console.debug("[MODAL] wikiTitle elegido:", wikiTitle);
      wikiData = await getWikiSummary(wikiTitle || '');
    }

    // 3) Datos enriquecidos
    const ancestry = (t.ancestors || []).map(a => a.name).filter(Boolean);
    const photos = (t.taxon_photos || [])
      .map(tp => tp.photo?.url?.replace('square', 'medium'))
      .filter(Boolean)
      .slice(0, 12);

    const status = t.conservation_status?.status || t.conservation_status?.iucn_status || null;
    const iconic = t.iconic_taxon_name || '';

    const payload = {
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
    };
    console.debug("[MODAL] payload modal:", payload);
    fillModal(payload);

  }catch(err){
    console.error("[MODAL] error:", err);
    fillModal({ summary:`Error: ${String(err.message||err)}` });
  }finally{
    console.groupEnd();
  }
}

function fillModal(d){
  document.getElementById('mThumb').src = d.thumb || '';
  document.getElementById('modalTitle').textContent = d.title || '';
  document.getElementById('mSci').textContent = d.sci || '';
  document.getElementById('mRank').textContent = d.rank ? `Rango: ${d.rank}` : '';

  const mIconic = document.getElementById('mIconic');
  const mStatus = document.getElementById('mStatus');
  mIconic.textContent = d.iconic_taxon_name ? `Iconic: ${d.iconic_taxon_name}` : '';
  mIconic.style.display = d.iconic_taxon_name ? 'inline-block' : 'none';
  mStatus.textContent = d.conservation_status ? `Estatus: ${d.conservation_status}` : '';
  mStatus.style.display = d.conservation_status ? 'inline-block' : 'none';

  document.getElementById('mSummary').textContent = d.summary || '';

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

  const gal = document.getElementById('mGallery');
  gal.innerHTML = '';
  (d.photos||[]).forEach(src=>{
    const img = new Image();
    img.src = src;
    gal.appendChild(img);
  });

  const mWiki = document.getElementById('mWiki');
  const mINat = document.getElementById('mINat');
  if(d.wiki){ mWiki.href = d.wiki; mWiki.style.display='inline-block'; } else { mWiki.style.display='none'; }
  if(d.inatUrl){ mINat.href = d.inatUrl; mINat.style.display='inline-block'; } else { mINat.style.display='none'; }
}
