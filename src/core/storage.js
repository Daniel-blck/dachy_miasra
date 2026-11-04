import { validateParameters } from './model.js';

/** Old or partial browser storage must not prevent the application from opening. */
export function readStorage(storage, key, fallback = null) {
  try { return JSON.parse(storage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}

export function validSavedScenarios(value, limit = 4) {
  if (!Array.isArray(value)) return [];
  return value.filter(s => {
    if (!s || typeof s.label !== 'string' || !s.procedures || typeof s.procedures !== 'object') return false;
    if (!['budgetPln', 'maxCapacityKwp', 'count', 'energyMwh', 'co2Tonnes'].every(k => Number.isFinite(s[k]) && s[k] >= 0)) return false;
    if (s.costPerMwhPln != null && (!Number.isFinite(s.costPerMwhPln) || s.costPerMwhPln < 0)) return false;
    return ['small', 'micro', 'exempt', 'permit'].every(k => Number.isInteger(s.procedures[k]) && s.procedures[k] >= 0);
  }).slice(0, limit);
}

export function storedParameters(value, defaults) {
  try {
    const parameters = { ...defaults, ...value };
    validateParameters(parameters);
    return parameters;
  } catch { return { ...defaults }; }
}
