/* ==== Endpoints con locale ==== */
const ENDPOINTS = {
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
      "order=desc","order_by=created_at","geo=true","verifiable=true",
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

// Wikipedia REST v1
const WIKI = {
  searchTitle: (lang, q) =>
    `https://${lang}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=1`,
  pageSummary: (lang, key) =>
    `https://${lang}.wikipedia.org/w/rest.php/v1/page/summary/${encodeURIComponent(key)}`
};

// ==== i18n ====
const I18N = {
  es: { legend_points:"Observaciones recientes", search_title:"Buscar", mode_animal:"Animal", mode_species:"Especie", mode_place:"Zona", btn_search:"Buscar", search_hint:"Clica el globo para ver especies de la zona seleccionada.", results_title:"Resultados" },
  ca: { legend_points:"Observacions recents",    search_title:"Cercar", mode_animal:"Animal", mode_species:"Espècie", mode_place:"Zona", btn_search:"Cercar", search_hint:"Clica el globus per veure espècies de la zona seleccionada.", results_title:"Resultats" }
};
let lang = "es";

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
  const r = await fetch(url);
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  console.log("[DATA]", data);
  return data;
}

// Traducción automática opcional (solo si Wikipedia cae a EN)
async function autoTranslate(text, targetLang){
  try{
    if(!text || (targetLang !== 'es' && targetLang !== 'ca')) return text;
    const res = await fetch('https://libretranslate.com/translate', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ q:text, source:'en', target:targetLang })
    });
    if(!res.ok) return text;
    const j = await res.json();
    return j?.translatedText || text;
  }catch(_){ return text; }
}

async function getWikiSummary(preferred){
  const order = lang === 'es' ? ['es','ca','en'] : ['ca','es','en'];
  for(const L of order){
    try{
      const s = await fetchJSON(WIKI.searchTitle(L, preferred));
      const key = s?.pages?.[0]?.key;
      if(!key) continue;
      const j = await fetchJSON(WIKI.pageSummary(L, key));
      let extract = j?.extract || '';
      const pageLang = j?.lang || L;
      if((lang === 'es' || lang === 'ca') && pageLang === 'en'){
        extract = await autoTranslate(extract, lang);
      }
      return { url: j?.content_urls?.desktop?.page, extract, thumb: j?.thumbnail?.source || '' };
    }catch(_){}
  }
  return {};
}

/* ==== Filtros iconic taxa ==== */
let currentIconic = "";               // "" = todos
window.__lastArea = null;             // { lat, lng, radius }
window.__lastTaxon = null;            // { id, t }
function withIconic(params){ return currentIconic ? { ...params, iconic_taxa: currentIconic } : params; }

const filtersEl = $('#filters');
if(filtersEl){
  filtersEl.addEventListener('click', (e)=>{
    const btn = e.target.closest('.chip');
    if(!btn) return;
    [...filtersEl.querySelectorAll('.chip')].forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentIconic = btn.dataset.iconic || "";
    if(window.__lastArea)      loadSpeciesByArea(window.__lastArea);
    else if(window.__lastTaxon) searchByTaxon(window.__lastTaxon);
  });
}

/* ==== CesiumJS globe ==== */
const viewer = new Cesium.Viewer("globe", {
  imageryProvider: new Cesium.UrlTemplateImageryProvider({
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    credit: "© OpenStreetMap contributors"
  }),
  terrainProvider: new Cesium.EllipsoidTerrainProvider(), // sin datos de elevación
  baseLayerPicker: false,
  timeline: false,
  animation: false,
  fullscreenButton: false,
  homeButton: false,
  geocoder: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  infoBox: false,
  selectionIndicator: false
});

// helpers Cesium
function flyTo(lat, lng, height=1_800_000){
  viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lng, lat, height) });
}

let selectionEntity = null;
function setSelection(lat, lng, radiusKm){
  if(selectionEntity) viewer.entities.remove(selectionEntity);
  selectionEntity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    ellipse: {
      semiMinorAxis: radiusKm * 1000, semiMajorAxis: radiusKm * 1000,
      material: Cesium.Color.fromCssColorString('rgba(34,197,94,0.25)'),
      outline:true, outlineColor: Cesium.Color.fromCssColorString('rgba(34,197,94,0.6)')
    }
  });
}

let pointEntities = [];
function clearPoints(){
  pointEntities.forEach(e=> viewer.entities.remove(e));
  pointEntities = [];
}
function renderPoints(arr){ // arr: [{latitude, longitude}]
  clearPoints();
  for(const p of arr){
    if(!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
    const ent = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude),
      point: { pixelSize: 6, color: Cesium.Color.fromCssColorString('#f59e0b'), outlineWidth: 0 }
    });
    pointEntities.push(ent);
  }
}

// Click en el globo -> lat/lng -> cargar especies
const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
handler.setInputAction(async (click)=>{
  const cart = viewer.camera.pickEllipsoid(click.position, Cesium.Ellipsoid.WGS84);
  if(!cart) return;
  const c = Cesium.Cartographic.fromCartesian(cart);
  const lat = Cesium.Math.toDegrees(c.latitude);
  const lng = Cesium.Math.toDegrees(c.longitude);
  const radius = Number($('#radiusKm').value || 250);
  setSelection(lat, lng, radius);
  window.__lastArea = { lat, lng, radius };
  window.__lastTaxon = null;
  await loadSpeciesByArea(window.__lastArea);
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

/* ==== UI resultados ==== */
function li(item){
  const el = document.createElement('li');
  el.innerHTML = `<img src="${item.thumb||''}" alt="">
  <div><div><strong>${item.title||''}</strong></div><div class="muted">${item.subtitle||''}</div></div>`;
  el.addEventListener('click', ()=> showDetails(item, true));
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
  if(pan && item.firstPoint) flyTo(item.firstPoint.lat, item.firstPoint.lng, 2_200_000);
}

/* ==== Flujos ==== */
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
      items.push({ id:t.id, title:common, subtitle:t.name, rank:t.rank, wiki:url||t.wikipedia_url, summary:extract||'', thumb:thumb||t.default_photo?.square_url });
    }
    $('#list').innerHTML = '';
    items.slice(0,50).forEach(it=> $('#list').appendChild(li(it)));

    const obs = await fetchJSON(ENDPOINTS.observations(withIconic({ lat, lng, radius, per_page: 200 }), lang));
    const pts = (obs.results||[]).map(o=>({ latitude:o.geojson?.coordinates[1], longitude:o.geojson?.coordinates[0] }))
                 .filter(p=>Number.isFinite(p.latitude));
    renderPoints(pts);
    flyTo(lat, lng, 1_600_000);
  }catch(err){
    $('#list').innerHTML = `<li>Error: ${String(err.message||err)}</li>`;
    clearPoints();
  }
}

$('#searchForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const mode = new FormData(e.target).get('mode');
  const q = $('#q').value.trim();
  $('#list').innerHTML = '';
  $('#details').hidden = true;

  try{
    if(mode === 'place'){
      const places = await fetchJSON(ENDPOINTS.places(q, lang));
      if(!places.results?.length){ $('#list').innerHTML = '<li>Sin resultados</li>'; clearPoints(); return; }
      const place = places.results[0];
      const radius = Number($('#radiusKm').value || 250);
      setSelection(place.latitude, place.longitude, radius);
      window.__lastArea = { lat: place.latitude, lng: place.longitude, radius };
      window.__lastTaxon = null;
      await loadSpeciesByArea(window.__lastArea);
    } else {
      const taxa = await fetchJSON(ENDPOINTS.taxa(q, lang));
      if(!taxa.results?.length){ $('#list').innerHTML = '<li>Sin resultados</li>'; clearPoints(); return; }
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
  const item = { id, title: common, subtitle: t.name, rank: t.rank, wiki: url || t.wikipedia_url, summary: extract || '', thumb: thumb || t.default_photo?.square_url };
  $('#list').innerHTML = '';
  $('#list').appendChild(li(item));

  const obs = await fetchJSON(ENDPOINTS.observations(withIconic({ taxon_id: id, per_page: 200 }), lang));
  const pts = (obs.results||[]).map(o=>({ latitude:o.geojson?.coordinates[1], longitude:o.geojson?.coordinates[0] }))
                .filter(p=>Number.isFinite(p.latitude));
  renderPoints(pts);
  if(pts[0]) flyTo(pts[0].latitude, pts[0].longitude, 2_000_000);
  $('#details').hidden = false;
  showDetails(item);
}
