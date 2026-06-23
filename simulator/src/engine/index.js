// index.js — registro de modelos del motor (extensible: MC400, sorter… se añaden aquí).
import mt800 from './models/mt800.js';
import mc400 from './models/mc400.js';
import { bomFromPlan, totalParts, bomToCSV } from './bom.js';

export const MODELS = {
  mt800_pro: mt800,
  mc400: mc400,
};

export function getModel(id) {
  const m = MODELS[id];
  if (!m) throw new Error(`modelo no registrado: ${id}`);
  return m;
}

export function listModels() {
  return Object.entries(MODELS).map(([id, m]) => ({ id, name: m.schema.name }));
}

// API de alto nivel: params -> plan + BOM (la fuente de verdad compartida)
export function configure(modelId, params) {
  const model = getModel(modelId);
  const plan = model.buildPlan(params);
  const bom = bomFromPlan(plan);
  return { model, plan, bom, total_parts: totalParts(bom), code: plan.meta.code };
}

export { bomFromPlan, totalParts, bomToCSV };
export default { MODELS, getModel, listModels, configure, bomFromPlan, totalParts, bomToCSV };
