import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMeasurements, summarizeMeasurements, parseBenchLine, createExampleMeasurements, connectionStatus } from '../src/core/monitoring.js';

const start = Date.parse('2026-10-26T10:00:00Z');
const row = (seconds, powerW = 1000, flows = {}) => ({ timestamp: new Date(start + seconds * 1000).toISOString(), powerW, ...flows });
const recording = samples => ({ schemaVersion: 1, mode: 'recording', installation: { id: 'test-pv', name: 'Test PV', kind: 'pv', measurementPoint: 'ac-output', location: { latitude: 50.05, longitude: 19.95 } }, samples });

test('measurement import validates chronology, timezone, finite readings and source provenance', () => {
  const input = recording([row(0), row(10)]);
  assert.equal(parseMeasurements(JSON.stringify(input)).mode, 'recording');
  for (const samples of [[row(10), row(0)], [row(0), row(0)], [row(0), row(10, -1)], [row(0), { timestamp: '2026-10-26T10:00:10', powerW: 1 }]]) {
    assert.throws(() => parseMeasurements(recording(samples)));
  }
  assert.throws(() => parseMeasurements({ ...input, mode: 'live' }));
  assert.throws(() => parseMeasurements({ ...input, installation: { ...input.installation, sourceUrl: 'javascript:alert(1)' } }));
  assert.throws(() => parseMeasurements({ ...input, mode: 'example' }));
  assert.throws(() => parseMeasurements(recording([row(0), row(10, 1, { selfConsumedPowerW: 1, exportPowerW: 1 })])));
});

test('energy integrates actual bounded intervals and leaves long missing periods uncounted', () => {
  const result = summarizeMeasurements(parseMeasurements(recording([row(0), row(10), row(20), row(120), row(130)])));
  assert.equal(result.observedSeconds, 30); assert.equal(result.gapCount, 1);
  assert.ok(Math.abs(result.energyWh - 1000 * 30 / 3600) < 1e-10);
  assert.equal(result.financialEffectPln, null); assert.equal(result.selfConsumedWh, null);
  const ramp = summarizeMeasurements(parseMeasurements(recording([row(0, 0), row(10, 1000)])));
  assert.ok(Math.abs(ramp.energyWh - 500 * 10 / 3600) < 1e-10);
});

test('measured zero production is distinct from absent continuous data', () => {
  assert.equal(summarizeMeasurements(parseMeasurements(recording([row(0, 0), row(10, 0)]))).energyWh, 0);
  const missing = summarizeMeasurements(parseMeasurements(recording([row(0), row(60)])));
  assert.equal(missing.energyWh, null); assert.equal(missing.observedSeconds, 0);
});

test('financial effect needs PV-attributed self-use and export readings and both explicit rates', () => {
  const flow = { selfConsumedPowerW: 600, exportPowerW: 400 };
  const data = parseMeasurements(recording([row(0, 1000, flow), row(3600, 1000, flow)]));
  const settings = { maxGapSeconds: 3600, buyRatePln: 1, sellRatePln: 0.3 };
  const result = summarizeMeasurements(data, settings);
  assert.equal(result.energyWh, 1000); assert.equal(result.selfConsumedWh, 600); assert.equal(result.exportWh, 400);
  assert.equal(result.financialEffectPln, 0.72);
  assert.equal(summarizeMeasurements(data, { ...settings, sellRatePln: null }).financialEffectPln, null);
  data.samples[1].selfConsumedPowerW = undefined;
  assert.equal(summarizeMeasurements(data, settings).financialEffectPln, null);
  assert.equal(summarizeMeasurements(createExampleMeasurements(), settings).financialEffectPln, null);
});

test('bench lines measure V times A under load; malformed and reversed readings are rejected', () => {
  const sample = parseBenchLine('{"voltageV":6,"currentA":0.5}', '2026-10-26T10:00:00Z');
  assert.equal(sample.powerW, 3); assert.equal(sample.currentA, 0.5);
  for (const text of ['{}', '{"voltageV":6,"currentA":-1}', '{"voltageV":30,"currentA":1}', '{"voltageV":"6","currentA":1}']) assert.throws(() => parseBenchLine(text));
});

test('file examples never claim live connection and stale devices stop displaying current power', () => {
  const example = createExampleMeasurements();
  assert.equal(example.mode, 'example'); assert.equal(example.installation.location, null);
  assert.equal(connectionStatus(false, start, start), 'disconnected');
  assert.equal(connectionStatus(true, null, start), 'waiting');
  assert.equal(connectionStatus(true, start, start + 10000), 'live');
  assert.equal(connectionStatus(true, start, start + 10001), 'waiting');
});
