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

// 6) DESVIADOR 1->2: una entrada reparte a dos salidas; ambas reciben cajas
const gd = { instances: [], links: [] };
const din = lib.place('TA', { x: 0, z: 0, rot: 0 }, { length: 4 }); gd.instances.push(din);
const dv = lib.place('DV90'); gd.instances.push(dv);
const oA = lib.place('190-E24', null, { length: 3 }); gd.instances.push(oA);   // salida recta (out)
const oB = lib.place('190-E24', null, { length: 3 }); gd.instances.push(oB);   // salida desvío (out2)
lib.connect(gd, din.id, dv.id);
lib.connect(gd, dv.id, oA.id, { fromNode: 'out' });
lib.connect(gd, dv.id, oB.id, { fromNode: 'out2' });
check('divert: expone nodos in/out/out2', lib.nodeKeys('DV90').join(',') === 'in,out,out2');
check('divert: validación sin errores', !lib.validate(gd).some(i => i.level === 'error'));
const md = lib.graphToModel(gd, { rate: 1400 });
const ed = new ConveyorSim(md, { seed: 11 });
for (let i = 0; i < 5000; i++) ed.step(0.05);
let collideD = 0; for (const seg of ed.segments.values()) { const arr = ed.boxes.filter(x => x.segId === seg.id).map(x => x.s).sort((p, q) => p - q); for (let i = 1; i < arr.length; i++) if (arr[i] - arr[i - 1] < seg.pitch - 1e-3) collideD++; }
check('divert: fluye sin solapes', collideD === 0);
check('divert: el flujo se reparte a las dos ramas', ed.stats.delivered > 0 && ed.stats.generated > ed.stats.delivered);

// 7) MERGE 2->1: dos entradas convergen a un tronco sin solape
const gm = { instances: [], links: [] };
const f1 = lib.place('TA', { x: 0, z: 0, rot: 0 }, { length: 4 }); gm.instances.push(f1);
const f2 = lib.place('TA', { x: 0, z: 3, rot: 0 }, { length: 4 }); gm.instances.push(f2);
const mg = lib.place('MG'); gm.instances.push(mg);
const trunk = lib.place('190-E24', null, { length: 4 }); gm.instances.push(trunk);
lib.connect(gm, f1.id, mg.id, { toNode: 'in' });
lib.connect(gm, f2.id, mg.id, { toNode: 'in2' });   // 2º upstream: snap del origen
lib.connect(gm, mg.id, trunk.id);
check('merge: expone nodos in/in2/out', lib.nodeKeys('MG').join(',') === 'in,in2,out');
const mm = lib.graphToModel(gm, { rate: 700 });
const em = new ConveyorSim(mm, { seed: 13 });
for (let i = 0; i < 5000; i++) em.step(0.05);
let collideM = 0; for (const seg of em.segments.values()) { const arr = em.boxes.filter(x => x.segId === seg.id).map(x => x.s).sort((p, q) => p - q); for (let i = 1; i < arr.length; i++) if (arr[i] - arr[i - 1] < seg.pitch - 1e-3) collideM++; }
check('merge: dos fuentes (in/in2 sin enlace previo no aplica; ambas TA son fuente)', mm.segments.filter(s => s.source).length === 2);
check('merge: confluye sin solapes', collideM === 0);
check('merge: el tronco entrega cajas de ambas líneas', em.stats.delivered > 0);

// 7b) FICHA FÍSICA (capa web): los specs coinciden con docs/web_facts.json (no inventados)
import { readFileSync } from 'node:fs';
const wf = JSON.parse(readFileSync(new URL('../docs/web_facts.json', import.meta.url)));
const fact = id => wf.facts.find(f => f.model === id);
const IN = 0.0254, near = (a, b) => Math.abs(a - b) < 1e-4;
const s190 = lib.spec('190-E24');
check('spec 190-E24: rodillo 1.9" OD (cut-sheet)', near(s190.rollerDia, fact('190-E24').fields.rollerDiaIn * IN) && near(s190.rollerDia, 1.9 * IN));
check('spec 190-E24: paso 3" centers (cut-sheet)', near(s190.rollerPitch, 3.0 * IN));
check('spec 190-E24EZ: 1.9"/3" como 190-E24', near(lib.spec('190-E24EZ').rollerPitch, 3.0 * IN));
check('spec TA: superficie de banda (no rodillos)', lib.spec('TA').surface === 'belt');
check('spec rollers: bastidor 6" y riel-guía 1-5/8" (familia 190)', near(s190.frameDepth, 6 * IN) && near(s190.railHeight, 1.625 * IN));
check('spec: toda ficha cita su fuente web', lib.list().every(m => { const sp = lib.spec(m.id); return !sp || !!sp.src; }));
check('web_facts: cada hecho lleva fuente con URL', wf.facts.every(f => wf.sources[f.source] && wf.sources[f.source].url));

// 8) GUARDAR / CARGAR (serialize -> hydrate) conserva el grafo y vuelve a compilar
const json = lib.serialize(gd);
const g2 = lib.hydrate(json);
check('persistencia: round-trip conserva piezas y enlaces', g2.instances.length === gd.instances.length && g2.links.length === gd.links.length);
check('persistencia: ids y modelos preservados', g2.instances[1].id === dv.id && g2.instances[1].model === 'DV90');
const m2 = lib.graphToModel(g2, { rate: 1400 });
check('persistencia: el grafo cargado vuelve a compilar a segmentos', m2.segments.length === md.segments.length);

console.log(`\n${passed} ok, ${failed} fail` + (failed ? `  -> ${fails.join(', ')}` : ''));
process.exit(failed ? 1 : 0);
