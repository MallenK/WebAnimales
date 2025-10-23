/* ==== Config ==== */
const ENDPOINTS = {
  // iNaturalist v1
  taxa: (q) => `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&rank=species`,
  observations: (p) => {
    // p: { taxon_id?, place_id?, lat?, lng?, radius?, per_page? }
    const base = [
      p.taxon_id?`taxon_id=${p.taxon_id}`:null,
      p.place_id?`place_id=${p.place_id}`:null,
      (p.lat!=null&&p.lng!=null)?`lat=${p.lat}&lng=${p.lng}`:null,
      p.radius?`radius=${p.radius}`:null, // km
      "order=desc","order_by=created_at","geo=true","verifiable=true",
      `per_page=${p.per_page??200}`
    ].filter(Boolean).join("&");
    return `https://api.inaturalist.org/v1/observations?${base}`;
  },
  speciesCounts: (p) => {
    const base = [
      p.place_id?`place_id=${p.place_id}`:null,
      (p.lat!=null&&p.lng!=null)?`lat=${p.lat}&lng=${p.lng}`:null,
      p.radius?`radius=${p.radius}`:null, // km
      "per_page=50"
    ].filter(Boolean).join("&");
    return `https://api.inaturalist.org/v1/observations/species_counts?${base}`;
  },
  places: (q) => `https://api.inaturalist.org/v1/places/autocomplete?q=${encodeURIComponent(q)}`,
  wikiSummary: (lang, title) => `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
};

// i18n
const I18N = {
  es: {
    legend_points: "Observaciones recientes",
    search_title: "Buscar",
    mode_animal: "Animal",
    mode_species: "Especie",
    mode_place: "Zona",
    btn_search: "Buscar",
    search_hint: "Clic en el globo para listar especies de esa zona.",
    results_title: "Resultados"
  },
  ca: {
    legend_points: "Observacions recents",
    search_title: "Cercar",
    mode_animal: "Animal",
    mode_species: "Espècie",
    mode_place: "Zona",
    btn_search: "Cercar",
    search_hint: "Clica el globus per llistar espècies d'aquella zona.",
    results_title: "Resultats"
  }
};
let lang = "es";

// ==== UI helpers ====
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

// ==== Globe ====
const globe = Globe()
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .pointAltitude(0.01)
  .pointRadius(0.15)
  .pointColor(() => '#f59e0b')   // naranja
  .backgroundColor('#eef2f7')
  (document.getElementById('globe'));

let points = [];
function renderPoints(arr){
  globe.pointsData(arr);
  globe.pointLat(d=>d.latitude).pointLng(d=>d.longitude);
}
function flyTo(lat,lng,alt=1.8){ globe.pointOfView({ lat, lng, altitude: alt }, 1200); }

// Clic en el globo -> especies cercanas + pintar puntos
globe.onGlobeClick(async ({lat, lng})=>{
  const radius = Number($('#radiusKm').value || 250);
  await loadSpeciesByArea({lat, lng, radius});
});

// ==== Data ====
const WIKI = {
  searchTitle: (lang, q) => `https://${lang}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=1`,
  pageSummary: (lang, key) => `https://${lang}.wikipedia.org/w/rest.php/v1/page/summary/${encodeURIComponent(key)}`
};

const UA = { headers: { 'Api-User-Agent': 'animals-globe/1.0 (github pages demo)' } };


async function fetchJSON(url){
  const r = await fetch(url, { headers: { "Api-User-Agent": "animals-globe/1.0 (https://tuusuario.github.io)" } });
  console.log("[API request]", url);
  if(!r.ok){
    console.warn("[API error]", r.status, r.statusText, "URL:", url);
    throw new Error(`HTTP ${r.status}`);
  }
  const j = await r.json();
  console.log("[API response]", j);
  return j;
}


async function getWikiSummary(preferred){
  // preferred: nombre común o científico (p.ej., "Common bottlenose dolphin" o "Tursiops truncatus")
  const langs = [lang, 'ca', 'es', 'en'];
  for(const L of langs){
    try {
      // 1) buscar título local
      const s = await fetchJSON(WIKI.searchTitle(L, preferred));
      const key = s?.pages?.[0]?.key;         // p.ej., "Tursiops_truncatus"
      if(!key) continue;
      // 2) summary del título resuelto
      const j = await fetchJSON(WIKI.pageSummary(L, key));
      return {
        url: j?.content_urls?.desktop?.page,
        extract: j?.extract || '',
        thumb: j?.thumbnail?.source || ''
      };
    } catch(e) { /* probar siguiente idioma */ }
  }
  return {}; // sin resultados en ningún idioma
}

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
  if(pan && item.firstPoint) flyTo(item.firstPoint.lat, item.firstPoint.lng, 2.2);
}

// ==== Core flows ====
// 1) Clic en globo: especies alrededor
async function loadSpeciesByArea({lat, lng, radius}){
  $('#list').innerHTML = '<li>Cargando…</li>';
  $('#details').hidden = true;

  try{
    // lista de especies
    const sc = await fetchJSON(ENDPOINTS.speciesCounts({ lat, lng, radius }));
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

    // puntos de observación para esa zona
    const obs = await fetchJSON(ENDPOINTS.observations({ lat, lng, radius, per_page: 200 }));
    points = (obs.results||[]).map(o=>({ latitude:o.geojson?.coordinates[1], longitude:o.geojson?.coordinates[0] }))
              .filter(p=>Number.isFinite(p.latitude));
    renderPoints(points);
    flyTo(lat, lng, 1.6);
  }catch(err){
    console.error(err);
    $('#list').innerHTML = `<li>Error: ${String(err.message||err)}</li>`;
    renderPoints([]);
  }
}

// 2) Búsqueda: animal/especie/zona
$('#searchForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const mode = new FormData(e.target).get('mode');
  const q = $('#q').value.trim();
  $('#list').innerHTML = '';
  $('#details').hidden = true;

  try{
    if(mode === 'place'){
      const places = await fetchJSON(ENDPOINTS.places(q));
      if(!places.results?.length){ $('#list').innerHTML = '<li>Sin resultados</li>'; renderPoints([]); return; }
      const place = places.results[0];
      await loadSpeciesByArea({ lat: place.latitude, lng: place.longitude, radius: Number($('#radiusKm').value || 250) });
    } else {
      // taxón
      const taxa = await fetchJSON(ENDPOINTS.taxa(q));
      if(!taxa.results?.length){ $('#list').innerHTML = '<li>Sin resultados</li>'; renderPoints([]); return; }
      const t = taxa.results[0];
      const common = t.preferred_common_name || t.name;
      const wikiTitle = (t.wikipedia_url && t.wikipedia_url.split('/').pop()) || t.name;
      const { url, extract, thumb } = await getWikiSummary(wikiTitle);
      const item = {
        id: t.id, title: common, subtitle: t.name, rank: t.rank,
        wiki: url || t.wikipedia_url, summary: extract || '', thumb: thumb || t.default_photo?.square_url
      };
      $('#list').appendChild(li(item));
      // pinta todas las observaciones del taxón
      const obs = await fetchJSON(ENDPOINTS.observations({ taxon_id: t.id, per_page: 200 }));
      const pts = (obs.results||[]).map(o=>({ latitude:o.geojson?.coordinates[1], longitude:o.geojson?.coordinates[0] }))
                    .filter(p=>Number.isFinite(p.latitude));
      points = pts;
      renderPoints(points);
      if(points[0]) flyTo(points[0].latitude, points[0].longitude, 2.0);
      showDetails(item);
    }
  }catch(err){
    console.error(err);
    $('#list').innerHTML = `<li>Error: ${String(err.message||err)}</li>`;
  }
});
