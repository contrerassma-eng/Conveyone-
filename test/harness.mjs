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

// ---------- clasificador Intralox 4500 + Virtual Pocket ----------
import { buildSorter4500 } from '../src/layouts.js';

// capacidades configuradas
let sorter = new ConveyorSim(buildSorter4500(), { seed: 3 });
let mainCap = 0;
for (const s of sorter.segments.values()) if (/^main/.test(s.id)) mainCap += Math.floor(s.length / s.pitch);
check('sorter: capacidad de línea principal = 60', mainCap === 60);
const bufCaps = sorter.frame().buffers.map(b => b.cap);
check('sorter: cada buffer tiene capacidad 20', bufCaps.length === 6 && bufCaps.every(c => c === 20));

sorter.run(180);
const sf = sorter.frame();

// clasificación por color: cada buffer solo contiene su color
let pureLanes = true;
for (const seg of sorter.segments.values()) {
  if (!seg.pocketBuffer) continue;
  for (const b of sorter.boxes) if (b.segId === seg.id && b.color !== seg.color) pureLanes = false;
}
check('sorter: cada salida acumula solo su color', pureLanes);
check('sorter: las fuentes asignan color a las cajas', sorter.boxes.every(b => b.segId === 'infeed' || b.color != null));

// buffer de cero presión: nunca excede su capacidad (+1 = caja en el extremo saliendo)
const overCap = sf.buffers.some(b => b.count > b.cap + 1);
check('sorter: el buffer respeta la capacidad (cero presión)', !overCap);

// virtual pocket: libera y reparte por la receta cíclica (3 por color)
check('virtual pocket: libera cajas a la salida', sf.stats.released > 0);
const counts = Object.values(sf.pocket.byColor);
const spread = Math.max(...counts) - Math.min(...counts);
check('virtual pocket: receta cíclica reparte parejo entre colores', counts.length === 6 && spread <= 3);

// receta "todo junto": un solo lote de cualquier color
const together = new ConveyorSim(buildSorter4500({ pocket: { loop: true, steps: [{ color: ['red', 'blue', 'green', 'yellow', 'orange', 'purple'], qty: 12 }] } }), { seed: 5 });
together.run(120);
check('virtual pocket: receta "todo junto" libera en lote', together.frame().stats.released > 0);

// receta que ignora un color -> ese buffer se llena y rebosa al rechazo
const partial = new ConveyorSim(buildSorter4500({ pocket: { loop: true, steps: [{ color: 'red', qty: 5 }] } }), { seed: 9 });
partial.run(300);
check('sorter: color no demandado se acumula y rebosa (rejected>0)', partial.frame().stats.rejected > 0);

// ---------- sistema con buffers verticales + elevadores (Kímarox) ----------
import { buildBufferedSorter } from '../src/layouts.js';

// geometría vertical: un elevador (lift) cambia la altura
const vlift = makePath({ type: 'lift', at: [0, 0], h0: 0.9, h1: 3.0 });
check('elevador: longitud = recorrido vertical', approx(vlift.length, 2.1, 1e-6));

let bs = new ConveyorSim(buildBufferedSorter({ outputs: 6 }), { seed: 4 });
// niveles de buffer: 4 por salida con capacidad 15
const lvlCaps = bs.frame().buffers; // incluye los _zp; filtremos los niveles
let lvl0 = null;
for (const seg of bs.segments.values()) if (seg.id === 'o0_lvl0') lvl0 = Math.round(seg.length / seg.pitch);
check('buffer vertical: cada nivel tiene capacidad 15', lvl0 === 15);
let nLevels = 0;
for (const seg of bs.segments.values()) if (/^o0_lvl\d+$/.test(seg.id)) nLevels++;
check('buffer vertical: 4 niveles por salida', nLevels === 4);
let nElev = 0;
for (const seg of bs.segments.values()) if (seg.elevator) nElev++;
check('elevadores: subida y descenso por salida (2 × 6)', nElev === 12);

bs.run(300);
const bf = bs.frame();
// las cajas alcanzan alturas de los niveles (transporte vertical real)
const maxY = Math.max(...bf.boxes.map(b => b.y), 0);
check('transporte vertical: las cajas suben por encima de 0.9 m', maxY > 1.1);
// un elevador nunca tiene más de una caja
let elevMax = 0;
for (const seg of bs.segments.values()) if (seg.elevator) {
  const c = bs.boxes.filter(b => b.segId === seg.id).length;
  elevMax = Math.max(elevMax, c);
}
check('elevador: capacidad de una sola caja', elevMax <= 1);
check('sistema: el Virtual Pocket libera tras subir, bufferizar y bajar', bf.stats.released > 0);
// los elevadores cíclicos son cuello (limitan el flujo) -> aparecen en cuellos o el buffer llena
check('sistema: detecta cuellos (elevadores/buffer)', bf.bottlenecks.length > 0);

// salidas regulables
const bs3 = new ConveyorSim(buildBufferedSorter({ outputs: 3 }), { seed: 2 });
let zpCount = 0;
for (const seg of bs3.segments.values()) if (/^o\d+_zp$/.test(seg.id)) zpCount++;
check('sistema: cantidad de salidas regulable (outputs=3)', zpCount === 3);

console.log(`\n${passed} ok, ${failed} fail` + (failed ? `  -> ${fails.join(', ')}` : ''));
process.exit(failed ? 1 : 0);
