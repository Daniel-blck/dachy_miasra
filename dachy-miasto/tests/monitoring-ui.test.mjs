import test from 'node:test';
import assert from 'node:assert/strict';
import { createViews } from '../src/views.js';
import { createExampleMeasurements, parseMeasurements, summarizeMeasurements, ozeTileUrl } from '../src/core/monitoring.js';

const settings = { maxGapSeconds: 30, buyRatePln: null, sellRatePln: null };
const state = { view: 'monitor', language: 'ru', parameters: {}, excludedIds: [], result: null };
let monitor = { record: null, summary: null, error: '', settings, connected: false, serialSupported: true };
const views = createViews({ state, roofs: [], metadata: {}, geometry: null, getMonitoring: () => monitor });

test('monitoring empty state, explicit synthetic example and recording render in both languages', () => {
  for (const language of ['ru', 'pl']) {
    state.language = language; monitor = { record: null, summary: null, error: '', settings, connected: false, serialSupported: true };
    const empty = views.html();
    assert.match(empty, /id="measurement-file"/); assert.match(empty, /data-action="serial-connect"/);
    assert.doesNotMatch(empty, /NaN|undefined|\{\w+\}/);
    const record = createExampleMeasurements();
    monitor.record = record; monitor.summary = summarizeMeasurements(record, settings);
    const example = views.html();
    assert.ok(example.includes(language === 'ru' ? 'искусственные данные' : 'dane sztuczne'));
    assert.match(example, /<polyline /); assert.doesNotMatch(example, /data-action="monitor-map"/);
    assert.doesNotMatch(example, /NaN|undefined|\{\w+\}/);
    monitor.record = { ...record, mode: 'recording' };
    assert.ok(views.html().includes(language === 'ru' ? 'сохранённая запись' : 'zapisany pomiar'));
  }
});

test('imported names are escaped, stale live connections show unknown current power, records keep provenance', () => {
  state.language = 'ru';
  const record = parseMeasurements({ schemaVersion: 1, mode: 'recording',
    installation: { id: 'pv', name: '<script>alert(1)</script>', kind: 'pv', measurementPoint: 'ac-output', location: { latitude: 50, longitude: 20 } },
    samples: [{ timestamp: '2026-10-26T10:00:00Z', powerW: 1234 }, { timestamp: '2026-10-26T10:00:10Z', powerW: 1234 }],
  });
  monitor = { record, summary: summarizeMeasurements(record), settings, connected: false, connection: 'disconnected', serialSupported: true };
  let html = views.html();
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>alert'));
  assert.match(html, /data-action="monitor-map"/);
  assert.ok(html.includes('Последняя измеренная мощность'));
  monitor.connected = true; monitor.connection = 'waiting'; html = views.html();
  const firstMetric = html.match(/<div class="kpi-value">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(firstMetric?.startsWith('—')); assert.ok(html.includes('текущая мощность неизвестна'));
});

test('official OZE map tiles have contiguous Web Mercator extents and request only the documented 2024 layer', () => {
  const a = new URL(ozeTileUrl({ x: 283, y: 173, z: 9 }));
  const b = new URL(ozeTileUrl({ x: 284, y: 173, z: 9 }));
  const boxA = a.searchParams.get('bbox').split(',').map(Number), boxB = b.searchParams.get('bbox').split(',').map(Number);
  assert.ok(Math.abs(boxA[2] - boxB[0]) < 1e-8);
  assert.equal(a.searchParams.get('bboxSR'), '3857'); assert.equal(a.searchParams.get('imageSR'), '3857');
  assert.equal(a.searchParams.get('layers'), 'show:1'); assert.equal(a.searchParams.get('transparent'), 'true');
  assert.equal(a.hostname, 'msip.um.krakow.pl');
});
