export const ENDPOINTS = {
  taxa: (q, locale) =>
    `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&rank=species&locale=${locale}`,

  taxon: (id, locale) =>
    `https://api.inaturalist.org/v1/taxa/${id}?locale=${locale}`,

  observations: (p, locale) => {
    const base = [
      p.taxon_id ? `taxon_id=${p.taxon_id}` : null,
      p.place_id ? `place_id=${p.place_id}` : null,
      (p.lat != null && p.lng != null) ? `lat=${p.lat}&lng=${p.lng}` : null,
      p.radius ? `radius=${p.radius}` : null,
      p.iconic_taxa ? `iconic_taxa=${encodeURIComponent(p.iconic_taxa)}` : null,
      `locale=${locale}`,
      'order=desc', 'order_by=created_at', 'geo=true', 'verifiable=true',
      `per_page=${p.per_page ?? 200}`
    ].filter(Boolean).join('&');
    return `https://api.inaturalist.org/v1/observations?${base}`;
  },

  speciesCounts: (p, locale) => {
    const base = [
      p.place_id ? `place_id=${p.place_id}` : null,
      (p.lat != null && p.lng != null) ? `lat=${p.lat}&lng=${p.lng}` : null,
      p.radius ? `radius=${p.radius}` : null,
      p.iconic_taxa ? `iconic_taxa=${encodeURIComponent(p.iconic_taxa)}` : null,
      `locale=${locale}`,
      'per_page=50'
    ].filter(Boolean).join('&');
    return `https://api.inaturalist.org/v1/observations/species_counts?${base}`;
  },

  places: (q, locale) =>
    `https://api.inaturalist.org/v1/places/autocomplete?q=${encodeURIComponent(q)}&locale=${locale}`,

  observers: (taxonId) =>
    `https://api.inaturalist.org/v1/observations/observers?taxon_id=${taxonId}&per_page=5&order=desc&order_by=observation_count`,

  histogram: (taxonId) =>
    `https://api.inaturalist.org/v1/observations/histogram?taxon_id=${taxonId}&date_field=observed&interval=month`,

  xenocanto: (scientificName) =>
    `https://xeno-canto.org/api/2/recordings?query=${encodeURIComponent(scientificName)}&per_page=3`
};

const WIKI = {
  searchTitle: (lang, q) =>
    `https://${lang}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=1`,
  pageSummary: (lang, key) =>
    `https://${lang}.wikipedia.org/w/rest.php/v1/page/summary/${encodeURIComponent(key)}`
};

export async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function autoTranslate(text, targetLang) {
  try {
    if (!text || (targetLang !== 'es' && targetLang !== 'ca')) return text;
    const res = await fetch('https://libretranslate.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'en', target: targetLang })
    });
    if (!res.ok) return text;
    const j = await res.json();
    return j?.translatedText || text;
  } catch {
    return text;
  }
}

export async function getWikiSummary(preferred, lang) {
  if (!preferred) return {};
  const order = lang === 'es' ? ['es', 'ca', 'en'] : ['ca', 'es', 'en'];
  for (const L of order) {
    try {
      const s = await fetchJSON(WIKI.searchTitle(L, preferred));
      const key = s?.pages?.[0]?.key;
      if (!key) continue;
      const j = await fetchJSON(WIKI.pageSummary(L, key));
      let extract = j?.extract || '';
      const pageLang = j?.lang || L;
      if ((lang === 'es' || lang === 'ca') && pageLang === 'en') {
        extract = await autoTranslate(extract, lang);
      }
      return {
        url: j?.content_urls?.desktop?.page,
        extract,
        thumb: j?.thumbnail?.source || ''
      };
    } catch {
      // try next language
    }
  }
  return {};
}

export async function fetchTopObservers(taxonId) {
  try {
    const data = await fetchJSON(ENDPOINTS.observers(taxonId));
    return data?.results || [];
  } catch {
    return [];
  }
}

export async function fetchHistogram(taxonId) {
  try {
    const data = await fetchJSON(ENDPOINTS.histogram(taxonId));
    return data?.results || {};
  } catch {
    return {};
  }
}

export async function fetchSounds(scientificName) {
  try {
    const data = await fetchJSON(ENDPOINTS.xenocanto(scientificName));
    return data?.recordings?.slice(0, 3) || [];
  } catch {
    return [];
  }
}

export async function fetchSpeciesOfDay() {
  try {
    // Pick a random well-known taxon from a curated list seeded by today's date
    const seeds = [
      3703, 4849, 7251, 12704, 42045, 43584, 43741, 12647, 5957,
      4218, 18355, 1039291, 18784, 25810, 19350, 4849, 12716, 3703,
      42860, 41369, 53762, 55825, 58492, 12345, 76600
    ];
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
    const id = seeds[dayOfYear % seeds.length];
    const data = await fetchJSON(`https://api.inaturalist.org/v1/taxa/${id}`);
    const taxon = data?.results?.[0];
    if (!taxon) return null;
    return {
      id: taxon.id,
      title: taxon.preferred_common_name || taxon.name,
      subtitle: taxon.name,
      rank: taxon.rank,
      thumb: taxon.default_photo?.square_url || '',
      wiki: taxon.wikipedia_url || '',
      conservation_status: taxon.conservation_status?.status || null
    };
  } catch {
    return null;
  }
}
