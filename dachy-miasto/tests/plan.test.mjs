import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DEFAULTS, evaluateRoof, prepareCandidates, procedureFor, describePortfolio, validateParameters } from '../src/core/model.js';
import { optimizePortfolio, budgetCurve } from '../src/core/optimizer.js';
import { portfolioCsv } from '../src/core/export.js';
import { candidateParcel } from '../src/core/review.js';
import { ownershipGroup, heritageFlags, isCityLand, needsConservator, CITY_GROUPS } from '../src/core/registers.js';
import { inverse2178, metresToRings, metresBetween } from '../src/core/geo.js';
import { roofLabel, roofPlace } from '../src/i18n.js';

const read = name => fs.readFile(new URL('../data/' + name, import.meta.url), 'utf8');
const roofs = JSON.parse(await read('roofs.json'));
const context = JSON.parse(await read('roof-context.json'));
const registers = JSON.parse(await read('roof-registers.json'));
const pvgis = JSON.parse(await read('pvgis-reference.json'));

test('EPSG:2178 inverse projection matches a reference point and keeps Kraków in range', () => {
  const [lon, lat] = inverse2178(7420744.6114, 5549972.3697);
  assert.ok(Math.abs(lon - 19.892609833318144) < 1e-9 && Math.abs(lat - 50.08060083232549) < 1e-9);
  const [lon0, lat0] = inverse2178(7_500_000, 5_550_000);
  assert.ok(Math.abs(lon0 - 21) < 1e-12 && lat0 > 50 && lat0 < 50.2);
});

test('distance to an outline is zero inside and metric outside', () => {
  const square = [[[19.9, 50], [19.901, 50], [19.901, 50.001], [19.9, 50.001], [19.9, 50]]];
  assert.equal(metresToRings([19.9005, 50.0005], square), 0);
  const outside = metresToRings([19.9005, 50.0012], square);
  assert.ok(Math.abs(outside - 0.0002 * 110_574) < 0.5);
  assert.ok(Math.abs(metresBetween([19.9, 50], [19.9, 50.001]) - 110.574) < 1e-6);
});

test('building cap shrinks large installations proportionally instead of dropping them', () => {
  const roof = { id: 'R', usableAreaM2: 2000, annualIrradiationKwh: 1_500_000 };
  const free = evaluateRoof(roof, { ...DEFAULTS, maxCapacityKwp: 0 });
  const capped = evaluateRoof(roof, DEFAULTS);
  assert.equal(free.capacityKwp, 240); assert.equal(free.capped, false);
  assert.equal(capped.capacityKwp, 150); assert.equal(capped.capped, true);
  assert.equal(capped.potentialKwp, 240);
  assert.ok(Math.abs(capped.annualEnergyKwh - free.annualEnergyKwh * 150 / 240) < 1e-6);
  assert.ok(Math.abs(capped.specificYieldKwhPerKwp - free.specificYieldKwhPerKwp) < 1e-9);
  assert.equal(capped.costPln, 150 * 4000 + 15000);
  assert.ok(Math.abs(capped.co2Tonnes - capped.annualEnergyKwh / 1000 * 0.597) < 1e-9);
  assert.throws(() => validateParameters({ ...DEFAULTS, maxCapacityKwp: 2 }));
});

test('approval route thresholds follow 6.5 / 50 / 150 kW', () => {
  assert.deepEqual([3, 6.5, 6.6, 50, 50.1, 150, 150.1].map(procedureFor), ['small', 'small', 'micro', 'micro', 'exempt', 'exempt', 'permit']);
});

test('heritage, city-land, EGiB and specific-yield filters exclude with a reason', () => {
  const city = { ownership: { group: 'municipal' }, inEgib: true };
  const sample = [
    { id: 'park', usableAreaM2: 500, annualIrradiationKwh: 400_000, culturalPark: 'Park Kulturowy Kazimierz', ...city },
    { id: 'shade', usableAreaM2: 500, annualIrradiationKwh: 100_000, ...city },
    { id: 'private', usableAreaM2: 500, annualIrradiationKwh: 400_000, ownership: { group: 'other' }, inEgib: true },
    { id: 'unknown', usableAreaM2: 500, annualIrradiationKwh: 400_000, ownership: null, inEgib: true },
    { id: 'gone', usableAreaM2: 500, annualIrradiationKwh: 400_000, ownership: { group: 'county' }, inEgib: false },
    { id: 'good', usableAreaM2: 500, annualIrradiationKwh: 400_000, ...city },
  ];
  const { candidates, reasons } = prepareCandidates(sample, { ...DEFAULTS, omitHeritage: true, minSpecificYield: 500 });
  assert.deepEqual(candidates.map(r => r.id), ['good']);
  assert.equal(reasons.park, 'Ochrona konserwatorska');
  assert.equal(reasons.shade, 'Niski uzysk jednostkowy');
  assert.equal(reasons.private, 'Poza działkami miasta');
  assert.equal(reasons.unknown, 'Poza działkami miasta');
  assert.equal(reasons.gone, 'Brak w aktualnej EGiB');
  // Without register data the filters stay inactive instead of emptying the plan.
  assert.equal(prepareCandidates([{ id: 'bare', usableAreaM2: 500, annualIrradiationKwh: 400_000 }], DEFAULTS).candidates.length, 1);
});

test('ownership descriptions map to groups and heritage signals rank by required consent', () => {
  assert.equal(ownershipGroup('Gmina Kraków - właściciel, działka oddana wyłącznie w zarząd (współzarząd)'), 'municipal');
  assert.equal(ownershipGroup('Gmina Kraków - właściciel, działka oddana w użytkowanie (współużytkowanie) wieczyste osobom fizycznym'), 'municipalLease');
  assert.equal(ownershipGroup('Gmina Kraków - właściciel, lecz są także inni właściciele (ale nie Skarb Państwa, ani Powiat Kraków (grodzki))'), 'municipalShared');
  assert.equal(ownershipGroup('Gmina Kraków - współwłasność ze Skarbem Państwa'), 'municipalShared');
  assert.equal(ownershipGroup('Powiat Kraków (grodzki) - właściciel, działka oddana wyłącznie w zarząd (współzarząd)'), 'county');
  assert.equal(ownershipGroup('Skarb Państwa - właściciel, działka oddana w użytkowanie (współużytkowanie) wieczyste osobom prawnym (ale nie Gminie Kraków)'), 'state');
  assert.equal(ownershipGroup('Działki osób fizycznych'), 'other');
  assert.equal(ownershipGroup(''), null);
  assert.equal(isCityLand({ id: 'x' }), undefined);
  assert.equal(isCityLand({ ownership: null }), false);
  const roof = { monument: { kind: 'inventory', address: 'ul. X 1' }, urbanLayout: 'Kleparz', unesco: 'buffer', heritageArea: true };
  assert.deepEqual(heritageFlags(roof).map(f => [f.key, f.level]), [['urbanLayout', 'permit'], ['inventory', 'opinion'], ['heritageArea', 'opinion'], ['unescoBuffer', 'opinion']]);
  assert.equal(needsConservator(roof), true);
  assert.equal(needsConservator({ monument: { kind: 'inventory' } }), false);
});

test('register file covers every roof with consistent groups and statistics', () => {
  assert.equal(Object.keys(registers.roofs).length, roofs.length);
  assert.equal(registers.sources.length, 9);
  for (const s of registers.sources) assert.match(s.url, /^https:\/\/msip\.um\.krakow\.pl\/arcgis\/rest\/services\//);
  let city = 0, inEgib = 0, register = 0;
  for (const roof of roofs) {
    const row = registers.roofs[roof.id];
    assert.equal(typeof row.inEgib, 'boolean');
    if (row.inEgib) inEgib++;
    if (row.ownership) {
      assert.equal(row.ownership.group, ownershipGroup(row.ownership.description));
      assert.equal(row.ownership.parcel, candidateParcel(roof.id));
      if (CITY_GROUPS.includes(row.ownership.group)) city++;
    }
    if (row.monument) {
      assert.ok(['register', 'inventory'].includes(row.monument.kind));
      assert.ok(row.monument.distanceM >= 0 && row.monument.distanceM <= 10);
      if (row.monument.kind === 'register') register++;
    }
    assert.ok([null, 'area', 'buffer'].includes(row.unesco));
    assert.ok(Array.isArray(row.res));
  }
  assert.deepEqual({ city, inEgib, register }, { city: registers.stats.cityOwned, inEgib: registers.stats.inEgib, register: registers.stats.monumentRegister });
});

test('PVGIS reference supports the model calibration', () => {
  const horizontal = pvgis.cases.find(c => c.key === 'horizontal'), tilted = pvgis.cases.find(c => c.key === 'flat10');
  assert.ok(horizontal.irradiationKwhPerM2 > 1000 && horizontal.irradiationKwhPerM2 < 1300);
  // The model's specific yield on an unshaded horizontal roof stays within 5% of PVGIS.
  const model = horizontal.irradiationKwhPerM2 * DEFAULTS.performanceRatio;
  assert.ok(Math.abs(model / horizontal.energyKwhPerKwp - 1) < 0.05);
  assert.ok(tilted.energyKwhPerKwp > horizontal.energyKwhPerKwp);
});

test('default plan on real data is spread out, stays within budget and reports its impact', () => {
  const merged = roofs.map(r => ({ ...r, ...context.roofs[r.id], ...registers.roofs[r.id] }));
  const { candidates } = prepareCandidates(merged, DEFAULTS);
  const result = optimizePortfolio(candidates, DEFAULTS.budgetPln);
  const byId = new Map(candidates.map(r => [r.id, r]));
  const facts = describePortfolio(result.selectedIds.map(id => byId.get(id)), DEFAULTS);
  assert.ok(facts.costPln <= DEFAULTS.budgetPln);
  assert.ok(facts.count >= 8, 'A 150 kWp cap spreads the budget over more buildings.');
  assert.ok(facts.largestSharePercent < 30);
  assert.equal(facts.procedures.permit, 0);
  assert.equal(facts.cityLandCount, facts.count, 'Default plan uses city land only.');
  assert.ok(result.selectedIds.every(id => byId.get(id).inEgib));
  assert.equal(Object.values(facts.procedures).reduce((a, b) => a + b, 0), facts.count);
  assert.ok(Math.abs(facts.co2Tonnes - facts.annualEnergyKwh / 1000 * 0.597) < 1e-6);
  assert.ok(Math.abs(facts.costPerMwhPln - facts.costPln / (facts.annualEnergyKwh / 1000)) < 1e-6);
  const csv = portfolioCsv(candidates, result, { ...DEFAULTS, excludedIds: [] }, { referenceFile: 's', referenceSha256: 'h', snapshotDate: null });
  for (const label of ['Limit mocy na budynek kWp (0 = bez limitu)";"150"', 'Wskaźnik emisyjności CO2 kg CO2/MWh";"597"', 'Adres (do weryfikacji)', 'Procedura', 'Uniknięta emisja t CO2/rok', 'Tylko działki miasta";"tak"', 'Funkcja budynku (EGiB)', 'Gmina Kraków - właściciel']) assert.ok(csv.includes(label), label);
});

test('budget curve is sorted, within each budget and never loses energy when the budget grows', () => {
  const { candidates } = prepareCandidates(roofs, DEFAULTS);
  const curve = budgetCurve(candidates, [5e6, 1e6, 2e6, 1e6, 10e6]);
  assert.deepEqual(curve.map(p => p.budgetPln), [1e6, 2e6, 5e6, 10e6]);
  for (const [i, point] of curve.entries()) {
    assert.ok(point.costPln <= point.budgetPln);
    if (i) assert.ok(point.annualEnergyKwh + 1e-6 >= curve[i - 1].annualEnergyKwh * 0.995);
  }
});

test('roof context covers every roof with bounded, documented matches', () => {
  assert.equal(Object.keys(context.roofs).length, roofs.length);
  assert.equal(context.sources.length, 2);
  for (const source of context.sources) assert.match(source.url, /^https:\/\/msip\.um\.krakow\.pl\/Dane\//);
  let inside = 0, nearest = 0, parks = 0;
  for (const roof of roofs) {
    const row = context.roofs[roof.id];
    assert.ok(row, roof.id);
    assert.ok([null, 'inside', 'nearest'].includes(row.addressMethod));
    if (row.addressMethod === 'inside') { inside++; assert.equal(row.addressDistanceM, 0); assert.ok(row.addressesInside >= 1); }
    if (row.addressMethod === 'nearest') { nearest++; assert.ok(row.addressDistanceM > 0 && row.addressDistanceM <= 30); }
    if (row.addressMethod) assert.ok(row.address.length > 2);
    else assert.equal(row.address, null);
    if (row.culturalPark) { parks++; assert.match(row.culturalPark, /Park Kulturowy/i); }
  }
  assert.deepEqual({ inside, nearest, parks }, { inside: context.stats.inside, nearest: context.stats.nearest, parks: context.stats.culturalPark });
});

test('building IDs become readable names and parcel hints', () => {
  const id = '126105_9.0017.292/1.1_BUD';
  assert.equal(roofLabel('pl', id), 'Budynek 1 · dz. 292/1');
  assert.equal(roofPlace('pl', id), 'Śródmieście · obręb 17');
  assert.equal(candidateParcel(id), '126105_9.0017.292/1');
  assert.equal(candidateParcel('test-roof'), null);
  assert.equal(roofLabel('pl', 'test-roof'), roofLabel('pl', 'test-roof'));
});
