import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DEFAULTS, prepareCandidates } from '../src/core/model.js';
import { optimizePortfolio } from '../src/core/optimizer.js';
import { createViews } from '../src/views.js';

const read = name => fs.readFile(new URL('../data/' + name, import.meta.url), 'utf8');
const roofsText = await read('roofs.json'), geometryText = await read('msip-roofs.geojson');
const roofs = JSON.parse(roofsText), geometry = JSON.parse(geometryText);
const metadata = JSON.parse(await read('reference-metadata.json'));
const context = JSON.parse(await read('roof-context.json')), registers = JSON.parse(await read('roof-registers.json'));
const merged = roofs.map(r => ({ ...r, ...(context.roofs[r.id] || {}), ...(registers.roofs[r.id] || {}) }));
const pilotParameters = { ...DEFAULTS, onlyCityLand: false, requireCurrentBuilding: false };
const { evaluated, candidates, reasons } = prepareCandidates(roofs, pilotParameters);
const result = optimizePortfolio(candidates, DEFAULTS.budgetPln);
// The app plan uses the joined open data, so the default register filters (city land, current EGiB) apply.
const appCalc = prepareCandidates(merged, DEFAULTS);
const appResult = optimizePortfolio(appCalc.candidates, DEFAULTS.budgetPln);

test('persisted review queue covers the default portfolio and matches its input snapshots', async () => {
  const report = JSON.parse(await read('review-sample.json'));
  assert.equal(report.sample.length, 15);
  assert.deepEqual(report.selectedIds, appResult.selectedIds);
  assert.deepEqual(report.selectedRoofsOutsideSample, []);
  assert.equal(report.inputSha256.roofs, createHash('sha256').update(roofsText).digest('hex'));
  assert.equal(report.inputSha256.geometry, createHash('sha256').update(geometryText).digest('hex'));
  assert.equal(report.ownershipSource.dataRetrieved, true);
  assert.equal(report.registerSources.sources.length, 9);
  for (const row of report.sample) {
    assert.equal(row.reviewStatus, 'pending'); assert.equal(row.buildingOwner, null); assert.equal(row.address, null);
    if (appResult.selectedIds.includes(row.id)) assert.match(row.ownershipHint, /^(Gmina|Powiat) Kraków/);
    assert.ok(row.position.longitude > 19 && row.position.longitude < 21);
    assert.ok(row.position.latitude > 49 && row.position.latitude < 51);
  }
});

test('real-data cards distinguish geometry from ownership in RU/PL and expose the review download', () => {
  const state = { language: 'ru', view: 'plan', parameters: DEFAULTS, excludedIds: [],
    result, sensitivity: [], roofId: result.selectedIds[0], mapMode: 'map', search: '', page: 0 };
  const views = createViews({ state, roofs, metadata, geometry, verification: null, benchmark: null,
    getCalculation: () => ({ evaluated, candidates, reasons, roofById: new Map(evaluated.map(r => [r.id, r])) }),
    getMapLocation: () => null,
  });
  for (const [language, available, unverified] of [['ru', 'Есть в пакете', 'Не проверено'], ['pl', 'Jest w danych', 'Do sprawdzenia']]) {
    state.language = language; state.view = 'plan';
    const html = views.html();
    const evidence = html.match(/<section class="roof-evidence"[\s\S]*?<\/section>/)?.[0];
    assert.ok(evidence?.includes(available));
    // Without the context file only the geometry row is confirmed; the rest stay open for manual review.
    assert.ok(evidence.split(unverified).length - 1 >= 4);
    assert.ok(evidence.includes('https://www.bip.krakow.pl/'));
    assert.doesNotMatch(html, /\{\w+\}/);
    state.view = 'data';
    assert.match(views.html(), /data-action="export-review"/);
    assert.doesNotMatch(views.html(), /\{\w+\}/);
  }
});

test('open data adds addresses, ownership and heritage to cards, table and method in Polish', async () => {
  const calc = appCalc, plan = appResult;
  const withAddress = plan.selectedIds.find(id => context.roofs[id].address);
  const state = { language: 'pl', view: 'plan', parameters: DEFAULTS, excludedIds: [], result: plan, sensitivity: [], curve: [], saved: [],
    roofId: withAddress, mapMode: 'map', search: '', page: 0, dataFilter: 'all', sort: { key: 'energy', dir: 'desc' } };
  const pvgis = JSON.parse(await read('pvgis-reference.json'));
  const views = createViews({ state, roofs: merged, metadata, geometry, verification: null, benchmark: null, context, registers, pvgis,
    getCalculation: () => ({ ...calc, roofById: new Map(calc.evaluated.map(r => [r.id, r])) }), getMapLocation: () => null });
  const html = views.html();
  assert.ok(html.includes(context.roofs[withAddress].address));
  assert.match(html, /Punkt adresowy w obrysie|Najbliższy punkt adresowy/);
  assert.match(html, /Gmina Kraków|Powiat Kraków/);
  assert.match(html, /Jest w aktualnej ewidencji/);
  assert.match(html, /poziomego przykładu PVGIS/);
  assert.doesNotMatch(html, /\{\w+\}/);
  assert.doesNotMatch(html, /[А-Яа-яЁё]/);
  for (const filter of ['all', 'plan', 'candidate', 'outside', 'city', 'heritage', 'noAddress', 'missingEgib']) {
    Object.assign(state, { view: 'data', dataFilter: filter });
    const data = views.html();
    assert.doesNotMatch(data, /\{\w+\}/);
    assert.doesNotMatch(data, /[А-Яа-яЁё]/);
    if (filter === 'heritage') assert.match(data, /Rejestr|Układ|Park|UNESCO/);
  }
  state.view = 'method';
  const method = views.html();
  assert.match(method, /Parki kulturowe|parków kulturowych/);
  assert.match(method, /Struktura własności/);
  assert.match(method, /PVGIS/);
  assert.doesNotMatch(method, /[А-Яа-яЁё]/);
});
