import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { auditSolarData, solarEvidence, outlineAreaM2, roofCalculationTrace } from '../src/core/provenance.js';
import { DEFAULTS, prepareCandidates } from '../src/core/model.js';
import { optimizePortfolio } from '../src/core/optimizer.js';
import { createViews } from '../src/views.js';
import { NUMBER_METRICS } from '../src/number-guide.js';
import { portfolioCsv } from '../src/core/export.js';

const read = async name => JSON.parse(await fs.readFile(new URL('../data/' + name, import.meta.url), 'utf8'));
const [roofs, geometry, audit, context, registers, metadata] = await Promise.all(['roofs.json', 'msip-roofs.geojson', 'source-audit.json', 'roof-context.json', 'roof-registers.json', 'reference-metadata.json'].map(read));

test('every pilot field is faithfully extracted from the original bundled HTML', async () => {
  const source = await fs.readFile(new URL('../../krakow-all-in-one.html', import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'), metadata.referenceSha256);
  const pages = JSON.parse(source.toString('utf8').match(/id="bundled-pages">([\s\S]*?)<\/script>/)[1]);
  const html = Buffer.from(pages.mockups, 'base64').toString('utf8');
  const rows = JSON.parse(html.match(/id="extra-data">([\s\S]*?)<\/script>/)[1]).r4.roofs;
  assert.equal(rows.length, roofs.length);
  const byId = new Map(rows.map(r => [r[7], r]));
  for (const roof of roofs) {
    const row = byId.get(roof.id);
    assert.deepEqual([roof.schematic.x, roof.schematic.y, roof.annualIrradiationKwh, roof.averageIrradiationKwhM2, roof.usableAreaM2, roof.greenRoofPotential, roof.investmentLabel], [row[0], row[1], row[2], row[3], row[4], Boolean(row[5]), row[6] || null]);
  }
});

test('all 927 official areas, irradiation values and independent outline areas pass the source audit', () => {
  const result = auditSolarData(roofs, geometry);
  assert.deepEqual(result, audit.solar);
  assert.equal(result.roundedAreaMatches, 927);
  assert.equal(result.irradiationMatches, 927);
  assert.equal(result.averageMatches, 927);
  assert.equal(result.maxAreaRoundingDeltaM2 <= 0.5, true);
  assert.ok(result.maxOutlineAreaDifferencePercent < 0.01);
  const corrupt = [{ ...roofs[0], usableAreaM2: roofs[0].usableAreaM2 + 10 }];
  assert.equal(auditSolarData(corrupt, geometry).mismatches.length, 1);
});

test('outline area subtracts courtyard holes and supports multipart buildings', () => {
  const ring = [[19, 50], [19.001, 50], [19.001, 50.001], [19, 50.001], [19, 50]];
  const hole = ring.map(([x, y]) => [19 + (x - 19) / 2, 50 + (y - 50) / 2]);
  const full = outlineAreaM2({ type: 'Polygon', coordinates: [ring] });
  const cut = outlineAreaM2({ type: 'Polygon', coordinates: [ring, hole] });
  assert.ok(Math.abs(cut / full - 0.75) < 1e-8);
  assert.ok(Math.abs(outlineAreaM2({ type: 'MultiPolygon', coordinates: [[ring], [ring]] }) / full - 2) < 1e-10);
  assert.equal(outlineAreaM2(null), null);
});

test('a large real roof separates source area, rounding, requested coverage and the 150 kWp cap', () => {
  const roof = roofs.find(r => r.id === '126105_9.0017.292/1.1_BUD');
  const feature = geometry.features.find(f => f.properties.ident === roof.id);
  const evidence = solarEvidence(roof, feature);
  assert.equal(evidence.sourceBuildingAreaM2, 5665.27001953);
  assert.equal(evidence.sourceUsefulAreaM2, 4526.45019531);
  assert.equal(evidence.pilotAreaM2, 4526);
  const trace = roofCalculationTrace(roof, DEFAULTS, feature);
  assert.equal(trace.calculated.capacityKwp, 150);
  assert.ok(Math.abs(trace.calculated.panelAreaM2 - 750) < 1e-9);
  assert.ok(trace.calculated.effectiveCoverage < 0.17);
  assert.equal(trace.calculated.costPln, 615000);
  assert.ok(Math.abs(trace.calculated.annualEnergyKwh - 4687302 * 0.6 * 0.2 * 0.8 * (150 / 543.12)) < 1e-8);
  assert.notEqual(evidence.effectiveIrradiationKwhM2, evidence.sourceAverageIrradiation);
});

test('CSV keeps source and module areas in separate localized columns with matching row widths', () => {
  const raw = roofs.find(r => r.id === '126105_9.0017.292/1.1_BUD');
  const solarSource = geometry.features.find(f => f.properties.ident === raw.id).properties;
  const calc = prepareCandidates([{ ...raw, ...registers.roofs[raw.id], solarSource }], { ...DEFAULTS, onlyCityLand: false, requireCurrentBuilding: false });
  const result = optimizePortfolio(calc.candidates, DEFAULTS.budgetPln);
  assert.equal(result.selectedIds.length, 1);
  for (const language of ['ru', 'pl']) {
    const csv = portfolioCsv(calc.evaluated, result, DEFAULTS, metadata, language);
    const lines = csv.split('\r\n');
    const headerAt = lines.findIndex(l => l.startsWith('"ID";'));
    const fields = line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replaceAll('""', '"'));
    const headers = fields(lines[headerAt]), values = fields(lines[headerAt + 1]);
    assert.equal(headers.length, values.length);
    const row = Object.fromEntries(headers.map((name, index) => [name, values[index]]));
    assert.equal(row[language === 'ru' ? 'Площадь модулей после предела м2' : 'Pole modułów po limicie m2'], '750.000');
    assert.equal(row[language === 'ru' ? 'Полезная площадь MSIP до округления м2' : 'Pole użyteczne MSIP przed zaokrągleniem m2'], '4526.450');
    assert.doesNotMatch(csv, /\?\?\?|undefined|NaN/);
  }
});

test('number guide explains all linked metrics in RU/PL and keeps current roof and scenario values', () => {
  const merged = roofs.map(r => ({ ...r, ...context.roofs[r.id], ...registers.roofs[r.id], solarSource: geometry.features.find(f => f.properties.ident === r.id).properties }));
  const calc = prepareCandidates(merged, DEFAULTS), result = optimizePortfolio(calc.candidates, DEFAULTS.budgetPln);
  const state = { language: 'ru', view: 'guide', parameters: DEFAULTS, result, roofId: result.selectedIds[0], excludedIds: [], mapMode: 'map', sensitivity: [], search: '', page: 0 };
  const views = createViews({ state, roofs: merged, geometry, audit, registers, context, metadata,
    getCalculation: () => ({ ...calc, roofById: new Map(calc.evaluated.map(r => [r.id, r])) }), getMapLocation: () => null });
  for (const language of ['ru', 'pl']) {
    state.language = language;
    const guide = views.html();
    for (const metric of NUMBER_METRICS) assert.ok(guide.includes(`id="explain-${metric.id}"`), metric.id);
    assert.ok(guide.includes(state.roofId));
    assert.match(guide, /powbudynku/);
    assert.match(guide, /powuzytecz/);
    assert.match(guide, /sumapc/);
    assert.doesNotMatch(guide, /NaN|undefined|\{\w+\}/);
    state.view = 'plan';
    const plan = views.html();
    for (const match of plan.matchAll(/data-explain="([^"]+)"/g)) assert.ok(NUMBER_METRICS.some(m => m.id === match[1]));
    state.view = 'guide';
  }
});
