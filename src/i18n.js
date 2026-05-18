export let lang = 'es';

export const I18N = {
  es: {
    legend_points: 'Observaciones recientes',
    search_title: 'Buscar',
    mode_animal: 'Animal',
    mode_species: 'Especie',
    mode_place: 'Zona',
    btn_search: 'Buscar',
    search_hint: 'Clica el globo para ver especies de la zona seleccionada.',
    results_title: 'Resultados',
    favorites: 'Favoritos',
    add_favorite: 'Añadir a favoritos',
    remove_favorite: 'Quitar de favoritos',
    share: 'Compartir',
    copied: '¡Copiado!',
    sounds: 'Sonidos',
    top_observers: 'Observadores destacados',
    trends: 'Tendencias (12 meses)',
    heatmap: 'Mapa de calor',
    points_mode: 'Ver puntos',
    dark_mode: 'Modo oscuro',
    load_more: 'Cargar más',
    no_results: 'Sin resultados',
    error_retry: 'Error al cargar.',
    loading: 'Cargando…',
    rank: 'Rango',
    conservation: 'Conservación',
    endemic: 'Endémica',
    introduced: 'Introducida',
    threatened: 'Amenazada',
    extinct: 'Extinta',
    establishment: 'Establecimiento',
    observations: 'observaciones',
    empty_favorites: 'No tienes favoritos aún.',
    filter_all: 'Todos',
    filter_results: 'Filtrar resultados…',
    saved: 'Guardados',
    species_of_day: 'Especie del día'
  },
  ca: {
    legend_points: 'Observacions recents',
    search_title: 'Cercar',
    mode_animal: 'Animal',
    mode_species: 'Espècie',
    mode_place: 'Zona',
    btn_search: 'Cercar',
    search_hint: 'Clica el globus per veure espècies de la zona seleccionada.',
    results_title: 'Resultats',
    favorites: 'Preferits',
    add_favorite: 'Afegir a preferits',
    remove_favorite: 'Treure de preferits',
    share: 'Compartir',
    copied: 'Copiat!',
    sounds: 'Sons',
    top_observers: 'Observadors destacats',
    trends: 'Tendències (12 mesos)',
    heatmap: 'Mapa de calor',
    points_mode: 'Veure punts',
    dark_mode: 'Mode fosc',
    load_more: 'Carregar més',
    no_results: 'Sense resultats',
    error_retry: 'Error en carregar.',
    loading: 'Carregant…',
    rank: 'Rang',
    conservation: 'Conservació',
    endemic: 'Endèmica',
    introduced: 'Introduïda',
    threatened: 'Amenaçada',
    extinct: 'Extinta',
    establishment: 'Establiment',
    observations: 'observacions',
    empty_favorites: 'Encara no tens preferits.',
    filter_all: 'Tots',
    filter_results: 'Filtrar resultats…',
    saved: 'Guardats',
    species_of_day: 'Espècie del dia'
  }
};

const listeners = [];

export function onLangChange(fn) {
  listeners.push(fn);
}

export function setLang(next) {
  lang = next;
  document.querySelectorAll('.lang-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === lang)
  );
  document.querySelectorAll('[data-i]').forEach(el => {
    const k = el.getAttribute('data-i');
    const val = I18N[lang][k];
    if (val != null) el.textContent = val;
  });
  listeners.forEach(fn => fn(lang));
}

export function t(key) {
  return I18N[lang]?.[key] ?? key;
}

export function initLang() {
  document.querySelectorAll('.lang-btn').forEach(b =>
    b.addEventListener('click', () => setLang(b.dataset.lang))
  );
  setLang('es');
}
