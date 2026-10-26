import { prepareCandidates } from './core/model.js';
import { optimizePortfolio } from './core/optimizer.js';

self.onmessage = ({ data }) => {
  try {
    const { candidates } = prepareCandidates(data.roofs, data.parameters, data.excludedIds);
    const result = optimizePortfolio(candidates, data.parameters.budgetPln);
    // Re-optimize alternative assumptions, rather than only scaling the chosen portfolio.
    const sensitivity = [
      { key: 'base', label: 'Bazowy', costFactor: 1, yieldFactor: 1 },
      { key: 'cost', label: 'Koszty +20%', costFactor: 1.2, yieldFactor: 1 },
      { key: 'yield', label: 'Produkcja −20%', costFactor: 1, yieldFactor: 0.8 },
    ].map(s => {
      if (s.key === 'base') return { ...s, ...result.totals, selectedIds: result.selectedIds };
      const parameters = { ...data.parameters,
        costPerKwpPln: data.parameters.costPerKwpPln * s.costFactor,
        fixedCostPln: data.parameters.fixedCostPln * s.costFactor,
        performanceRatio: data.parameters.performanceRatio * s.yieldFactor,
      };
      const { candidates: changed } = prepareCandidates(data.roofs, parameters, data.excludedIds);
      const scenario = optimizePortfolio(changed, parameters.budgetPln);
      const overlap = result.selectedIds.filter(id => scenario.selectedIds.includes(id)).length;
      return { ...s, ...scenario.totals, selectedIds: scenario.selectedIds, overlap };
    });
    self.postMessage({ id: data.id, result, sensitivity });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
