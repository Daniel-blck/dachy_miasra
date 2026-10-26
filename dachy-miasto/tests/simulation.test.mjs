import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/core/model.js';
import { parseMeasurements } from '../src/core/monitoring.js';
import { createRoofSimulation, advanceSimulation, configureSimulation, resetSimulation, DAY_SECONDS, SIMULATION_START_SECONDS, simulationFinancialEffect, simulationArchive, simulationCsv, simulationSnapshot } from '../src/core/simulation.js';

const roof = { id: 'roof-a', usableAreaM2: 1000, annualIrradiationKwh: 1000000, averageIrradiationKwhM2: 1000 };
const make = () => createRoofSimulation(roof, DEFAULTS, { lat: 50.05, lon: 19.95 });
const near = (a, b) => assert.ok(Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-10), `${a} != ${b}`);

test('virtual installation captures its roof and parameters without changing planning data', () => {
  const sim = make();
  assert.equal(sim.mode, 'simulation'); assert.equal(sim.roof.id, roof.id);
  assert.equal(sim.roof.capacityKwp, 120); assert.equal(sim.roof.annualEnergyKwh, 96000);
  assert.equal(sim.timeSeconds, SIMULATION_START_SECONDS); assert.equal(sim.running, false);
  assert.ok(sim.peakPowerW <= sim.roof.capacityKwp * 1000);
  sim.parameters.coverage = 0.1; sim.roof.location.lat = 51;
  assert.equal(DEFAULTS.coverage, 0.6); assert.equal(roof.ownershipStatus, undefined);
  assert.throws(() => createRoofSimulation({ ...roof, usableAreaM2: 0 }, DEFAULTS));
});

test('clear day conserves energy, splits self-use and export, caps time and stops at midnight', () => {
  const sim = make(); sim.running = true;
  advanceSimulation(sim, DAY_SECONDS * 2);
  assert.equal(sim.timeSeconds, DAY_SECONDS); assert.equal(sim.running, false);
  near(sim.energyWh / 1000, sim.roof.annualEnergyKwh / 365);
  near(sim.energyWh, sim.selfConsumedWh + sim.exportWh);
  near(sim.selfConsumedWh, sim.energyWh * 0.6);
  assert.equal(simulationSnapshot(sim).powerW, 0);
  assert.ok(sim.samples.every(r => r.powerW <= sim.roof.capacityKwp * 1000));
});

test('scenario switches affect only future intervals and a stopped installation adds no energy', () => {
  const sim = make(); sim.running = true; advanceSimulation(sim, 6 * 3600);
  const morningEnergy = sim.energyWh, morningRows = sim.samples.map(r => ({ ...r }));
  configureSimulation(sim, { scenario: 'stopped' });
  assert.equal(simulationSnapshot(sim).powerW, 0);
  advanceSimulation(sim, 3600); near(sim.energyWh, morningEnergy);
  assert.deepEqual(sim.samples.slice(0, morningRows.length), morningRows);
  configureSimulation(sim, { scenario: 'clear' }); advanceSimulation(sim, 3600);
  assert.ok(sim.energyWh > morningEnergy);
});

test('pause, speed and batching do not distort virtual energy; reset clears the previous history', () => {
  const a = make(), b = make();
  advanceSimulation(a, 3600); assert.equal(a.timeSeconds, SIMULATION_START_SECONDS);
  a.running = true; b.running = true;
  configureSimulation(a, { speed: 1800 });
  advanceSimulation(a, 43200);
  for (let i = 0; i < 720; i++) advanceSimulation(b, 60);
  near(a.energyWh, b.energyWh); near(a.selfConsumedWh, b.selfConsumedWh);
  a.running = false; const frozen = a.timeSeconds; advanceSimulation(a, 3600); assert.equal(a.timeSeconds, frozen);
  resetSimulation(a); assert.equal(a.energyWh, 0); assert.equal(a.samples.length, 1);
  assert.equal(a.running, false); assert.equal(a.timeSeconds, SIMULATION_START_SECONDS);
});

test('clouds and shade reduce generation and self-use changes preserve energy already allocated', () => {
  const clear = make(), cloudy = make(), shaded = make();
  for (const [sim, scenario] of [[clear, 'clear'], [cloudy, 'cloudy'], [shaded, 'shade']]) {
    configureSimulation(sim, { scenario }); sim.running = true; advanceSimulation(sim, DAY_SECONDS);
  }
  near(cloudy.energyWh, clear.energyWh * 0.45); near(shaded.energyWh, clear.energyWh * 0.15);
  const sim = make(); configureSimulation(sim, { selfConsumptionFraction: 0 });
  sim.running = true; advanceSimulation(sim, 6 * 3600); const firstHalf = sim.energyWh;
  configureSimulation(sim, { selfConsumptionFraction: 1 }); advanceSimulation(sim, 6 * 3600);
  near(sim.exportWh, firstHalf); near(sim.selfConsumedWh, firstHalf);
  near(simulationFinancialEffect(sim), (sim.selfConsumedWh + sim.exportWh * 0.3) / 1000);
  const wh = sim.energyWh; configureSimulation(sim, { buyRatePln: 2, sellRatePln: 0 });
  near(simulationFinancialEffect(sim), sim.selfConsumedWh * 2 / 1000); assert.equal(sim.energyWh, wh);
});

test('exports keep simulation provenance and cannot be imported as measured generation', () => {
  const sim = make(); sim.running = true; advanceSimulation(sim, 3600);
  const archive = simulationArchive(sim);
  assert.equal(archive.mode, 'simulation'); assert.match(archive.label, /SIMULATION/);
  assert.equal(archive.elapsedVirtualSeconds, 3600);
  assert.throws(() => parseMeasurements(archive));
  archive.samples[0].powerW = 123; assert.equal(sim.samples[0].powerW, 0);
  for (const language of ['ru', 'pl']) {
    const csv = simulationCsv(sim, language); assert.ok(csv.startsWith('\uFEFF"SIMULATION"'));
    assert.ok(csv.includes('roof-a'));
    assert.ok(csv.includes(language === 'ru' ? 'искусственные данные' : 'dane sztuczne'));
  }
  assert.throws(() => configureSimulation(sim, { scenario: 'live' }));
  assert.throws(() => configureSimulation(sim, { selfConsumptionFraction: 2 }));
  assert.throws(() => advanceSimulation(sim, Infinity));
});
