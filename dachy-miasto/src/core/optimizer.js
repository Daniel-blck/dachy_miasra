import { sumPortfolio } from './model.js';

const byRatio = (a, b) => b.annualEnergyKwh / b.costCents - a.annualEnergyKwh / a.costCents || a.id.localeCompare(b.id);
const byEnergy = (a, b) => b.annualEnergyKwh - a.annualEnergyKwh || a.id.localeCompare(b.id);

function greedy(items, budgetCents, compare) {
  let spent = 0;
  const chosen = [];
  for (const item of items.slice().sort(compare)) {
    if (spent + item.costCents > budgetCents) continue;
    chosen.push(item);
    spent += item.costCents;
  }
  return chosen;
}

/** Fractional relaxation: valid upper bound for the same candidate set and model. */
function fractionalBound(items, budgetCents) {
  let remaining = budgetCents;
  let upper = 0;
  for (const item of items.slice().sort(byRatio)) {
    const fraction = Math.min(1, remaining / item.costCents);
    upper += fraction * item.annualEnergyKwh;
    remaining -= fraction * item.costCents;
    if (remaining <= 0) break;
  }
  return upper;
}

/** Conservative cost discretization; every returned selection respects the real budget. */
export function optimizePortfolio(candidates, budgetPln, { maxStates = 5000 } = {}) {
  if (!Number.isFinite(budgetPln) || budgetPln < 0) throw new RangeError('Invalid budget.');
  if (!Number.isInteger(maxStates) || maxStates < 1 || maxStates > 100_000) throw new RangeError('Invalid state limit.');
  const budgetCents = Math.floor(budgetPln * 100 + 1e-6);
  const seen = new Set();
  for (const item of candidates) {
    if (seen.has(item.id)) throw new Error('Duplicate candidate ID.');
    seen.add(item.id);
    if (!Number.isSafeInteger(item.costCents) || item.costCents <= 0 || !Number.isFinite(item.annualEnergyKwh) || item.annualEnergyKwh < 0) {
      throw new RangeError('Invalid candidate values.');
    }
  }
  const items = candidates.filter(r => r.costCents <= budgetCents && r.annualEnergyKwh > 0).slice().sort((a, b) => a.id.localeCompare(b.id));
  const largest = greedy(items, budgetCents, byEnergy);
  const ratio = greedy(items, budgetCents, byRatio);
  const costStepCents = Math.max(1, Math.ceil(budgetCents / maxStates));
  const capacity = Math.floor(budgetCents / costStepCents);
  let dpItems = [];
  // Avoid rounding loss when every feasible item already fits.
  if (items.reduce((s, r) => s + r.costCents, 0) <= budgetCents) dpItems = items;
  else if (capacity > 0) {
    const values = new Float64Array(capacity + 1);
    const stride = capacity + 1;
    const choices = new Uint8Array(items.length * stride);
    for (let i = 0; i < items.length; i++) {
      const weight = Math.ceil(items[i].costCents / costStepCents);
      for (let c = capacity; c >= weight; c--) {
        const proposed = values[c - weight] + items[i].annualEnergyKwh;
        if (proposed > values[c] + 1e-9) {
          values[c] = proposed;
          choices[i * stride + c] = 1;
        }
      }
    }
    let c = capacity;
    for (let i = items.length - 1; i >= 0; i--) {
      if (!choices[i * stride + c]) continue;
      dpItems.push(items[i]);
      c -= Math.ceil(items[i].costCents / costStepCents);
    }
  }
  const alternatives = [
    { key: 'largest', label: 'Największa produkcja', items: largest },
    { key: 'ratio', label: 'Produkcja / koszt', items: ratio },
    { key: 'dp', label: 'Programowanie dynamiczne', items: dpItems },
  ].map(a => ({ ...a, ...sumPortfolio(a.items) }));
  const winner = alternatives.slice().sort((a, b) => b.annualEnergyKwh - a.annualEnergyKwh || a.costCents - b.costCents)[0];
  const selected = winner.items.slice().sort(byEnergy);
  const totals = sumPortfolio(selected);
  if (totals.costCents > budgetCents) throw new Error('Budget invariant violated.');
  const upperBoundKwh = Math.max(totals.annualEnergyKwh, fractionalBound(items, budgetCents));
  const baseline = alternatives[0].annualEnergyKwh;
  return {
    selectedIds: selected.map(r => r.id), totals,
    strategy: winner.key,
    alternatives: alternatives.map(({ items: ignored, ...rest }) => rest),
    budgetPln, remainingPln: (budgetCents - totals.costCents) / 100,
    eligibleCount: candidates.length, affordableCount: items.length,
    costStepPln: costStepCents / 100,
    upperBoundKwh,
    boundGapPercent: upperBoundKwh > 0 ? 100 * (upperBoundKwh - totals.annualEnergyKwh) / upperBoundKwh : 0,
    improvementPercent: baseline > 0 ? 100 * (totals.annualEnergyKwh / baseline - 1) : null,
  };
}
