const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const fail = () => { throw new TypeError('Invalid measurement dataset.'); };
const safeText = (value, max = 160) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export const OZE_SOURCE = Object.freeze({
  catalogUrl: 'https://msip.krakow.pl/dataset/2842',
  serviceUrl: 'https://msip.um.krakow.pl/arcgis/rest/services/JP/Instalacje_OZE_2023/MapServer',
  layer: '1', layerYear: 2024,
});

export function ozeTileUrl({ x, y, z }) {
  const extent = 20037508.342789244, width = 2 * extent / 2 ** z;
  const left = -extent + x * width, top = extent - y * width;
  const url = new URL(OZE_SOURCE.serviceUrl + '/export');
  for (const [key, value] of Object.entries({ f: 'image', bbox: [left, top - width, left + width, top].join(','), bboxSR: 3857, imageSR: 3857, size: '256,256', format: 'png32', transparent: true, layers: 'show:' + OZE_SOURCE.layer })) url.searchParams.set(key, String(value));
  return url.href;
}

/** Imported readings remain recordings; a file can never claim a live connection. */
export function parseMeasurements(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (!data || data.schemaVersion !== 1 || !['recording', 'example'].includes(data.mode)) fail();
  const site = data.installation;
  if (!site || !safeText(site.id) || !safeText(site.name) || !['pv', 'bench'].includes(site.kind)) fail();
  if (!['ac-output', 'dc-load'].includes(site.measurementPoint)) fail();
  if (site.kind === 'pv' && site.measurementPoint !== 'ac-output') fail();
  if (site.sourceUrl != null && (!safeText(site.sourceUrl, 2000) || !/^https?:\/\//i.test(site.sourceUrl))) fail();
  let location = null;
  if (site.location != null) {
    if (site.kind !== 'pv' || data.mode === 'example' || !finite(site.location.latitude, -90, 90) || !finite(site.location.longitude, -180, 180)) fail();
    location = { latitude: site.location.latitude, longitude: site.location.longitude };
  }
  if (!Array.isArray(data.samples) || data.samples.length < 2 || data.samples.length > 20000) fail();
  let last = -Infinity;
  const samples = data.samples.map(row => {
    const sample = parseSample(row);
    const time = Date.parse(sample.timestamp);
    if (time <= last) fail();
    last = time;
    return sample;
  });
  return {
    schemaVersion: 1, mode: data.mode,
    installation: { id: site.id.trim(), name: site.name.trim(), kind: site.kind, measurementPoint: site.measurementPoint, sourceUrl: site.sourceUrl || null, location },
    samples,
  };
}

export function parseSample(row) {
  if (!row || typeof row.timestamp !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(row.timestamp) || !Number.isFinite(Date.parse(row.timestamp))) fail();
  if (!finite(row.powerW, 0, 100_000_000)) fail();
  const sample = { timestamp: new Date(row.timestamp).toISOString(), powerW: row.powerW };
  for (const key of ['selfConsumedPowerW', 'exportPowerW']) {
    if (row[key] != null) {
      if (!finite(row[key], 0, row.powerW + 0.01)) fail();
      sample[key] = row[key];
    }
  }
  if (sample.selfConsumedPowerW != null && sample.exportPowerW != null && sample.selfConsumedPowerW + sample.exportPowerW > sample.powerW + 0.01) fail();
  if (row.voltageV != null) { if (!finite(row.voltageV, 0, 1000)) fail(); sample.voltageV = row.voltageV; }
  if (row.currentA != null) { if (!finite(row.currentA, 0, 10000)) fail(); sample.currentA = row.currentA; }
  return sample;
}

/** Trapezoidal integration only across adjacent readings with a bounded gap. */
export function summarizeMeasurements(record, { maxGapSeconds = 30, buyRatePln = null, sellRatePln = null } = {}) {
  if (!finite(maxGapSeconds, 0.001, 86400)) throw new RangeError('Invalid maximum interval.');
  const rows = record.samples;
  let energyWh = 0, selfConsumedWh = 0, exportWh = 0, observedSeconds = 0, gapCount = 0;
  let flowsComplete = true;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    const seconds = (Date.parse(b.timestamp) - Date.parse(a.timestamp)) / 1000;
    if (seconds <= 0) throw new RangeError('Readings must be strictly chronological.');
    if (seconds > maxGapSeconds) { gapCount++; continue; }
    observedSeconds += seconds;
    energyWh += (a.powerW + b.powerW) / 2 * seconds / 3600;
    if ([a.selfConsumedPowerW, b.selfConsumedPowerW, a.exportPowerW, b.exportPowerW].some(v => v == null)) flowsComplete = false;
    else {
      selfConsumedWh += (a.selfConsumedPowerW + b.selfConsumedPowerW) / 2 * seconds / 3600;
      exportWh += (a.exportPowerW + b.exportPowerW) / 2 * seconds / 3600;
    }
  }
  const hasCoverage = observedSeconds > 0;
  const financialAvailable = hasCoverage && flowsComplete && record.installation.kind === 'pv'
    && finite(buyRatePln, 0, 100) && finite(sellRatePln, 0, 100);
  return {
    energyWh: hasCoverage ? energyWh : null,
    selfConsumedWh: hasCoverage && flowsComplete ? selfConsumedWh : null,
    exportWh: hasCoverage && flowsComplete ? exportWh : null,
    observedSeconds, gapCount, sampleCount: rows.length,
    firstTimestamp: rows[0]?.timestamp || null, lastTimestamp: rows.at(-1)?.timestamp || null,
    lastPowerW: rows.at(-1)?.powerW ?? null,
    financialEffectPln: financialAvailable ? (selfConsumedWh * buyRatePln + exportWh * sellRatePln) / 1000 : null,
  };
}

/** INA219 bench protocol: V and A at the load, timestamped by the receiving laptop. */
export function parseBenchLine(line, receivedAt = new Date().toISOString()) {
  const row = JSON.parse(line);
  if (!finite(row.voltageV, 0, 26) || !finite(row.currentA, 0, 3.2)) fail();
  return parseSample({ timestamp: receivedAt, powerW: row.voltageV * row.currentA, voltageV: row.voltageV, currentA: row.currentA });
}

export function connectionStatus(connected, lastReceivedAt, now = Date.now()) {
  if (!connected) return 'disconnected';
  return lastReceivedAt != null && now >= lastReceivedAt && now - lastReceivedAt <= 10000 ? 'live' : 'waiting';
}

export function createExampleMeasurements() {
  const start = Date.parse('2026-10-26T10:00:00Z');
  return parseMeasurements({
    schemaVersion: 1, mode: 'example',
    installation: { id: 'training-bench', name: 'PV demo', kind: 'bench', measurementPoint: 'dc-load' },
    samples: Array.from({ length: 91 }, (_, i) => ({ timestamp: new Date(start + i * 1000).toISOString(), powerW: i < 30 ? 2 : i < 60 ? 0.35 : 1.9 })),
  });
}
