import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DEFAULTS } from '../src/core/model.js';
import { createRoofSimulation, configureSimulation, simulationSnapshot, advanceSimulation, resetSimulation, simulationArchive, simulationCsv, playSimulation, suggestedRowGap, daylight, bestConfiguration, currentOptimum, DAY_SECONDS } from '../src/core/simulation.js';
import { prepareClimate, representativeDay, planeIrradiance, hourlyPv, solarPosition, rowShadeFraction, PV_ASSUMPTIONS } from '../src/core/climate.js';
import { projectRoof, rectangleFits } from '../src/core/layout.js';
import { ozeTileUrl } from '../src/core/oze.js';

const read = async name => JSON.parse(await fs.readFile(new URL('../data/' + name, import.meta.url), 'utf8'));
const [climate, roofs, geometry] = await Promise.all(['krakow-climate.json', 'roofs.json', 'msip-roofs.geojson'].map(read));
const roof = roofs.find(r => r.id === '126102_9.0014.179/6.8_BUD');
const outline = geometry.features.find(f => f.properties.ident === roof.id).geometry;
const make = () => createRoofSimulation(roof, DEFAULTS, { lat: 50.05, lon: 19.95 }, { climate, geometry: outline });
const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);

test('climate snapshot has 8760 distinct valid hours, documented sources and complete Warsaw representative days', () => {
  const prepared = prepareClimate(climate);
  assert.equal(prepared.hours.length, 8760);
  assert.match(climate.source.url, /re\.jrc\.ec\.europa\.eu\/api\/v5_3\/tmy/);
  assert.match(climate.source.rawResponseSha256, /^[a-f0-9]{64}$/);
  assert.equal(climate.meteo.radiation_db, 'PVGIS-SARAH3');
  for (let month = 1; month <= 12; month++) {
    const days = ['cloudy', 'typical', 'sunny'].map(weather => representativeDay(prepared, month, weather));
    assert.ok(days[0].clearness <= days[1].clearness && days[1].clearness <= days[2].clearness);
    for (const day of days) assert.deepEqual(day.rows.map(h => h.localHour), Array.from({ length: 24 }, (_, i) => i));
  }
  assert.throws(() => prepareClimate({ ...climate, hours: climate.hours.slice(1) }));
});

test('solar position and isotropic transposition respect night, horizontal GHI and a sun-facing plane', () => {
  const sun = solarPosition(Date.UTC(2022, 5, 21, 11), 50.0614, 19.9366);
  assert.ok(sun.elevation > 62 && sun.elevation < 64);
  assert.ok(sun.azimuth > 175 && sun.azimuth < 190);
  const hour = { ghi: 700, dni: 600, dhi: 100, temperature: 20, wind: 2, sun };
  assert.equal(planeIrradiance(hour, 0, 180), 700);
  assert.ok(planeIrradiance(hour, 30, 180) > planeIrradiance(hour, 30, 0));
  assert.equal(planeIrradiance({ ...hour, sun: { ...sun, up: -0.1 } }, 30, 180), 0);
  const settings = { tilt: 30, azimuth: 180, shadePercent: 0, snowPercent: 0 };
  assert.ok(hourlyPv({ ...hour, temperature: 0 }, settings).powerW > hourlyPv({ ...hour, temperature: 35 }, settings).powerW);
  assert.equal(hourlyPv(hour, { ...settings, snowPercent: 100 }).powerW, 0);
});

test('every drawn panel stays within the real MSIP outline and setbacks; power follows fitted panel count', () => {
  const sim = make();
  assert.equal(sim.layout.panels.length, 375);
  near(sim.capacityKwp, 150);
  assert.ok(sim.capacityKwp <= sim.roof.capacityKwp + 1e-8);
  for (const tilt of [0, 30, 60]) for (const azimuth of [0, 90, 180, 270]) {
    configureSimulation(sim, { tilt, azimuth });
    assert.ok(sim.layout.panels.length <= sim.requestedPanelCount);
    for (const p of sim.layout.panels) assert.ok(rectangleFits(p.corners, sim.roofPlane.polygons, sim.setbackM));
    near(sim.capacityKwp, sim.layout.panels.length * sim.modulePowerW / 1000);
  }
  const hole = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  assert.equal(rectangleFits([[3, 3], [7, 3], [7, 7], [3, 7]], [[hole, [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]]], 0.3), false);
  assert.throws(() => projectRoof(null));
  assert.throws(() => createRoofSimulation(roof, DEFAULTS, null, { climate: null, geometry: outline }));
});

test('winter, summer and direction differ; monthly and annual energies conserve hourly totals', () => {
  const sim = make();
  const summer = sim.dayEnergyKwh;
  configureSimulation(sim, { month: 1 });
  assert.ok(sim.dayEnergyKwh < summer / 2);
  near(sim.forecast.months.reduce((s, m) => s + m.energyKwh, 0), sim.forecast.annualEnergyKwh);
  const south = sim.forecast.annualEnergyKwh;
  configureSimulation(sim, { azimuth: 0 });
  assert.ok(sim.forecast.annualEnergyKwh < south);
  const annual = sim.forecast.annualEnergyKwh;
  configureSimulation(sim, { scenario: 'sunny' });
  near(sim.forecast.annualEnergyKwh, annual);
  assert.ok(sim.comparisons.find(r => r.tilt === 30 && r.azimuth === 180).annualEnergyKwh > sim.comparisons.find(r => r.tilt === 30 && r.azimuth === 0).annualEnergyKwh);
  const months = sim.forecast.months.map(m => m.energyKwh);
  configureSimulation(sim, { snowPercent: 100 });
  // Snow on the modules is a winter assumption: January goes dark, July keeps its sun.
  assert.equal(sim.dayEnergyKwh, 0);
  for (const m of sim.forecast.months) {
    if (PV_ASSUMPTIONS.snowMonths.includes(m.month)) assert.equal(m.energyKwh, 0);
    else near(m.energyKwh, months[m.month - 1]);
  }
  configureSimulation(sim, { month: 7 });
  assert.ok(sim.dayEnergyKwh > 0 && sim.profile.every(h => !h.snowApplied));
});

test('rows shade each other at low sun: tighter gaps lose more, flat modules lose nothing, the suggested gap keeps the loss small', () => {
  const sim = make();
  assert.ok(sim.layout.rowCount > 1 && sim.layout.rowExposure > 0.5 && sim.layout.rowExposure < 1);
  const tight = sim.forecast.rowShadeLossPercent;
  assert.ok(tight > 2, `30° rows 0.8 m apart should lose several percent, got ${tight}`);
  configureSimulation(sim, { rowGapM: suggestedRowGap(sim) });
  assert.ok(sim.forecast.rowShadeLossPercent <= PV_ASSUMPTIONS.rowShadeTargetPercent && sim.forecast.rowShadeLossPercent < tight);
  configureSimulation(sim, { tilt: 0 });
  assert.equal(sim.forecast.rowShadeLossPercent, 0);
  // Sun straight ahead at 30°, modules at 30°, rows touching: the shadow covers half the module (Appelbaum & Bany).
  const south30 = { east: 0, north: -Math.cos(Math.PI / 6), up: Math.sin(Math.PI / 6) };
  near(rowShadeFraction(south30, 30, 180, 2, 2 * Math.cos(Math.PI / 6)), 0.5);
  assert.equal(rowShadeFraction({ east: 0, north: 0.8, up: 0.6 }, 30, 180, 2, 2), 0);
  // The orientation table keeps the roof's gap: with tight rows a low tilt beats 30°.
  configureSimulation(sim, { tilt: 30, rowGapM: 0.8 });
  const cell = (tilt, azimuth) => sim.comparisons.find(r => r.tilt === tilt && r.azimuth === azimuth).annualEnergyKwh;
  assert.ok(cell(15, 180) > cell(30, 180) && cell(30, 180) > cell(60, 180));
});

test('the best-configuration search keeps every module on a tight roof, beats the default and leaves the sketch alone until applied', () => {
  // On this roof a shadow-free gap would drop 56 of 136 modules; the maximum keeps them all with some row shade.
  const tight = roofs.find(r => r.id === '126105_9.0017.228/23.1_BUD');
  const sim = createRoofSimulation(tight, DEFAULTS, null, { climate, geometry: geometry.features.find(f => f.properties.ident === tight.id).geometry });
  const before = sim.forecast.annualEnergyKwh, { tilt, azimuth, rowGapM } = sim;
  const best = bestConfiguration(sim);
  assert.deepEqual([sim.forecast.annualEnergyKwh, sim.tilt, sim.azimuth, sim.rowGapM], [before, tilt, azimuth, rowGapM]);
  assert.ok(best.annualEnergyKwh > before);
  assert.equal(best.fittedPanelCount, sim.requestedPanelCount);
  configureSimulation(sim, { rowGapM: suggestedRowGap(sim) });
  assert.ok(sim.layout.panels.length < sim.requestedPanelCount && sim.forecast.annualEnergyKwh < best.annualEnergyKwh);
  sim.optimum = best;
  configureSimulation(sim, { tilt: best.tilt, azimuth: best.azimuth, rowGapM: best.rowGapM });
  near(sim.forecast.annualEnergyKwh, best.annualEnergyKwh, 1e-6);
  assert.equal(currentOptimum(sim), best);
  configureSimulation(sim, { shadePercent: 10 });
  assert.equal(currentOptimum(sim), null);
});

test('slider previews defer the orientation table; playback survives setting changes and skips the night', () => {
  const sim = make(), before = sim.comparisons;
  configureSimulation(sim, { rowGapM: 2 }, { preview: true });
  assert.equal(sim.comparisons, before); assert.equal(sim.comparisonsStale, true);
  configureSimulation(sim, { rowGapM: 2 });
  assert.notEqual(sim.comparisons, before); assert.equal(sim.comparisonsStale, false);
  sim.running = true; configureSimulation(sim, { tilt: 15 });
  assert.equal(sim.running, true);
  sim.timeSeconds = DAY_SECONDS; sim.running = false; playSimulation(sim);
  assert.equal(sim.running, true); assert.equal(sim.timeSeconds, daylight(sim).sunrise - 3600);
  assert.ok(daylight(sim).sunrise > 3 * 3600 && daylight(sim).sunset < 22 * 3600);
});

test('camera and playback do not change physical results; configuration changes recalculate a single coherent day', () => {
  const sim = make(), forecast = sim.forecast.annualEnergyKwh;
  configureSimulation(sim, { viewYaw: 100, viewPitch: 70 });
  near(sim.forecast.annualEnergyKwh, forecast);
  resetSimulation(sim); assert.equal(sim.timeSeconds, 0);
  advanceSimulation(sim, 3600); assert.equal(sim.timeSeconds, 0);
  sim.running = true; advanceSimulation(sim, 43200);
  const half = simulationSnapshot(sim).energyWh;
  assert.ok(half > 0);
  advanceSimulation(sim, DAY_SECONDS);
  near(sim.energyWh / 1000, sim.dayEnergyKwh); assert.equal(sim.running, false);
  configureSimulation(sim, { shadePercent: 100 });
  assert.equal(sim.energyWh, 0);
  assert.throws(() => configureSimulation(sim, { tilt: 90 }));
  assert.throws(() => configureSimulation(sim, { month: 1.5 }));
});

test('the climate scenario does not apply a second orientation factor to historical MONIT-AIR energy', () => {
  const base = make();
  const changed = createRoofSimulation({ ...roof, annualIrradiationKwh: roof.annualIrradiationKwh / 10 },
    { ...DEFAULTS, performanceRatio: 0.4 }, null, { climate, geometry: outline });
  assert.ok(changed.roof.annualEnergyKwh < base.roof.annualEnergyKwh / 10);
  near(changed.forecast.annualEnergyKwh, base.forecast.annualEnergyKwh);
  near(changed.dayEnergyKwh, base.dayEnergyKwh);
});

test('simulation exports retain climate provenance, geometric assumptions, fitted layout and monthly results', () => {
  const sim = make(), archive = simulationArchive(sim);
  assert.equal(archive.mode, 'simulation'); assert.equal(archive.schemaVersion, 2);
  assert.equal(archive.climate.meteo.radiation_db, 'PVGIS-SARAH3');
  assert.equal(archive.layout.assumptions.buildingHeightM, 6);
  assert.equal(archive.layout.panelsInLocalMetres.length, sim.layout.panels.length);
  assert.equal(archive.forecast.months.length, 12); assert.equal(archive.hourlyDayProfile.length, 24);
  assert.ok(archive.rowShading.annualLossPercent > 0 && archive.rowShading.pitchM > archive.settings.rowGapM);
  archive.roof.location.lat = 0; assert.equal(sim.roof.location.lat, 50.05);
  for (const language of ['ru', 'pl']) {
    const csv = simulationCsv(sim, language);
    assert.match(csv, /SIMULATION/); assert.match(csv, /PVGIS|pvgis|re\.jrc/);
    assert.doesNotMatch(csv, /NaN|undefined/);
  }
});

test('municipal OZE remains an open-data map layer with contiguous tile extents', () => {
  const left = new URL(ozeTileUrl({ x: 2, y: 1, z: 3 }));
  const right = new URL(ozeTileUrl({ x: 3, y: 1, z: 3 }));
  near(+left.searchParams.get('bbox').split(',')[2], +right.searchParams.get('bbox').split(',')[0]);
  assert.equal(left.searchParams.get('layers'), 'show:1');
});
