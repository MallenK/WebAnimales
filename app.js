/* ==== Config ==== */
const ENDPOINTS = {
  // iNaturalist v1
  taxa: (q) => `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&rank=species`,
  observations: ({ taxon_id, place_id, per_page=200 }) =>
    `https://api.inaturalist.org/v1/observations?${[
      taxon_id?`taxon_id=${taxon_id}`:null,
      place_id?`place_id=${place_id}`:null,
      "order=desc","order_by=created_at","geo=true","verifiable=true",`per_page=${per_page}`
    ].filter(Boolean).join("&")}`,
  speciesCounts: (place_id) => `https://api.inaturalist.org/v1/observations/species_counts?place_id=${place_id}&per_page=50`,
  places: (q) => `https://api.inaturalist.org/v1/places/autocomplete?q=${encodeURIComponent(q)}`,
  // Wikipedia REST summary (lang inferred later)
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
    search_hint: "Sugerencia: escribe un país, región o el nombre científico.",
    results_title: "Resultados"
  },
  ca: {
    legend_points: "Observacions recents",
    search_title: "Cercar",
    mode_animal: "Animal",
    mode_species: "Espècie",
    mode_place: "Zona",
    btn_search: "Cercar",
    search_hint: "Consell: escriu un país, regió o el nom científic.",
    results_title: "Resultats"
  }
};
let lang = "es";

// ==== UI basics ====
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
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .pointAltitude(0.01)
  .pointRadius(0.15)
  .pointColor(() => '#f59e0b')
  .backgroundColor('#000')
  (document.getElementById('globe'));

let points = [];
function renderPoints(arr){
  globe.pointsData(arr);
  globe.pointLat(d=>d.latitude).pointLng(d=>d.longitude);
}

// Fit to data
function flyToFirst(arr){
  if(!arr.length) return;
  const { latitude: lat, longitude: lng } = arr[0];
  globe.pointOfView({ lat, lng, altitude: 1.8 }, 1200);
}

// ==== Data helpers ====
async function fetchJSON(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function getWikiSummary(title){
  // try ES then CA then EN
  for(const l of [lang, 'ca', 'es', 'en']){
    try{
      const j = await fetchJSON(ENDPOINTS.wikiSummary(l, title));
      if(j && j.extract) return { url: j.content_urls?.desktop?.page, extract: j.extract, thumb: j.thumbnail?.source };
    }catch(e){}
  }
  return {};
}

// Build result item
function li(item){
  const el = document.createElement('li');
  el.innerHTML = `<img src="${item.thumb||''}" alt="">
  <div><div><strong>${item.title||''}</strong></div><div class="muted">${item.subtitle||''}</div></div>`;
  el.addEventListener('click', ()=> showDetails(item));
  return el;
}

function showDetails(item){
  $('#details').hidden = false;
  $('#title').textContent = item.title || '';
  $('#sci').textContent = item.subtitle || '';
  $('#rank').textContent = item.rank ? `Rank: ${item.rank}` : '';
  $('#summary').textContent = item.summary || '';
  $('#thumb').src = item.thumb || '';
  const a = $('#wiki');
  a.href = item.wiki || '#';
  a.style.display = item.wiki ? 'inline-block' : 'none';
}

// ==== Search flow ====
$('#searchForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const mode = new FormData(e.target).get('mode');
  const q = $('#q').value.trim();
  $('#list').innerHTML = '';
  $('#details').hidden = true;

  try{
    if(mode === 'place'){
      // resolve place -> species list + observations
      const places = await fetchJSON(ENDPOINTS.places(q));
      if(!places.results?.length){ $('#list').innerHTML = '<li>No results</li>'; renderPoints([]); return; }
      const place = places.results[0];
      // species list
      const sc = await fetchJSON(ENDPOINTS.speciesCounts(place.id));
      const items = [];
      for(const s of (sc.results||[]).slice(0,20)){
        const taxon = s.taxon || {};
        const name = taxon.preferred_common_name || taxon.name;
        const wiki = taxon.wikipedia_url || null;
        const { url, extract, thumb } = wiki ? await getWikiSummary(wiki.split('/').pop()) : {};
        items.push({
          id: taxon.id, title: name, subtitle: taxon.name, rank: taxon.rank,
          wiki: url || wiki, summary: extract || '', thumb: thumb || taxon.default_photo?.square_url
        });
      }
      items.forEach(it=> $('#list').appendChild(li(it)));

      // observations to plot
      const obs = await fetchJSON(ENDPOINTS.observations({ place_id: place.id, per_page: 200 }));
      points = (obs.results||[]).map(o=>({ latitude:o.geojson?.coordinates[1], longitude:o.geojson?.coordinates[0] })).filter(p=>Number.isFinite(p.latitude));
      renderPoints(points); flyToFirst(points);
    } else {
      // resolve taxon -> observations
      const taxa = await fetchJSON(ENDPOINTS.taxa(q));
      if(!taxa.results?.length){ $('#list').innerHTML = '<li>No results</li>'; renderPoints([]); return; }
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
      points = (obs.results||[]).map(o=>({ latitude:o.geojson?.coordinates[1], longitude:o.geojson?.coordinates[0] })).filter(p=>Number.isFinite(p.latitude));
      renderPoints(points); flyToFirst(points);
      showDetails(item);
    }
  }catch(err){
    console.error(err);
    $('#list').innerHTML = `<li>Error: ${String(err.message||err)}</li>`;
  }
});
