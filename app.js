/* ==== Endpoints ==== */
const ENDPOINTS = {
  // iNaturalist v1
  taxa: (q) => `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&rank=species`,
  observations: (p) => {
    const base = [
      p.taxon_id?`taxon_id=${p.taxon_id}`:null,
      p.place_id?`place_id=${p.place_id}`:null,
      (p.lat!=null&&p.lng!=null)?`lat=${p.lat}&lng=${p.lng}`:null,
      p.radius?`radius=${p.radius}`:null,
      "order=desc","order_by=created_at","geo=true","verifiable=true",
      `per_page=${p.per_page??200}`
    ].filter(Boolean).join("&");
    return `https://api.inaturalist.org/v1/observations?${base}`;
  },
  speciesCounts: (p) => {
    const base = [
      p.place_id?`place_id=${p.place_id}`:null,
      (p.lat!=null&&p.lng!=null)?`lat=${p.lat}&lng=${p.lng}`:null,
      p.radius?`radius=${p.radius}`:null,
      "per_page=50"
    ].filter(Boolean).join("&");
    return `https://api.inaturalist.org/v1/observations/species_counts?${base}`;
  },
  places: (q) => `https://api.inaturalist.org/v1/places/autocomplete?q=${encodeURIComponent(q)}`,
};

// Wikipedia REST v1 search + summary
const WIKI = {
  searchTitle: (lang, q) => `https://${lang}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=1`,
  pageSummary: (lang, key) => `https://${lang}.wikipedia.org/w/rest.php/v1/page/summary/${encodeURIComponent(key)}`
};

const UA = { headers: { "Api-User-Agent": "animals-globe/1.0 (github pages demo)" } };

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
  const r = await fetch(url); // sin headers
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  console.log("[DATA]", data); // solo datos
  return data;
}


async function getWikiSummary(preferred){
  const langs = [lang, 'ca', 'es', 'en'];
  for(const L of langs){
    try {
      const s = await fetchJSON(WIKI.searchTitle(L, preferred));
      const key = s?.pages?.[0]?.key;
      if(!key) continue;
      const j = await fetchJSON(WIKI.pageSummary(L, key));
      return {
        url: j?.content_urls?.desktop?.page,
        extract: j?.extract || '',
        thumb: j?.thumbnail?.source || ''
      };
    } catch(e) {}
  }
  return {};
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
  .polygonCapColor(()=>'rgba(34,197,94,0.25)')   // verde translúcido
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
  const ang = radiusKm / R; // en radianes
  const pts = [];
  for(let i=0;i<=segments;i++){
    const brng = 2*Math.PI*i/segments;
    const lat1 = lat*Math.PI/180, lon1 = lng*Math.PI/180;
    const lat2 = Math.asin( Math.sin(lat1)*Math.cos(ang) + Math.cos(lat1)*Math.sin(ang)*Math.cos(brng) );
    const lon2 = lon1 + Math.atan2(Math.sin(brng)*Math.sin(ang)*Math.cos(lat1), Math.cos(ang)-Math.sin(lat1)*Math.sin(lat2));
    pts.push([ (lon2*180/Math.PI + 540)%360-180, lat2*180/Math.PI ]); // [lng, lat]
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

// ==== Flujos ====
// Click en globo -> especies + puntos
globe.onGlobeClick(async ({lat, lng})=>{
  const radius = Number($('#radiusKm').value || 250);
  setSelection(lat,lng,radius);
  await loadSpeciesByArea({lat, lng, radius});
});

async function loadSpeciesByArea({lat, lng, radius}){
  $('#list').innerHTML = '<li>Cargando…</li>';
  $('#details').hidden = true;

  try{
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

    const obs = await fetchJSON(ENDPOINTS.observations({ lat, lng, radius, per_page: 200 }));
    points = (obs.results||[]).map(o=>({ latitude:o.geojson?.coordinates[1], longitude:o.geojson?.coordinates[0] }))
              .filter(p=>Number.isFinite(p.latitude));
    renderPoints(points);
    flyTo(lat, lng, 1.6);
  }catch(err){
    $('#list').innerHTML = `<li>Error: ${String(err.message||err)}</li>`;
    renderPoints([]);
  }
}

// Búsqueda por animal/especie/zona
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
      const radius = Number($('#radiusKm').value || 250);
      setSelection(place.latitude, place.longitude, radius);
      await loadSpeciesByArea({ lat: place.latitude, lng: place.longitude, radius });
    } else {
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

      const obs = await fetchJSON(ENDPOINTS.observations({ taxon_id: t.id, per_page: 200 }));
      const pts = (obs.results||[]).map(o=>({ latitude:o.geojson?.coordinates[1], longitude:o.geojson?.coordinates[0] }))
                    .filter(p=>Number.isFinite(p.latitude));
      points = pts;
      renderPoints(points);
      if(points[0]) flyTo(points[0].latitude, points[0].longitude, 2.0);
      $('#details').hidden = false;
      showDetails(item);
    }
  }catch(err){
    $('#list').innerHTML = `<li>Error: ${String(err.message||err)}</li>`;
  }
});
