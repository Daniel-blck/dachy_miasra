import { evaluateRoof, validateParameters } from './model.js';
import { prepareClimate, representativeDay, hourlyPv, yearForecast, orientationComparison, PV_ASSUMPTIONS } from './climate.js';
import { projectRoof, layoutPanels, LAYOUT_ASSUMPTIONS } from './layout.js';

export const DAY_SECONDS = 86400;
export const SIMULATION_START_SECONDS = 12 * 3600;
export const SIMULATION_SCENARIOS = Object.freeze(['typical', 'sunny', 'cloudy']);
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function simulationClock(seconds) {
  const minutes = Math.floor(Math.min(DAY_SECONDS, Math.max(0, seconds)) / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function energyUntil(sim, seconds) {
  return sim.profile.reduce((wh, row) => wh + row.powerW * Math.min(1, Math.max(0, seconds / 3600 - row.hour)), 0);
}

function rebuild(sim, layoutChanged = true) {
  if (layoutChanged) {
    sim.layout = layoutPanels(sim.roofPlane, sim, sim.requestedPanelCount);
    sim.capacityKwp = sim.layout.panels.length * sim.modulePowerW / 1000;
    sim.forecast = yearForecast(sim.climate, sim, sim.capacityKwp);
  }
  sim.day = representativeDay(sim.climate, sim.month, sim.scenario);
  sim.profile = sim.day.rows.map(row => ({ ...hourlyPv(row, sim, sim.capacityKwp), hour: row.localHour, sourceTime: row.time }));
  sim.dayEnergyKwh = sim.profile.reduce((sum, h) => sum + h.powerW / 1000, 0);
  sim.running = false;
  sim.energyWh = energyUntil(sim, sim.timeSeconds);
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
    timeSeconds: SIMULATION_START_SECONDS, running: false, speed: 600, energyWh: 0,
    comparisons: orientationComparison(prepared),
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

export function configureSimulation(sim, changes) {
  const ranges = { month: [1, 12], tilt: [0, 60], azimuth: [0, 359], shadePercent: [0, 100], snowPercent: [0, 100],
    rowGapM: [0.3, 3], setbackM: [0.3, 3], viewYaw: [-180, 180], viewPitch: [15, 80], speed: [60, 3600], timeSeconds: [0, DAY_SECONDS] };
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'scenario') { if (!SIMULATION_SCENARIOS.includes(value)) throw new RangeError('Invalid weather scenario.'); }
    else if (key === 'comparisonPeriod') { if (!['month', 'annual'].includes(value)) throw new RangeError('Invalid comparison period.'); }
    else if (!ranges[key] || !finite(value, ...ranges[key]) || key === 'month' && !Number.isInteger(value)) throw new RangeError('Invalid simulation setting: ' + key);
  }
  const changed = Object.keys(changes).filter(key => changes[key] !== sim[key]);
  Object.assign(sim, changes);
  if (changed.some(k => ['month', 'scenario', 'tilt', 'azimuth', 'shadePercent', 'snowPercent', 'rowGapM', 'setbackM'].includes(k))) {
    rebuild(sim, changed.some(k => !['month', 'scenario'].includes(k)));
  }
  sim.energyWh = energyUntil(sim, sim.timeSeconds);
  return sim;
}

export function resetSimulation(sim) { sim.running = false; sim.timeSeconds = 0; sim.energyWh = 0; }

export function simulationArchive(sim) {
  return {
    schemaVersion: 2, mode: 'simulation', model: sim.model,
    label: 'OPEN-DATA SCENARIO — schematic flat roof, not installed hardware, weather forecast or engineering design.',
    roof: structuredClone(sim.roof), parameters: { ...sim.parameters }, climate: structuredClone(sim.climateMetadata), pvAssumptions: PV_ASSUMPTIONS,
    settings: Object.fromEntries(['month', 'scenario', 'tilt', 'azimuth', 'shadePercent', 'snowPercent', 'rowGapM', 'setbackM'].map(k => [k, sim[k]])),
    representativeDay: { date: sim.day.date, clearness: sim.day.clearness, timeZone: 'Europe/Warsaw' },
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
    [pl ? 'Wizualizacja płaskiego dachu, nie projekt budowlany' : 'Эскиз плоской крыши, не строительный проект'], [],
    pl ? ['Godzina Europe/Warsaw', 'Moc W', 'Energia godziny kWh', 'Promieniowanie W/m2', 'Temperatura powietrza C', 'Temperatura modułu C', 'Wiatr m/s']
      : ['Час Europe/Warsaw', 'Мощность, Вт', 'Энергия часа, кВт·ч', 'Излучение, Вт/м2', 'Температура воздуха, C', 'Температура модуля, C', 'Ветер, м/с'],
    ...sim.profile.map(r => [r.hour, r.powerW, r.powerW / 1000, r.irradiance, r.temperature, r.moduleTemperature, r.wind])];
  return '\uFEFF' + rows.map(row => row.map(quote).join(';')).join('\r\n');
}
