import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DEFAULTS, prepareCandidates } from '../src/core/model.js';
import { optimizePortfolio } from '../src/core/optimizer.js';
import { createReviewSample, reviewCsv, OWNERSHIP_SOURCE } from '../src/core/review.js';

const data = new URL('../data/', import.meta.url);
const roofsText = await fs.readFile(new URL('roofs.json', data), 'utf8');
const geometryText = await fs.readFile(new URL('msip-roofs.geojson', data), 'utf8');
const roofs = JSON.parse(roofsText), geometry = JSON.parse(geometryText);
const { candidates } = prepareCandidates(roofs, DEFAULTS);
const result = optimizePortfolio(candidates, DEFAULTS.budgetPln);
const sample = createReviewSample(roofs, result.selectedIds, geometry);
const report = {
  schemaVersion: 1, purpose: 'Manual review queue; no ownership conclusions have been made.',
  parameters: DEFAULTS, selectedIds: result.selectedIds,
  selectedRoofsOutsideSample: result.selectedIds.filter(id => !sample.some(row => row.id === id)),
  inputSha256: {
    roofs: createHash('sha256').update(roofsText).digest('hex'),
    geometry: createHash('sha256').update(geometryText).digest('hex'),
  },
  ownershipSource: OWNERSHIP_SOURCE, sample,
};
await fs.writeFile(new URL('review-sample.json', data), JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(new URL('review-sample.ru.csv', data), reviewCsv(sample, 'ru'));
await fs.writeFile(new URL('review-sample.pl.csv', data), reviewCsv(sample, 'pl'));
console.log(`Prepared ${sample.length} roofs for review; ${sample.filter(r => r.reasons.includes('selected')).length} from the default portfolio. All reviews pending.`);
