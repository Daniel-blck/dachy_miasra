import { translate } from './i18n.js';

export function createRoofMap({ geometry, roofs, onSelect }) {
  const L = globalThis.L;
  const element = document.createElement('div');
  element.className = 'city-map';
  element.id = 'city-map';
  element.tabIndex = 0;
  let language = 'ru', map, base, group, activeId, status = 'loading';
  const layers = new Map(), markers = new Map(), selected = new Set(), eligible = new Set();
  const t = (key, parameters) => translate(language, key, parameters);
  const short = id => id.split('.').slice(-2).join('.').replace('_BUD', '');

  function paint(id) {
    const excluded = !eligible.has(id), chosen = selected.has(id), active = activeId === id;
    return {
      color: active ? '#243e2d' : excluded ? '#8b958d' : chosen ? '#ad6816' : '#286245',
      fillColor: excluded ? '#c4ccc4' : chosen ? '#ffc35f' : '#609f70',
      fillOpacity: excluded ? 0.2 : chosen ? 0.75 : 0.4,
      weight: active ? 3 : chosen ? 2 : 1,
      opacity: excluded ? 0.5 : 1,
    };
  }

  function setStatus(next) {
    status = next;
    const host = element.parentElement;
    const indicator = host?.parentElement?.querySelector('.map-network-status');
    if (indicator) {
      indicator.hidden = next === 'ready';
      indicator.textContent = t(next === 'loading' ? 'mapLoading' : 'mapOffline');
      indicator.classList.toggle('failed', next === 'failed');
    }
    element.dataset.tiles = next;
  }

  function initialize() {
    if (!L || !geometry?.features?.length) {
      element.classList.add('schematic-map');
      element.innerHTML = `<svg viewBox="0 0 1240 900" role="img" aria-label="${t('schematic')}">${roofs.map(r => `<circle cx="${r.schematic.x + 10}" cy="${r.schematic.y + 10}" r="${Math.max(3, Math.sqrt(r.usableAreaM2) / 8)}" fill="#6c906b"/>`).join('')}</svg>`;
      setStatus('failed'); return;
    }
    map = L.map(element, { scrollWheelZoom: true, zoomControl: false, maxZoom: 19, minZoom: 9, zoomAnimation: false, fadeAnimation: false });
    L.control.zoom({ position: 'topright' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com/" target="_blank" rel="noopener">Leaflet</a>');
    base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      referrerPolicy: 'strict-origin-when-cross-origin',
      keepBuffer: 1,
    });
    base.on('loading', () => setStatus('loading'));
    base.on('tileerror', () => setStatus('failed'));
    base.on('load', () => setStatus(element.querySelector('.leaflet-tile-loaded') ? 'ready' : 'failed'));
    base.addTo(map);
    group = L.geoJSON(geometry, {
      style: feature => paint(feature.properties.ident),
      onEachFeature(feature, layer) {
        const id = feature.properties.ident;
        layers.set(id, layer);
        layer.bindTooltip(() => t('roof', { id: short(id) }), { sticky: true });
        layer.on('click', event => { L.DomEvent.stopPropagation(event); onSelect(id, 'map'); });
        layer.on('add', () => { if (layer._path) layer._path.dataset.roofId = id; });
      },
    }).addTo(map);
    for (const [id, layer] of layers) {
      const marker = L.circleMarker(layer.getBounds().getCenter(), { ...paint(id), radius: 4, fillOpacity: 0.85, weight: 1.2 });
      marker.bindTooltip(() => t('roof', { id: short(id) }));
      marker.on('click', event => { L.DomEvent.stopPropagation(event); onSelect(id, 'map'); });
      marker.on('add', () => { if (marker._path) marker._path.dataset.roofId = id; });
      markers.set(id, marker);
    }
    const refreshMarkers = () => {
      const near = map.getZoom() >= 16;
      for (const marker of markers.values()) {
        if (near && map.hasLayer(marker)) map.removeLayer(marker);
        else if (!near && !map.hasLayer(marker)) marker.addTo(map);
      }
    };
    map.on('zoomend', refreshMarkers);
    map.on('moveend zoomend', () => {
      element.dataset.zoom = map.getZoom();
      element.dataset.center = `${map.getCenter().lat.toFixed(7)},${map.getCenter().lng.toFixed(7)}`;
    });
    map.fitBounds(group.getBounds(), { padding: [30, 30], maxZoom: 13, animate: false });
    refreshMarkers();
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  }

  return {
    mount(host, nextLanguage) {
      language = nextLanguage;
      host.append(element);
      if (!map && !element.classList.contains('schematic-map')) initialize();
      if (map) {
        map.invalidateSize({ pan: false });
        const plus = element.querySelector('.leaflet-control-zoom-in'), minus = element.querySelector('.leaflet-control-zoom-out');
        plus?.setAttribute('title', t('zoomIn')); plus?.setAttribute('aria-label', t('zoomIn'));
        minus?.setAttribute('title', t('zoomOut')); minus?.setAttribute('aria-label', t('zoomOut'));
      }
      element.setAttribute('aria-label', t('mapHelp'));
      setStatus(status);
    },
    update({ selectedIds, eligibleIds, roofId }) {
      selected.clear(); eligible.clear();
      selectedIds.forEach(id => selected.add(id)); eligibleIds.forEach(id => eligible.add(id));
      activeId = roofId;
      for (const [id, layer] of layers) {
        layer.setStyle(paint(id));
        markers.get(id)?.setStyle({ ...paint(id), fillOpacity: 0.9 });
        markers.get(id)?.setRadius(id === activeId || selected.has(id) ? 5.5 : 3.2);
      }
      layers.get(activeId)?.bringToFront();
      markers.get(activeId)?.bringToFront();
    },
    focus(id) {
      const layer = layers.get(id);
      if (map && layer) map.fitBounds(layer.getBounds(), { padding: [65, 65], maxZoom: 18, animate: false });
    },
    fitAll() { if (map && group) map.fitBounds(group.getBounds(), { padding: [25, 25], maxZoom: 13, animate: false }); },
    fitSelected(ids) {
      if (!map) return;
      const bounds = L.latLngBounds([]);
      for (const id of ids) if (layers.has(id)) bounds.extend(layers.get(id).getBounds());
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 17, animate: false });
    },
    location(id) {
      const center = layers.get(id)?.getBounds().getCenter();
      return center ? { lat: center.lat, lon: center.lng, url: `https://www.openstreetmap.org/?mlat=${center.lat.toFixed(6)}&mlon=${center.lng.toFixed(6)}#map=18/${center.lat.toFixed(6)}/${center.lng.toFixed(6)}` } : null;
    },
    retry() { base?.redraw(); },
    resize() { map?.invalidateSize({ pan: false }); },
  };
}
