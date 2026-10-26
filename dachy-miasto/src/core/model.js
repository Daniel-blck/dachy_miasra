export const DEFAULTS = Object.freeze({
  budgetPln: 5_000_000,
  coverage: 0.6,
  efficiency: 0.2,
  performanceRatio: 0.8,
  costPerKwpPln: 4000,
  fixedCostPln: 15000,
  minCapacityKwp: 3,
  onlyGreen: false,
  omitInvestmentLabels: false,
});

export function validateParameters(p) {
  const ranges = {
    budgetPln: [0, 100_000_000], coverage: [0.01, 1], efficiency: [0.01, 0.5],
    performanceRatio: [0.01, 1], costPerKwpPln: [1, 100_000],
    fixedCostPln: [0, 10_000_000], minCapacityKwp: [0, 10_000],
  };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max) {
      throw new RangeError(`Nieprawidłowy parametr: ${key} (${min}–${max}).`);
    }
  }
}

/** Scenario, not a site survey. Radiation is allocated by the same coverage as capacity. */
export function evaluateRoof(roof, parameters) {
  const p = parameters;
  const panelAreaM2 = roof.usableAreaM2 * p.coverage;
  const capacityKwp = panelAreaM2 * p.efficiency; // STC reference irradiance: 1 kW/m²
  const annualEnergyKwh = roof.annualIrradiationKwh * p.coverage * p.efficiency * p.performanceRatio;
  const costCents = Math.round((capacityKwp * p.costPerKwpPln + p.fixedCostPln) * 100);
  return {
    ...roof, panelAreaM2, capacityKwp, annualEnergyKwh, costCents,
    costPln: costCents / 100,
    kwhPerThousandPln: annualEnergyKwh / (costCents / 100_000),
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
    else if (roof.capacityKwp < parameters.minCapacityKwp) reason = 'Moc poniżej progu scenariusza';
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
