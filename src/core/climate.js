// Explicit, small PV scenario model. No reuse of MONIT-AIR irradiation: that would double-count orientation.
const RAD = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const cache = new WeakMap();

export const PV_ASSUMPTIONS = Object.freeze({
  model: 'krakow-tmy-isotropic-v1', albedo: 0.2, lossFraction: 0.14,
  temperatureCoefficient: -0.004, faimanU0: 25, faimanU1: 6.84,
  thermalSource: 'https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.temperature.faiman.html',
  solarSource: 'https://gml.noaa.gov/grad/solcalc/solareqns.PDF',
  limitation: 'Isotropic diffuse transposition, generic c-Si temperature coefficient and free-standing thermal assumptions; no obstacle, row-shadow, inverter or snow-physics model.',
});

/** NOAA fractional-year approximation; azimuth is clockwise from north. UTC input prevents browser-timezone drift. */
export function solarPosition(timestamp, latitude, longitude) {
  const date = new Date(timestamp), year = date.getUTCFullYear();
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const day = (timestamp - Date.UTC(year, 0, 1)) / 86400000;
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const gamma = 2 * Math.PI / days * (Math.floor(day) + (hour - 12) / 24);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const dec = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const ha = (hour * 60 + eq + 4 * longitude) / 4 * RAD - Math.PI;
  const lat = latitude * RAD;
  const east = -Math.cos(dec) * Math.sin(ha);
  const north = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(ha);
  const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  return { east, north, up, elevation: Math.asin(clamp(up, -1, 1)) / RAD,
    azimuth: (Math.atan2(east, north) / RAD + 360) % 360 };
}

export function prepareClimate(data) {
  if (cache.has(data)) return cache.get(data);
  if (data?.schemaVersion !== 1 || data.kind !== 'typical-meteorological-year' || data.hours?.length !== 8760) throw new Error('Climate snapshot unavailable.');
  if (data.columns.join('|') !== 'time(UTC)|G(h)|Gb(n)|Gd(h)|T2m|WS10m') throw new Error('Unknown climate columns.');
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const groups = new Map(), offset = data.location.irradiance_time_offset ?? 0;
  const hours = data.hours.map(row => {
    const [time, ghi, dni, dhi, temperature, wind] = row;
    if (!/^\d{8}:\d{4}$/.test(time) || row.slice(1).some(v => !Number.isFinite(v)) || Math.min(ghi, dni, dhi, wind) < 0) throw new Error('Invalid climate reading.');
    const timestamp = Date.UTC(+time.slice(0, 4), +time.slice(4, 6) - 1, +time.slice(6, 8), +time.slice(9, 11), +time.slice(11, 13));
    const parts = Object.fromEntries(formatter.formatToParts(timestamp).map(p => [p.type, p.value]));
    const sun = solarPosition(timestamp + offset * 3600000, data.location.latitude, data.location.longitude);
    const item = { time, timestamp, month: +time.slice(4, 6), localMonth: +parts.month, localDay: +parts.day,
      localHour: +parts.hour, localYear: +parts.year, ghi, dni, dhi, temperature, wind, sun };
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
    return item;
  });
  if (new Set(hours.map(h => h.time)).size !== 8760) throw new Error('Duplicate climate readings.');
  const days = [...groups.entries()].filter(([, rows]) => rows.length === 24 && new Set(rows.map(r => r.localHour)).size === 24)
    .map(([date, rows]) => {
      const ghi = rows.reduce((sum, h) => sum + h.ghi, 0);
      // Daily clearness ranking normalises for day length; no claim of measured cloud fraction.
      const clear = rows.reduce((sum, h) => sum + (h.sun.up > 0 ? 1098 * h.sun.up * Math.exp(-0.059 / h.sun.up) : 0), 0);
      return { date, month: rows[0].localMonth, day: rows[0].localDay, year: rows[0].localYear,
        rows: rows.toSorted((a, b) => a.localHour - b.localHour), clearness: ghi / Math.max(1, clear) };
    });
  const result = { hours, days, source: data.source, location: data.location, meteo: data.meteo, orientationCache: new Map() };
  cache.set(data, result);
  return result;
}

export function representativeDay(climate, month, weather) {
  const percentile = { cloudy: 0.1, typical: 0.5, sunny: 0.9 }[weather];
  if (!Number.isInteger(month) || month < 1 || month > 12 || percentile == null) throw new RangeError('Invalid climate scenario.');
  const days = climate.days.filter(d => d.month === month).toSorted((a, b) => a.clearness - b.clearness || a.date.localeCompare(b.date));
  if (!days.length) throw new Error('No complete day in this climate month.');
  return days[Math.round((days.length - 1) * percentile)];
}

/** Isotropic-sky POA model; DNI is normal to the sun, DHI/GHI are horizontal. */
export function planeIrradiance(hour, tilt, azimuth) {
  if (hour.sun.up <= 0) return 0;
  const beta = tilt * RAD, az = azimuth * RAD;
  const incidence = hour.sun.east * Math.sin(beta) * Math.sin(az)
    + hour.sun.north * Math.sin(beta) * Math.cos(az) + hour.sun.up * Math.cos(beta);
  // Horizontal GHI is retained exactly at tilt=0; reduces component inconsistencies at sunrise/sunset.
  if (tilt === 0) return hour.ghi;
  return Math.max(0, hour.dni * Math.max(0, incidence)
    + hour.dhi * (1 + Math.cos(beta)) / 2 + hour.ghi * PV_ASSUMPTIONS.albedo * (1 - Math.cos(beta)) / 2);
}

export function hourlyPv(hour, settings, capacityKwp = 1) {
  const reduction = (1 - settings.shadePercent / 100) * (1 - settings.snowPercent / 100);
  const irradiance = planeIrradiance(hour, settings.tilt, settings.azimuth) * reduction;
  const moduleTemperature = hour.temperature + irradiance / (PV_ASSUMPTIONS.faimanU0 + PV_ASSUMPTIONS.faimanU1 * hour.wind);
  const thermal = Math.max(0, 1 + PV_ASSUMPTIONS.temperatureCoefficient * (moduleTemperature - 25));
  const powerW = Math.min(capacityKwp * 1000, Math.max(0, capacityKwp * irradiance * thermal * (1 - PV_ASSUMPTIONS.lossFraction)));
  return { powerW, irradiance, moduleTemperature, temperature: hour.temperature, wind: hour.wind, sun: hour.sun };
}

export function yearForecast(climate, settings, capacityKwp) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, energyKwh: 0, temperatureSum: 0, hours: 0 }));
  for (const hour of climate.hours) {
    const month = months[hour.month - 1];
    month.energyKwh += hourlyPv(hour, settings, capacityKwp).powerW / 1000;
    month.temperatureSum += hour.temperature; month.hours++;
  }
  return { annualEnergyKwh: months.reduce((sum, m) => sum + m.energyKwh, 0),
    months: months.map(m => ({ month: m.month, energyKwh: m.energyKwh, meanTemperature: m.temperatureSum / m.hours })) };
}

/** Same 1 kWp for every cell: isolates orientation, rather than confusing it with fitted panel count. */
export function orientationComparison(climate) {
  const key = PV_ASSUMPTIONS.model;
  if (climate.orientationCache.has(key)) return climate.orientationCache.get(key);
  const rows = [];
  for (const tilt of [0, 15, 30, 45, 60]) for (const azimuth of [0, 90, 180, 270]) {
    const forecast = yearForecast(climate, { tilt, azimuth, shadePercent: 0, snowPercent: 0 }, 1);
    rows.push({ tilt, azimuth, ...forecast });
  }
  climate.orientationCache.set(key, rows);
  return rows;
}
