// Joins open municipal datasets to the pilot roofs: address points (address, district) and cultural parks.
// Usage: node scripts/fetch-context.mjs            downloads the current MSIP archives
//        node scripts/fetch-context.mjs --from DIR  uses Adresy_JSON.zip and Parki_kulturowe_JSON.zip saved in DIR
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { inverse2178, outerRings, pointInRings, centroid, metresToRings, metresBetween } from '../src/core/geo.js';

const dataDir = new URL('../data/', import.meta.url);
const ADDRESS_LIMIT_M = 30, DISTRICT_LIMIT_M = 500, CELL = 0.002;
const SOURCES = {
  addresses: { name: 'MSIP · Adresy (punkty adresowe)', url: 'https://msip.um.krakow.pl/Dane/Adresy_JSON.zip', entry: 'Adresy.geojson' },
  parks: { name: 'MSIP · Parki kulturowe', url: 'https://msip.um.krakow.pl/Dane/Parki_kulturowe_JSON.zip', entry: 'Parki_kulturowe.geojson' },
};

/** Minimal ZIP reader (stored and deflated entries), enough for the MSIP archives. */
function unzip(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Not a ZIP archive.');
  const files = new Map();
  for (let i = 0, p = buffer.readUInt32LE(end + 16); i < buffer.readUInt16LE(end + 10); i++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt ZIP directory.');
    const method = buffer.readUInt16LE(p + 10), size = buffer.readUInt32LE(p + 20);
    const nameLength = buffer.readUInt16LE(p + 28), skip = nameLength + buffer.readUInt16LE(p + 30) + buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42), name = buffer.toString('utf8', p + 46, p + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(start, start + size);
    if (method === 0 || method === 8) files.set(name, method === 8 ? inflateRawSync(raw) : raw);
    p += 46 + skip;
  }
  return files;
}

async function load(key) {
  const source = SOURCES[key], from = process.argv.indexOf('--from');
  const buffer = from >= 0
    ? await fs.readFile(path.resolve(process.argv[from + 1], source.url.split('/').pop()))
    : Buffer.from(await (async () => { const r = await fetch(source.url, { signal: AbortSignal.timeout(120000) }); if (!r.ok) throw new Error(`MSIP HTTP ${r.status}`); return r.arrayBuffer(); })());
  const files = unzip(buffer);
  const geojson = JSON.parse(files.get(source.entry)?.toString('utf8') ?? 'null');
  if (!geojson?.features?.length || geojson.crs?.properties?.name !== 'EPSG:2178') throw new Error(`Unexpected content of ${source.url}`);
  const currency = files.get('__Aktualnosc__.txt')?.toString('utf8').trim() || null;
  return { geojson, meta: { name: source.name, url: source.url, sha256: createHash('sha256').update(buffer).digest('hex'), currency, features: geojson.features.length } };
}

const project = coordinates => typeof coordinates[0] === 'number' ? inverse2178(coordinates[0], coordinates[1]) : coordinates.map(project);
const clean = value => typeof value === 'string' ? value.trim() : '';
const roofs = JSON.parse(await fs.readFile(new URL('roofs.json', dataDir), 'utf8'));
const geometry = JSON.parse(await fs.readFile(new URL('msip-roofs.geojson', dataDir), 'utf8'));
const [addresses, parks] = [await load('addresses'), await load('parks')];

const grid = new Map();
const cell = ([lon, lat]) => `${Math.floor(lon / CELL)}:${Math.floor(lat / CELL)}`;
for (const f of addresses.geojson.features) {
  const p = f.properties, point = project(f.geometry.coordinates);
  const street = clean(p.nazwa_ulicy), number = clean(p.numer_adresowy);
  const entry = { point, label: street ? `${street} ${number}` : `${clean(p.miejscowosc) || 'Kraków'} ${number}`.trim(), postcode: clean(p.kod_pocztowy) || null, district: clean(p.nazwa_dzielnicy).replace(/^Dzielnica\s+/, '') || null };
  const key = cell(point);
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push(entry);
}
const near = ([lon, lat], radiusDeg) => {
  const out = [];
  for (let x = Math.floor((lon - radiusDeg) / CELL); x <= Math.floor((lon + radiusDeg) / CELL); x++)
    for (let y = Math.floor((lat - radiusDeg) / CELL); y <= Math.floor((lat + radiusDeg) / CELL); y++) out.push(...(grid.get(`${x}:${y}`) || []));
  return out;
};
const parkShapes = parks.geojson.features.map(f => ({ name: clean(f.properties.nazwa), rings: outerRings({ type: f.geometry.type, coordinates: project(f.geometry.coordinates) }) }));

const byId = new Map(geometry.features.map(f => [f.properties.ident, f]));
const context = {}, stats = { inside: 0, nearest: 0, withoutAddress: 0, district: 0, culturalPark: 0 };
for (const roof of roofs) {
  const feature = byId.get(roof.id);
  const row = { address: null, postcode: null, addressMethod: null, addressDistanceM: null, addressesInside: 0, district: null, culturalPark: null };
  if (feature) {
    const rings = outerRings(feature.geometry), middle = centroid(rings);
    const span = Math.max(...rings.flat().map(p => Math.max(Math.abs(p[0] - middle[0]), Math.abs(p[1] - middle[1]))));
    const candidates = near(middle, span + 0.0006).map(a => ({ ...a, edge: metresToRings(a.point, rings), centre: metresBetween(a.point, middle) }));
    const inside = candidates.filter(a => a.edge === 0).sort((a, b) => a.centre - b.centre);
    const nearest = candidates.filter(a => a.edge > 0 && a.edge <= ADDRESS_LIMIT_M).sort((a, b) => a.edge - b.edge)[0];
    const chosen = inside[0] || nearest;
    if (chosen) Object.assign(row, { address: chosen.label, postcode: chosen.postcode, addressMethod: inside.length ? 'inside' : 'nearest', addressDistanceM: Math.round(chosen.edge * 10) / 10, addressesInside: inside.length, district: chosen.district });
    if (!row.district) {
      const fallback = near(middle, 0.008).map(a => ({ ...a, d: metresBetween(a.point, middle) })).filter(a => a.d <= DISTRICT_LIMIT_M && a.district).sort((a, b) => a.d - b.d)[0];
      if (fallback) row.district = fallback.district;
    }
    const park = parkShapes.find(p => pointInRings(middle, p.rings) || rings.flat().some(v => pointInRings(v, p.rings)));
    row.culturalPark = park?.name || null;
  }
  stats[row.addressMethod === 'inside' ? 'inside' : row.addressMethod === 'nearest' ? 'nearest' : 'withoutAddress']++;
  if (row.district) stats.district++;
  if (row.culturalPark) stats.culturalPark++;
  context[roof.id] = row;
}

const output = {
  schemaVersion: 1,
  retrievedAt: new Date().toISOString(),
  sources: [addresses.meta, parks.meta],
  method: {
    coordinates: 'EPSG:2178 → EPSG:4326, odwzorowanie odwrotne PL-2000 strefa 7 (GRS80).',
    address: `Punkt adresowy wewnątrz obrysu dachu (najbliższy środka) albo najbliższy punkt do ${ADDRESS_LIMIT_M} m od krawędzi obrysu. To kandydat do potwierdzenia, nie adres z ewidencji budynków.`,
    district: `Dzielnica z wybranego punktu adresowego, a bez adresu — z najbliższego punktu do ${DISTRICT_LIMIT_M} m od środka obrysu.`,
    culturalPark: 'Środek obrysu lub dowolny wierzchołek obrysu w granicach parku kulturowego.',
  },
  stats: { roofs: roofs.length, ...stats },
  roofs: context,
};
await fs.writeFile(new URL('roof-context.json', dataDir), JSON.stringify(output) + '\n');
console.log(JSON.stringify(output.stats), addresses.meta.currency, parks.meta.currency);
