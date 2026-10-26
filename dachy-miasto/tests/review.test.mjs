import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewSample, reviewCsv } from '../src/core/review.js';

const roofs = Array.from({ length: 30 }, (_, i) => ({
  id: `126102_9.${String(i % 5).padStart(4, '0')}.${i}_BUD`, usableAreaM2: i + 1,
  greenRoofPotential: i % 2 === 0, investmentLabel: i % 3 === 0 ? 'Investment' : null,
}));

test('review sample prioritizes selected roofs, flags and area extremes without granting ownership', () => {
  const selectedIds = [roofs[11].id, roofs[17].id, roofs[22].id];
  const sample = createReviewSample(roofs, selectedIds, null);
  assert.equal(sample.length, 15);
  assert.equal(new Set(sample.map(r => r.id)).size, 15);
  assert.deepEqual(sample.slice(0, 3).map(r => r.id), selectedIds);
  for (const reason of ['investment', 'green', 'smallest', 'largest']) assert.ok(sample.some(r => r.reasons.includes(reason)));
  for (const row of sample) {
    assert.equal(row.reviewStatus, 'pending'); assert.equal(row.parcelCategory, null);
    assert.equal(row.buildingOwner, null); assert.equal(row.installedPv, 'unknown');
    assert.equal(row.position, null); assert.equal(row.evidenceUrl, null);
  }
  assert.deepEqual(createReviewSample(roofs.slice().reverse(), selectedIds, null), sample);
});

test('review queue handles empty input, duplicate selections, missing geometry and sample limits', () => {
  assert.deepEqual(createReviewSample([], [], null), []);
  assert.deepEqual(createReviewSample(roofs, [], null, 0), []);
  const geometry = { features: [{ properties: { ident: roofs[0].id }, geometry: { type: 'Polygon', coordinates: [[[19, 50], [21, 50], [21, 52], [19, 50]]] } }] };
  const sample = createReviewSample(roofs.slice(0, 2), [roofs[0].id, roofs[0].id, 'missing'], geometry);
  assert.equal(sample.length, 2);
  assert.deepEqual(sample[0].position, { longitude: 20, latitude: 51, method: 'geometry-bounding-box-center' });
  assert.equal(sample[0].address, null);
  assert.equal(createReviewSample(roofs, roofs.map(r => r.id), null).length, 15);
});

test('review CSV localizes headings, leaves evidence blank, escapes labels and blocks formulas', () => {
  const sample = createReviewSample([{ ...roofs[0], investmentLabel: '=HYPERLINK("bad");label\nnext' }], [], null);
  const ru = reviewCsv(sample), pl = reviewCsv(sample, 'pl');
  assert.ok(ru.startsWith('\uFEFF')); assert.match(ru, /Категория собственности участка/);
  assert.match(pl, /Kategoria własności działki/);
  assert.ok(ru.includes(`"'=HYPERLINK(""bad"");label\nnext"`));
  assert.match(ru, /ожидает проверки/); assert.match(pl, /oczekuje/);
  assert.ok(ru.includes(sample[0].id) && pl.includes(sample[0].id));
});
