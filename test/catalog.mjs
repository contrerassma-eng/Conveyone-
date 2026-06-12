// catalog.mjs — Validación headless de la biblioteca de conveyors (catálogo Hytrol 24",
// place/connect/validate/graphToModel) sobre el motor real. Sin navegador.
//
//   node test/catalog.mjs

import { createConveyorLibrary } from '../src/catalog.js';
import { createSimulator } from '../src/index.js';
import { ConveyorSim } from '../src/engine.js';

let passed = 0, failed = 0; const fails = [];
const check = (name, cond) => { if (cond) { passed++; console.log(`  ok  ${name}`); } else { failed++; fails.push(name); console.log(`FAIL  ${name}`); } };

const lib = createConveyorLibrary();

// 1) cada modelo del catálogo se coloca y compila a segmentos con geometría válida
let allCompile = true, allNodes = true;
for (const m of lib.list()) {
  try {
    const inst = lib.place(m.id, { x: 0, z: 0, rot: 0 });
    const segs = lib.graphToModel({ instances: [inst], links: [] }).segments;
    if (!segs.length || !segs[0].geom) allCompile = false;
    if (!inst.nodes || !inst.nodes.in || !inst.nodes.out) allNodes = false;
    // el motor debe poder compilar el modelo de una sola pieza
    new ConveyorSim({ meta: { boxSize: lib.BOX }, segments: segs }, { seed: 1 });
  } catch (e) { allCompile = false; console.log('   compile error', m.id, e.message); }
}
check(`catálogo: los ${lib.list().length} modelos se colocan y compilan`, allCompile);
check('catálogo: todo modelo expone nodos in/out', allNodes);
check('catálogo: incluye los Hytrol pedidos', ['E24CT', 'E34EZCT', '190-E24', '190-E24EZ', 'TA', 'SBI', 'LBP', 'E24SS', 'T90', 'T30'].every(id => lib.list().some(m => m.id === id)));

// 2) connect con snap deja el empalme coincidente (continuidad C0)
const g = { instances: [], links: [] };
const a = lib.place('TA', { x: 0, z: 0, rot: 0 }, { length: 6 }); g.instances.push(a);
const t = lib.place('T90', { x: 0, z: 0, rot: 0 }); g.instances.push(t);
const b = lib.place('190-E24', { x: 0, z: 0, rot: 0 }, { length: 3 }); g.instances.push(b);
lib.connect(g, a.id, t.id); lib.connect(g, t.id, b.id);
const cont1 = Math.hypot(a.nodes.out.p[0] - t.nodes.in.p[0], a.nodes.out.p[1] - t.nodes.in.p[1]);
const cont2 = Math.hypot(t.nodes.out.p[0] - b.nodes.in.p[0], t.nodes.out.p[1] - b.nodes.in.p[1]);
check('connect+snap: empalmes coincidentes (<1 mm)', cont1 < 1e-3 && cont2 < 1e-3);
check('T90: gira el flujo ~90°', Math.abs(Math.abs(t.nodes.out.dir - t.nodes.in.dir) - Math.PI / 2) < 1e-6);

// 3) validador atrapa configs imposibles
const badPitch = { instances: [lib.place('TA', null, { pitch: 0.2 })], links: [] };
check('validador: pitch < caja+gap = error', lib.validate(badPitch).some(i => i.level === 'error' && /pitch/.test(i.msg)));
const badIncline = { instances: [lib.place('TA', null, { entryHeight: 0.9, exitHeight: 2.5, length: 4 })], links: [] };
check('validador: inclinación sobre el tope de la banda = error', lib.validate(badIncline).some(i => i.level === 'error' && /inclinaci/.test(i.msg)));
const okSBI = { instances: [lib.place('SBI', null, { entryHeight: 0.9, exitHeight: 1.8, length: 6 })], links: [] };
check('validador: SBI inclinada dentro de su tope = sin error', !lib.validate(okSBI).some(i => i.level === 'error'));
const goodGraph = { instances: [a, t, b], links: g.links };
check('validador: grafo conectado y válido = sin errores', !lib.validate(goodGraph).some(i => i.level === 'error'));

// 4) un grafo compilado FLUYE en el motor sin solapes y entrega cajas
const sim = createSimulator();
const model = sim.build(goodGraph, { rate: 900, cv: 0.2 });
const eng = sim.run(model, { seed: 3 });
for (let i = 0; i < 4000; i++) eng.step(0.05);    // 200 s
// no-solape por tramo
let collide = 0;
for (const seg of eng.segments.values()) {
  const arr = eng.boxes.filter(x => x.segId === seg.id).map(x => x.s).sort((p, q) => p - q);
  for (let i = 1; i < arr.length; i++) if (arr[i] - arr[i - 1] < seg.pitch - 1e-3) collide++;
}
check('motor: el grafo Hytrol fluye sin solapes', collide === 0);
check('motor: hay generación y entrega', eng.stats.generated > 0 && eng.stats.delivered > 0);

// 5) graphToModel marca fuente (sin entrada) y sumidero (sin salida) automáticamente
check('graphToModel: 1ª pieza es fuente', !!model.segments.find(s => s.id === a.id).source);
check('graphToModel: última pieza es sumidero', !!model.segments.find(s => s.id === b.id).sink);

console.log(`\n${passed} ok, ${failed} fail` + (failed ? `  -> ${fails.join(', ')}` : ''));
process.exit(failed ? 1 : 0);
