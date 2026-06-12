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
//   g.instances.push(lib.place('TA',  { x:0, z:0, rot:0 }, { length:6 }));
//   g.instances.push(lib.place('DV90'));                       // desviador 1->2 (out, out2)
//   lib.connect(g, g.instances[0].id, g.instances[1].id);     // out de A -> in de B (con snap)
//   const issues = lib.validate(g);                            // reglas de diseño
//   const model  = lib.graphToModel(g);                        // {meta, segments} para ConveyorSim
//   const json   = lib.serialize(g);                           // guardar; lib.hydrate(json) -> grafo

const FPM = 0.00508;            // 1 pie/min = 0.00508 m/s (velocidades comerciales)
const IN = 0.0254;             // 1 pulgada
const W24 = 24 * IN;           // ancho nominal 24"  ≈ 0.61 m
const ROLLER19 = 1.9 * IN;     // rodillo Ø1.9"      ≈ 0.048 m
const BOX = [0.40, 0.13, 0.30];// caja de referencia [largo, alto, ancho] (m)
const GAP_MIN = 0.05;          // holgura mínima entre cajas (cero presión)

// ───────────────────────── helpers de geometría ─────────────────────────
const deg = d => (d || 0) * Math.PI / 180;
const dirOf = rot => [Math.cos(rot), Math.sin(rot)];
const dist2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// ───────────────────────── FAMILIAS cinemáticas (lo que el motor entiende) ─────────────
// Cada familia construye: nodes(pose,cfg) -> {in,out,...}; segments(id,pose,cfg) -> [seg];
// entrySeg(id,key)/exitSeg(id,key) -> id de segmento por nodo (para enrutar enlaces).
const FAMILIES = {
  // Recta (banda/rodillo en línea). Inclina si entryHeight≠exitHeight.
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
    entrySeg: id => id, exitSeg: id => id,
  },

  // Curva (banda modular LBP / curva 190): arco `angleDeg`, radio `radius`. Plana.
  curve: {
    nodes(pose, c) {
      const a = [pose.x, pose.z], sweep = deg(c.angleDeg) * (c.cw ? -1 : 1);
      const nrm = c.cw ? [Math.sin(pose.rot), -Math.cos(pose.rot)] : [-Math.sin(pose.rot), Math.cos(pose.rot)];
      const center = [a[0] + c.radius * nrm[0], a[1] + c.radius * nrm[1]];
      const a0 = Math.atan2(a[1] - center[1], a[0] - center[0]), a1 = a0 + sweep;
      const out = [center[0] + c.radius * Math.cos(a1), center[1] + c.radius * Math.sin(a1)];
      return { in: { p: a, dir: pose.rot }, out: { p: out, dir: pose.rot + sweep }, _center: center, _a0: a0, _a1: a1 };
    },
    segments(id, pose, c) {
      const n = this.nodes(pose, c);
      return [{ id, geom: { type: 'arc', center: n._center, radius: c.radius, a0: n._a0, a1: n._a1 },
        height: c.entryHeight, speed: c.speed, pitch: c.pitch }];
    },
    entrySeg: id => id, exitSeg: id => id,
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
    entrySeg: id => id, exitSeg: id => id,
  },

  // Desviador 1->2: celda recta con salida que CONTINÚA (out) y un SPUR que desvía
  // a `angleDeg` (out2). El motor reparte por hueco (round-robin) entre continuar y
  // desviar. Dos segmentos: cell + cell__br.
  divert: {
    nodes(pose, c) {
      const d0 = dirOf(pose.rot), a = [pose.x, pose.z];
      const cEnd = [a[0] + c.length * d0[0], a[1] + c.length * d0[1]];
      const mid = [a[0] + c.length * 0.5 * d0[0], a[1] + c.length * 0.5 * d0[1]];
      const r2 = pose.rot + deg(c.angleDeg) * (c.cw ? -1 : 1);
      const d2 = dirOf(r2), brEnd = [mid[0] + (c.branch || c.length) * d2[0], mid[1] + (c.branch || c.length) * d2[1]];
      return { in: { p: a, dir: pose.rot }, out: { p: cEnd, dir: pose.rot }, out2: { p: brEnd, dir: r2 }, _mid: mid };
    },
    segments(id, pose, c) {
      const n = this.nodes(pose, c), br = id + '__br';
      return [
        { id, geom: { type: 'straight', from: n.in.p, to: n.out.p }, height: c.entryHeight, speed: c.speed, pitch: c.pitch, next: [br] },
        { id: br, geom: { type: 'polyline', points: [n._mid, n.out2.p] }, height: c.entryHeight, speed: c.speed, pitch: c.pitch },
      ];
    },
    entrySeg: id => id,
    exitSeg: (id, key) => key === 'out2' ? id + '__br' : id,
  },

  // Merge 2->1: dos entradas (in, in2 a `angleDeg`) que convergen al tronco (out).
  // Ambas entradas mapean al inicio del tronco; el motor evita solape por hueco (R4).
  merge: {
    nodes(pose, c) {
      const d0 = dirOf(pose.rot), a = [pose.x, pose.z];
      const out = [a[0] + c.length * d0[0], a[1] + c.length * d0[1]];
      const r2 = pose.rot - deg(c.angleDeg) * (c.cw ? -1 : 1);     // segunda línea entra angulada
      return { in: { p: a, dir: pose.rot }, in2: { p: a, dir: r2 }, out: { p: out, dir: pose.rot } };
    },
    segments(id, pose, c) {
      const n = this.nodes(pose, c);
      return [{ id, geom: { type: 'straight', from: n.in.p, to: n.out.p }, height: c.entryHeight, speed: c.speed, pitch: c.pitch }];
    },
    entrySeg: id => id, exitSeg: id => id,
  },

  // MÁQUINA en línea (Niverplast): GUILLOTINA-TOPE al ingreso que METERa la entrada a
  // `meterPerMin` c/min → aguas arriba se acumula en la LBP (cero presión).
  machine: {
    nodes(pose, c) { return FAMILIES.straight.nodes(pose, c); },
    segments(id, pose, c) {
      const n = FAMILIES.straight.nodes(pose, c);
      const meter = c.meterPerMin || 15, time = 60 / meter;   // 15 c/min → retiene 4 s por caja
      return [{ id, geom: { type: 'straight', from: n.in.p, to: n.out.p }, height: c.entryHeight, speed: c.speed, pitch: c.pitch,
        process: { at: Math.max(0.1, (c.length || 2) * 0.18), time, operators: 1, cv: 0.15 } }];   // tope cerca del ingreso → la cola backea a la LBP
    },
    entrySeg: id => id, exitSeg: id => id,
  },
  // ELEMENTO ESTÁTICO (rack, mesa): sin flujo. Un nodo ancla para colocar/seleccionar.
  prop: {
    nodes(pose) { return { in: { p: [pose.x, pose.z], dir: pose.rot }, out: { p: [pose.x, pose.z], dir: pose.rot } }; },
    segments() { return []; },
    entrySeg: id => id, exitSeg: id => id,
  },
};

// ───────────────────────── CATÁLOGO (modelos comerciales 24") ─────────────────────────
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

  { id: '190-E24C', label: '190-E24C · Curva de rodillo vivo 24V (cónicos)', group: 'Curvas',
    kind: 'roller', family: 'curve',
    defaults: { angleDeg: 90, radius: 1.1, width: W24, speed: 60 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9, cw: false },
    caps: { maxInclineDeg: 0, rollerDia: 2.5 * IN },
    note: 'Curva de rodillo motorizado. Rodillos CÓNICOS 2.5"→1-11/16" dispuestos radialmente.' },

  { id: 'NIVERPLAST', label: 'Niverplast · Guillotina-tope al ingreso (metera 15 c/min)', group: 'Estación Niverplast',
    kind: 'machine', family: 'machine',
    defaults: { length: 2.0, width: 1.0, speed: 0.4, pitch: BOX[0] + GAP_MIN, entryHeight: 0.8, meterPerMin: 15 },
    caps: { maxInclineDeg: 0 },
    note: 'Niverplast: guillotina-tope al ingreso que METERa la entrada (15 c/min por defecto); aguas arriba la LBP acumula. Dimensiones APROXIMADAS (descripción del usuario, no cut-sheet).' },

  { id: 'GRR', label: 'Gravedad · Rodillo OD30 paso 3" (700 mm) + mini-mesas 200 mm', group: 'Estación Niverplast',
    kind: 'gravity', family: 'straight',
    defaults: { length: 4.0, width: 0.6, speed: 0.3, pitch: BOX[0] + GAP_MIN, entryHeight: 0.7 },
    caps: { maxInclineDeg: 7, rollerDia: 0.030 },
    note: 'Transportador por gravedad: rodillo OD 30 mm a paso 3", altura 700 mm, con mini-mesas de 200 mm a cada lado (tomar contenido / tapar).' },

  { id: 'LIDRACK', label: 'Rack de tapas · 3 niveles de bandejas con minicarriles', group: 'Estación Niverplast',
    kind: 'prop', family: 'prop',
    defaults: { length: 1.6, width: 0.5, entryHeight: 1.1 },
    caps: {}, note: 'Estantería de 3 niveles con minicarriles que abastecen tapas de cajas por gravedad. Estático (sin flujo de cajas).' },

  { id: 'INOXTABLE', label: 'Mesa de inox · tomar contenido y tapar', group: 'Estación Niverplast',
    kind: 'prop', family: 'prop',
    defaults: { length: 1.5, width: 0.8, entryHeight: 0.9 },
    caps: {}, note: 'Mesa de acero inoxidable de trabajo. Estático (sin flujo de cajas).' },

  { id: 'OPERATOR', label: 'Operario · persona de trabajo', group: 'Estación Niverplast',
    kind: 'prop', family: 'prop',
    defaults: { length: 0.5, width: 0.5, entryHeight: 0 },
    caps: {}, note: 'Operario (figura) — para representar las personas de la estación. Estático.' },

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

  { id: 'DV90', label: 'Desviador 90° (1 → 2 salidas)', group: 'Desvío / Empalme',
    kind: 'divert', family: 'divert',
    defaults: { length: 1.5, branch: 1.5, angleDeg: 90, width: W24, speed: 70 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9, cw: true },
    caps: { maxInclineDeg: 0, rollerDia: ROLLER19 },
    note: 'Celda de desvío: continúa recto (out) o desvía a 90° (out2). Reparte por hueco.' },

  { id: 'DV30', label: 'Desviador 30° (1 → 2 salidas)', group: 'Desvío / Empalme',
    kind: 'divert', family: 'divert',
    defaults: { length: 1.8, branch: 1.8, angleDeg: 30, width: W24, speed: 75 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9, cw: true },
    caps: { maxInclineDeg: 0, rollerDia: ROLLER19 },
    note: 'Spur de desvío 30°: continúa recto o desvía suave (alta tasa).' },

  { id: 'MG', label: 'Empalme / merge (2 → 1)', group: 'Desvío / Empalme',
    kind: 'merge', family: 'merge',
    defaults: { length: 2.0, angleDeg: 30, width: W24, speed: 70 * FPM, pitch: BOX[0] + GAP_MIN, entryHeight: 0.9, cw: true },
    caps: { maxInclineDeg: 0, rollerDia: ROLLER19 },
    note: 'Confluencia de dos líneas (in, in2) a un tronco (out). Sin solape por hueco (R4).' },
];

// ───────────────────────── SPEC física por modelo (capa WEB · ver docs/web_facts.json) ──────
// Valores de ficha técnica Hytrol con procedencia. surface: cómo se ve la superficie de
// transporte. *In = pulgadas (como el cut-sheet); el render los convierte a metros.
// 'src' apunta a docs/web_facts.json; las marcas [asumido] están listadas allí también.
const SPECS = {
  // — Rodillo motorizado 1.9" OD × 16 ga sobre centros de 3" (E24/190) [E24-713] —
  'E24CT':     { surface: 'rollers', rollerDiaIn: 1.9, rollerPitchIn: 3.0, gauge: 16, frameDepthIn: 6, railHeightIn: 1.625, speedFpm: [25, 174], src: 'E24-713' },
  'E34EZCT':   { surface: 'rollers', rollerDiaIn: 1.9, rollerPitchIn: 3.0, gauge: 16, frameDepthIn: 6, railHeightIn: 1.625, speedFpm: [25, 174], zone: true, src: 'E24-713' },
  '190-E24':   { surface: 'rollers', rollerDiaIn: 1.9, rollerPitchIn: 3.0, gauge: 16, frameDepthIn: 6, railHeightIn: 1.625, speedFpm: [25, 174], src: 'E24-713' },
  '190-E24EZ': { surface: 'rollers', rollerDiaIn: 1.9, rollerPitchIn: 3.0, gauge: 16, frameDepthIn: 6, railHeightIn: 1.625, speedFpm: [25, 174], zone: true, src: 'E24-713' },
  // — Transferencias/desvíos: familia E24SS, mismo rodillo 1.9"×3" [E24-713] —
  'E24SS':     { surface: 'rollers', rollerDiaIn: 1.9, rollerPitchIn: 3.0, gauge: 16, frameDepthIn: 6, railHeightIn: 1.625, speedFpm: [25, 174], src: 'E24-713' },
  'T90':       { surface: 'rollers', rollerDiaIn: 1.9, rollerPitchIn: 3.0, gauge: 16, frameDepthIn: 6, railHeightIn: 1.625, speedFpm: [25, 174], src: 'E24-713' },
  'T30':       { surface: 'rollers', rollerDiaIn: 1.9, rollerPitchIn: 3.0, gauge: 16, frameDepthIn: 6, railHeightIn: 1.625, speedFpm: [25, 174], src: 'E24-713' },
  'DV90':      { surface: 'rollers', rollerDiaIn: 1.9, rollerPitchIn: 3.0, gauge: 16, frameDepthIn: 6, railHeightIn: 1.625, speedFpm: [25, 174], src: 'E24-713' },
  'DV30':      { surface: 'rollers', rollerDiaIn: 1.9, rollerPitchIn: 3.0, gauge: 16, frameDepthIn: 6, railHeightIn: 1.625, speedFpm: [25, 174], src: 'E24-713' },
  'MG':        { surface: 'rollers', rollerDiaIn: 1.9, rollerPitchIn: 3.0, gauge: 16, frameDepthIn: 6, railHeightIn: 1.625, speedFpm: [25, 174], src: 'E24-713' },
  // — Bandas: cama deslizante / modular (sin rodillos en la superficie) [TA-642] —
  'TA':        { surface: 'belt', frameDepthIn: 5.5, railHeightIn: 0, pulleyDiaIn: 4, beltMm: 5, speedFpm: [30, 120], src: 'TA-642' },
  'SBI':       { surface: 'belt', frameDepthIn: 5.5, railHeightIn: 0, pulleyDiaIn: 4, beltMm: 5, speedFpm: [30, 120], cleated: true, src: 'TA-642' },
  'LBP':       { surface: 'belt', frameDepthIn: 5.5, railHeightIn: 0, pulleyDiaIn: 4, beltMm: 8, speedFpm: [30, 120], modular: true, src: 'TA-642' },
  'LBP-CURVE': { surface: 'belt', frameDepthIn: 4.0, railHeightIn: 0, pulleyDiaIn: 4, beltMm: 8, speedFpm: [30, 120], modular: true, src: 'TA-642' },
  '190-E24C':  { surface: 'rollers', rollerDiaIn: 2.5, rollerTaperToIn: 1.6875, rollerPitchIn: 3.0, gauge: 16, frameDepthIn: 6, railHeightIn: 1.625, speedFpm: [25, 174], tapered: true, src: 'E24-713' },
  // Gravedad: rodillo OD 30 mm a paso 3", altura 700 mm, mini-mesas 200 mm (declarado por el usuario)
  'GRR':       { surface: 'rollers', rollerDiaIn: 30 / 25.4, rollerPitchIn: 3.0, gauge: 16, frameDepthIn: 5, railHeightIn: 0, sideTable: 0.2, gravity: true, speedFpm: [0, 60], src: 'USER' },
};

function specMetric(id) {
  const s = SPECS[id]; if (!s) return null;
  return {
    surface: s.surface,
    rollerDia: s.rollerDiaIn != null ? s.rollerDiaIn * IN : null,
    rollerTaper: s.rollerTaperToIn != null ? s.rollerTaperToIn * IN : null,
    tapered: !!s.tapered,
    rollerPitch: s.rollerPitchIn != null ? s.rollerPitchIn * IN : null,
    frameDepth: (s.frameDepthIn || 5.5) * IN,
    railHeight: (s.railHeightIn || 0) * IN,
    pulleyDia: s.pulleyDiaIn != null ? s.pulleyDiaIn * IN : null,
    belt: s.beltMm != null ? s.beltMm / 1000 : null,
    gauge: s.gauge || null, zone: !!s.zone, modular: !!s.modular, cleated: !!s.cleated,
    sideTable: s.sideTable || 0, gravity: !!s.gravity,
    speedFpm: s.speedFpm || null, inches: s, src: s.src,
  };
}

// Parámetros PROPIOS de cada modelo (opciones de cut-sheet) para setear en la UI.
// Cada control referencia una clave de cfg + conversión de unidad ('in'→metros, 'fpm'→m/s,
// 'incline' = ajusta exitHeight por el ángulo, 'm'/'raw'/'bool' directos).
function paramsFor(id) {
  const m = modelById(id), sp = SPECS[id] || {}, fam = m.family, out = [];
  if (fam === 'prop') return [{ label: 'Largo (m)', cfg: 'length', unit: 'm', type: 'number', min: 0.3, max: 5, step: 0.1 }, { label: 'Ancho (m)', cfg: 'width', unit: 'm', type: 'number', min: 0.2, max: 3, step: 0.1 }];
  if (fam === 'machine') { out.push({ label: 'Tasa de corte (c/min)', cfg: 'meterPerMin', unit: 'raw', type: 'number', min: 1, max: 60, step: 1 }); out.push({ label: 'Largo (m)', cfg: 'length', unit: 'm', type: 'number', min: 0.5, max: 5, step: 0.1 }); return out; }
  if (sp.surface === 'rollers') {
    out.push({ label: 'Centros de rodillo', cfg: 'rollerPitch', unit: 'in', type: 'select', options: [2, 3] });
    out.push({ label: 'Ancho BR', cfg: 'width', unit: 'in', type: 'select', options: [18, 24, 30, 36] });
    if (sp.zone) out.push({ label: 'Zona EZLogic', cfg: 'zoneIn', unit: 'raw', type: 'select', options: [18, 24, 30, 36] });
  } else {
    out.push({ label: 'Ancho de banda', cfg: 'width', unit: 'in', type: 'select', options: [12, 18, 24, 30] });
    out.push({ label: 'Polea / drive', cfg: 'pulleyDia', unit: 'in', type: 'select', options: [4, 8] });
  }
  if (sp.speedFpm) out.push({ label: 'Velocidad', cfg: 'speed', unit: 'fpm', type: 'number', min: sp.speedFpm[0], max: sp.speedFpm[1], step: 5 });
  if (fam === 'curve') {
    out.push({ label: 'Ángulo de curva', cfg: 'angleDeg', unit: 'raw', type: 'select', options: [30, 45, 60, 90] });
    out.push({ label: 'Radio', cfg: 'radius', unit: 'm', type: 'number', min: 0.4, max: 2.0, step: 0.1 });
    out.push({ label: 'Sentido', cfg: 'cw', unit: 'bool', type: 'select', options: [['Horario', true], ['Antihorario', false]] });
  }
  if (fam === 'transfer' || fam === 'divert') out.push({ label: 'Ángulo de desvío', cfg: 'angleDeg', unit: 'raw', type: 'select', options: [30, 45, 90] });
  if (m.caps && m.caps.maxInclineDeg > 0) out.push({ label: 'Inclinación', cfg: 'inclineDeg', unit: 'incline', type: 'number', min: 0, max: m.caps.maxInclineDeg, step: 1 });
  return out;
}

// ───── REFERENCIA al catálogo Hytrol real (designación oficial + ficha/manual) ─────
// Verificado contra hytrol.com/products y los boletines (ver docs/web_facts.json).
const DOC = {
  E24: 'https://cdn.hytrol.com/E24.pdf',                                   // Bulletin 713
  TA: 'https://cdn.hytrol.com/2012_642_ta.pdf',                            // Bulletin 642
  LR: 'https://hytrol.com/products/transport/live-roller-conveyor/',
  BELT: 'https://hytrol.com/products/transport/belt-over-conveyor/',
  SUP: 'https://cdn.hytrol.com/2014_667_support.pdf',
};
const REFS = {
  'E24CT':     { hytrol: '190-E24',    note: 'Rodillo vivo 24V (transporte)', doc: DOC.E24, cat: DOC.LR },
  'E34EZCT':   { hytrol: '190-E24EZ',  note: 'Acumulación EZLogic 24V',       doc: DOC.E24, cat: DOC.LR },
  '190-E24':   { hytrol: '190-E24',    note: 'Rodillo vivo 24V (transporte)', doc: DOC.E24, cat: DOC.LR },
  '190-E24EZ': { hytrol: '190-E24EZ',  note: 'Acumulación EZLogic 24V',       doc: DOC.E24, cat: DOC.LR },
  'E24SS':     { hytrol: '190-E24SS',  note: 'Spur recto 30°/45° (24V)',      doc: DOC.E24, cat: DOC.LR },
  'T90':       { hytrol: '190-E24SS',  note: 'Transferencia/spur (familia E24SS)', doc: DOC.E24, cat: DOC.LR },
  'T30':       { hytrol: '190-E24SS',  note: 'Spur 30° (familia E24SS)',      doc: DOC.E24, cat: DOC.LR },
  'DV90':      { hytrol: '190-E24SS',  note: 'Desvío por spur (familia E24SS)', doc: DOC.E24, cat: DOC.LR },
  'DV30':      { hytrol: '190-E24SS',  note: 'Desvío por spur 30°',           doc: DOC.E24, cat: DOC.LR },
  'MG':        { hytrol: '190-E24',    note: 'Empalme sobre rodillo vivo 24V', doc: DOC.E24, cat: DOC.LR },
  'TA':        { hytrol: 'TA',         note: 'Banda cama deslizante (transporte)', doc: DOC.TA, cat: DOC.BELT },
  'SBI':       { hytrol: 'SBI',        note: 'Banda cama deslizante INCLINADA', doc: DOC.TA, cat: DOC.BELT },
  'LBP':       { hytrol: 'TA/LBP',     note: 'Banda modular (LBP) — genérica', doc: DOC.TA, cat: DOC.BELT },
  'LBP-CURVE': { hytrol: 'SBC',        note: 'Curva de banda (cama deslizante)', doc: DOC.TA, cat: DOC.BELT },
  '190-E24C':  { hytrol: '190-E24C',   note: 'Curva de rodillo vivo 24V (cónicos)', doc: DOC.E24, cat: DOC.LR },
  'NIVERPLAST': { hytrol: 'Niverplast', note: 'Corte/volcado de cajas (guillotina al ingreso)', doc: 'https://niverplast.com/packaging-machines', cat: 'https://niverplast.com/' },
  'GRR':        { hytrol: 'Gravity Roller', note: 'Rodillo por gravedad OD30 paso 3" (700 mm)', doc: DOC.LR, cat: DOC.LR },
  'LIDRACK':    { hytrol: '—',          note: 'Rack de tapas de 3 niveles con minicarriles', doc: DOC.LR, cat: DOC.LR },
  'INOXTABLE':  { hytrol: '—',          note: 'Mesa de inox de trabajo', doc: DOC.LR, cat: DOC.LR },
  'OPERATOR':   { hytrol: '—',          note: 'Operario (figura de trabajo)', doc: DOC.LR, cat: DOC.LR },
};

function modelById(id) { const m = CATALOG.find(x => x.id === id); if (!m) throw new Error('modelo desconocido: ' + id); return m; }
function resolveCfg(model, overrides = {}) {
  const c = Object.assign({}, model.defaults, overrides);
  if (c.entryHeight == null) c.entryHeight = 0.9;
  if (c.exitHeight == null) c.exitHeight = c.entryHeight;
  if (c.width == null) c.width = W24;
  if (c.cw == null) c.cw = model.defaults.cw != null ? model.defaults.cw : true;
  return c;
}
// reubica `inst` para que su nodo `key` quede en `targetP` orientado a `targetDir`.
function snapNodeTo(refresh, inst, key, targetP, targetDir) {
  inst.pose.rot += (targetDir - inst.nodes[key].dir); refresh(inst);
  const dp = [targetP[0] - inst.nodes[key].p[0], targetP[1] - inst.nodes[key].p[1]];
  inst.pose.x += dp[0]; inst.pose.z += dp[1]; refresh(inst);
}

// ───────────────────────── la función callable ─────────────────────────
let _instSeq = 0;
export function createConveyorLibrary() {
  const refresh = inst => { inst.nodes = FAMILIES[inst.family].nodes(inst.pose, inst.cfg); return inst; };
  const api = {
    BOX, GAP_MIN, units: { FPM, IN, W24, ROLLER19 },

    models: CATALOG,
    list() { return CATALOG.map(m => ({ id: m.id, label: m.label, group: m.group, kind: m.kind, family: m.family })); },
    groups() { const g = {}; for (const m of CATALOG) (g[m.group] = g[m.group] || []).push(m.id); return g; },
    get(id) { return modelById(id); },
    defaults(id) { return resolveCfg(modelById(id)); },
    // ficha física (capa WEB, ver docs/web_facts.json): superficie, OD/pitch de rodillo,
    // profundidad de bastidor, riel-guía, polea, etc. en METROS (+ pulgadas en .inches).
    spec(id) { return specMetric(id); },
    // parámetros propios del modelo (opciones de cut-sheet) para la UI
    params(id) { return paramsFor(id); },
    // referencia al catálogo Hytrol real: designación oficial + ficha/manual citado
    ref(id) { return REFS[id] || null; },
    // claves de nodo de un modelo (in/out/out2/in2…), para la UI
    nodeKeys(id) { const m = modelById(id); const n = FAMILIES[m.family].nodes({ x: 0, z: 0, rot: 0 }, resolveCfg(m)); return Object.keys(n).filter(k => k[0] !== '_'); },

    place(modelId, pose, overrides, fixedId) {
      const model = modelById(modelId);
      const cfg = resolveCfg(model, overrides);
      const p = Object.assign({ x: 0, z: 0, rot: 0 }, pose || {});
      const id = fixedId || (modelId.replace(/[^A-Za-z0-9]/g, '') + '_' + (++_instSeq));
      const inst = { id, model: model.id, family: model.family, kind: model.kind, cfg, pose: p };
      refresh(inst); return inst;
    },
    refresh,

    // conecta out(A) [fromNode] -> in(B) [toNode]; SNAP por defecto. Si el destino ya
    // tiene entradas (p.ej. un merge), mueve el ORIGEN en vez del destino.
    connect(graph, fromId, toId, opts = {}) {
      const A = graph.instances.find(i => i.id === fromId), B = graph.instances.find(i => i.id === toId);
      if (!A || !B) throw new Error('connect: instancia no encontrada');
      const fromNode = opts.fromNode || 'out', toNode = opts.toNode || 'in';
      if (!graph.links) graph.links = [];
      if (opts.snap !== false) {
        const snapFrom = opts.snapWhich ? opts.snapWhich === 'from'
          : graph.links.some(l => l.to === toId);   // destino ya conectado -> mover el origen
        if (snapFrom) snapNodeTo(refresh, A, fromNode, B.nodes[toNode].p, B.nodes[toNode].dir);
        else snapNodeTo(refresh, B, toNode, A.nodes[fromNode].p, A.nodes[fromNode].dir);
      }
      if (!graph.links.some(l => l.from === fromId && l.to === toId && l.fromNode === fromNode && l.toNode === toNode))
        graph.links.push({ from: fromId, to: toId, fromNode, toNode });
      return graph;
    },
    disconnect(graph, fromId, toId, fromNode, toNode) {
      graph.links = (graph.links || []).filter(l => !(l.from === fromId && l.to === toId &&
        (!fromNode || l.fromNode === fromNode) && (!toNode || l.toNode === toNode)));
      return graph;
    },

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
        if (inst.family !== 'straight' && dh > 1e-6)
          issues.push({ level: 'error', instId: inst.id, msg: 'no se permite inclinación dentro de una curva/transferencia/desviador' });
        if (!(graph.links || []).some(l => l.from === inst.id || l.to === inst.id))
          issues.push({ level: 'warn', instId: inst.id, msg: 'instancia suelta (sin conexiones)' });
      }
      for (const l of (graph.links || [])) {
        const A = graph.instances.find(i => i.id === l.from), B = graph.instances.find(i => i.id === l.to);
        if (!A || !B) { issues.push({ level: 'error', instId: l.from, msg: 'enlace a instancia inexistente' }); continue; }
        const ap = A.nodes[l.fromNode || 'out'], bp = B.nodes[l.toNode || 'in'];
        if (ap && bp && dist2(ap.p, bp.p) > 0.05)
          issues.push({ level: 'warn', instId: B.id, msg: 'empalme no coincidente (>5 cm): reconecta con snap' });
      }
      return issues;
    },

    // compila el GRAFO a { meta, segments }. Fuente = segmento con grado de entrada 0;
    // sumidero = segmento con next vacío (tras enrutar enlaces). Robusto para divert/merge.
    graphToModel(graph, opts = {}) {
      const links = graph.links || [];
      const segById = new Map();
      for (const inst of graph.instances) {
        const segs = FAMILIES[inst.family].segments(inst.id, inst.pose, inst.cfg);
        for (const s of segs) { s.next = s.next || []; segById.set(s.id, s); }
        // TOMAS de la pieza (ingresos/salidas) → al segmento de entrada, distancia → s
        if (inst.cfg.taps && inst.cfg.taps.length) {
          const head = segById.get(FAMILIES[inst.family].entrySeg(inst.id, 'in'));
          if (head) head.taps = inst.cfg.taps.map(t => ({
            kind: t.kind, at: Math.max(0, Math.min(t.distance || 0, inst.cfg.length || 9)),
            rate: t.kind === 'in' ? (t.ratePerMin || 0) : 0, cv: t.cv != null ? t.cv : 0.3,
            frac: t.frac != null ? t.frac : 1,
          }));
        }
      }
      // enruta enlaces externos: salida(seg de fromNode).next += entrada(seg de toNode)
      for (const l of links) {
        const A = graph.instances.find(i => i.id === l.from), B = graph.instances.find(i => i.id === l.to);
        if (!A || !B) continue;
        const fromSeg = FAMILIES[A.family].exitSeg(A.id, l.fromNode || 'out');
        const toSeg = FAMILIES[B.family].entrySeg(B.id, l.toNode || 'in');
        const s = segById.get(fromSeg); if (s && !s.next.includes(toSeg)) s.next.push(toSeg);
      }
      // grado de entrada por segmento
      const indeg = new Map(); for (const id of segById.keys()) indeg.set(id, 0);
      for (const s of segById.values()) for (const nx of s.next) indeg.set(nx, (indeg.get(nx) || 0) + 1);
      const segments = [];
      for (const s of segById.values()) {
        // FUENTE = sin entrada PERO con salida (una pieza aislada no genera cajas)
        if (indeg.get(s.id) === 0 && s.next.length > 0) {
          const inst = graph.instances.find(i => FAMILIES[i.family].entrySeg(i.id, 'in') === s.id);
          const rate = (inst && inst.cfg.rate != null) ? inst.cfg.rate : (opts.rate != null ? opts.rate : 1200);
          s.source = { rate, cv: opts.cv != null ? opts.cv : 0.3, burst: opts.burst != null ? opts.burst : 0.1, max: opts.max };
          s._isSource = true;
        }
        if (s.next.length === 0 && indeg.get(s.id) > 0) s.sink = true;   // SUMIDERO (recibe algo)
        segments.push(s);
      }
      return { meta: { name: opts.name || 'builder', boxSize: BOX, rollerDia: ROLLER19, family: 'Hytrol-24' }, segments };
    },

    // ── persistencia ──
    serialize(graph) {
      return JSON.stringify({
        version: 1,
        instances: graph.instances.map(i => ({ id: i.id, model: i.model, pose: { x: i.pose.x, z: i.pose.z, rot: i.pose.rot }, cfg: i.cfg })),
        links: (graph.links || []).map(l => ({ from: l.from, to: l.to, fromNode: l.fromNode || 'out', toNode: l.toNode || 'in' })),
      }, null, 2);
    },
    hydrate(json) {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      const instances = (data.instances || []).map(d => api.place(d.model, d.pose, d.cfg, d.id));
      for (const d of data.instances || []) {                  // re-sincroniza el contador de ids
        const num = parseInt(String(d.id).split('_').pop(), 10); if (num > _instSeq) _instSeq = num;
      }
      return { instances, links: (data.links || []).map(l => ({ from: l.from, to: l.to, fromNode: l.fromNode || 'out', toNode: l.toNode || 'in' })) };
    },
  };
  return api;
}

export { CATALOG, FAMILIES, SPECS, BOX, GAP_MIN };
export default createConveyorLibrary;
