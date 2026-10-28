// Joins municipal registers published by MSIP (ArcGIS REST) to the pilot roofs:
// EGiB building class, ownership group of the parcel named in the building ID, monuments,
// UNESCO / Pomnik Historii areas and RES installations recorded by the city.
// Usage: node scripts/fetch-registers.mjs   (network access to msip.um.krakow.pl is required)
import fs from 'node:fs/promises';
import { inverse2178, outerRings, pointInRings, centroid, metresToRings } from '../src/core/geo.js';
import { candidateParcel } from '../src/core/review.js';
import { CITY_GROUPS, ownershipGroup } from '../src/core/registers.js';

const dataDir = new URL('../data/', import.meta.url);
const REST = 'https://msip.um.krakow.pl/arcgis/rest/services/';
const MONUMENT_LIMIT_M = 10, RES_LIMIT_M = 15, CONCURRENCY = 4;
const LAYERS = {
  buildings: { name: 'MSIP · Budynki ewidencyjne (EGiB)', path: 'Pobieranie/Budynki/MapServer/0' },
  ownership: { name: 'MSIP · Struktura własności działek', path: 'Obserwatorium/K01_GR_WLASNOSCI/MapServer/0' },
  register: { name: 'MSIP · Obiekty w rejestrze zabytków', path: 'Obserwatorium/zabytki_do_pobrania/MapServer/0' },
  inventory: { name: 'MSIP · Obiekty w gminnej ewidencji zabytków', path: 'Obserwatorium/zabytki_do_pobrania/MapServer/1' },
  urban: { name: 'MSIP · Układy urbanistyczne w rejestrze zabytków', path: 'Obserwatorium/Zabytki_aprx/MapServer/4' },
  heritage: { name: 'MSIP · Obszar Pomnika Historii', path: 'Obserwatorium/Zabytki_aprx/MapServer/5' },
  unesco: { name: 'MSIP · Obszar UNESCO', path: 'Obserwatorium/Zabytki_aprx/MapServer/9' },
  buffer: { name: 'MSIP · Strefa buforowa UNESCO', path: 'Obserwatorium/Zabytki_aprx/MapServer/8' },
  res: { name: 'MSIP · Instalacje OZE (wykaz miejski)', path: 'JP/JP_OZE/MapServer/0' },
};
const UNIT_NAMES = { '126102': 'KROWODRZA', '126103': 'NOWA HUTA', '126104': 'PODGÓRZE', '126105': 'ŚRÓDMIEŚCIE' };

async function query(path, params, attempt = 1) {
  try {
    const response = await fetch(REST + path + '/query', { method: 'POST', body: new URLSearchParams({ f: 'json', ...params }), signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    return data;
  } catch (error) {
    if (attempt >= 3) throw new Error(`${path}: ${error.message}`);
    await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
    return query(path, params, attempt + 1);
  }
}

/** All features of a layer, by object ID chunks (several MSIP layers do not support pagination). */
async function fetchAll(key, outFields = '*') {
  const { path } = LAYERS[key];
  const ids = (await query(path, { where: '1=1', returnIdsOnly: 'true' })).objectIds || [];
  const features = [];
  for (let i = 0; i < ids.length; i += 500) {
    const data = await query(path, { objectIds: ids.slice(i, i + 500).join(','), outFields, returnGeometry: 'true' });
    features.push(...data.features);
  }
  LAYERS[key].features = features.length;
  return features;
}

async function pool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) { const i = next++; results[i] = await worker(items[i]); }
  }));
  return results;
}

const text = value => typeof value === 'string' ? value.trim() : '';
const point = geometry => inverse2178(geometry.x, geometry.y);
const rings = geometry => (geometry.rings || []).map(ring => ring.map(([x, y]) => inverse2178(x, y)));

const roofs = JSON.parse(await fs.readFile(new URL('roofs.json', dataDir), 'utf8'));
const geometry = JSON.parse(await fs.readFile(new URL('msip-roofs.geojson', dataDir), 'utf8'));
const shapes = new Map(geometry.features.map(f => { const r = outerRings(f.geometry); return [f.properties.ident, { rings: r, middle: centroid(r) }]; }));

// 1. EGiB buildings: does the 2016 building still exist, and what is it used for?
const buildings = new Map();
const ids = roofs.map(r => r.id);
for (let i = 0; i < ids.length; i += 150) {
  const data = await query(LAYERS.buildings.path, { where: `ident IN (${ids.slice(i, i + 150).map(id => `'${id.replaceAll("'", "''")}'`).join(',')})`, outFields: 'ident,rodz_kst_nz,aktualnosc', returnGeometry: 'false' });
  for (const f of data.features) buildings.set(f.attributes.ident, f.attributes);
}
LAYERS.buildings.features = buildings.size;

// 2. Ownership group of the parcel embedded in the building ID (one request per parcel: the layer returns one record at a time).
const parcels = [...new Set(roofs.map(r => candidateParcel(r.id)).filter(Boolean))];
const owners = new Map(await pool(parcels, async parcel => {
  const data = await query(LAYERS.ownership.path, { where: `dz_ident='${parcel.replaceAll("'", "''")}'`, outFields: 'dz_ident,gr_wl_op,data_akt', returnGeometry: 'false' });
  return [parcel, data.features[0]?.attributes || null];
}));
LAYERS.ownership.features = [...owners.values()].filter(Boolean).length;

// 3. Monuments and protected areas.
const monuments = [
  ...(await fetchAll('register')).map(f => ({ kind: 'register', f })),
  ...(await fetchAll('inventory')).map(f => ({ kind: 'inventory', f })),
].filter(({ f }) => f.geometry).map(({ kind, f }) => ({
  kind, point: point(f.geometry), number: text(f.attributes.user_num_1) || null,
  address: text(f.attributes.user_adres).startsWith(text(f.attributes.user_field)) ? text(f.attributes.user_adres) : [text(f.attributes.user_field), text(f.attributes.user_adres)].filter(Boolean).join(' '),
  typology: text(f.attributes.user_typol) || null, dating: text(f.attributes.user_datow) || null,
}));
const areas = {};
for (const key of ['urban', 'heritage', 'unesco', 'buffer']) areas[key] = (await fetchAll(key)).filter(f => f.geometry).map(f => ({ name: text(f.attributes.NAZWA) || null, rings: rings(f.geometry) }));

// 4. RES installations recorded by the city (mostly subsidised household installations).
const resRecords = (await fetchAll('res')).map(f => ({
  unit: text(f.attributes.Jednosta_e).toUpperCase(), section: Number(text(f.attributes['Obręb'])), parcel: text(f.attributes['Nr_działk']),
  type: text(f.attributes.Zainstalow) || null, point: f.geometry ? point(f.geometry) : null,
}));

const stats = { roofs: roofs.length, inEgib: 0, ownership: 0, cityOwned: 0, monumentRegister: 0, monumentInventory: 0, urbanLayout: 0, heritageArea: 0, unesco: 0, unescoBuffer: 0, res: 0, ownershipGroups: {} };
const ownershipValues = {};
const context = {};
for (const roof of roofs) {
  const shape = shapes.get(roof.id);
  const building = buildings.get(roof.id);
  const parcelId = candidateParcel(roof.id);
  const owner = parcelId ? owners.get(parcelId) : null;
  const [unit, section, parcelNumber] = (parcelId || '').split('.');
  const row = {
    inEgib: Boolean(building),
    buildingClass: building?.rodz_kst_nz ? { code: Number(building.rodz_kst_nz.match(/\((\d+)\)/)?.[1]) || null, name: building.rodz_kst_nz.replace(/\s*\(\d+\)\s*$/, '') } : null,
    ownership: owner ? { parcel: owner.dz_ident, group: ownershipGroup(owner.gr_wl_op), description: text(owner.gr_wl_op) } : null,
    monument: null, urbanLayout: null, heritageArea: false, unesco: null, res: [],
  };
  if (shape) {
    const near = monuments.map(m => ({ ...m, distanceM: metresToRings(m.point, shape.rings) })).filter(m => m.distanceM <= MONUMENT_LIMIT_M)
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'register' ? -1 : 1) || a.distanceM - b.distanceM)[0];
    if (near) row.monument = { kind: near.kind, number: near.number, address: near.address, typology: near.typology, dating: near.dating, distanceM: Math.round(near.distanceM * 10) / 10 };
    const inside = list => list.find(a => pointInRings(shape.middle, a.rings));
    row.urbanLayout = inside(areas.urban)?.name || null;
    row.heritageArea = Boolean(inside(areas.heritage));
    row.unesco = inside(areas.unesco) ? 'area' : inside(areas.buffer) ? 'buffer' : null;
    row.res = resRecords.filter(r => (r.unit === UNIT_NAMES[unit?.split('_')[0]] && r.section === Number(section) && r.parcel === parcelNumber)
      || (r.point && metresToRings(r.point, shape.rings) <= RES_LIMIT_M)).map(r => r.type).filter((type, i, all) => all.indexOf(type) === i);
  }
  if (row.inEgib) stats.inEgib++;
  if (row.ownership) { stats.ownership++; ownershipValues[row.ownership.description] = (ownershipValues[row.ownership.description] || 0) + 1; }
  if (row.ownership) stats.ownershipGroups[row.ownership.group] = (stats.ownershipGroups[row.ownership.group] || 0) + 1;
  if (CITY_GROUPS.includes(row.ownership?.group)) stats.cityOwned++;
  if (row.monument?.kind === 'register') stats.monumentRegister++;
  if (row.monument?.kind === 'inventory') stats.monumentInventory++;
  if (row.urbanLayout) stats.urbanLayout++;
  if (row.heritageArea) stats.heritageArea++;
  if (row.unesco === 'area') stats.unesco++;
  if (row.unesco === 'buffer') stats.unescoBuffer++;
  if (row.res.length) stats.res++;
  context[roof.id] = row;
}

const egibDates = [...buildings.values()].map(b => b.aktualnosc).filter(Number.isFinite);
const ownershipDates = [...owners.values()].map(o => o?.data_akt).filter(Number.isFinite);
const day = ms => ms ? new Date(ms).toISOString().slice(0, 10) : null;
const output = {
  schemaVersion: 1,
  retrievedAt: new Date().toISOString(),
  sources: Object.values(LAYERS).map(({ name, path, features }) => ({ name, url: REST + path, features: features ?? null })),
  currency: { egib: day(Math.max(...egibDates)), ownership: day(Math.max(...ownershipDates)) },
  method: {
    building: 'Budynek o tym samym identyfikatorze w aktualnej EGiB; brak oznacza zmianę numeracji lub budynek, którego już nie ma.',
    ownership: 'Grupa własności działki zapisanej w identyfikatorze budynku (warstwa Struktura własności). Własność działki nie przesądza o własności ani zarządzie budynku.',
    monument: `Punkt z rejestru zabytków lub gminnej ewidencji zabytków w obrysie dachu albo do ${MONUMENT_LIMIT_M} m od niego.`,
    areas: 'Środek obrysu w granicach układu urbanistycznego w rejestrze zabytków, Pomnika Historii, obszaru UNESCO lub jego strefy buforowej.',
    res: `Wpis w miejskim wykazie instalacji OZE na tej samej działce albo do ${RES_LIMIT_M} m od obrysu. Brak wpisu nie wyklucza istniejącej instalacji.`,
  },
  stats,
  ownershipValues,
  roofs: context,
};
await fs.writeFile(new URL('roof-registers.json', dataDir), JSON.stringify(output) + '\n');
console.log(JSON.stringify({ stats, currency: output.currency, ownershipValues }, null, 2));
