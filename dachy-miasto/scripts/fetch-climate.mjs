// Download once at development time. The application uses the checked, local snapshot offline.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const url = 'https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=50.0614&lon=19.9366&outputformat=json&usehorizon=1';
const fromAt = process.argv.indexOf('--from');
let text;
if (fromAt >= 0) text = await fs.readFile(process.argv[fromAt + 1], 'utf8');
else {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`PVGIS HTTP ${response.status}`);
  text = await response.text();
}
const raw = JSON.parse(text);
const columns = ['time(UTC)', 'G(h)', 'Gb(n)', 'Gd(h)', 'T2m', 'WS10m'];
const hours = raw.outputs?.tmy_hourly?.map(row => columns.map(key => row[key]));
if (hours?.length !== 8760 || new Set(hours.map(r => r[0])).size !== 8760
  || hours.some(r => !/^\d{8}:\d{4}$/.test(r[0]) || r.slice(1).some(v => !Number.isFinite(v))
    || r.slice(1, 4).some(v => v < 0) || r[5] < 0)) throw new Error('Incomplete or invalid TMY snapshot.');
const output = {
  schemaVersion: 1, kind: 'typical-meteorological-year', retrievedAt: new Date().toISOString(),
  source: { name: 'European Commission JRC · PVGIS 5.3 TMY', url,
    documentation: 'https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en',
    rawResponseSha256: createHash('sha256').update(text).digest('hex') },
  location: raw.inputs.location, meteo: raw.inputs.meteo_data,
  selectedMonths: raw.outputs.months_selected,
  columns, units: ['UTC YYYYMMDD:HHmm', 'W/m²', 'W/m²', 'W/m²', '°C', 'm/s'],
  limitations: 'A synthetic typical year assembled from different historical months, not a weather forecast, a measured roof or a simulation of neighbouring buildings. Irradiance time offset is preserved in location metadata.',
  hours,
};
await fs.writeFile(new URL('../data/krakow-climate.json', import.meta.url), JSON.stringify(output) + '\n');
console.log(JSON.stringify({ hours: hours.length, location: output.location, meteo: output.meteo, source: output.source }, null, 2));
