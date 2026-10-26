import { DEFAULTS, prepareCandidates, validateParameters } from './core/model.js';
import { portfolioCsv } from './core/export.js';
import { createReviewSample, reviewCsv } from './core/review.js';
import { translate } from './i18n.js';
import { createViews } from './views.js';
import { createRoofMap } from './map.js';
import { parseMeasurements, summarizeMeasurements, createExampleMeasurements, connectionStatus } from './core/monitoring.js';
import { createBenchSerial } from './serial.js';

const app = document.getElementById('app');
const state = { parameters: { ...DEFAULTS }, excludedIds: [], language: 'ru', view: 'plan', mapMode: 'map', roofId: null, advanced: false, search: '', page: 0, busy: true, error: '', result: null, sensitivity: [], showOze: false };
try {
  const stored = JSON.parse(localStorage.getItem('dachy-miasto-v1') || 'null');
  if (stored) {
    const parameters = { ...DEFAULTS, ...stored.parameters };
    validateParameters(parameters);
    state.parameters = parameters;
    state.excludedIds = Array.isArray(stored.excludedIds) ? stored.excludedIds.filter(x => typeof x === 'string') : [];
  }
  const language = localStorage.getItem('dachy-miasto-language');
  if (['ru', 'pl'].includes(language)) state.language = language;
} catch { /* Browser storage is optional. */ }

const t = (key, parameters) => translate(state.language, key, parameters);
let roofs = [], metadata, verification, geometry, benchmark, views, roofMap;
let evaluated = [], candidates = [], reasons = {}, roofById = new Map(), job = 0;
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const optionalJson = async url => { try { const response = await fetch(url); return response.ok ? await response.json() : null; } catch { return null; } };
const monitoring = { record: null, connected: false, lastReceivedAt: null, error: '', settings: { maxGapSeconds: 30, buyRatePln: null, sellRatePln: null } };
let renderedConnection = 'disconnected';
const serial = createBenchSerial({
  onState(connected) {
    monitoring.connected = connected;
    if (connected) {
      monitoring.lastReceivedAt = null; monitoring.error = '';
      monitoring.record = { schemaVersion: 1, mode: 'recording', installation: { id: 'usb-bench', name: t('serialTitle'), kind: 'bench', measurementPoint: 'dc-load', location: null, sourceUrl: null }, samples: [] };
    }
    render();
  },
  onSample(sample) {
    const samples = monitoring.record.samples;
    if (samples.length >= 20000) { monitoring.error = 'serialLimit'; return; }
    if (samples.length && Date.parse(sample.timestamp) <= Date.parse(samples.at(-1).timestamp)) return;
    samples.push(sample); monitoring.lastReceivedAt = Date.now(); monitoring.error = '';
  },
  onError(key) { monitoring.error = key; render(); },
});
function getMonitoring() {
  return { ...monitoring, serialSupported: serial.supported,
    connection: connectionStatus(monitoring.connected, monitoring.lastReceivedAt),
    summary: monitoring.record ? summarizeMeasurements(monitoring.record, monitoring.settings) : null };
}
setInterval(() => {
  if (!monitoring.connected || state.view !== 'monitor') return;
  const connection = connectionStatus(monitoring.connected, monitoring.lastReceivedAt);
  // Keep numeric edits stable, but always remove a stale "live" label on time.
  if (document.activeElement?.tagName !== 'INPUT' || connection !== renderedConnection) render();
}, 1000);

function persist() {
  try {
    localStorage.setItem('dachy-miasto-v1', JSON.stringify({ parameters: state.parameters, excludedIds: state.excludedIds }));
    localStorage.setItem('dachy-miasto-language', state.language);
  } catch { /* Calculation works even when storage is disabled. */ }
}

function render() {
  if (!views) return;
  if (state.view === 'monitor') renderedConnection = connectionStatus(monitoring.connected, monitoring.lastReceivedAt);
  app.innerHTML = views.html();
  document.documentElement.lang = state.language;
  document.title = t('title');
  document.querySelector('meta[name="description"]').content = t('description');
  document.querySelector('.skip-link').textContent = t('skip');
  const host = app.querySelector('.map-host');
  if (host) {
    roofMap.mount(host, state.language);
    roofMap.update({ selectedIds: state.result?.selectedIds || [], eligibleIds: candidates.map(r => r.id), roofId: state.roofId, ozeVisible: state.showOze, installation: monitoring.record });
  }
  document.getElementById('advanced')?.addEventListener('toggle', event => { state.advanced = event.target.open; });
}

function recalculate() {
  try {
    validateParameters(state.parameters);
    ({ evaluated, candidates, reasons } = prepareCandidates(roofs, state.parameters, state.excludedIds));
    roofById = new Map(evaluated.map(r => [r.id, r]));
    state.busy = true; state.error = '';
    persist(); render();
    worker.postMessage({ id: ++job, roofs, parameters: state.parameters, excludedIds: state.excludedIds });
  } catch (error) { state.error = error.message; state.busy = false; render(); }
}

worker.onmessage = ({ data }) => {
  if (data.id !== job) return;
  state.busy = false;
  if (data.error) state.error = data.error;
  else {
    state.result = data.result; state.sensitivity = data.sensitivity;
    if (!state.roofId) state.roofId = data.result.selectedIds[0] || candidates[0]?.id || roofs[0]?.id;
  }
  render();
};
worker.onerror = () => { state.busy = false; state.error = 'Worker failed'; render(); };

function selectRoof(id, source = 'list') {
  state.roofId = id; state.view = 'plan';
  if (source !== 'map') state.mapMode = 'map';
  render();
  if (source !== 'map') roofMap.focus(id);
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

app.addEventListener('click', event => {
  if (event.target.closest('#city-map')) return; // Leaflet owns its pointer, keyboard and wheel events.
  const view = event.target.closest('[data-view]');
  if (view) { event.preventDefault(); state.view = view.dataset.view; render(); return; }
  const roof = event.target.closest('[data-roof-id]');
  if (roof) { selectRoof(roof.dataset.roofId); return; }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  switch (button.dataset.action) {
    case 'monitor-example': if (!monitoring.connected) { monitoring.record = createExampleMeasurements(); monitoring.error = ''; render(); } break;
    case 'monitor-clear': if (!monitoring.connected) { monitoring.record = null; monitoring.error = ''; render(); } break;
    case 'monitor-export': if (monitoring.record?.samples.length >= 2) download('dachy-measurements.json', JSON.stringify(monitoring.record, null, 2), 'application/json'); break;
    case 'serial-connect': serial.connect(); break;
    case 'serial-disconnect': serial.disconnect(); break;
    case 'monitor-map': state.view = 'plan'; state.mapMode = 'map'; render(); roofMap.focusInstallation(); document.querySelector('.map-panel')?.scrollIntoView({ block: 'nearest' }); break;
    case 'export-review': {
      const sample = createReviewSample(roofs, state.result?.selectedIds || [], geometry);
      download(`dachy-review-${state.language}.csv`, reviewCsv(sample, state.language), 'text/csv;charset=utf-8');
      break;
    }
    case 'exclude': {
      const id = button.dataset.id;
      state.excludedIds = state.excludedIds.includes(id) ? state.excludedIds.filter(x => x !== id) : [...state.excludedIds, id];
      recalculate(); break;
    }
    case 'reset': state.parameters = { ...DEFAULTS }; state.excludedIds = []; state.roofId = null; recalculate(); break;
    case 'map': case 'list': state.mapMode = button.dataset.action; render(); break;
    case 'map-all': roofMap.fitAll(); break;
    case 'map-selected': roofMap.fitSelected(state.result?.selectedIds || []); break;
    case 'focus-roof': state.mapMode = 'map'; render(); roofMap.focus(button.dataset.id); document.querySelector('.map-panel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break;
    case 'show-details': document.getElementById('roof-details')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break;
    case 'prev-page': state.page = Math.max(0, state.page - 1); render(); break;
    case 'next-page': state.page++; render(); break;
    case 'export-csv': if (!state.busy && state.result) download('dachy-miasto-portfel.csv', portfolioCsv(evaluated, state.result, { ...state.parameters, excludedIds: state.excludedIds }, metadata, state.language), 'text/csv;charset=utf-8'); break;
    case 'export-json': if (!state.busy && state.result) download('dachy-miasto-scenario.json', JSON.stringify({ version: 1, language: state.language, parameters: state.parameters, excludedIds: state.excludedIds, result: state.result, sensitivity: state.sensitivity, metadata, verification }, null, 2), 'application/json'); break;
    case 'print': if (!state.busy) { state.view = 'plan'; state.mapMode = 'map'; render(); requestAnimationFrame(() => window.print()); } break;
  }
});

app.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'budget-range') document.getElementById('budget').value = el.value;
  if (el.id === 'coverage') document.getElementById('coverage-value').textContent = el.value + '%';
  if (el.type === 'number') el.setCustomValidity('');
  if (el.id === 'roof-search') {
    const position = el.selectionStart;
    state.search = el.value; state.page = 0; render();
    const next = document.getElementById('roof-search'); next.focus(); next.setSelectionRange(position, position);
  }
});

app.addEventListener('change', async event => {
  const el = event.target;
  if (el.id === 'oze-layer') { state.showOze = el.checked; render(); return; }
  if (el.id === 'measurement-file') {
    if (monitoring.connected || !el.files?.[0]) return;
    const file = el.files[0];
    if (file.size > 5 * 1024 * 1024) { monitoring.error = 'measurementTooLarge'; render(); return; }
    try { const record = parseMeasurements(await file.text()); if (!monitoring.connected) { monitoring.record = record; monitoring.error = ''; } }
    catch { monitoring.error = 'measurementInvalid'; }
    render(); return;
  }
  if (el.dataset.monitorParam) {
    if (!el.checkValidity()) { el.reportValidity(); return; }
    const value = el.value === '' ? null : Number(el.value);
    if (el.dataset.monitorParam === 'maxGapSeconds' && (value == null || value <= 0)) { el.value = monitoring.settings.maxGapSeconds; return; }
    monitoring.settings[el.dataset.monitorParam] = value; render(); return;
  }
  if (el.id === 'language') { state.language = el.value; persist(); render(); return; }
  if (el.id === 'roof-search') return;
  const next = { ...state.parameters };
  if (el.id === 'budget' || el.id === 'budget-range') next.budgetPln = Number(el.value) * 1e6;
  else if (el.dataset.param) {
    let value = el.type === 'checkbox' ? el.checked : Number(el.value);
    if (['coverage', 'efficiency', 'performanceRatio'].includes(el.dataset.param)) value /= 100;
    next[el.dataset.param] = value;
  } else return;
  if (!el.checkValidity()) { el.setCustomValidity(t('invalidInput')); el.reportValidity(); return; }
  try { validateParameters(next); } catch { el.setCustomValidity(t('invalidInput')); el.reportValidity(); return; }
  state.parameters = next; recalculate();
});

try {
  const responses = await Promise.all([fetch('./data/roofs.json'), fetch('./data/reference-metadata.json')]);
  if (responses.some(r => !r.ok)) throw new Error('Dataset unavailable');
  [roofs, metadata] = await Promise.all(responses.map(r => r.json()));
  [geometry, verification, benchmark] = await Promise.all([optionalJson('./data/msip-roofs.geojson'), optionalJson('./data/msip-verification.json'), optionalJson('./data/benchmark.json')]);
  roofMap = createRoofMap({ geometry, roofs, onSelect: selectRoof, onInstallationSelect: () => { state.view = 'monitor'; render(); } });
  views = createViews({ state, roofs, metadata, verification, geometry, benchmark,
    getCalculation: () => ({ evaluated, candidates, reasons, roofById }),
    getMapLocation: id => roofMap.location(id),
    getMonitoring,
  });
  recalculate();
} catch {
  app.innerHTML = `<main class="boot"><h1>${t('loadError')}</h1><p>${t('launchHelp')}</p><button class="button" onclick="location.reload()">${t('retry')}</button></main>`;
}

window.addEventListener('beforeprint', () => roofMap?.resize());
window.addEventListener('afterprint', () => roofMap?.resize());
