import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DEFAULTS, prepareCandidates } from '../src/core/model.js';
import { optimizePortfolio } from '../src/core/optimizer.js';

const dataDir = new URL('../data/', import.meta.url);
const roofs = JSON.parse(await fs.readFile(new URL('roofs.json', dataDir), 'utf8'));
const geoText = await fs.readFile(new URL('msip-roofs.geojson', dataDir), 'utf8');
const geo = JSON.parse(geoText);
const verification = JSON.parse(await fs.readFile(new URL('msip-verification.json', dataDir), 'utf8'));

test('official geometry joins all pilot IDs without duplicates or swapped latitude/longitude', () => {
  assert.equal(roofs.length, 927);
  assert.equal(new Set(geo.features.map(f => f.properties.ident)).size, roofs.length);
  const ids = new Set(roofs.map(r => r.id));
  for (const f of geo.features) {
    assert.ok(ids.has(f.properties.ident));
    assert.ok(['Polygon', 'MultiPolygon'].includes(f.geometry.type));
    const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
    for (const ring of rings) for (const [lon, lat] of ring) {
      assert.ok(Number.isFinite(lon) && lon > 18.5 && lon < 21, 'Expected Kraków longitude.');
      assert.ok(Number.isFinite(lat) && lat > 49.5 && lat < 51, 'Expected Kraków latitude.');
    }
  }
  assert.equal(createHash('sha256').update(geoText).digest('hex'), verification.geojsonSha256);
});

test('reference irradiation matches the official records; ownership is not inferred from geometry', () => {
  const official = new Map(geo.features.map(f => [f.properties.ident, f.properties]));
  for (const roof of roofs) {
    assert.equal(roof.annualIrradiationKwh, official.get(roof.id).sumapc);
    assert.equal(roof.ownershipStatus, 'unverified');
    assert.equal(roof.protectionStatus, 'unknown');
  }
});

test('real pilot selections respect budgets and the relaxation bound across eight scenarios', () => {
  const { candidates } = prepareCandidates(roofs, DEFAULTS);
  for (const budget of [0, 100000, 500000, 1000000, 2000000, 5000000, 10000000, 20000000]) {
    const result = optimizePortfolio(candidates, budget);
    assert.ok(result.totals.costPln <= budget);
    assert.equal(result.selectedIds.length, new Set(result.selectedIds).size);
    assert.ok(result.totals.annualEnergyKwh <= result.upperBoundKwh + 1e-6);
    assert.ok(result.totals.annualEnergyKwh + 1e-6 >= result.alternatives[0].annualEnergyKwh);
  }
});
