// bom.js — BOM CONTADO del plan (no por fórmula).
//
// Recorre las piezas realmente colocadas en el plan y las agrega por código. El
// BOM no puede divergir de la geometría: si el plan coloca 140 tornillos, el BOM
// dice 140. Las líneas `derived` (tuercas 1:1, conectores, control board) se
// suman aparte y se marcan source:'derived'.

export function bomFromPlan(plan) {
  const order = [];
  const byCode = new Map();

  const accumulate = (row, source) => {
    if (!byCode.has(row.code)) {
      byCode.set(row.code, {
        category: row.category, code: row.code, desc: row.desc,
        material: row.material, dim_mm: row.dim, qty: 0, source,
      });
      order.push(row.code);
    }
    const agg = byCode.get(row.code);
    agg.qty += row.qty != null ? row.qty : (row.bomQty != null ? row.bomQty : 1);
    if (source === 'geom') agg.source = 'geom';
  };

  for (const part of plan.parts) {
    if (part.countsInBom === false || !part.code) continue;
    accumulate(part, 'geom');
  }
  for (const d of plan.derived || []) accumulate(d, 'derived');

  return order.map((code, i) => ({ pos: i + 1, ...byCode.get(code) }));
}

export function totalParts(rows) {
  return rows.reduce((a, r) => a + r.qty, 0);
}

export function bomToCSV(rows) {
  const head = ['Pos', 'Categoria', 'Codigo', 'Descripcion', 'Cant.', 'Dim (mm)', 'Material', 'Origen'];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push([r.pos, r.category, r.code, r.desc, r.qty, r.dim_mm, r.material, r.source].map(esc).join(','));
  }
  return lines.join('\n');
}

export default { bomFromPlan, totalParts, bomToCSV };
