// box-physics.mjs — Validación headless del motor de comportamiento de la caja.
// Corre con:  node test/box-physics.mjs
//
// No dibuja: comprueba que la FÍSICA hace lo que decimos (tracción, transporte,
// colisión por frenado, derrape en curva bajo presión, desvío).

import { BoxFlowSim } from '../src/box-physics.js';
import { buildBehaviorLine } from '../src/box-layouts.js';

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}  ${extra}`); }
}

// ---------- 1) tracción: una caja en una banda alcanza ~la velocidad de banda ----------
{
  const model = { meta: {}, conveyors: [
    { id: 'a', width: 0.6, speed: 0.8, geom: { type: 'straight', from: [0, 0], to: [20, 0] } },
  ] };
  const sim = new BoxFlowSim(model, { seed: 1 });
  sim.boxes.push({ id: 1, convId: 'a', p: [0, 0], v: [0, 0], offTrack: false, divert: false, divertChecked: false, state: 'ok', bornAt: 0 });
  sim.run(2);
  const b = sim.boxes[0];
  const sp = Math.hypot(b.v[0], b.v[1]);
  check('tracción lleva la caja a la velocidad de banda', Math.abs(sp - 0.8) < 0.05, `v=${sp.toFixed(3)}`);
  check('la caja avanza en +x', b.p[0] > 1, `x=${b.p[0].toFixed(2)}`);
}

// ---------- 2) transporte por toda la línea: se generan y se entregan cajas ----------
{
  const sim = new BoxFlowSim(buildBehaviorLine({ rate: 2000 }), { seed: 3 });
  sim.run(90);   // la línea es larga (~28 m): hay que dejarla llegar a régimen
  check('la fuente genera cajas', sim.stats.generated > 10, `gen=${sim.stats.generated}`);
  check('se entregan cajas (transporte completo)', sim.stats.delivered > 5, `del=${sim.stats.delivered}`);
  check('hay cajas en el sistema', sim.stats.inSystem > 0, `inSys=${sim.stats.inSystem}`);
}

// ---------- 3) colisión por frenado: dos cajas, la de adelante frena -> se tocan ----------
{
  const model = { meta: {}, conveyors: [
    { id: 'fast', width: 0.6, speed: 1.0, geom: { type: 'straight', from: [0, 0], to: [6, 0] }, next: ['slow'] },
    { id: 'slow', width: 0.6, speed: 0.15, geom: { type: 'straight', from: [6, 0], to: [16, 0] }, sink: true },
  ] };
  const sim = new BoxFlowSim(model, { seed: 5 });
  // dos cajas separadas 1 m sobre la banda rápida
  sim.boxes.push({ id: 1, convId: 'fast', p: [1.0, 0], v: [1.0, 0], offTrack: false, divert: false, divertChecked: false, state: 'ok', bornAt: 0 });
  sim.boxes.push({ id: 2, convId: 'fast', p: [0.0, 0], v: [1.0, 0], offTrack: false, divert: false, divertChecked: false, state: 'ok', bornAt: 0 });
  let touched = false;
  for (let i = 0; i < 600; i++) { sim.step(1 / 60); if (sim.stats.contacts > 0) touched = true; }
  check('al frenar la línea, las cajas chocan (contacto)', touched, 'nunca hubo contacto');
}

// ---------- 4) derrape en curva: empuje fuerte + guía débil -> la caja se sale ----------
{
  const model = { meta: {}, conveyors: [
    { id: 'arc', width: 0.6, speed: 3.5, geom: { type: 'arc', center: [0, 0], radius: 1.5, a0: 0, a1: Math.PI } },
  ] };
  // guía débil: la fuerza de riel no alcanza para el v²/R alto -> derrape
  const sim = new BoxFlowSim(model, { seed: 9, cfg: { railMax: 2.5, derailPen: 0.06 } });
  const p0 = sim.conveyors[0].path.pointAt(0.2);
  const d0 = sim.conveyors[0].path.dirAt(0.2);
  sim.boxes.push({ id: 1, convId: 'arc', p: [p0[0], p0[1]], v: [d0[0] * 3.5, d0[1] * 3.5], offTrack: false, divert: false, divertChecked: false, state: 'ok', bornAt: 0 });
  sim.run(2.5);
  check('caja rápida en curva con guía débil -> derrapa', sim.stats.derailed > 0 || sim.boxes.some(b => b.offTrack), 'no derrapó');
}

// ---------- 5) curva estable: a velocidad nominal la caja NO se sale ----------
{
  const model = { meta: {}, conveyors: [
    { id: 'arc', width: 0.6, speed: 0.6, geom: { type: 'arc', center: [0, 0], radius: 3, a0: 0, a1: Math.PI / 3 } },
  ] };
  const sim = new BoxFlowSim(model, { seed: 2 });
  const p0 = sim.conveyors[0].path.pointAt(0.1);
  const d0 = sim.conveyors[0].path.dirAt(0.1);
  sim.boxes.push({ id: 1, convId: 'arc', p: [p0[0], p0[1]], v: [d0[0] * 0.6, d0[1] * 0.6], offTrack: false, divert: false, divertChecked: false, state: 'ok', bornAt: 0 });
  sim.run(3);
  check('a velocidad nominal la curva NO derrapa', sim.stats.derailed === 0, `derailed=${sim.stats.derailed}`);
}

// ---------- 6) desvío: con frac alto, parte del flujo toma la salida a 30° ----------
{
  const sim = new BoxFlowSim(buildBehaviorLine({ rate: 2500, divertFrac: 0.8 }), { seed: 4 });
  sim.run(60);
  check('el desviador manda cajas a la salida 30°', sim.stats.diverted > 0, `diverted=${sim.stats.diverted}`);
}

console.log(`\n${passed} ok, ${failed} fail`);
process.exit(failed ? 1 : 0);
