import { evaluateRoof, validateParameters } from './model.js';
import { prepareClimate, representativeDay, hourlyPv, yearForecast, orientationComparison, recommendedRowGap, rowGeometry, PV_ASSUMPTIONS } from './climate.js';
import { projectRoof, layoutPanels, LAYOUT_ASSUMPTIONS } from './layout.js';

export const DAY_SECONDS = 86400;
export const SIMULATION_START_SECONDS = 12 * 3600;
export const SIMULATION_SCENARIOS = Object.freeze(['typical', 'sunny', 'cloudy']);
export const ROW_GAP_RANGE = Object.freeze([0.3, 6]);
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function simulationClock(seconds) {
  const minutes = Math.floor(Math.min(DAY_SECONDS, Math.max(0, seconds)) / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function energyUntil(sim, seconds) {
  return sim.profile.reduce((wh, row) => wh + row.powerW * Math.min(1, Math.max(0, seconds / 3600 - row.hour)), 0);
}

/** First and last daylight hour of the representative day, in seconds after local midnight. */
export function daylight(sim) {
  const lit = sim.profile.filter(r => r.sun.up > 0);
  return lit.length ? { sunrise: lit[0].hour * 3600, sunset: (lit.at(-1).hour + 1) * 3600 } : { sunrise: 0, sunset: DAY_SECONDS };
}

const GEOMETRY_KEYS = ['tilt', 'azimuth', 'rowGapM', 'setbackM'], LOSS_KEYS = ['shadePercent', 'snowPercent'], DAY_KEYS = ['month', 'scenario'];

// The orientation table: a standard grid plus the current tilt and direction, so the chosen variant always has a cell.
const withCurrent = (values, current) => [...new Set([...values, current])].sort((a, b) => a - b);
const compare = sim => {
  sim.comparisons = orientationComparison(sim.climate, { gapM: sim.rowGapM, slantM: LAYOUT_ASSUMPTIONS.panelLengthM, exposure: sim.layout.rowExposure },
    { tilts: withCurrent([0, 15, 30, 45, 60], sim.tilt), azimuths: withCurrent([0, 90, 180, 270], sim.azimuth) });
  sim.comparisonsStale = false;
};

/** `preview` (a slider still moving) defers the 20-orientation table until the value is released. */
function rebuild(sim, { layout = true, forecast = layout, preview = false } = {}) {
  if (layout) {
    sim.layout = layoutPanels(sim.roofPlane, sim, sim.requestedPanelCount);
    sim.capacityKwp = sim.layout.panels.length * sim.modulePowerW / 1000;
    sim.rows = rowGeometry(sim.tilt, LAYOUT_ASSUMPTIONS.panelLengthM, sim.rowGapM, sim.layout.rowExposure);
    if (preview) sim.comparisonsStale = true; else compare(sim);
  }
  if (!preview && sim.comparisonsStale) compare(sim);
  if (forecast) sim.forecast = yearForecast(sim.climate, sim, sim.capacityKwp);
  sim.day = representativeDay(sim.climate, sim.month, sim.scenario);
  sim.profile = sim.day.rows.map(row => ({ ...hourlyPv(row, sim, sim.capacityKwp), hour: row.localHour, sourceTime: row.time }));
  sim.dayEnergyKwh = sim.profile.reduce((sum, h) => sum + h.powerW / 1000, 0);
  sim.energyWh = energyUntil(sim, sim.timeSeconds);
}

/**
 * Most annual energy on this outline: coarse grid over tilt and row gap facing south, then the neighbouring
 * directions and a local refinement. Each probe lays the modules out again, so fewer fitted modules and row
 * shadows both count. A generator, so the UI can run it in slices; yields progress 0–1, returns the best probe.
 */
// A found optimum stays valid only for the losses, setback and module count it was searched with.
const optimumKey = sim => `${sim.shadePercent}|${sim.snowPercent}|${sim.setbackM}|${sim.requestedPanelCount}`;
export const currentOptimum = sim => sim.optimum?.key === optimumKey(sim) ? sim.optimum : null;

export function* searchBestConfiguration(sim) {
  const probe = { ...sim, running: false }, tried = new Map(), key = optimumKey(sim);
  const clampGap = gap => Math.round(Math.min(ROW_GAP_RANGE[1], Math.max(ROW_GAP_RANGE[0], gap)) * 10) / 10;
  const evaluate = (tilt, azimuth, rowGapM) => {
    const key = `${tilt}|${azimuth}|${rowGapM}`;
    if (!tried.has(key)) {
      configureSimulation(probe, { tilt, azimuth, rowGapM }, { preview: true });
      tried.set(key, { tilt, azimuth, rowGapM, annualEnergyKwh: probe.forecast.annualEnergyKwh, fittedPanelCount: probe.layout.panels.length });
    }
    return tried.get(key);
  };
  const better = (a, b) => !b || a.annualEnergyKwh > b.annualEnergyKwh + 1e-6;
  const gaps = [0.3, 0.6, 1, 1.5, 2.2, 3, 4.5, 6], tilts = [0, 10, 20, 30, 40, 50, 60];
  const steps = tilts.length * gaps.length + 2 * 3 + 2 * 3 + 4;
  let best = evaluate(sim.tilt, sim.azimuth, sim.rowGapM), done = 0;
  const visit = (tilt, azimuth, gap) => { const r = evaluate(tilt, azimuth, gap); if (better(r, best)) best = r; return ++done / steps; };
  for (const tilt of tilts) for (const gap of gaps) yield visit(tilt, 180, gap);
  for (const azimuth of [135, 225]) for (const gap of [-0.3, 0, 0.3].map(d => clampGap(best.rowGapM + d))) yield visit(best.tilt, azimuth, gap);
  const { azimuth } = best;
  for (const tilt of [best.tilt - 5, best.tilt + 5].filter(x => x >= 0 && x <= 60)) for (const gap of [-0.3, 0, 0.3].map(d => clampGap(best.rowGapM + d))) yield visit(tilt, azimuth, gap);
  for (const d of [-0.2, -0.1, 0.1, 0.2]) yield visit(best.tilt, best.azimuth, clampGap(best.rowGapM + d));
  return { ...best, probes: tried.size, key };
}

export function bestConfiguration(sim) {
  const search = searchBestConfiguration(sim);
  let step;
  do step = search.next(); while (!step.done);
  return step.value;
}

/** Clear row gap at which a field of rows loses at most ~1% of the year to its own shadows. */
export function suggestedRowGap(sim) {
  const key = `${sim.tilt}|${sim.azimuth}`;
  if (sim.suggestedGap?.key !== key) sim.suggestedGap = { key, gapM: recommendedRowGap(sim.climate, sim.tilt, sim.azimuth, LAYOUT_ASSUMPTIONS.panelLengthM, { min: ROW_GAP_RANGE[0], max: ROW_GAP_RANGE[1] }) };
  return sim.suggestedGap.gapM;
}

export function createRoofSimulation(roof, parameters, location, { climate, geometry } = {}) {
  validateParameters(parameters);
  const evaluated = evaluateRoof(roof, parameters);
  if (!finite(evaluated.capacityKwp, Number.MIN_VALUE, 1e6)) throw new RangeError('Invalid simulation roof.');
  const prepared = prepareClimate(climate), roofPlane = projectRoof(geometry);
  const modulePowerW = LAYOUT_ASSUMPTIONS.panelLengthM * LAYOUT_ASSUMPTIONS.panelWidthM * parameters.efficiency * 1000;
  const sim = {
    schemaVersion: 2, mode: 'simulation', model: PV_ASSUMPTIONS.model,
    roof: { id: roof.id, name: roof.address || roof.id, usableAreaM2: roof.usableAreaM2,
      capacityKwp: evaluated.capacityKwp, annualEnergyKwh: evaluated.annualEnergyKwh,
      location: location ? { lat: location.lat, lon: location.lon } : { lat: roofPlane.origin[1], lon: roofPlane.origin[0] } },
    parameters: { ...parameters }, climate: prepared, climateMetadata: { source: climate.source, location: climate.location,
      meteo: climate.meteo, selectedMonths: climate.selectedMonths, retrievedAt: climate.retrievedAt }, roofPlane,
    requestedPanelCount: Math.floor(evaluated.panelAreaM2 / 2 + 1e-7), modulePowerW,
    month: 7, scenario: 'typical', tilt: 30, azimuth: 180, shadePercent: 0, snowPercent: 0,
    rowGapM: 0.8, setbackM: 0.5, viewYaw: 25, viewPitch: 35,
    timeSeconds: SIMULATION_START_SECONDS, running: false, speed: 600, energyWh: 0, comparisonPeriod: 'annual',
  };
  rebuild(sim);
  return sim;
}

export function simulationSnapshot(sim) {
  const now = sim.profile[Math.min(23, Math.floor(sim.timeSeconds / 3600))];
  return { ...now, powerW: sim.timeSeconds >= DAY_SECONDS ? 0 : now.powerW,
    secondOfDay: sim.timeSeconds, energyWh: energyUntil(sim, sim.timeSeconds), panelCount: sim.layout.panels.length,
    capacityKwp: sim.capacityKwp, dayEnergyKwh: sim.dayEnergyKwh };
}

export function advanceSimulation(sim, seconds) {
  if (!finite(seconds, 0, Number.MAX_VALUE)) throw new RangeError('Invalid elapsed simulation time.');
  if (!sim.running) return sim;
  sim.timeSeconds = Math.min(DAY_SECONDS, sim.timeSeconds + seconds);
  sim.energyWh = energyUntil(sim, sim.timeSeconds);
  if (sim.timeSeconds >= DAY_SECONDS) sim.running = false;
  return sim;
}

export function configureSimulation(sim, changes, { preview = false } = {}) {
  const ranges = { month: [1, 12], tilt: [0, 60], azimuth: [0, 359], shadePercent: [0, 100], snowPercent: [0, 100],
    rowGapM: ROW_GAP_RANGE, setbackM: [0.3, 3], viewYaw: [-180, 180], viewPitch: [15, 80], speed: [60, 3600], timeSeconds: [0, DAY_SECONDS] };
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'scenario') { if (!SIMULATION_SCENARIOS.includes(value)) throw new RangeError('Invalid weather scenario.'); }
    else if (key === 'comparisonPeriod') { if (!['month', 'annual'].includes(value)) throw new RangeError('Invalid comparison period.'); }
    else if (!ranges[key] || !finite(value, ...ranges[key]) || key === 'month' && !Number.isInteger(value)) throw new RangeError('Invalid simulation setting: ' + key);
  }
  const changed = Object.keys(changes).filter(key => changes[key] !== sim[key]);
  Object.assign(sim, changes);
  const touches = keys => changed.some(k => keys.includes(k));
  if (touches([...GEOMETRY_KEYS, ...LOSS_KEYS, ...DAY_KEYS])) rebuild(sim, { layout: touches(GEOMETRY_KEYS), forecast: touches([...GEOMETRY_KEYS, ...LOSS_KEYS]), preview });
  else if (!preview && sim.comparisonsStale) compare(sim);
  sim.energyWh = energyUntil(sim, sim.timeSeconds);
  return sim;
}

export function resetSimulation(sim) { sim.running = false; sim.timeSeconds = 0; sim.energyWh = 0; }

/** Start playback; a finished or still-dark day restarts shortly before sunrise instead of replaying the night. */
export function playSimulation(sim) {
  const { sunrise } = daylight(sim);
  if (sim.timeSeconds >= DAY_SECONDS || sim.timeSeconds < sunrise - 3600) sim.timeSeconds = Math.max(0, sunrise - 3600);
  sim.energyWh = energyUntil(sim, sim.timeSeconds);
  sim.running = true;
  return sim;
}

export function simulationArchive(sim) {
  return {
    schemaVersion: 2, mode: 'simulation', model: sim.model,
    label: 'OPEN-DATA SCENARIO — schematic flat roof, not installed hardware, weather forecast or engineering design.',
    roof: structuredClone(sim.roof), parameters: { ...sim.parameters }, climate: structuredClone(sim.climateMetadata), pvAssumptions: PV_ASSUMPTIONS,
    settings: Object.fromEntries(['month', 'scenario', 'tilt', 'azimuth', 'shadePercent', 'snowPercent', 'rowGapM', 'setbackM'].map(k => [k, sim[k]])),
    representativeDay: { date: sim.day.date, clearness: sim.day.clearness, timeZone: 'Europe/Warsaw' },
    rowShading: { rowCount: sim.layout.rowCount, shareOfModulesBehindARow: sim.layout.rowExposure, pitchM: sim.rows.pitchM,
      annualLossPercent: sim.forecast.rowShadeLossPercent, snowMonths: PV_ASSUMPTIONS.snowMonths },
    layout: { assumptions: sim.layout.assumptions, requestedPanelCount: sim.requestedPanelCount,
      fittedPanelCount: sim.layout.panels.length, capacityKwp: sim.capacityKwp, modulePowerW: sim.modulePowerW,
      panelAreaM2: sim.layout.panelAreaM2, panelsInLocalMetres: sim.layout.panels.map(p => p.vertices), originLonLat: sim.roofPlane.origin },
    forecast: sim.forecast, representativeDayEnergyKwh: sim.dayEnergyKwh,
    hourlyDayProfile: sim.profile.map(({ sun, ...row }) => ({ ...row, sunElevation: sun.elevation, sunAzimuth: sun.azimuth })),
  };
}

export function simulationCsv(sim, language = 'ru') {
  const pl = language === 'pl', quote = v => `"${String(v ?? '').replace(/^[=+@\-\t\r\n]/, "'$&").replaceAll('"', '""')}"`;
  const rows = [['SIMULATION', sim.model], [pl ? 'Źródło klimatu' : 'Источник климата', sim.climateMetadata.source.url],
    ['TMY', `${sim.climateMetadata.meteo.year_min}–${sim.climateMetadata.meteo.year_max}`],
    ['ID', sim.roof.id], [pl ? 'Dzień reprezentatywny' : 'Репрезентативный день', sim.day.date],
    [pl ? 'Nachylenie stopnie' : 'Наклон, градусы', sim.tilt], [pl ? 'Azymut od północy' : 'Азимут от севера', sim.azimuth],
    [pl ? 'Liczba modułów' : 'Количество модулей', sim.layout.panels.length], ['kWp', sim.capacityKwp],
    [pl ? 'Energia roku TMY kWh' : 'Энергия типичного года, кВт·ч', sim.forecast.annualEnergyKwh],
    [pl ? 'Prześwit między rzędami m' : 'Просвет между рядами, м', sim.rowGapM],
    [pl ? 'Strata roczna od cienia rzędów %' : 'Годовые потери от тени рядов, %', sim.forecast.rowShadeLossPercent],
    [pl ? 'Wizualizacja płaskiego dachu, nie projekt budowlany' : 'Эскиз плоской крыши, не строительный проект'], [],
    pl ? ['Godzina Europe/Warsaw', 'Moc W', 'Energia godziny kWh', 'Promieniowanie W/m2', 'Temperatura powietrza C', 'Temperatura modułu C', 'Wiatr m/s']
      : ['Час Europe/Warsaw', 'Мощность, Вт', 'Энергия часа, кВт·ч', 'Излучение, Вт/м2', 'Температура воздуха, C', 'Температура модуля, C', 'Ветер, м/с'],
    ...sim.profile.map(r => [r.hour, r.powerW, r.powerW / 1000, r.irradiance, r.temperature, r.moduleTemperature, r.wind])];
  return '\uFEFF' + rows.map(row => row.map(quote).join(';')).join('\r\n');
}
