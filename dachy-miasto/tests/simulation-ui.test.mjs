import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createViews } from '../src/views.js';
import { DEFAULTS, evaluateRoof } from '../src/core/model.js';
import { createRoofSimulation, configureSimulation } from '../src/core/simulation.js';

const read = async name => JSON.parse(await fs.readFile(new URL('../data/' + name, import.meta.url), 'utf8'));
const [roofs, geo, climate] = await Promise.all(['roofs.json', 'msip-roofs.geojson', 'krakow-climate.json'].map(read));
const raw = roofs.find(r => r.id === '126102_9.0014.179/6.8_BUD'), roof = evaluateRoof(raw, DEFAULTS);
const geometry = geo.features.find(f => f.properties.ident === raw.id).geometry;
const state = { language: 'ru', view: 'simulation', parameters: DEFAULTS, excludedIds: [], roofId: raw.id };
let sim;
const views = createViews({ state, roofs: [raw], metadata: {}, getSimulation: () => sim, getSimulationData: () => ({ climate, geometry }),
  getCalculation: () => ({ evaluated: [roof], roofById: new Map([[raw.id, roof]]) }) });

test('simulation screen explains open-data inputs and separates camera, physical settings and weather in RU/PL', () => {
  for (const language of ['ru', 'pl']) {
    state.language = language; sim = null;
    assert.match(views.html(), /data-action="simulation-create"/);
    sim = createRoofSimulation(raw, DEFAULTS, null, { climate, geometry });
    const html = views.html();
    for (const control of ['month', 'scenario', 'tilt', 'azimuth', 'viewYaw', 'viewPitch', 'snowPercent', 'shadePercent']) assert.ok(html.includes(`id="sim-${control}"`));
    assert.match(html, /roof-scene/); assert.match(html, /orientation-table/); assert.match(html, /month-bars/);
    assert.match(html, /PVGIS 5.3/); assert.match(html, /2005/); assert.match(html, /2023/);
    assert.doesNotMatch(html, /data-view="monitor"|measurement-file|serial-connect|NaN|undefined|\{\w+\}/);
    if (language === 'pl') assert.doesNotMatch(html, /[А-Яа-яЁё]/);
  }
});

test('scene changes with camera while energy and control markup stay independent; absent data disables creation', () => {
  state.language = 'ru'; sim = createRoofSimulation(raw, DEFAULTS, null, { climate, geometry });
  const original = views.simulationFrame(), energy = sim.forecast.annualEnergyKwh;
  configureSimulation(sim, { viewYaw: 100 });
  assert.notEqual(views.simulationFrame(), original); assert.equal(sim.forecast.annualEnergyKwh, energy);
  assert.doesNotMatch(views.simulationFrame(), /<input|<select/);
  sim = null;
  const missing = createViews({ state, roofs: [raw], metadata: {}, getCalculation: () => ({ evaluated: [roof], roofById: new Map([[raw.id, roof]]) }) }).html();
  assert.match(missing, /simulation-create" disabled/); assert.match(missing, /notice error/);
});
