// Verifica que el BOM se cuenta del plan y coincide con la geometría colocada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { configure } from '../src/engine/index.js';
import mt800 from '../src/engine/models/mt800.js';
import { bomFromPlan, totalParts } from '../src/engine/bom.js';

test('BOM == piezas colocadas en el plan (tornillos, placas, poleas)', () => {
  const plan = mt800.buildPlan({});
  const rows = bomFromPlan(plan);

  const countParts = (pred) => plan.parts.filter(pred).reduce((a, p) => a + (p.bomQty ?? 1), 0);
  const bomQty = (code) => rows.filter((r) => r.code === code).reduce((a, r) => a + r.qty, 0);

  // tornillos
  assert.equal(bomQty('DIN912-M5x12'), countParts((p) => p.code === 'DIN912-M5x12'));
  // placas de cabezal (motriz + idler)
  const platesBom = bomQty('MTB800-207') + bomQty('MTB800-207-I');
  const platesGeom = countParts((p) => p.code === 'MTB800-207' || p.code === 'MTB800-207-I');
  assert.equal(platesBom, platesGeom);
  // poleas
  const pulBom = rows.filter((r) => r.code.startsWith('MT800-PUL-')).reduce((a, r) => a + r.qty, 0);
  const pulGeom = countParts((p) => (p.code || '').startsWith('MT800-PUL-'));
  assert.equal(pulBom, pulGeom);
});

test('cantidades exactas para defaults (L1400-W600 -> 7 bandas)', () => {
  const { bom, total_parts } = configure('mt800_pro', {});
  const q = Object.fromEntries(bom.map((r) => [r.code, r.qty]));
  assert.equal(q['DIN912-M5x12'], 140);   // antes la fórmula daba 108
  assert.equal(q['MT800-TN-M5'], 140);    // tuerca 1:1 con tornillo
  assert.equal(q['MTB800-207'] + q['MTB800-207-I'], 28);
  assert.equal(q['MT800-BRG-625'], 28);
  assert.equal(total_parts, 407);
  assert.ok(bom.every((r) => r.qty > 0));
  assert.ok(bom.every((r) => r.source === 'geom' || r.source === 'derived'));
});

test('coincide con el backend mt800.py (407 piezas, 21 líneas)', () => {
  const { bom, total_parts } = configure('mt800_pro', {});
  assert.equal(bom.length, 21);
  assert.equal(total_parts, 407);
});

test('sin tornillería cuando bolts=false', () => {
  const { bom } = configure('mt800_pro', { bolts: false });
  const codes = new Set(bom.map((r) => r.code));
  assert.ok(!codes.has('DIN912-M5x12'));
  assert.ok(!codes.has('MT800-TN-M5'));
});

test('el BOM escala con el número de bandas', () => {
  const small = totalParts(configure('mt800_pro', { width: 200 }).bom);
  const big = totalParts(configure('mt800_pro', { width: 900 }).bom);
  assert.ok(big > small);
});
