// Explicit, small PV scenario model. No reuse of MONIT-AIR irradiation: that would double-count orientation.
const RAD = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const cache = new WeakMap();

export const PV_ASSUMPTIONS = Object.freeze({
  model: 'krakow-tmy-isotropic-rows-v2', albedo: 0.2, lossFraction: 0.14,
  temperatureCoefficient: -0.004, faimanU0: 25, faimanU1: 6.84,
  snowMonths: [11, 12, 1, 2, 3], rowShadeTargetPercent: 1,
  thermalSource: 'https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.temperature.faiman.html',
  solarSource: 'https://gml.noaa.gov/grad/solcalc/solareqns.PDF',
  rowShadeSource: 'https://doi.org/10.1016/0038-092X(79)90042-6',
  limitation: 'Isotropic diffuse transposition, generic c-Si temperature coefficient and free-standing thermal assumptions; row-to-row shading reduces only the direct beam in proportion to the shaded strip (no bypass-diode mismatch); no obstacle, inverter or snow-physics model.',
});
const SNOW_MONTHS = new Set(PV_ASSUMPTIONS.snowMonths);

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

/** Isotropic-sky POA components; DNI is normal to the sun, DHI/GHI are horizontal. */
export function planeComponents(hour, tilt, azimuth) {
  if (hour.sun.up <= 0) return { beam: 0, total: 0 };
  // Horizontal GHI is retained exactly at tilt=0; reduces component inconsistencies at sunrise/sunset.
  if (tilt === 0) return { beam: hour.dni * hour.sun.up, total: hour.ghi };
  const beta = tilt * RAD, az = azimuth * RAD;
  const incidence = hour.sun.east * Math.sin(beta) * Math.sin(az)
    + hour.sun.north * Math.sin(beta) * Math.cos(az) + hour.sun.up * Math.cos(beta);
  const beam = hour.dni * Math.max(0, incidence);
  return { beam, total: Math.max(0, beam + hour.dhi * (1 + Math.cos(beta)) / 2 + hour.ghi * PV_ASSUMPTIONS.albedo * (1 - Math.cos(beta)) / 2) };
}

export function planeIrradiance(hour, tilt, azimuth) {
  return planeComponents(hour, tilt, azimuth).total;
}

/** Shaded share of a module row behind an identical row (Appelbaum & Bany 1979, 2-D profile angle). */
export function rowShadeFraction(sun, tilt, azimuth, slantM, pitchM) {
  const forward = sun.east * Math.sin(azimuth * RAD) + sun.north * Math.cos(azimuth * RAD);
  if (sun.up <= 0 || tilt <= 0 || forward <= 0) return 0;
  const profile = Math.atan2(sun.up, forward), beta = tilt * RAD;
  return clamp(1 - pitchM * Math.sin(profile) / (slantM * Math.sin(profile + beta)), 0, 1);
}

const isSnowMonth = hour => hour.localMonth == null || SNOW_MONTHS.has(hour.localMonth);
const modulePower = (hour, irradiance, capacityKwp) => {
  const moduleTemperature = hour.temperature + irradiance / (PV_ASSUMPTIONS.faimanU0 + PV_ASSUMPTIONS.faimanU1 * hour.wind);
  const thermal = Math.max(0, 1 + PV_ASSUMPTIONS.temperatureCoefficient * (moduleTemperature - 25));
  return { moduleTemperature, powerW: Math.min(capacityKwp * 1000, Math.max(0, capacityKwp * irradiance * thermal * (1 - PV_ASSUMPTIONS.lossFraction))) };
};

/** settings.rows = { exposure, slantM, pitchM }: share of modules with a row in front, and the row geometry. */
export function hourlyPv(hour, settings, capacityKwp = 1) {
  const snow = isSnowMonth(hour) ? settings.snowPercent : 0;
  const reduction = (1 - settings.shadePercent / 100) * (1 - snow / 100);
  const plane = planeComponents(hour, settings.tilt, settings.azimuth), rows = settings.rows;
  const rowShade = rows ? rowShadeFraction(hour.sun, settings.tilt, settings.azimuth, rows.slantM, rows.pitchM) * rows.exposure : 0;
  const irradiance = (plane.total - plane.beam * rowShade) * reduction;
  const { moduleTemperature, powerW } = modulePower(hour, irradiance, capacityKwp);
  const unshadedW = rowShade ? modulePower(hour, plane.total * reduction, capacityKwp).powerW : powerW;
  return { powerW, unshadedW, irradiance, rowShade, snowApplied: snow > 0, moduleTemperature, temperature: hour.temperature, wind: hour.wind, sun: hour.sun };
}

export function yearForecast(climate, settings, capacityKwp) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, energyKwh: 0, unshadedKwh: 0, temperatureSum: 0, hours: 0 }));
  for (const hour of climate.hours) {
    const month = months[hour.month - 1], pv = hourlyPv(hour, settings, capacityKwp);
    month.energyKwh += pv.powerW / 1000; month.unshadedKwh += pv.unshadedW / 1000;
    month.temperatureSum += hour.temperature; month.hours++;
  }
  const annualEnergyKwh = months.reduce((sum, m) => sum + m.energyKwh, 0), unshaded = months.reduce((sum, m) => sum + m.unshadedKwh, 0);
  return { annualEnergyKwh, rowShadeLossPercent: unshaded > 0 ? 100 * (1 - annualEnergyKwh / unshaded) : 0,
    months: months.map(m => ({ month: m.month, energyKwh: m.energyKwh, meanTemperature: m.temperatureSum / m.hours })) };
}

/** Row geometry for a tilt: projected module depth plus the clear gap between rows. */
export const rowGeometry = (tilt, slantM, gapM, exposure) => ({ exposure, slantM, pitchM: slantM * Math.cos(tilt * RAD) + gapM });

/**
 * Same 1 kWp for every cell: isolates orientation, rather than confusing it with fitted panel count.
 * With `rows`, each cell keeps the current clear gap and share of shaded rows, so steep tilts pay for their longer shadows.
 */
export function orientationComparison(climate, rows = null, { tilts = [0, 15, 30, 45, 60], azimuths = [0, 90, 180, 270] } = {}) {
  const key = `${rows ? `${PV_ASSUMPTIONS.model}|${rows.gapM}|${rows.exposure.toFixed(3)}` : PV_ASSUMPTIONS.model}|${tilts}|${azimuths}`;
  if (climate.orientationCache.has(key)) return climate.orientationCache.get(key);
  const result = [];
  for (const tilt of tilts) for (const azimuth of azimuths) {
    const forecast = yearForecast(climate, { tilt, azimuth, shadePercent: 0, snowPercent: 0,
      rows: rows && rowGeometry(tilt, rows.slantM, rows.gapM, rows.exposure) }, 1);
    result.push({ tilt, azimuth, ...forecast });
  }
  if (climate.orientationCache.size > 64) climate.orientationCache.delete(climate.orientationCache.keys().next().value);
  climate.orientationCache.set(key, result);
  return result;
}

/** Smallest clear gap (0.1 m steps) whose annual row-to-row loss stays within the target, for a field of rows. */
export function recommendedRowGap(climate, tilt, azimuth, slantM, { min = 0.3, max = 6, targetPercent = PV_ASSUMPTIONS.rowShadeTargetPercent } = {}) {
  const loss = gap => yearForecast(climate, { tilt, azimuth, shadePercent: 0, snowPercent: 0, rows: rowGeometry(tilt, slantM, gap, 1) }, 1).rowShadeLossPercent;
  if (loss(min) <= targetPercent) return min;
  if (loss(max) > targetPercent) return max;
  let low = Math.round(min * 10), high = Math.round(max * 10);
  while (high - low > 1) { const mid = (low + high) >> 1; if (loss(mid / 10) <= targetPercent) high = mid; else low = mid; }
  return high / 10;
}
