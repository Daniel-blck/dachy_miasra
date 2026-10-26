import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const dataDir = new URL('../data/', import.meta.url);
const base = 'https://msip.um.krakow.pl/arcgis/rest/services/MONIT-AIR/WS_MA_Potencal_solarny_dachow/MapServer';
const roofs = JSON.parse(await fs.readFile(new URL('roofs.json', dataDir), 'utf8'));
const get = async (url, parameters = {}) => {
  const target = new URL(url);
  for (const [key, value] of Object.entries(parameters)) target.searchParams.set(key, String(value));
  const response = await fetch(target, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`MSIP HTTP ${response.status}`);
  const json = await response.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json;
};
const service = await get(base, { f: 'json' });
const layer = await get(base + '/0', { f: 'json' });
const count = await get(base + '/0/query', { f: 'json', where: '1=1', returnCountOnly: true });
const features = [];
for (let offset = 0; offset < roofs.length; offset += 40) {
  const ids = roofs.slice(offset, offset + 40).map(r => `'${r.id.replaceAll("'", "''")}'`).join(',');
  const result = await get(base + '/0/query', {
    f: 'geojson', where: `ident IN (${ids})`,
    outFields: 'ident,solarid,sredniepc,sumapc,powbudynku,powuzytecz,objectid',
    returnGeometry: true, outSR: 4326,
  });
  if (!Array.isArray(result.features) || result.exceededTransferLimit) throw new Error('Incomplete MSIP response.');
  features.push(...result.features);
  console.log(`Geometry: ${Math.min(offset + 40, roofs.length)}/${roofs.length} IDs queried`);
}
const matching = new Set(features.map(f => f.properties.ident));
const reference = new Map(roofs.map(r => [r.id, r]));
const differences = features.flatMap(f => {
  const original = reference.get(f.properties.ident);
  if (!original) return [];
  const delta = Math.abs(f.properties.sumapc - original.annualIrradiationKwh);
  return delta > 1 ? [{ id: original.id, referenceIrradiation: original.annualIrradiationKwh, officialIrradiation: f.properties.sumapc }] : [];
});
const collection = { type: 'FeatureCollection', features };
const serialized = JSON.stringify(collection);
const verification = {
  retrievedAt: new Date().toISOString(),
  serviceUrl: base, layerUrl: base + '/0',
  serviceDescription: service.serviceDescription,
  sourceSpatialReference: service.spatialReference,
  outputSpatialReference: 'EPSG:4326',
  officialRecordCount: count.count,
  queriedReferenceIds: roofs.length,
  matchingReferenceIds: matching.size,
  features: features.length,
  missingIds: roofs.filter(r => !matching.has(r.id)).map(r => r.id),
  duplicateGeometryIds: [...matching].filter(id => features.filter(f => f.properties.ident === id).length > 1),
  attributeDifferences: differences,
  geojsonSha256: createHash('sha256').update(serialized).digest('hex'),
  geometryOnlyEnrichment: true,
  limitation: 'Geometria i pola źródła porównane. Własność, stan techniczny, ochrona i aktualność instalacji pozostają niezweryfikowane.',
};
// Only replace the usable snapshot after all queries complete successfully.
await fs.writeFile(new URL('msip-roofs.geojson', dataDir), serialized);
await fs.writeFile(new URL('msip-verification.json', dataDir), JSON.stringify(verification, null, 2) + '\n');
await fs.writeFile(new URL('msip-layer.json', dataDir), JSON.stringify({ service, layer }, null, 2) + '\n');
console.log(JSON.stringify({ matched: matching.size, missing: verification.missingIds.length, differences: differences.length, officialCount: count.count }));
