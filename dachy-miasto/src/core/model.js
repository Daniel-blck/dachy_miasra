import { isCityLand, needsConservator } from './registers.js';

export const DEFAULTS = Object.freeze({
  budgetPln: 5_000_000,
  coverage: 0.6,
  efficiency: 0.2,
  performanceRatio: 0.8,
  costPerKwpPln: 4000,
  fixedCostPln: 15000,
  minCapacityKwp: 3,
  // 150 kW: PV up to this size needs neither a building permit nor a construction notification (Prawo budowlane, art. 29 ust. 4 pkt 3 lit. c). 0 = no limit.
  maxCapacityKwp: 150,
  minSpecificYield: 0,
  // KOBiZE table 2, published 12.2025 (2024 data), kg CO2/MWh at end users.
  co2KgPerMwh: 553,
  onlyGreen: false,
  omitInvestmentLabels: false,
  // When enabled, register filters require a positive match; missing data never grants eligibility.
  onlyCityLand: true,
  requireCurrentBuilding: true,
  omitHeritage: false,
});

/** Approval route by installed capacity. Thresholds are a planning aid; each project still needs legal confirmation. */
export const PROCEDURES = Object.freeze([
  { key: 'small', maxKwp: 6.5 },   // no fire-safety design approval
  { key: 'micro', maxKwp: 50 },    // micro-installation: notification to the grid operator; fire-safety approval above 6.5 kWp
  { key: 'exempt', maxKwp: 150 },  // no building permit or notification; grid connection conditions
  { key: 'permit', maxKwp: Infinity },
]);
export const procedureFor = capacityKwp => PROCEDURES.find(p => capacityKwp <= p.maxKwp + 1e-9).key;

export function validateParameters(p) {
  const ranges = {
    budgetPln: [0, 100_000_000], coverage: [0.01, 1], efficiency: [0.01, 0.5],
    performanceRatio: [0.01, 1], costPerKwpPln: [1, 100_000],
    fixedCostPln: [0, 10_000_000], minCapacityKwp: [0, 10_000],
    maxCapacityKwp: [0, 100_000], minSpecificYield: [0, 2000], co2KgPerMwh: [0, 2000],
  };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max) {
      throw new RangeError(`Nieprawidłowy parametr: ${key} (${min}–${max}).`);
    }
  }
  if (p.maxCapacityKwp > 0 && p.maxCapacityKwp < p.minCapacityKwp) throw new RangeError('Limit mocy jest niższy niż minimalna moc.');
}

/**
 * Scenario, not a site survey. Radiation is allocated by the same coverage as capacity.
 * A per-building limit shrinks the installation proportionally; it does not drop the roof.
 */
export function evaluateRoof(roof, parameters) {
  const p = parameters;
  const potentialKwp = roof.usableAreaM2 * p.coverage * p.efficiency; // STC reference irradiance: 1 kW/m²
  const capacityKwp = p.maxCapacityKwp > 0 ? Math.min(potentialKwp, p.maxCapacityKwp) : potentialKwp;
  const scale = potentialKwp > 0 ? capacityKwp / potentialKwp : 0;
  const panelAreaM2 = roof.usableAreaM2 * p.coverage * scale;
  const annualEnergyKwh = roof.annualIrradiationKwh * p.coverage * p.efficiency * p.performanceRatio * scale;
  const costCents = Math.round((capacityKwp * p.costPerKwpPln + p.fixedCostPln) * 100);
  return {
    ...roof, potentialKwp, panelAreaM2, capacityKwp, annualEnergyKwh, costCents,
    requestedPanelAreaM2: roof.usableAreaM2 * p.coverage,
    capacityScale: scale,
    effectiveCoverage: p.coverage * scale,
    capped: capacityKwp < potentialKwp,
    costPln: costCents / 100,
    kwhPerThousandPln: annualEnergyKwh / (costCents / 100_000),
    specificYieldKwhPerKwp: capacityKwp > 0 ? annualEnergyKwh / capacityKwp : 0,
    co2Tonnes: annualEnergyKwh / 1000 * (p.co2KgPerMwh ?? DEFAULTS.co2KgPerMwh) / 1000,
    procedure: procedureFor(capacityKwp),
  };
}

export function prepareCandidates(roofs, parameters, excludedIds = []) {
  validateParameters(parameters);
  const excluded = new Set(excludedIds);
  const evaluated = roofs.map(r => evaluateRoof(r, parameters));
  const candidates = [];
  const reasons = {};
  for (const roof of evaluated) {
    let reason = null;
    if (excluded.has(roof.id)) reason = 'Wykluczenie użytkownika';
    else if (parameters.onlyGreen && !roof.greenRoofPotential) reason = 'Brak flagi zielonego dachu';
    else if (parameters.omitInvestmentLabels && roof.investmentLabel) reason = 'Filtr odnotowanych inwestycji';
    else if (parameters.onlyCityLand && isCityLand(roof) !== true) reason = 'Poza działkami miasta';
    else if (parameters.requireCurrentBuilding && roof.inEgib !== true) reason = 'Brak w aktualnej EGiB';
    else if (parameters.omitHeritage && needsConservator(roof)) reason = 'Ochrona konserwatorska';
    else if (roof.capacityKwp < parameters.minCapacityKwp) reason = 'Moc poniżej progu scenariusza';
    else if (parameters.minSpecificYield > 0 && roof.specificYieldKwhPerKwp < parameters.minSpecificYield) reason = 'Niski uzysk jednostkowy';
    if (reason) reasons[roof.id] = reason;
    else candidates.push(roof);
  }
  return { evaluated, candidates, reasons };
}

export function sumPortfolio(items) {
  const sums = items.reduce((sum, r) => ({
    costCents: sum.costCents + r.costCents,
    annualEnergyKwh: sum.annualEnergyKwh + r.annualEnergyKwh,
    capacityKwp: sum.capacityKwp + r.capacityKwp,
  }), { costCents: 0, annualEnergyKwh: 0, capacityKwp: 0 });
  return { ...sums, costPln: sums.costCents / 100, count: items.length };
}

/** Plan facts for decision makers: emissions, cost per annual MWh, approval routes and concentration. */
export function describePortfolio(items, parameters) {
  const totals = sumPortfolio(items);
  const procedures = Object.fromEntries(PROCEDURES.map(p => [p.key, 0]));
  for (const r of items) procedures[r.procedure ?? procedureFor(r.capacityKwp)]++;
  const largest = items.reduce((best, r) => (r.annualEnergyKwh > (best?.annualEnergyKwh ?? -1) ? r : best), null);
  return {
    ...totals,
    co2Tonnes: totals.annualEnergyKwh / 1000 * parameters.co2KgPerMwh / 1000,
    costPerMwhPln: totals.annualEnergyKwh > 0 ? totals.costPln / (totals.annualEnergyKwh / 1000) : null,
    procedures,
    cappedCount: items.filter(r => r.capped).length,
    culturalParkCount: items.filter(r => r.culturalPark).length,
    heritageCount: items.filter(needsConservator).length,
    cityLandCount: items.filter(r => isCityLand(r)).length,
    addressCount: items.filter(r => r.address).length,
    largestId: largest?.id ?? null,
    largestSharePercent: largest && totals.annualEnergyKwh > 0 ? 100 * largest.annualEnergyKwh / totals.annualEnergyKwh : 0,
  };
}
