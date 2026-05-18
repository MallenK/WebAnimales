let map = null;
let markersLayer = null;
let heatLayer = null;
let selectionCircle = null;
let selectionMarker = null;
let lightTile = null;
let darkTile = null;
let isHeatmap = false;
let clickCb = null;
let currentPoints = [];

const ATTR = '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors © <a href="https://carto.com/" target="_blank">CARTO</a>';
const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_DARK  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

export function initGlobe(containerId) {
  map = L.map(containerId, {
    center: [30, 10],
    zoom: 2,
    minZoom: 2,
    maxZoom: 19,
    zoomControl: true,
    attributionControl: true,
    worldCopyJump: true
  });

  lightTile = L.tileLayer(TILE_LIGHT, { attribution: ATTR, subdomains: 'abcd', maxZoom: 19 });
  darkTile  = L.tileLayer(TILE_DARK,  { attribution: ATTR, subdomains: 'abcd', maxZoom: 19 });

  const isDark = document.documentElement.dataset.theme === 'dark';
  (isDark ? darkTile : lightTile).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  map.on('click', e => {
    if (clickCb) clickCb({ lat: e.latlng.lat, lng: e.latlng.lng });
  });
}

export function setGlobeTheme(theme) {
  if (!map) return;
  if (theme === 'dark') {
    if (lightTile && map.hasLayer(lightTile)) map.removeLayer(lightTile);
    if (darkTile && !map.hasLayer(darkTile)) darkTile.addTo(map);
  } else {
    if (darkTile && map.hasLayer(darkTile)) map.removeLayer(darkTile);
    if (lightTile && !map.hasLayer(lightTile)) lightTile.addTo(map);
  }
}

export function onGlobeClick(cb) {
  clickCb = cb;
}

export function renderPoints(pts) {
  currentPoints = pts;
  markersLayer.clearLayers();
  if (heatLayer && map.hasLayer(heatLayer)) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  if (!pts.length) return;
  isHeatmap ? _renderHeatmap(pts) : _renderMarkers(pts);
}

function _renderMarkers(pts) {
  pts.forEach(p => {
    L.circleMarker([p.latitude, p.longitude], {
      radius: 5,
      fillColor: '#f59e0b',
      color: 'rgba(255,255,255,0.7)',
      weight: 1,
      opacity: 0.9,
      fillOpacity: 0.75
    }).addTo(markersLayer);
  });
}

function _renderHeatmap(pts) {
  if (typeof L.heatLayer !== 'function') {
    _renderMarkers(pts);
    return;
  }
  const data = pts.map(p => [p.latitude, p.longitude, 0.6]);
  heatLayer = L.heatLayer(data, {
    radius: 22,
    blur: 16,
    maxZoom: 13,
    gradient: { 0.3: '#22c55e', 0.6: '#f59e0b', 1: '#dc2626' }
  }).addTo(map);
}

export function flyTo(lat, lng, zoom = 9) {
  if (!map) return;
  map.flyTo([lat, lng], zoom, { duration: 1.2, easeLinearity: 0.5 });
}

export function setSelection(lat, lng, radius) {
  if (!map) return;
  if (selectionCircle) { map.removeLayer(selectionCircle); selectionCircle = null; }
  if (selectionMarker) { map.removeLayer(selectionMarker); selectionMarker = null; }

  selectionCircle = L.circle([lat, lng], {
    radius: radius * 1000,
    color: '#f59e0b',
    fillColor: '#f59e0b',
    fillOpacity: 0.07,
    weight: 2,
    dashArray: '8 5'
  }).addTo(map);

  selectionMarker = L.circleMarker([lat, lng], {
    radius: 7,
    fillColor: '#f59e0b',
    color: '#fff',
    weight: 2.5,
    fillOpacity: 1
  }).addTo(map);

  map.flyToBounds(selectionCircle.getBounds(), { padding: [32, 32], duration: 1.2, maxZoom: 14 });
}

export function toggleHeatmap(active) {
  isHeatmap = active;
  renderPoints(currentPoints);
}
