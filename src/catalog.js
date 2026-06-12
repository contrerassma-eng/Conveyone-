// catalog.js — Biblioteca paramétrica de transportadores (base Hytrol 24") + la función
// callable `createConveyorLibrary()` que da acceso a todos los recursos del motor para
// armar modelos a partir de un GRAFO de instancias conectadas por nodos.
//
// Honestidad de datos: los anchos/velocidades por defecto son valores razonables de
// industria para equipo 24" (rodillo 1.9" = 0.048 m, BF ~22", 30–120 fpm = 0.15–0.6 m/s).
// NO provienen de las hojas de corte exactas de Hytrol; afínalos contra el cut-sheet real
// del modelo cuando dimensiones en serio. Cada modelo declara su FAMILIA cinemática, que
// es lo que el motor entiende; el nombre comercial es una etiqueta + presets.
//
// Uso mínimo:
//   import { createConveyorLibrary } from './catalog.js';
//   const lib = createConveyorLibrary();
//   const g = { instances: [], links: [] };
//   g.instances.push(lib.place('TA',  { x:0,  z:0, rot:0 }, { length:6 }));
//   g.instances.push(lib.place('T90', null,               { }));      // se autoconecta por nodos
//   lib.connect(g, g.instances[0].id, g.instances[1].id);             // out de A -> in de B (con snap)
//   const issues = lib.validate(g);                 // reglas de diseño (pitch, inclinación, ...)
//   const model  = lib.graphToModel(g);             // { meta, segments } -> new ConveyorSim(model)

const FPM = 0.00508;            // 1 pie/min = 0.00508 m/s (para traducir velocidades comerciales)
const IN = 0.0254;             // 1 pulgada
const W24 = 24 * IN;           // ancho nominal 24"  ≈ 0.61 m
const ROLLER19 = 1.9 * IN;     // rodillo Ø1.9"      ≈ 0.048 m
const BOX = [0.40, 0.13, 0.30];// caja de referencia [largo, alto, ancho] (m)
const GAP_MIN = 0.05;          // holgura mínima entre cajas (cero presión)

// ───────────────────────── FAMILIAS cinemáticas (lo que el motor entiende) ─────────────
// Cada familia sabe construir su(s) segmento(s) y sus nodos in/out a partir de una pose
// {x,z,rot} y una config {length,width,speed,pitch,entryHeight,exitHeight,angleDeg,radius}.
const FAMILIES = {
  // Recta: banda o rodillo en línea. Inclina si entryHeight≠exitHeight.
  straight: {
    nodes(pose, c) {
      const d = dirOf(pose.rot), a = [pose.x, pose.z];
      const b = [a[0] + c.length * d[0], a[1] + c.length * d[1]];
      return { in: { p: a, dir: pose.rot }, out: { p: b, dir: pose.rot } };
    },
    segments(id, pose, c) {
      const n = this.nodes(pose, c);
      return [{ id, geom: { type: 'straight', from: n.in.p, to: n.out.p },
        height: [c.entryHeight, c.exitHeight], speed: c.speed, pitch: c.pitch }];
    },
  },
  // Curva (banda modular LBP / curva 190): arco de `angleDeg`, radio = radius. Plana.
  curve: {
    nodes(pose, c) {
      const a = [pose.x, pose.z], sweep = deg(c.angleDeg) * (c.cw ? -1 : 1);
      const nrm = c.cw ? [Math.sin(pose.rot), -Math.cos(pose.rot)] : [-Math.sin(pose.rot), Math.cos(pose.rot)];
      const center = [a[0] + c.radius * nrm[0], a[1] + c.radius * nrm[1]];
      const a0 = Math.atan2(a[1] - center[1], a[0] - center[0]);
      const a1 = a0 + sweep;
      const out = [center[0] + c.radius * Math.cos(a1), center[1] + c.radius * Math.sin(a1)];
      return { in: { p: a, dir: pose.rot }, out: { p: out, dir: pose.rot + sweep }, _center: center, _a0: a0, _a1: a1 };
    },
    segments(id, pose, c) {
      const n = this.nodes(pose, c);
      return [{ id, geom: { type: 'arc', center: n._center, radius: c.radius, a0: n._a0, a1: n._a1 },
        height: c.entryHeight, speed: c.speed, pitch: c.pitch }];
    },
  },
  // Transferencia (90°/30°/E24SS): tramo corto que GIRA el flujo `angleDeg`. Plana.
  transfer: {
    nodes(pose, c) {
      const a = [pose.x, pose.z], d0 = dirOf(pose.rot), half = c.length / 2;
      const mid = [a[0] + half * d0[0], a[1] + half * d0[1]];
      const r1 = pose.rot + deg(c.angleDeg) * (c.cw ? -1 : 1);
      const d1 = dirOf(r1), out = [mid[0] + half * d1[0], mid[1] + half * d1[1]];
      return { in: { p: a, dir: pose.rot }, out: { p: out, dir: r1 }, _mid: mid };
    },
    segments(id, pose, c) {
      const n = this.nodes(pose, c);
      return [{ id, geom: { type: 'polyline', points: [n.in.p, n._mid, n.out.p] },
        height: c.entryHeight, speed: c.speed, pitch: c.pitch }];
    },
  },
};

// ───────────────────────── CATÁLOGO (modelos comerciales 24") ─────────────────────────
// kind: etiqueta de comportamiento real (transporte/acumulación/...). family: cinemática.
// defaults: config por defecto. caps: límites de diseño (para el validador).
const CATALOG = [
  { id: 'E24CT',   label: 'E24CT · Rodillo motorizado 24V (transporte)', group: 'Rodillo MDR (24V)',
    kind: 'roller', family: 'straight',
    defaults: { length: 3.05, width: W24, speed: 60 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9 },
    caps: { maxInclineDeg: 0, rollerDia: ROLLER19 },
    note: 'MDR EZ24/E24: rodillo motorizado por zonas. Transporte plano; ZPA con la variante EZ.' },

  { id: 'E34EZCT', label: 'E24EZ · Acumulación EZLogic (cero presión)', group: 'Rodillo MDR (24V)',
    kind: 'accum', family: 'straight',
    defaults: { length: 3.05, width: W24, speed: 45 * FPM, pitch: 0.76, entryHeight: 0.9 },
    caps: { maxInclineDeg: 0, rollerDia: ROLLER19, zone: true },
    note: 'EZLogic: zonas de acumulación sin contrapresión. pitch ≈ largo de zona (0.6–0.9 m).' },

  { id: '190-E24', label: '190-E24 · Rodillo vivo BDLR (transporte)', group: 'Rodillo BDLR (serie 190)',
    kind: 'roller', family: 'straight',
    defaults: { length: 3.05, width: W24, speed: 65 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9 },
    caps: { maxInclineDeg: 0, rollerDia: ROLLER19 },
    note: '190 line-shaft / banda-rodillo vivo (BDLR), accionado a 24V.' },

  { id: '190-E24EZ', label: '190-E24EZ · BDLR acumulación EZLogic', group: 'Rodillo BDLR (serie 190)',
    kind: 'accum', family: 'straight',
    defaults: { length: 3.05, width: W24, speed: 45 * FPM, pitch: 0.76, entryHeight: 0.9 },
    caps: { maxInclineDeg: 0, rollerDia: ROLLER19, zone: true },
    note: '190 con EZLogic: acumulación de cero presión sobre rodillo vivo.' },

  { id: 'TA',  label: 'TA · Banda de cama deslizante (horizontal)', group: 'Banda',
    kind: 'belt', family: 'straight',
    defaults: { length: 6.0, width: W24, speed: 65 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9 },
    caps: { maxInclineDeg: 5, rollerDia: ROLLER19 },
    note: 'Banda lisa de cama deslizante, servicio medio. Mantiene el espaciado de entrada.' },

  { id: 'SBI', label: 'SBI · Banda de cama deslizante inclinada', group: 'Banda',
    kind: 'incline', family: 'straight',
    defaults: { length: 6.0, width: W24, speed: 60 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9, exitHeight: 1.8 },
    caps: { maxInclineDeg: 30, rollerDia: ROLLER19, cleated: true },
    note: 'Inclinación con banda de agarre/tacos hasta ~30°. Exige μ_s ≥ tanθ (validado).' },

  { id: 'LBP', label: 'LBP · Banda modular plástica (baja contrapresión)', group: 'Banda',
    kind: 'belt', family: 'straight',
    defaults: { length: 6.0, width: W24, speed: 60 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9 },
    caps: { maxInclineDeg: 15, rollerDia: ROLLER19, modular: true },
    note: 'Banda modular plástica (LBP). Admite curvas e inclinación moderada.' },

  { id: 'LBP-CURVE', label: 'LBP · Curva de banda modular 90°', group: 'Banda',
    kind: 'belt', family: 'curve',
    defaults: { angleDeg: 90, radius: 1.0, width: W24, speed: 55 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9, cw: false },
    caps: { maxInclineDeg: 0, rollerDia: ROLLER19, modular: true },
    note: 'Curva de banda modular. Sin acumulación ni inclinación dentro de la curva.' },

  { id: 'E24SS', label: 'E24SS · Transferencia de rodillo motorizado', group: 'Transferencias',
    kind: 'transfer', family: 'transfer',
    defaults: { length: 1.2, angleDeg: 90, width: W24, speed: 70 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9, cw: true },
    caps: { maxInclineDeg: 0, rollerDia: ROLLER19 },
    note: 'Transferencia/spur de rodillo motorizado (E24). Ángulo configurable (30°/90°).' },

  { id: 'T90', label: 'Transferencia 90° (pop-up cadena/rodillo)', group: 'Transferencias',
    kind: 'transfer', family: 'transfer',
    defaults: { length: 1.2, angleDeg: 90, width: W24, speed: 70 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9, cw: true },
    caps: { maxInclineDeg: 0, rollerDia: ROLLER19 },
    note: 'Transferencia a 90°. Requiere hueco aguas arriba (singulación).' },

  { id: 'T30', label: 'Transferencia 30° (spur de desvío)', group: 'Transferencias',
    kind: 'transfer', family: 'transfer',
    defaults: { length: 1.5, angleDeg: 30, width: W24, speed: 75 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9, cw: true },
    caps: { maxInclineDeg: 0, rollerDia: ROLLER19 },
    note: 'Spur a 30° para desvío suave a alta tasa.' },
];

// ───────────────────────── helpers de geometría ─────────────────────────
function deg(d) { return (d || 0) * Math.PI / 180; }
function dirOf(rot) { return [Math.cos(rot), Math.sin(rot)]; }
function angleOf(d) { return Math.atan2(d[1], d[0]); }
function dist2(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
function modelById(id) { const m = CATALOG.find(x => x.id === id); if (!m) throw new Error('modelo desconocido: ' + id); return m; }

// fusiona defaults del modelo + overrides; rellena entry/exit height coherentes
function resolveCfg(model, overrides = {}) {
  const c = Object.assign({}, model.defaults, overrides);
  if (c.entryHeight == null) c.entryHeight = 0.9;
  if (c.exitHeight == null) c.exitHeight = c.entryHeight;     // plano salvo que sea inclinado
  if (c.width == null) c.width = W24;
  if (c.cw == null) c.cw = model.defaults.cw != null ? model.defaults.cw : true;
  return c;
}

// ───────────────────────── la función callable ─────────────────────────
let _instSeq = 0;
export function createConveyorLibrary() {
  const api = {
    BOX, GAP_MIN, units: { FPM, IN, W24, ROLLER19 },

    // catálogo
    models: CATALOG,
    list() { return CATALOG.map(m => ({ id: m.id, label: m.label, group: m.group, kind: m.kind, family: m.family })); },
    groups() { const g = {}; for (const m of CATALOG) (g[m.group] = g[m.group] || []).push(m.id); return g; },
    get(id) { return modelById(id); },
    defaults(id) { return resolveCfg(modelById(id)); },

    // crea una INSTANCIA colocada (pose en metros, rot en rad). Devuelve {id,model,family,cfg,pose,nodes}
    place(modelId, pose, overrides) {
      const model = modelById(modelId);
      const cfg = resolveCfg(model, overrides);
      const p = Object.assign({ x: 0, z: 0, rot: 0 }, pose || {});
      const inst = { id: modelId.replace(/[^A-Za-z0-9]/g, '') + '_' + (++_instSeq), model: model.id, family: model.family, kind: model.kind, cfg, pose: p };
      inst.nodes = FAMILIES[model.family].nodes(p, cfg);
      return inst;
    },

    // recalcula nodos tras mover/configurar una instancia
    refresh(inst) { inst.nodes = FAMILIES[inst.family].nodes(inst.pose, inst.cfg); return inst; },

    // conecta out(A) -> in(B); por defecto SNAP: reubica B para que su nodo de entrada
    // coincida con el de salida de A (continuidad C0 en el empalme).
    connect(graph, fromId, toId, opts = {}) {
      const A = graph.instances.find(i => i.id === fromId), B = graph.instances.find(i => i.id === toId);
      if (!A || !B) throw new Error('connect: instancia no encontrada');
      if (opts.snap !== false) {
        B.pose.x = A.nodes.out.p[0]; B.pose.z = A.nodes.out.p[1]; B.pose.rot = A.nodes.out.dir;
        this.refresh(B);
      }
      if (!graph.links) graph.links = [];
      if (!graph.links.some(l => l.from === fromId && l.to === toId)) graph.links.push({ from: fromId, to: toId });
      return graph;
    },
    disconnect(graph, fromId, toId) {
      graph.links = (graph.links || []).filter(l => !(l.from === fromId && l.to === toId)); return graph;
    },

    // VALIDADOR de reglas de diseño (handoff): pitch ≥ caja+gap, inclinación ≤ tope de
    // la familia, sin inclinación dentro de curvas/transferencias, nodos empalmados
    // coincidentes, e instancias sueltas. Devuelve [{level,instId,msg}].
    validate(graph) {
      const issues = [];
      for (const inst of graph.instances) {
        const m = modelById(inst.model), c = inst.cfg;
        if (c.pitch < BOX[0] + GAP_MIN - 1e-6)
          issues.push({ level: 'error', instId: inst.id, msg: `pitch ${c.pitch.toFixed(2)} m < caja ${BOX[0]} + ${GAP_MIN} (cajas se solaparían)` });
        const dh = Math.abs((c.exitHeight ?? c.entryHeight) - c.entryHeight);
        const L = (inst.family === 'straight') ? c.length : 0;
        const incl = L > 0 ? Math.atan2(dh, L) * 180 / Math.PI : (dh > 1e-6 ? 999 : 0);
        if (incl > (m.caps.maxInclineDeg || 0) + 1e-6)
          issues.push({ level: 'error', instId: inst.id, msg: `inclinación ${incl.toFixed(1)}° supera el máximo de ${m.label} (${m.caps.maxInclineDeg || 0}°)` });
        if ((inst.family === 'curve' || inst.family === 'transfer') && dh > 1e-6)
          issues.push({ level: 'error', instId: inst.id, msg: 'no se permite inclinación dentro de una curva/transferencia' });
        const links = (graph.links || []);
        if (!links.some(l => l.from === inst.id || l.to === inst.id))
          issues.push({ level: 'warn', instId: inst.id, msg: 'instancia suelta (sin conexiones)' });
      }
      for (const l of (graph.links || [])) {
        const A = graph.instances.find(i => i.id === l.from), B = graph.instances.find(i => i.id === l.to);
        if (!A || !B) { issues.push({ level: 'error', instId: l.from, msg: 'enlace a instancia inexistente' }); continue; }
        if (dist2(A.nodes.out.p, B.nodes.in.p) > 0.05)
          issues.push({ level: 'warn', instId: B.id, msg: 'empalme no coincidente (>5 cm): usa snap al conectar' });
      }
      return issues;
    },

    // compila el GRAFO a un modelo { meta, segments } para ConveyorSim. Las instancias
    // sin enlace de entrada se vuelven FUENTE; las sin enlace de salida, SALIDA (sink).
    graphToModel(graph, opts = {}) {
      const segments = [];
      const links = graph.links || [];
      const hasIn = id => links.some(l => l.to === id);
      const hasOut = id => links.some(l => l.from === id);
      for (const inst of graph.instances) {
        const segs = FAMILIES[inst.family].segments(inst.id, inst.pose, inst.cfg);
        const head = segs[0], tail = segs[segs.length - 1];
        // encadena segmentos internos (si una familia produjera varios)
        for (let k = 0; k < segs.length - 1; k++) segs[k].next = [segs[k + 1].id];
        // enlaces salientes -> next del último segmento
        const outs = links.filter(l => l.from === inst.id).map(l => l.to);
        tail.next = (tail.next || []).concat(outs);
        // fuente / sumidero automáticos
        if (!hasIn(inst.id)) {
          const rate = (inst.cfg.rate != null ? inst.cfg.rate : (opts.rate != null ? opts.rate : 1200));
          head.source = { rate, cv: opts.cv != null ? opts.cv : 0.3, burst: opts.burst != null ? opts.burst : 0.1, max: opts.max };
        }
        if (!hasOut(inst.id)) tail.sink = true;
        for (const s of segs) segments.push(s);
      }
      return { meta: { name: opts.name || 'builder', boxSize: BOX, rollerDia: ROLLER19, family: 'Hytrol-24' }, segments };
    },
  };
  return api;
}

export { CATALOG, FAMILIES, BOX, GAP_MIN };
export default createConveyorLibrary;
