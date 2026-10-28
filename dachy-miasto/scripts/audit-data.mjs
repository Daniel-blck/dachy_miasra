import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { auditSolarData } from '../src/core/provenance.js';
import { DEFAULTS, prepareCandidates, describePortfolio } from '../src/core/model.js';
import { optimizePortfolio } from '../src/core/optimizer.js';

const names = ['roofs.json', 'msip-roofs.geojson', 'roof-context.json', 'roof-registers.json', 'reference-metadata.json', 'msip-verification.json', 'source-live-check.json'];
const inputs = await Promise.all(names.map(async name => {
  const text = await fs.readFile(new URL('../data/' + name, import.meta.url), 'utf8');
  return [name, { data: JSON.parse(text), sha256: createHash('sha256').update(text).digest('hex') }];
}));
const data = Object.fromEntries(inputs);
const roofs = data['roofs.json'].data, geometry = data['msip-roofs.geojson'].data;
const merged = roofs.map(r => ({ ...r, ...data['roof-context.json'].data.roofs[r.id], ...data['roof-registers.json'].data.roofs[r.id] }));
const { candidates, reasons } = prepareCandidates(merged, DEFAULTS);
const result = optimizePortfolio(candidates, DEFAULTS.budgetPln);
const source = await fs.readFile(new URL('../../krakow-all-in-one.html', import.meta.url));
const verification = data['msip-verification.json'].data;
const live = data['source-live-check.json'].data;
const savedSpot = geometry.features.find(f => f.properties.ident === live.attributes.ident)?.properties;
const report = {
  schemaVersion: 1,
  scope: 'Reproducible comparison of saved snapshots; not a new roof survey or proof of current conditions.',
  inputSha256: Object.fromEntries(inputs.map(([name, value]) => [name, value.sha256])),
  referenceHashMatches: createHash('sha256').update(source).digest('hex') === data['reference-metadata.json'].data.referenceSha256,
  geometryHashMatches: data['msip-roofs.geojson'].sha256 === verification.geojsonSha256,
  sourceRetrievedAt: verification.retrievedAt,
  sourceSurveyDate: null,
  liveSpotCheck: { checkedOn: live.checkedOn, id: live.attributes.ident, url: live.url,
    matchesSaved: ['powbudynku', 'powuzytecz', 'sredniepc', 'sumapc'].every(key => savedSpot && Math.abs(savedSpot[key] - live.attributes[key]) < 1e-8),
    scope: live.scope },
  solar: auditSolarData(roofs, geometry),
  defaults: DEFAULTS,
  screening: { candidates: candidates.length, excluded: Object.keys(reasons).length,
    reasons: Object.values(reasons).reduce((counts, key) => ({ ...counts, [key]: (counts[key] || 0) + 1 }), {}) },
  plan: describePortfolio(result.selectedIds.map(id => candidates.find(r => r.id === id)), DEFAULTS),
  selectedIds: result.selectedIds,
};
if (!report.referenceHashMatches || !report.geometryHashMatches || !report.liveSpotCheck.matchesSaved || report.solar.mismatches.length || report.solar.duplicatePilotIds || report.solar.duplicateGeometryIds || report.solar.features !== roofs.length) throw new Error('Source audit failed.');
await fs.writeFile(new URL('../data/source-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report.solar, mismatches: report.solar.mismatches.length, largestRoofs: undefined, plan: report.plan, screening: report.screening }, null, 2));
