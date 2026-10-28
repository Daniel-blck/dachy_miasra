// Reference yield for Kraków from PVGIS (European Commission JRC), used to calibrate the roof model.
// PVGIS models terrain horizon but not neighbouring buildings, so it is an unshaded upper reference.
// Usage: node scripts/fetch-pvgis.mjs   (network access to re.jrc.ec.europa.eu is required)
import fs from 'node:fs/promises';

const API = 'https://re.jrc.ec.europa.eu/api/v5_2/PVcalc';
const LOCATION = { latitude: 50.0614, longitude: 19.9366, name: 'Kraków, Rynek Główny' };
const LOSS = 14; // PVGIS default system loss, %
const CASES = [
  { key: 'horizontal', slope: 0, aspect: 0 },
  { key: 'flat10', slope: 10, aspect: 0 },
  { key: 'eastWest10', slope: 10, aspects: [-90, 90] },
  { key: 'optimal', optimal: true },
];

async function pvcalc(params) {
  const url = `${API}?${new URLSearchParams({ lat: LOCATION.latitude, lon: LOCATION.longitude, peakpower: 1, loss: LOSS, outputformat: 'json', ...params })}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`PVGIS HTTP ${response.status}`);
  const data = await response.json();
  const totals = data.outputs.totals.fixed;
  const mounting = data.inputs.mounting_system.fixed;
  return { url, energyKwhPerKwp: totals.E_y, irradiationKwhPerM2: totals['H(i)_y'], slope: mounting.slope.value, aspect: mounting.azimuth.value, meta: data.inputs.meteo_data, elevation: data.inputs.location.elevation };
}

const cases = [];
let meta, elevation;
for (const c of CASES) {
  const runs = c.optimal ? [await pvcalc({ optimalangles: 1 })] : await Promise.all((c.aspects || [c.aspect]).map(aspect => pvcalc({ angle: c.slope, aspect })));
  ({ meta, elevation } = runs[0]);
  const mean = key => runs.reduce((sum, r) => sum + r[key], 0) / runs.length;
  cases.push({ key: c.key, slope: runs[0].slope, aspect: c.aspects ? c.aspects : runs[0].aspect, energyKwhPerKwp: Math.round(mean('energyKwhPerKwp') * 10) / 10, irradiationKwhPerM2: Math.round(mean('irradiationKwhPerM2') * 10) / 10, urls: runs.map(r => r.url) });
}
const output = {
  schemaVersion: 1,
  retrievedAt: new Date().toISOString(),
  source: { name: 'PVGIS 5.2 · European Commission JRC', url: 'https://re.jrc.ec.europa.eu/pvg_tools/en/', api: API },
  location: { ...LOCATION, elevation },
  assumptions: { technology: 'c-Si', systemLossPercent: LOSS, radiationDatabase: meta.radiation_db, years: `${meta.year_min}–${meta.year_max}`, horizon: 'terrain only (no buildings)' },
  cases,
};
await fs.writeFile(new URL('../data/pvgis-reference.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.table(cases.map(({ urls, ...c }) => c));
