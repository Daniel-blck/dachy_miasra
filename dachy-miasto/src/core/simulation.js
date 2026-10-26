import { evaluateRoof, validateParameters } from './model.js';

export const DAY_SECONDS = 86400;
export const SIMULATION_START_SECONDS = 6 * 3600;
export const SIMULATION_SCENARIOS = Object.freeze({ clear: 1, cloudy: 0.45, shade: 0.15, stopped: 0 });
const SUNRISE = 6 * 3600, SUNSET = 18 * 3600;
const daylight = SUNSET - SUNRISE;
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function simulationClock(seconds) {
  const minutes = Math.floor(Math.min(DAY_SECONDS, Math.max(0, seconds)) / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function createRoofSimulation(roof, parameters, location = null) {
  validateParameters(parameters);
  const evaluated = evaluateRoof(roof, parameters);
  if (typeof roof.id !== 'string' || !finite(evaluated.capacityKwp, Number.MIN_VALUE, 1e6) || !finite(evaluated.annualEnergyKwh, 0, 1e12)) throw new RangeError('Invalid simulation roof.');
  const targetDailyWh = evaluated.annualEnergyKwh * 1000 / 365;
  // Illustrative 06:00–18:00 sine curve: no measured weather or panel layout.
  const peakPowerW = Math.min(evaluated.capacityKwp * 1000, targetDailyWh / (2 * daylight / Math.PI / 3600));
  const sim = {
    schemaVersion: 1, mode: 'simulation', model: 'illustrative-day-v1',
    roof: { id: roof.id, usableAreaM2: roof.usableAreaM2, capacityKwp: evaluated.capacityKwp, annualEnergyKwh: evaluated.annualEnergyKwh,
      location: location && finite(location.lat, -90, 90) && finite(location.lon, -180, 180) ? { lat: location.lat, lon: location.lon } : null },
    parameters: { ...parameters }, peakPowerW,
    baselineDailyKwh: peakPowerW * (2 * daylight / Math.PI / 3600) / 1000,
    timeSeconds: SIMULATION_START_SECONDS, running: false,
    scenario: 'clear', speed: 600, selfConsumptionFraction: 0.6,
    buyRatePln: 1, sellRatePln: 0.3,
    energyWh: 0, selfConsumedWh: 0, exportWh: 0, samples: [],
  };
  sim.samples.push(simulationSnapshot(sim));
  return sim;
}

export function baselinePowerW(sim, seconds) {
  if (seconds <= SUNRISE || seconds >= SUNSET) return 0;
  return sim.peakPowerW * Math.sin(Math.PI * (seconds - SUNRISE) / daylight);
}

function baselineEnergyWh(sim, from, to) {
  const a = Math.max(SUNRISE, Math.min(SUNSET, from)), b = Math.max(SUNRISE, Math.min(SUNSET, to));
  if (b <= a) return 0;
  return sim.peakPowerW * daylight / Math.PI / 3600
    * (Math.cos(Math.PI * (a - SUNRISE) / daylight) - Math.cos(Math.PI * (b - SUNRISE) / daylight));
}

export function simulationSnapshot(sim) {
  const base = baselinePowerW(sim, sim.timeSeconds), powerW = base * SIMULATION_SCENARIOS[sim.scenario];
  return {
    secondOfDay: sim.timeSeconds, baselinePowerW: base, powerW,
    selfConsumedPowerW: powerW * sim.selfConsumptionFraction,
    exportPowerW: powerW * (1 - sim.selfConsumptionFraction),
    energyWh: sim.energyWh, selfConsumedWh: sim.selfConsumedWh, exportWh: sim.exportWh,
    scenario: sim.scenario, selfConsumptionFraction: sim.selfConsumptionFraction,
  };
}

/** Advance only the virtual clock; integrate piecewise scenarios without rewriting the past. */
export function advanceSimulation(sim, seconds) {
  if (!finite(seconds, 0, Number.MAX_VALUE)) throw new RangeError('Invalid elapsed simulation time.');
  if (!sim.running || seconds === 0) return sim;
  const end = Math.min(DAY_SECONDS, sim.timeSeconds + seconds);
  while (sim.timeSeconds < end) {
    const next = Math.min(end, sim.timeSeconds + 60);
    const wh = baselineEnergyWh(sim, sim.timeSeconds, next) * SIMULATION_SCENARIOS[sim.scenario];
    sim.energyWh += wh;
    sim.selfConsumedWh += wh * sim.selfConsumptionFraction;
    sim.exportWh += wh * (1 - sim.selfConsumptionFraction);
    sim.timeSeconds = next;
    sim.samples.push(simulationSnapshot(sim));
  }
  if (sim.timeSeconds === DAY_SECONDS) sim.running = false;
  return sim;
}

export function configureSimulation(sim, changes) {
  const ranges = { speed: [1, 3600], selfConsumptionFraction: [0, 1], buyRatePln: [0, 100], sellRatePln: [0, 100] };
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'scenario') {
      if (!Object.hasOwn(SIMULATION_SCENARIOS, value)) throw new RangeError('Invalid simulation scenario.');
    } else if (!ranges[key] || !finite(value, ...ranges[key])) throw new RangeError('Invalid simulation parameter.');
  }
  const boundary = Object.entries(changes).some(([key, value]) => ['scenario', 'selfConsumptionFraction'].includes(key) && sim[key] !== value);
  Object.assign(sim, changes);
  if (boundary) sim.samples.push(simulationSnapshot(sim));
  return sim;
}

export function resetSimulation(sim) {
  sim.timeSeconds = SIMULATION_START_SECONDS; sim.running = false;
  sim.energyWh = 0; sim.selfConsumedWh = 0; sim.exportWh = 0;
  sim.samples = [simulationSnapshot(sim)];
}

export function simulationFinancialEffect(sim) {
  return (sim.selfConsumedWh * sim.buyRatePln + sim.exportWh * sim.sellRatePln) / 1000;
}

export function simulationArchive(sim) {
  return {
    schemaVersion: 1, mode: 'simulation', label: 'SIMULATION — virtual installation; no measured generation or verified savings.',
    model: sim.model, roof: structuredClone(sim.roof), parameters: { ...sim.parameters },
    assumptions: { simulationStartsAtHour: 6, sunriseHour: 6, sunsetHour: 18, referenceDay: 'annual scenario estimate / 365, bounded by nominal capacity', scenarioFactors: { ...SIMULATION_SCENARIOS }, pricesApplyToEntireHistory: true },
    settings: { speed: sim.speed, scenario: sim.scenario, selfConsumptionFraction: sim.selfConsumptionFraction, buyRatePln: sim.buyRatePln, sellRatePln: sim.sellRatePln },
    currentSecondOfDay: sim.timeSeconds, elapsedVirtualSeconds: sim.timeSeconds - SIMULATION_START_SECONDS,
    totals: { energyKwh: sim.energyWh / 1000, selfConsumedKwh: sim.selfConsumedWh / 1000, exportKwh: sim.exportWh / 1000, estimatedGrossEffectPln: simulationFinancialEffect(sim) },
    samples: sim.samples.map(row => ({ ...row })),
  };
}

export function simulationCsv(sim, language = 'ru') {
  const pl = language === 'pl';
  const quote = value => `"${String(value ?? '').replace(/^[=+@\-\t\r\n]/, "'$&").replaceAll('"', '""')}"`;
  const rows = [
    ['SIMULATION', pl ? 'Instalacja wirtualna; dane sztuczne; brak potwierdzonych oszczędności' : 'Виртуальная установка; искусственные данные; экономия не подтверждена'],
    [pl ? 'ID dachu' : 'ID крыши', sim.roof.id], [pl ? 'Moc kWp' : 'Мощность кВтп', sim.roof.capacityKwp],
    [pl ? 'Sekundy wirtualne / sekundę rzeczywistą' : 'Виртуальных секунд / реальную секунду', sim.speed],
    [pl ? 'Cena unikniętego zakupu PLN/kWh' : 'Цена замещённой покупки PLN/кВт·ч', sim.buyRatePln],
    [pl ? 'Cena sprzedaży PLN/kWh' : 'Цена продажи PLN/кВт·ч', sim.sellRatePln],
    [pl ? 'Ceny dotyczą całej historii; szacunek przed kosztami' : 'Цены применены ко всей истории; оценка до расходов'], [],
    pl ? ['Czas umowny', 'Sekunda dnia', 'Scenariusz', 'Moc W', 'Autokonsumpcja W', 'Oddanie W', 'Energia kWh', 'Autokonsumpcja kWh', 'Oddanie kWh', 'Szacowany efekt PLN']
      : ['Условное время', 'Секунда дня', 'Сценарий', 'Мощность Вт', 'Собственное потребление Вт', 'Отдача Вт', 'Энергия кВт·ч', 'Собственное потребление кВт·ч', 'Отдача кВт·ч', 'Оценка эффекта PLN'],
    ...sim.samples.map(row => [simulationClock(row.secondOfDay), row.secondOfDay, row.scenario, row.powerW, row.selfConsumedPowerW, row.exportPowerW, row.energyWh / 1000, row.selfConsumedWh / 1000, row.exportWh / 1000, (row.selfConsumedWh * sim.buyRatePln + row.exportWh * sim.sellRatePln) / 1000]),
  ];
  return '\uFEFF' + rows.map(row => row.map(quote).join(';')).join('\r\n');
}
