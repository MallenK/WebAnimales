export function encodeState(state) {
  const params = new URLSearchParams();
  if (state.type === 'area') {
    params.set('lat', state.lat.toFixed(4));
    params.set('lng', state.lng.toFixed(4));
    params.set('r', state.radius);
  } else if (state.type === 'taxon') {
    params.set('taxon', state.id);
  }
  const url = `${location.pathname}?${params.toString()}`;
  history.pushState(state, '', url);
}

export function decodeState() {
  const params = new URLSearchParams(location.search);
  if (params.has('lat') && params.has('lng')) {
    return {
      type: 'area',
      lat: parseFloat(params.get('lat')),
      lng: parseFloat(params.get('lng')),
      radius: parseInt(params.get('r') || '250', 10)
    };
  }
  if (params.has('taxon')) {
    return { type: 'taxon', id: parseInt(params.get('taxon'), 10) };
  }
  return null;
}

export async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    return true;
  } catch {
    return false;
  }
}
