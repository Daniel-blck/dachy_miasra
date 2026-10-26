import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, evaluateRoof, prepareCandidates } from '../src/core/model.js';
import { optimizePortfolio } from '../src/core/optimizer.js';
import { portfolioCsv } from '../src/core/export.js';

const item = (id, costCents, annualEnergyKwh) => ({ id, costCents, annualEnergyKwh, capacityKwp: 1 });
const roof = { id: 'A', usableAreaM2: 100, annualIrradiationKwh: 100000, greenRoofPotential: false, investmentLabel: null };

test('area, radiation allocation and losses share the same coverage; cost is in cents', () => {
  const r = evaluateRoof(roof, DEFAULTS);
  assert.equal(r.panelAreaM2, 60);
  assert.equal(r.capacityKwp, 12);
  assert.equal(r.annualEnergyKwh, 9600);
  assert.equal(r.costCents, 6_300_000);
  const half = evaluateRoof(roof, { ...DEFAULTS, coverage: 0.3 });
  assert.equal(half.annualEnergyKwh, r.annualEnergyKwh / 2);
  assert.equal(half.capacityKwp, r.capacityKwp / 2);
});

test('knapsack beats both simple greedy strategies on a known example', () => {
  const items = [item('A', 600, 10), item('B', 500, 8), item('C', 500, 8)];
  const r = optimizePortfolio(items, 10);
  assert.deepEqual(r.selectedIds, ['B', 'C']);
  assert.equal(r.totals.annualEnergyKwh, 16);
  assert.equal(r.strategy, 'dp');
  assert.equal(r.totals.costPln, 10);
});

test('zero budget, empty input, unaffordable roofs and all-items-fit cases', () => {
  assert.equal(optimizePortfolio([item('A', 100, 1)], 0).totals.count, 0);
  assert.equal(optimizePortfolio([], 100).upperBoundKwh, 0);
  assert.equal(optimizePortfolio([item('A', 10001, 1)], 100).totals.count, 0);
  assert.equal(optimizePortfolio([item('A', 50, 2), item('B', 51, 3)], 2, { maxStates: 1 }).totals.count, 2);
});

test('explicit exclusions and investment flags do not silently imply installed PV', () => {
  const rows = [roof, { ...roof, id: 'B', investmentLabel: 'Inwestycja', greenRoofPotential: true }];
  assert.equal(prepareCandidates(rows, DEFAULTS).candidates.length, 2);
  const filtered = prepareCandidates(rows, { ...DEFAULTS, onlyGreen: true }, ['B']);
  assert.equal(filtered.candidates.length, 0);
  assert.match(filtered.reasons.B, /użytkownika/);
  assert.throws(() => prepareCandidates(rows, { ...DEFAULTS, coverage: NaN }));
});

test('exact small problems match exhaustive enumeration; fractional relaxation is an upper bound', () => {
  let seed = 4291;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let trial = 0; trial < 60; trial++) {
    const items = Array.from({ length: 9 }, (_, i) => item(String(i), 1 + Math.floor(random() * 80), 1 + Math.floor(random() * 100)));
    const budgetCents = 20 + Math.floor(random() * 220);
    let best = 0;
    for (let mask = 0; mask < 2 ** items.length; mask++) {
      let cost = 0, energy = 0;
      items.forEach((r, i) => { if (mask & (1 << i)) { cost += r.costCents; energy += r.annualEnergyKwh; } });
      if (cost <= budgetCents) best = Math.max(best, energy);
    }
    const result = optimizePortfolio(items, budgetCents / 100);
    assert.equal(result.totals.annualEnergyKwh, best);
    assert.ok(result.upperBoundKwh + 1e-8 >= best);
  }
});

test('coarse rounding stays feasible, keeps IDs unique and never underperforms either baseline', () => {
  const items = Array.from({ length: 120 }, (_, i) => item(String(i), 1001 + (i * 197) % 13000, 50 + (i * 89) % 5000));
  const result = optimizePortfolio(items, 2000, { maxStates: 37 });
  assert.ok(result.totals.costCents <= 200000);
  assert.equal(result.selectedIds.length, new Set(result.selectedIds).size);
  for (const baseline of result.alternatives) assert.ok(result.totals.annualEnergyKwh + 1e-8 >= baseline.annualEnergyKwh);
  assert.ok(result.upperBoundKwh + 1e-8 >= result.totals.annualEnergyKwh);
  assert.throws(() => optimizePortfolio([items[0], items[0]], 2000));
  assert.throws(() => optimizePortfolio([item('X', 0, 1)], 100));
});

test('export includes actual costs, parameters, exclusions and escaped source labels', () => {
  const r = { ...evaluateRoof(roof, DEFAULTS), investmentLabel: 'A;"B"' };
  const result = optimizePortfolio([r], DEFAULTS.budgetPln);
  const csv = portfolioCsv([r], result, { ...DEFAULTS, excludedIds: ['X'] }, { referenceFile: 'source', referenceSha256: 'abc', snapshotDate: null });
  assert.ok(csv.includes('"Koszt wybranych PLN";"63000"'));
  assert.ok(csv.includes('"A;""B"""'));
  assert.ok(csv.includes('"Wykluczone identyfikatory";"X"'));
});
