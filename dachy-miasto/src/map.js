import { translate, roofLabel } from './i18n.js';

export function createRoofMap({ geometry, roofs, onSelect }) {
  const L = globalThis.L;
  const element = document.createElement('div');
  element.className = 'city-map';
  element.id = 'city-map';
  element.tabIndex = 0;
  let language = 'pl', map, base, group, labels, activeId, showOutside = false, status = 'loading';
  const layers = new Map(), markers = new Map(), selected = new Set(), eligible = new Set();
  const t = (key, parameters) => translate(language, key, parameters);

  function paint(id) {
    const excluded = !eligible.has(id), chosen = selected.has(id), active = activeId === id;
    // Kraków portal palette: plan roofs in city red, other eligible roofs in city blue.
    return {
      color: active ? '#071f32' : excluded ? '#8a8a8a' : chosen ? '#7d1220' : '#004c87',
      fillColor: excluded ? '#c8c8c8' : chosen ? '#af1828' : '#0063af',
      fillOpacity: excluded ? 0.25 : chosen ? 0.8 : 0.45,
      weight: active ? 3 : chosen ? 2 : 1,
      opacity: excluded ? 0.5 : 1,
    };
  }

  // Roofs outside the criteria are hidden unless requested; the active roof always stays visible.
  const visible = id => showOutside || eligible.has(id) || selected.has(id) || id === activeId;

  function refreshMarkers() {
    if (!map) return;
    const near = map.getZoom() >= 16;
    for (const [id, marker] of markers) {
      const show = !near && visible(id);
      if (!show && map.hasLayer(marker)) map.removeLayer(marker);
      else if (show && !map.hasLayer(marker)) marker.addTo(map);
    }
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
        layer.bindTooltip(() => roofLabel(language, id), { sticky: true });
        layer.on('click', event => { L.DomEvent.stopPropagation(event); onSelect(id, 'map'); });
        layer.on('add', () => { if (layer._path) layer._path.dataset.roofId = id; });
      },
    }).addTo(map);
    for (const [id, layer] of layers) {
      const marker = L.circleMarker(layer.getBounds().getCenter(), { ...paint(id), radius: 4, fillOpacity: 0.85, weight: 1.2 });
      marker.bindTooltip(() => roofLabel(language, id));
      marker.on('click', event => { L.DomEvent.stopPropagation(event); onSelect(id, 'map'); });
      marker.on('add', () => { if (marker._path) marker._path.dataset.roofId = id; });
      markers.set(id, marker);
    }
    labels = L.layerGroup().addTo(map);
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
    update({ selectedIds, eligibleIds, roofId, showOutside: outside = false }) {
      selected.clear(); eligible.clear();
      selectedIds.forEach(id => selected.add(id)); eligibleIds.forEach(id => eligible.add(id));
      activeId = roofId; showOutside = outside;
      if (!map) return;
      for (const [id, layer] of layers) {
        if (visible(id) && !group.hasLayer(layer)) group.addLayer(layer);
        else if (!visible(id) && group.hasLayer(layer)) group.removeLayer(layer);
        layer.setStyle(paint(id));
        markers.get(id)?.setStyle({ ...paint(id), fillOpacity: 0.9 });
        markers.get(id)?.setRadius(id === activeId || selected.has(id) ? 5.5 : 3.2);
      }
      refreshMarkers();
      layers.get(activeId)?.bringToFront();
      markers.get(activeId)?.bringToFront();
      // Plan ranks match the numbering of the list and the printed report.
      labels.clearLayers();
      selectedIds.forEach((id, index) => {
        const layer = layers.get(id);
        if (!layer) return;
        const label = L.marker(layer.getBounds().getCenter(), { icon: L.divIcon({ className: 'rank-label', html: String(index + 1), iconSize: [20, 20] }), keyboard: false, zIndexOffset: 500 });
        label.on('click', event => { L.DomEvent.stopPropagation(event); onSelect(id, 'map'); });
        label.bindTooltip(() => roofLabel(language, id), { direction: 'top', offset: [0, -8] });
        labels.addLayer(label);
      });
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
