// Tests del modelo MB400 (módulo de banda modular).
import test from 'node:test';
import assert from 'node:assert/strict';
import { configure, listModels } from '../src/engine/index.js';
import mb400 from '../src/engine/models/mb400.js';
import { bomFromPlan } from '../src/engine/bom.js';

test('mb400 está registrado', () => {
  assert.ok(listModels().some((m) => m.id === 'mb400'));
});

test('BOM == piezas colocadas (piñones, tornillos)', () => {
  const plan = mb400.buildPlan({});
  const rows = bomFromPlan(plan);
  const countParts = (pred) => plan.parts.filter(pred).reduce((a, p) => a + (p.bomQty ?? 1), 0);
  const sprBom = rows.filter((r) => r.code.startsWith('MB400-SPR-')).reduce((a, r) => a + r.qty, 0);
  const sprGeom = countParts((p) => (p.code || '').startsWith('MB400-SPR-'));
  assert.equal(sprBom, sprGeom);
  const boltBom = rows.filter((r) => r.code === 'DIN912-M6x16').reduce((a, r) => a + r.qty, 0);
  assert.equal(boltBom, countParts((p) => p.code === 'DIN912-M6x16'));
});

test('cantidades coherentes para defaults (L2000 W400)', () => {
  const p = mb400.validate({});
  const ns = mb400.sprockets(p);
  const { bom, total_parts } = configure('mb400', {});
  const q = Object.fromEntries(bom.map((r) => [r.code, r.qty]));
  // piñones: ns por extremo x 2 extremos
  const spr = (q['MB400-SPR-DRV-D90'] || 0) + (q['MB400-SPR-IDL-D90'] || 0);
  assert.equal(spr, 2 * ns);
  assert.equal(q['MB400-BRG-UCF'], 4);   // 2 por eje x 2 ejes
  assert.equal(q['MA4080'], 4);
  assert.ok(q['MB400-MOD'] > 0);         // módulos de banda derivados
  assert.ok(total_parts > 0 && bom.every((r) => r.qty > 0));
});

test('más largo/ancho => más piezas', () => {
  const a = configure('mb400', { length: 800, width: 200 }).total_parts;
  const b = configure('mb400', { length: 4000, width: 800 }).total_parts;
  assert.ok(b > a);
});

test('sin tornillería cuando bolts=false', () => {
  const codes = new Set(configure('mb400', { bolts: false }).bom.map((r) => r.code));
  assert.ok(!codes.has('DIN912-M6x16'));
});

test('código MB400 bien formado', () => {
  assert.match(mb400.code({}), /^MB400-Pro-FL-A-L2000-W400-S2-LA2-UGN2-DM1$/);
});
