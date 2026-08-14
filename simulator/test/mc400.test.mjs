// Tests del modelo MC400 (curva): plan + BOM contado de la geometría.
import test from 'node:test';
import assert from 'node:assert/strict';
import { configure, listModels } from '../src/engine/index.js';
import mc400 from '../src/engine/models/mc400.js';
import { bomFromPlan } from '../src/engine/bom.js';

test('mc400 está registrado en el motor', () => {
  assert.ok(listModels().some((m) => m.id === 'mc400'));
});

test('BOM == piezas colocadas (rodillos, rodamientos, tornillos)', () => {
  const plan = mc400.buildPlan({});
  const rows = bomFromPlan(plan);
  const countParts = (pred) => plan.parts.filter(pred).reduce((a, p) => a + (p.bomQty ?? 1), 0);
  const bomQty = (code) => rows.filter((r) => r.code === code).reduce((a, r) => a + r.qty, 0);

  const rollersBom = rows.filter((r) => r.code.startsWith('MC400-ROL') || r.code.startsWith('MC400-DRV')).reduce((a, r) => a + r.qty, 0);
  const rollersGeom = countParts((p) => (p.code || '').startsWith('MC400-ROL') || (p.code || '').startsWith('MC400-DRV'));
  assert.equal(rollersBom, rollersGeom);

  assert.equal(bomQty('MC400-BRG-625'), countParts((p) => p.code === 'MC400-BRG-625'));
  assert.equal(bomQty('DIN912-M5x12'), countParts((p) => p.code === 'DIN912-M5x12'));
});

test('cantidades coherentes para defaults (90°, R400, W300)', () => {
  const { bom, total_parts } = configure('mc400', {});
  const q = Object.fromEntries(bom.map((r) => [r.code, r.qty]));
  const n = mc400.rollerCount(mc400.validate({}));
  assert.ok(n >= 2);
  // 1 rodillo motriz + (n-1) idler
  assert.equal((q['MC400-DRV-W300'] || 0) + (q['MC400-ROL-W300'] || 0), n);
  assert.equal(q['MC400-DRV-W300'], 1);
  assert.equal(q['MC400-BRG-625'], 2 * n);     // 2 rodamientos por rodillo
  assert.equal(q['DIN912-M5x12'], 4 * n);      // 4 tornillos por rodillo
  assert.equal(q['MT800-TN-M5'], 4 * n);       // tuerca 1:1
  assert.equal(q['MA4080'], 4);                // 4 patas
  assert.ok(total_parts > 0);
  assert.ok(bom.every((r) => r.qty > 0));
});

test('más ángulo/menor paso => más rodillos => más piezas', () => {
  const a = configure('mc400', { angle: 30 }).total_parts;
  const b = configure('mc400', { angle: 90 }).total_parts;
  assert.ok(b > a);
});

test('sin tornillería cuando bolts=false', () => {
  const codes = new Set(configure('mc400', { bolts: false }).bom.map((r) => r.code));
  assert.ok(!codes.has('DIN912-M5x12'));
});

test('código de catálogo MC400 bien formado', () => {
  assert.match(mc400.code({}), /^MC400-Pro-90-A-R400-W300-S2-LA2-UGN2-DM1$/);
});
