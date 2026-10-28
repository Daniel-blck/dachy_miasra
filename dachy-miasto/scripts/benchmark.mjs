import fs from 'node:fs/promises';
import { DEFAULTS, prepareCandidates } from '../src/core/model.js';
import { optimizePortfolio } from '../src/core/optimizer.js';
const read = async name => JSON.parse(await fs.readFile(new URL('../data/' + name, import.meta.url), 'utf8').catch(() => 'null'));
// Same inputs as the app: roofs joined with addresses, parks and municipal registers, so the default filters apply.
const [context, registers] = [await read('roof-context.json'), await read('roof-registers.json')];
const roofs = (await read('roofs.json')).map(r => ({ ...r, ...(context?.roofs?.[r.id] || {}), ...(registers?.roofs?.[r.id] || {}) }));
const cases = [0, 100_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000].map(budgetPln => {
  const p = { ...DEFAULTS, budgetPln };
  const { candidates } = prepareCandidates(roofs, p);
  const start = performance.now();
  const result = optimizePortfolio(candidates, budgetPln);
  return {
    budgetPln, selected: result.totals.count, spentPln: result.totals.costPln,
    annualEnergyKwh: result.totals.annualEnergyKwh,
    baselineEnergyKwh: result.alternatives[0].annualEnergyKwh,
    improvementPercent: result.improvementPercent,
    boundGapPercent: result.boundGapPercent,
    strategy: result.strategy, costStepPln: result.costStepPln,
    elapsedMs: Math.round(performance.now() - start),
  };
});
const report = { referenceRecords: roofs.length, parameters: DEFAULTS, cases, scope: 'Same unverified pilot candidates and explicit scenario assumptions; algorithmic comparison, not verified municipal savings.' };
await fs.writeFile(new URL('../data/benchmark.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.table(cases);
