// harness.mjs — Validación headless del motor (sin navegador ni dependencias).
//
//   node test/harness.mjs
//
// Comprueba los comportamientos documentados en docs/principles.md. Si algo se
// rompe, el motor no debe usarse para trabajo visual hasta arreglarlo.

import { makePath } from '../src/geometry.js';
import { ConveyorSim } from '../src/engine.js';

let passed = 0, failed = 0;
const fails = [];
function check(name, cond) {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL  ${name}`); }
}
function approx(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }

// ---------- geometría ----------
const line = makePath({ type: 'straight', from: [0, 0], to: [10, 0] });
check('recta: longitud correcta', approx(line.length, 10));
check('recta: pointAt en el medio', approx(line.pointAt(5)[0], 5) && approx(line.pointAt(5)[1], 0));
check('recta: dirAt unitario', approx(Math.hypot(...line.dirAt(0)), 1));

const a = makePath({ type: 'arc', center: [0, 0], radius: 2, a0: 0, a1: Math.PI / 2 });
check('arco: longitud = r*Δθ', approx(a.length, 2 * (Math.PI / 2)));
check('arco: punto final ~ (0, r)', approx(a.pointAt(a.length)[0], 0, 1e-6) && approx(a.pointAt(a.length)[1], 2, 1e-6));

const poly = makePath({ type: 'polyline', points: [[0, 0], [3, 0], [3, 4]] });
check('polilínea: longitud = suma de tramos', approx(poly.length, 7));

// ---------- modelo base para el motor ----------
function baseModel(extra = {}) {
  return {
    meta: { name: 'test', boxSize: [0.4, 0.13, 0.3] },
    segments: [
      { id: 'in', geom: { type: 'straight', from: [0, 0], to: [10, 0] }, height: 0.9,
        speed: 0.5, pitch: 0.5, source: { rate: 3600, cv: 0.0, ...(extra.source || {}) }, next: ['out'] },
      { id: 'out', geom: { type: 'straight', from: [10, 0], to: [20, 0] }, height: 0.9,
        speed: 0.5, pitch: 0.5, sink: true },
    ],
  };
}

// ---------- generación ----------
let sim = new ConveyorSim(baseModel());
sim.run(5);
check('fuente: genera cajas', sim.stats.generated > 0);
check('fuente: cajas en sistema > 0', sim.stats.inSystem > 0);

// tope de cajas en circulación
sim = new ConveyorSim(baseModel({ source: { rate: 100000, max: 5 } }));
sim.run(10);
check('fuente: respeta el tope max', sim.stats.inSystem <= 5);

// ---------- cero presión ----------
// fuente rápida contra un sink lento aguas abajo: las cajas se acumulan sin solaparse
const jam = {
  meta: { name: 'jam', boxSize: [0.4, 0.13, 0.3] },
  segments: [
    { id: 'feed', geom: { type: 'straight', from: [0, 0], to: [10, 0] }, height: 0.9,
      speed: 1.0, pitch: 0.5, source: { rate: 100000, cv: 0 }, next: ['slow'] },
    { id: 'slow', geom: { type: 'straight', from: [10, 0], to: [12, 0] }, height: 0.9,
      speed: 0.05, pitch: 0.5, sink: true },
  ],
};
sim = new ConveyorSim(jam);
sim.run(20);
let minGap = Infinity;
const feed = sim.segments.get('feed');
const arr = sim.boxes.filter(b => b.segId === 'feed').map(b => b.s).sort((x, y) => x - y);
for (let i = 1; i < arr.length; i++) minGap = Math.min(minGap, arr[i] - arr[i - 1]);
check('cero presión: ninguna caja invade el pitch', arr.length < 2 || minGap >= 0.5 - 1e-3);
check('cero presión: hay acumulación real', arr.length >= 3);

// ---------- transferencias con hueco ----------
sim = new ConveyorSim(baseModel());
sim.run(60);
// no debe haber dos cajas exactamente en s=0 del mismo tramo (singulación)
const atStart = sim.boxes.filter(b => b.segId === 'out' && b.s < 1e-6).length;
check('transferencia: singula al entrar (no apila en s=0)', atStart <= 1);
check('entrega: llegan cajas al sink', sim.stats.delivered > 0);

// ---------- proceso con fatiga ----------
const proc = {
  meta: { name: 'proc', boxSize: [0.4, 0.13, 0.3] },
  segments: [
    { id: 'in', geom: { type: 'straight', from: [0, 0], to: [6, 0] }, height: 0.9,
      speed: 0.5, pitch: 0.5, source: { rate: 2000, cv: 0.1 }, next: ['work'] },
    { id: 'work', geom: { type: 'straight', from: [6, 0], to: [14, 0] }, height: 0.9,
      speed: 0.5, pitch: 0.5, process: { at: 3, time: 1.5, operators: 2 }, next: ['out'] },
    { id: 'out', geom: { type: 'straight', from: [14, 0], to: [18, 0] }, height: 0.9,
      speed: 0.5, pitch: 0.5, sink: true },
  ],
};
sim = new ConveyorSim(proc);
sim.run(60);
const station = sim.segments.get('work')._station;
check('proceso: la estación completa trabajo', station.completed > 0);
check('proceso: acumula fatiga', station.fatigue > 0);
check('proceso: deja pasar cajas tras procesar', sim.stats.delivered > 0);

// ---------- cuellos de botella ----------
sim = new ConveyorSim(jam);
sim.run(30);
const bn = sim.bottlenecks(0.5);
check('cuellos: detecta acumulación', bn.length > 0);

// ---------- determinismo ----------
const s1 = new ConveyorSim(baseModel(), { seed: 7 }); s1.run(10);
const s2 = new ConveyorSim(baseModel(), { seed: 7 }); s2.run(10);
check('determinismo: misma semilla -> mismo resultado', s1.stats.generated === s2.stats.generated && s1.stats.delivered === s2.stats.delivered);

// ---------- frame() ----------
const fr = sim.frame();
check('frame: expone cajas, tramos y stats', Array.isArray(fr.boxes) && Array.isArray(fr.segments) && !!fr.stats);

console.log(`\n${passed} ok, ${failed} fail` + (failed ? `  -> ${fails.join(', ')}` : ''));
process.exit(failed ? 1 : 0);
