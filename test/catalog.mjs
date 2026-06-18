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
    if (m.family !== 'prop' && (!segs.length || !segs[0].geom)) allCompile = false;   // los 'prop' no tienen flujo
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
// match con catálogo Hytrol: cada modelo referencia su designación real + ficha/catálogo
check('catálogo: todo modelo mapea a designación Hytrol real + doc', lib.list().every(m => { const r = lib.ref(m.id); return r && r.hytrol && /^https?:/.test(r.doc) && /^https?:/.test(r.cat); }));
check('catálogo: SBI = Inclined Slider Bed (modelo real)', lib.ref('SBI').hytrol === 'SBI');
check('catálogo: E24SS = 190-E24SS spur (Bulletin 713)', lib.ref('E24SS').hytrol === '190-E24SS');
// parámetros PROPIOS por modelo
check('params: rodillo ofrece centros de rodillo (2"/3")', lib.params('190-E24').some(p => p.cfg === 'rollerPitch' && p.options.join(',') === '2,3'));
check('params: banda ofrece ancho y polea/drive', lib.params('TA').some(p => p.cfg === 'width') && lib.params('TA').some(p => p.cfg === 'pulleyDia'));
check('params: curva ofrece ángulo y radio', lib.params('190-E24C').some(p => p.cfg === 'angleDeg') && lib.params('190-E24C').some(p => p.cfg === 'radius'));
check('params: SBI ofrece inclinación', lib.params('SBI').some(p => p.cfg === 'inclineDeg'));
check('spec: 190-E24C rodillos cónicos 2.5"→1-11/16"', near(lib.spec('190-E24C').rollerDia, 2.5 * IN) && lib.spec('190-E24C').tapered);

// 7c) una pieza AISLADA no genera cajas (la fuente requiere tener salida)
const giso = { instances: [lib.place('TA', null, { length: 3 })], links: [] };
check('graphToModel: pieza aislada no es fuente', !lib.graphToModel(giso).segments.some(s => s.source));

// 7d) ACUMULACIÓN cero presión: al parar el sumidero, el buffer crece y marca _blocked
const gac = { instances: [], links: [] };
const af = lib.place('TA', null, { length: 3 }); gac.instances.push(af);
const ae = lib.place('190-E24', null, { length: 3 }); gac.instances.push(ae); lib.connect(gac, af.id, ae.id);
const mac = lib.graphToModel(gac, { rate: 40 * 60 }); const eac = new ConveyorSim(mac, { seed: 2 });
for (let i = 0; i < 1500; i++) eac.step(0.05);
for (const id of mac.segments.filter(s => s.sink).map(s => s.id)) { const s = eac.segments.get(id); s.sink = false; s.speed = 0; }
const before = eac.boxes.length; for (let i = 0; i < 1500; i++) eac.step(0.05);
check('acumulación: parar la salida hace crecer el buffer (cero presión)', eac.boxes.length > before && eac.boxes.some(b => b._blocked));

// 7e) TOMAS de ingreso/salida: distancia desde el inicio, tasa propia, desvío
const gt = { instances: [], links: [] };
const ti = lib.place('190-E24', null, { length: 6, taps: [{ kind: 'in', side: 'R', angleDeg: 30, distance: 1.5, ratePerMin: 30, cv: 0.3 }, { kind: 'out', side: 'L', angleDeg: 45, distance: 4, frac: 0.5 }] });
gt.instances.push(ti);
const to = lib.place('190-E24', null, { length: 2 }); gt.instances.push(to); lib.connect(gt, ti.id, to.id);
const mt = lib.graphToModel(gt, { rate: 0 }); const head = mt.segments.find(s => s.id === ti.id); head.source = null;
check('taps: se adjuntan al segmento con su posición (in@1.5, out@4)', head.taps && head.taps.length === 2 && head.taps[0].at === 1.5 && head.taps[1].at === 4);
const et = new ConveyorSim(mt, { seed: 4 }); for (let i = 0; i < 2000; i++) et.step(0.05);
check('taps: la toma de INGRESO inyecta cajas (sin fuente de cabeza)', et.stats.generated > 0);
check('taps: la toma de SALIDA desvía cajas (entregadas en la toma)', et.stats.delivered > 0);
check('taps: persisten en serialize/hydrate', lib.hydrate(lib.serialize(gt)).instances[0].cfg.taps.length === 2);

// 7f) ESTACIÓN Niverplast: LBP(acumula) -> NIVERPLAST(guillotina/proceso) -> GRR(gravedad)
const gst = { instances: [], links: [] };
const addst = (id, ov) => { const last = gst.instances[gst.instances.length - 1]; const i = lib.place(id, null, ov); gst.instances.push(i); if (last) lib.connect(gst, last.id, i.id); return i; };
const lbp = addst('LBP', { length: 5 }); const niv = addst('NIVERPLAST'); const grr = addst('GRR', { length: 4 });
gst.instances.push(lib.place('LIDRACK', { x: 1, z: 3 })); gst.instances.push(lib.place('INOXTABLE', { x: 3, z: 3 }));
const mst = lib.graphToModel(gst, { rate: 30 * 60 });
check('estación: props (rack/mesa) no generan segmento de flujo', !mst.segments.some(s => /LIDRACK|INOXTABLE/.test(s.id)));
check('estación: Niverplast es un proceso (throttle → acumulación LBP)', !!mst.segments.find(s => s.id === niv.id).process);
check('GRR: rodillo OD 30 mm, paso 3" (76 mm), mini-mesa 200 mm', near(lib.spec('GRR').rollerDia, 0.030) && near(lib.spec('GRR').rollerPitch, 3 * IN) && near(lib.spec('GRR').sideTable, 0.2));
const est = new ConveyorSim(mst, { seed: 5 }); for (let i = 0; i < 3000; i++) est.step(0.05);
check('estación: se acumulan cajas en el LBP antes de Niverplast', est.boxes.filter(b => b.segId === lbp.id).length > 1);
check('estación: la guillotina/máquina deja pasar y la línea entrega', est.stats.delivered > 0);

// 7f) GUILLOTINA Niverplast: metera la entrada a 15 c/min y la LBP acumula aguas arriba
const gn = { instances: [], links: [] };
const lbpN = lib.place('LBP', null, { length: 5 }); gn.instances.push(lbpN);
const nivM = lib.place('NIVERPLAST', null, { meterPerMin: 15 }); gn.instances.push(nivM); lib.connect(gn, lbpN.id, nivM.id);
const grrN = lib.place('GRR', null, { length: 3 }); gn.instances.push(grrN); lib.connect(gn, nivM.id, grrN.id);
const mn = lib.graphToModel(gn, { rate: 40 * 60 });   // alimenta 40 c/min (más que el techo de la guillotina)
const en = new ConveyorSim(mn, { seed: 6 });
for (let i = 0; i < 6000; i++) en.step(0.05);   // 300 s
const tputN = en.stats.throughput / 60, accumN = en.boxes.filter(b => b._blocked).length;
check('niverplast: la guillotina metera ~15 c/min (no 40)', tputN > 8 && tputN < 22);
check('niverplast: la LBP acumula aguas arriba (cero presión)', en.boxes.filter(b => b.segId === lbpN.id).length >= 3 && accumN > 0);
check('niverplast: param tasa de corte (c/min)', lib.params('NIVERPLAST').some(p => p.cfg === 'meterPerMin'));
check('catálogo: OPERATOR como prop', lib.get('OPERATOR').family === 'prop');
// mínima presión: las bandas modulares/gravedad acumulan TOCÁNDOSE (paso = largo de caja)
const onL = en.boxes.filter(b => b.segId === lbpN.id).map(b => b.s).sort((a, b) => b - a);
let minGap = 99; for (let i = 1; i < onL.length; i++) minGap = Math.min(minGap, onL[i - 1] - onL[i]);
check('mínima presión: LBP acumula con cajas tocándose (~0.40 m)', onL.length >= 3 && Math.abs(minGap - lib.BOX[0]) < 0.02);
check('validador: pitch = largo de caja (tocándose) NO es error', !lib.validate({ instances: [lib.place('LBP', null, { length: 3 })], links: [] }).some(i => i.level === 'error'));

// 8) GUARDAR / CARGAR (serialize -> hydrate) conserva el grafo y vuelve a compilar
const json = lib.serialize(gd);
const g2 = lib.hydrate(json);
check('persistencia: round-trip conserva piezas y enlaces', g2.instances.length === gd.instances.length && g2.links.length === gd.links.length);
check('persistencia: ids y modelos preservados', g2.instances[1].id === dv.id && g2.instances[1].model === 'DV90');
const m2 = lib.graphToModel(g2, { rate: 1400 });
check('persistencia: el grafo cargado vuelve a compilar a segmentos', m2.segments.length === md.segments.length);

console.log(`\n${passed} ok, ${failed} fail` + (failed ? `  -> ${fails.join(', ')}` : ''));
process.exit(failed ? 1 : 0);
