import { calculatePlan } from './core/plan.js';

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, ...calculatePlan(data.roofs, data.parameters, data.excludedIds) });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
