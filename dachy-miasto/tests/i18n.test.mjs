import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { MESSAGES, translate } from '../src/i18n.js';
import { DEFAULTS, evaluateRoof } from '../src/core/model.js';
import { optimizePortfolio } from '../src/core/optimizer.js';
import { portfolioCsv } from '../src/core/export.js';

test('both languages have the same keys and interpolation placeholders', () => {
  assert.deepEqual(Object.keys(MESSAGES.ru), Object.keys(MESSAGES.pl));
  for (const key of Object.keys(MESSAGES.ru)) {
    const placeholders = text => (text.match(/\{\w+\}/g) || []).sort();
    assert.deepEqual(placeholders(MESSAGES.ru[key]), placeholders(MESSAGES.pl[key]), key);
  }
  assert.equal(translate('ru', 'roof', { id: '123' }), 'Крыша 123');
  assert.equal(translate('pl', 'roof', { id: '123' }), 'Dach 123');
});

test('all literal UI translation keys exist', async () => {
  for (const name of ['views.js', 'controller.js', 'map.js']) {
    const source = await fs.readFile(new URL('../src/' + name, import.meta.url), 'utf8');
    for (const match of source.matchAll(/\bt\('([\w]+)'(?=\s*[,\)])/g)) assert.ok(MESSAGES.ru[match[1]], `${name}: ${match[1]}`);
  }
});

test('Russian CSV changes labels without changing selected IDs, costs or source names', () => {
  const roof = evaluateRoof({ id: 'test-roof', usableAreaM2: 100, annualIrradiationKwh: 100000, greenRoofPotential: true, investmentLabel: 'Szkoła', ownershipStatus: 'unverified', protectionStatus: 'unknown' }, DEFAULTS);
  const result = optimizePortfolio([roof], DEFAULTS.budgetPln);
  const metadata = { referenceFile: 'source.html', referenceSha256: 'hash', snapshotDate: null };
  const csv = portfolioCsv([roof], result, DEFAULTS, metadata, 'ru');
  assert.ok(csv.includes('"Бюджет PLN";"5000000"'));
  assert.ok(csv.includes('"Полезная площадь м2"'));
  assert.ok(csv.includes('"test-roof"'));
  assert.ok(csv.includes('"63000.00"'));
  assert.ok(csv.includes('"Szkoła"'));
});
