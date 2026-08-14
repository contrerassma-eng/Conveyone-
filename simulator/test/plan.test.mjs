// Verifica la integridad del plan (representación exacta) y la validación de params.
import test from 'node:test';
import assert from 'node:assert/strict';
import mt800 from '../src/engine/models/mt800.js';

test('cada pieza del plan tiene código, primitiva y transform', () => {
  const plan = mt800.buildPlan({});
  assert.ok(plan.parts.length > 0);
  for (const p of plan.parts) {
    assert.ok(['box', 'cyl', 'tslot', 'beltLoop'].includes(p.kind), `kind inválido: ${p.kind}`);
    assert.ok(Array.isArray(p.pos) && p.pos.length === 3, `pos inválido en ${p.id}`);
    assert.ok(p.args && typeof p.args === 'object');
    if (p.countsInBom !== false) assert.ok(p.code, `pieza contable sin código: ${p.id}`);
  }
});

test('validate hace clamp de los parámetros fuera de rango', () => {
  const p = mt800.validate({ length: 99999, width: 1, belt_width: 999, pulley_d: 5 });
  assert.equal(p.length, 6000);
  assert.equal(p.width, 80);
  assert.equal(p.belt_width, 80);
  assert.equal(p.pulley_d, 20);
});

test('lanes = round(width / pitch)', () => {
  assert.equal(mt800.lanes(mt800.validate({ width: 600, belt_pitch: 85 })), 7);
  assert.equal(mt800.lanes(mt800.validate({ width: 300, belt_pitch: 85 })), 4);
});

test('código de catálogo bien formado', () => {
  const c = mt800.code({});
  assert.match(c, /^MT800-Pro-FL-A-L1400-W600-25TU1-S2-LA2-UGN2-DM1$/);
});

test('backendParams expone solo lo que entiende el backend', () => {
  const bp = mt800.backendParams({});
  assert.deepEqual(
    Object.keys(bp).sort(),
    ['belt_pitch', 'belt_width', 'bolts', 'casters', 'drive_end', 'leg_height', 'length', 'pulley_d', 'side_guides', 'understructure', 'width'].sort(),
  );
});

test('más bandas => más piezas en el plan', () => {
  const a = mt800.buildPlan({ width: 200 }).parts.length;
  const b = mt800.buildPlan({ width: 900 }).parts.length;
  assert.ok(b > a);
});
