import { prepareCandidates, evaluateRoof } from './model.js';
import { optimizePortfolio, budgetCurve, CURVE_BUDGETS_PLN } from './optimizer.js';

/** One calculation shared by the Worker and regression checks. */
export function calculatePlan(roofs, parameters, excludedIds = []) {
  const { candidates } = prepareCandidates(roofs, parameters, excludedIds);
  const result = optimizePortfolio(candidates, parameters.budgetPln);
  const sensitivity = [
    { key: 'base', costFactor: 1, yieldFactor: 1 },
    { key: 'cost', costFactor: 1.2, yieldFactor: 1 },
    { key: 'yield', costFactor: 1, yieldFactor: 0.8 },
  ].map(s => {
    if (s.key === 'base') return { ...s, ...result.totals, selectedIds: result.selectedIds };
    // Derived scenarios may exceed the editable input range. Evaluate them without
    // rejecting a valid base plan. Higher costs/lower yield cannot add candidates.
    const changedParameters = { ...parameters,
      costPerKwpPln: parameters.costPerKwpPln * s.costFactor,
      fixedCostPln: parameters.fixedCostPln * s.costFactor,
      performanceRatio: parameters.performanceRatio * s.yieldFactor,
    };
    const changed = candidates.map(r => evaluateRoof(r, changedParameters))
      .filter(r => r.specificYieldKwhPerKwp >= parameters.minSpecificYield);
    const scenario = optimizePortfolio(changed, parameters.budgetPln);
    const overlap = result.selectedIds.filter(id => scenario.selectedIds.includes(id)).length;
    return { ...s, ...scenario.totals, selectedIds: scenario.selectedIds, overlap };
  });
  const curve = budgetCurve(candidates, [...CURVE_BUDGETS_PLN, parameters.budgetPln].filter(b => b > 0));
  return { result, sensitivity, curve };
}
