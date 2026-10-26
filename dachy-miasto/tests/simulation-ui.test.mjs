import test from 'node:test';
import assert from 'node:assert/strict';
import { createViews } from '../src/views.js';
import { DEFAULTS, evaluateRoof } from '../src/core/model.js';
import { createRoofSimulation, advanceSimulation, configureSimulation, resetSimulation } from '../src/core/simulation.js';

const rawRoof = { id: '126105_9.0017.292/1.1_BUD', usableAreaM2: 4526, annualIrradiationKwh: 4687302, averageIrradiationKwhM2: 1036 };
const roof = evaluateRoof(rawRoof, DEFAULTS);
const state = { view: 'simulation', language: 'ru', parameters: DEFAULTS, excludedIds: [], roofId: roof.id, result: null };
let sim = null;
const views = createViews({ state, roofs: [rawRoof], metadata: {}, getSimulation: () => sim,
  getCalculation: () => ({ evaluated: [roof], roofById: new Map([[roof.id, roof]]) }),
});

test('roof simulation renders explicit provenance, controls, assumptions and exports in RU/PL', () => {
  for (const language of ['ru', 'pl']) {
    state.language = language; sim = null;
    const empty = views.html();
    assert.match(empty, /data-action="simulation-create"/);
    assert.ok(empty.includes(language === 'ru' ? 'СИМУЛЯЦИЯ' : 'SYMULACJA'));
    assert.doesNotMatch(empty, /NaN|undefined|\{\w+\}/);
    sim = createRoofSimulation(rawRoof, DEFAULTS, { lat: 50.05, lon: 19.95 });
    sim.running = true; advanceSimulation(sim, 6 * 3600);
    const html = views.html();
    for (const action of ['simulation-start', 'simulation-pause', 'simulation-reset', 'simulation-map', 'simulation-json', 'simulation-csv']) assert.ok(html.includes(`data-action="${action}"`));
    assert.match(html, /simulation-generated/); assert.match(html, /id="sim-speed"/);
    assert.match(html, /id="sim-buyRatePln"/); assert.match(html, /id="sim-selfConsumptionFraction"/);
    assert.ok(html.includes(language === 'ru' ? 'искусственные' : 'sztuczne'));
    assert.ok(html.includes('12:00')); assert.ok(html.includes(rawRoof.id));
    assert.doesNotMatch(html, /NaN|undefined|\{\w+\}/);
    assert.ok(!html.includes(language === 'ru' ? 'Живые измерения стенда' : 'Pomiary stanowiska na żywo'));
  }
});

test('incremental simulation frame updates counters and scenario without replacing editable controls', () => {
  state.language = 'ru'; sim = createRoofSimulation(rawRoof, DEFAULTS);
  const original = views.simulationFrame();
  sim.running = true; advanceSimulation(sim, 6 * 3600);
  const advanced = views.simulationFrame(); assert.notEqual(advanced, original);
  assert.ok(advanced.includes('12:00')); assert.ok(advanced.includes('Ускоренное воспроизведение'));
  assert.doesNotMatch(advanced, /<input|<select/);
  configureSimulation(sim, { scenario: 'stopped' });
  const stopped = views.simulationFrame(); assert.ok(stopped.includes('Остановка'));
  assert.match(stopped, /0,00<small>кВт<\/small>/);
  resetSimulation(sim); assert.ok(views.simulationFrame().includes('06:00'));
  const malicious = { ...rawRoof, id: '<img src=x onerror=alert(1)>' };
  sim = createRoofSimulation(malicious, DEFAULTS);
  assert.ok(views.html().includes('&lt;img')); assert.ok(!views.html().includes('<img src=x'));
});
