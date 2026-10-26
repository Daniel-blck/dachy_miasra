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
const { evaluated, candidates, reasons } = prepareCandidates(roofs, DEFAULTS);
const result = optimizePortfolio(candidates, DEFAULTS.budgetPln);

test('persisted review queue covers the default portfolio and matches its input snapshots', async () => {
  const report = JSON.parse(await read('review-sample.json'));
  assert.equal(report.sample.length, 15);
  assert.deepEqual(report.selectedIds, result.selectedIds);
  assert.deepEqual(report.selectedRoofsOutsideSample, []);
  assert.equal(report.inputSha256.roofs, createHash('sha256').update(roofsText).digest('hex'));
  assert.equal(report.inputSha256.geometry, createHash('sha256').update(geometryText).digest('hex'));
  assert.equal(report.ownershipSource.dataRetrieved, false);
  for (const row of report.sample) {
    assert.equal(row.reviewStatus, 'pending'); assert.equal(row.buildingOwner, null);
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
  for (const [language, available, unverified] of [['ru', 'Есть в пакете', 'Не проверено'], ['pl', 'Dostępny w pakiecie', 'Niezweryfikowane']]) {
    state.language = language; state.view = 'plan';
    const html = views.html();
    const evidence = html.match(/<section class="roof-evidence"[\s\S]*?<\/section>/)?.[0];
    assert.ok(evidence?.includes(available));
    assert.equal(evidence.split(unverified).length - 1, 5);
    assert.ok(evidence.includes('https://www.bip.krakow.pl/'));
    assert.doesNotMatch(html, /\{\w+\}/);
    state.view = 'data';
    assert.match(views.html(), /data-action="export-review"/);
    assert.doesNotMatch(views.html(), /\{\w+\}/);
  }
});
