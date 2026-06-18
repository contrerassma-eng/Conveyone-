// layouts.js — Generadores PARAMÉTRICOS de modelos y biblioteca de componentes.
//
// Esta es la "semilla del modelador": funciones que reciben parámetros y devuelven
// un modelo `{ meta, segments }` listo para el motor. El modelador online hará
// exactamente esto: traducir lo que el usuario dibuja (entradas, salidas, curvas,
// desviadores) a un modelo como los de aquí.
//
// La biblioteca de componentes (COMPONENTS) está pensada para crecer con el catálogo
// Hytrol y otros: cada componente expone parámetros físicos configurables
//   - width      ancho del transportador (m)
//   - pitch      paso mínimo entre cajas / cero presión (m)
//   - rollerDia  diámetro de rodillo (m)  [metadato físico, afecta velocidad mínima]
//   - speed      velocidad de banda (m/s)
// y produce uno o varios `segments`.

// ---------------- Biblioteca de componentes ----------------
// Cada generador devuelve { segments, exits } donde `exits` son los ids de salida
// para encadenar componentes entre sí.

export const COMPONENTS = {
  // Tramo recto (Hytrol TA/ABEZ etc.): banda/rodillos en línea.
  straight({ id, from, to, height = 0.9, speed = 0.5, pitch = 0.4, rollerDia = 0.048 }) {
    return {
      meta: { rollerDia },
      segments: [{ id, geom: { type: 'straight', from, to }, height, speed, pitch }],
      exits: [id],
    };
  },

  // Curva (Hytrol 190-NSPEZ / curva de banda): arco de `angle` grados.
  // `center` y `radius` definen la curva; el ancho informa el radio interior real.
  curve({ id, center, radius, a0, angleDeg = 90, dir = 'ccw', height = 0.9,
          speed = 0.5, pitch = 0.4, width = 0.6, rollerDia = 0.048 }) {
    const sweep = (Math.PI / 180) * angleDeg * (dir === 'ccw' ? 1 : -1);
    return {
      meta: { width, rollerDia, family: 'curve' },
      segments: [{
        id, geom: { type: 'arc', center, radius, a0, a1: a0 + sweep },
        height, speed, pitch,
      }],
      exits: [id],
    };
  },

  // Desviador / clasificador (Hytrol divert): un tramo de entrada con dos salidas.
  // El motor enruta balanceando por hueco (round-robin). `branches` son los ids
  // de los tramos a los que apunta.
  diverter({ id, from, to, branches, height = 0.9, speed = 0.5, pitch = 0.4,
             width = 0.6, rollerDia = 0.048 }) {
    return {
      meta: { width, rollerDia, family: 'diverter' },
      segments: [{ id, geom: { type: 'straight', from, to }, height, speed, pitch, next: branches }],
      exits: branches,
    };
  },
};

// ---------------- buildDemo: layout mínimo navegable ----------------
// recta de entrada -> curva 90° -> estación de trabajo -> salida.
export function buildDemo(opts = {}) {
  const speed = opts.speed != null ? opts.speed : 0.5;
  const pitch = opts.pitch != null ? opts.pitch : 0.45;
  const rate = opts.rate != null ? opts.rate : 1500;
  return {
    meta: { name: 'demo', boxSize: [0.4, 0.13, 0.3], rollerDia: 0.048 },
    segments: [
      { id: 'in', geom: { type: 'straight', from: [0, 0], to: [6, 0] }, height: 0.9,
        speed, pitch, source: { rate, cv: 0.25, burst: 0.1 }, next: ['curve'] },
      { id: 'curve', geom: { type: 'arc', center: [6, 2], radius: 2, a0: -Math.PI / 2, a1: 0 },
        height: 0.9, speed, pitch, next: ['work'] },
      { id: 'work', geom: { type: 'straight', from: [8, 2], to: [14, 2] }, height: 0.9,
        speed: speed * 0.9, pitch, process: { at: 3, time: 2.0, operators: 2, cv: 0.3 }, next: ['out'] },
      { id: 'out', geom: { type: 'straight', from: [14, 2], to: [20, 2] }, height: 0.9,
        speed: speed * 1.2, pitch, sink: true },
    ],
  };
}

// ---------------- buildComb: fila tipo "peine" (AC301) ----------------
// Un transportador principal del que cuelgan `lanes` carriles de trabajo en paralelo,
// cada uno con su estación, que vuelven a una línea de evacuación. Demuestra cómo
// un parámetro (`lanes`) arma un modelo grande.
export function buildComb(opts = {}) {
  const lanes = opts.lanes != null ? opts.lanes : 7;
  const speed = opts.speed != null ? opts.speed : 0.5;
  const pitch = opts.pitch != null ? opts.pitch : 0.45;
  const rate = opts.rate != null ? opts.rate : 600 * lanes;
  const laneGap = 2.0;          // separación entre carriles (m)
  const mainLen = lanes * laneGap + 2;

  const segments = [];
  // espina dorsal de alimentación
  segments.push({
    id: 'feed', geom: { type: 'straight', from: [0, 0], to: [mainLen, 0] }, height: 0.9,
    speed, pitch, source: { rate, cv: 0.3, burst: 0.15, max: opts.max },
    next: Array.from({ length: lanes }, (_, i) => `lane${i}_in`),
  });
  // evacuación
  segments.push({
    id: 'evac', geom: { type: 'straight', from: [0, 6], to: [mainLen, 6] }, height: 0.9,
    speed: speed * 1.3, pitch, sink: true,
  });
  // carriles
  for (let i = 0; i < lanes; i++) {
    const x = 1 + i * laneGap;
    segments.push({
      id: `lane${i}_in`, geom: { type: 'straight', from: [x, 0], to: [x, 2.5] }, height: 0.9,
      speed, pitch, next: [`lane${i}_work`],
    });
    segments.push({
      id: `lane${i}_work`, geom: { type: 'straight', from: [x, 2.5], to: [x, 4] }, height: 0.9,
      speed: speed * 0.85, pitch,
      process: { at: 0.7, time: 2.5, operators: 1, cv: 0.35 }, next: [`lane${i}_out`],
    });
    segments.push({
      id: `lane${i}_out`, geom: { type: 'straight', from: [x, 4], to: [x, 6] }, height: 0.9,
      speed, pitch, next: ['evac'],
    });
  }
  return { meta: { name: `comb-${lanes}`, boxSize: [0.4, 0.13, 0.3], rollerDia: 0.048 }, segments };
}

// ---------------- buildSorter4500: clasificador Intralox Serie 4500 ----------------
// Línea principal de clasificación (ARB / sorter) con salidas PERPENDICULARES por
// color. Cada salida acumula un buffer de cero presión, y un Virtual Pocket libera
// las cajas a una línea de salida en función de la demanda (receta).
//
// Parámetros físicos configurables:
//   colors          paleta (cada salida = un color)               default 6 colores
//   mainCapacity    capacidad de la línea principal (cajas)        default 60
//   bufferCapacity  capacidad de cada buffer de cero presión       default 20
//   speed, pitch, rollerDia, width
//   pocket          receta del Virtual Pocket (ver VirtualPocket)
export function buildSorter4500(opts = {}) {
  const colors = opts.colors || ['red', 'blue', 'green', 'yellow', 'orange', 'purple'];
  const outputs = opts.outputs || colors.length;
  const mainCapacity = opts.mainCapacity != null ? opts.mainCapacity : 60;
  const bufferCapacity = opts.bufferCapacity != null ? opts.bufferCapacity : 20;
  const speed = opts.speed != null ? opts.speed : 0.6;
  const pitch = opts.pitch != null ? opts.pitch : 0.5;
  const rollerDia = opts.rollerDia != null ? opts.rollerDia : 0.048;
  const width = opts.width != null ? opts.width : 0.6;
  const rate = opts.rate != null ? opts.rate : 3600;

  const cellCap = Math.ceil(mainCapacity / outputs);  // cajas por celda de la línea
  const cellLen = cellCap * pitch;                     // largo de cada celda (m)
  const bufLen = bufferCapacity * pitch;               // largo de cada buffer (m)
  const outY = 0.6 + bufLen + 1.5;                     // y de la línea de salida

  const segments = [];

  // Alimentación: genera cajas con mezcla de colores.
  segments.push({
    id: 'infeed', geom: { type: 'straight', from: [0, 0], to: [cellLen, 0] },
    height: 0.9, speed, pitch,
    source: { rate, cv: 0.3, colors, weights: opts.weights, max: opts.max },
    next: ['main0'],
  });

  // Celdas de la línea principal: cada una deriva su color a un carril perpendicular.
  for (let i = 0; i < outputs; i++) {
    const x0 = (i + 1) * cellLen;
    const x1 = (i + 2) * cellLen;
    const color = colors[i];
    const laneId = `lane_${color}`;
    const contId = i < outputs - 1 ? `main${i + 1}` : 'overflow';
    segments.push({
      id: `main${i}`, geom: { type: 'straight', from: [x0, 0], to: [x1, 0] },
      height: 0.9, speed, pitch,
      sort: { by: 'color', divertColor: color, lane: laneId, cont: contId },
      next: [laneId, contId],
    });
    // Carril/buffer perpendicular (+y), cero presión, gobernado por el Virtual Pocket.
    segments.push({
      id: laneId, geom: { type: 'straight', from: [x1, 0.6], to: [x1, 0.6 + bufLen] },
      height: 0.9, speed, pitch, color, pocketBuffer: true, next: ['outfeed'],
    });
  }

  // Overflow: cajas no clasificadas (buffer lleno) -> rechazo.
  const xEnd = (outputs + 1) * cellLen;
  segments.push({
    id: 'overflow', geom: { type: 'straight', from: [xEnd, 0], to: [xEnd + cellLen, 0] },
    height: 0.9, speed, pitch, sink: true, reject: true,
  });

  // Línea de salida del Virtual Pocket: recibe el flujo ordenado por la receta.
  segments.push({
    id: 'outfeed', geom: { type: 'straight', from: [cellLen, outY], to: [xEnd + cellLen, outY] },
    height: 0.9, speed: speed * 1.3, pitch, sink: true,
  });

  // Receta por defecto: cadena de 3 cajas por color, en ciclo.
  const pocket = opts.pocket || { loop: true, steps: colors.map(c => ({ color: c, qty: 3 })) };

  return {
    meta: { name: 'sorter4500', boxSize: [0.4, 0.13, 0.3], rollerDia, width, family: 'Intralox-4500' },
    segments,
    pocket,
  };
}

// ---------------- buildBufferedSorter: sistema completo con buffers verticales ----------------
// Cadena por cada salida del clasificador 4500 (según el render real):
//   sorter 4500 -> cero presión -> elevador Kímarox (sube) -> buffer vertical de N
//   niveles (cero presión) -> elevador de descenso (baja) -> cero presión -> Virtual Pocket.
// Cada salida está dedicada a un color. La cantidad de salidas es regulable.
//
//   outputs    número de salidas (cada una un color)          default 6
//   levels     niveles del buffer vertical por salida          default 4
//   perLevel   cajas por nivel (cero presión)                  default 15
//   upCycle/downCycle/cooldown   tiempos de los elevadores (s)
const PALETTE8 = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'cyan', 'pink'];

export function buildBufferedSorter(opts = {}) {
  const outputs = Math.max(1, Math.min(opts.outputs || 6, PALETTE8.length));
  const colors = (opts.colors || PALETTE8).slice(0, outputs);
  const levels = opts.levels != null ? opts.levels : 4;
  const perLevel = opts.perLevel != null ? opts.perLevel : 15;
  const mainCapacity = opts.mainCapacity != null ? opts.mainCapacity : 60;
  const speed = opts.speed != null ? opts.speed : 0.6;
  const pitch = opts.pitch != null ? opts.pitch : 0.5;
  const upCycle = opts.upCycle != null ? opts.upCycle : 3;
  const downCycle = opts.downCycle != null ? opts.downCycle : 3;
  const cooldown = opts.cooldown != null ? opts.cooldown : 2;
  const rate = opts.rate != null ? opts.rate : 600 * outputs;

  const cellCap = Math.ceil(mainCapacity / Math.max(1, Math.ceil(mainCapacity / 10)));
  const cellLen = 10 * pitch;                 // celda de la línea principal (~10 cajas)
  const levelLen = perLevel * pitch;          // largo de cada nivel de buffer
  const baseH = 1.2, levelStep = 0.6;         // alturas de los niveles
  const topH = baseH + (levels - 1) * levelStep;
  const yLevels0 = 2.8;                        // inicio de los niveles (+y)
  const yDown = yLevels0 + levelLen + 0.6;     // elevador de descenso
  const yZp0 = yDown + 0.6;                    // cero presión final
  const outY = yZp0 + 3.0;                     // línea de salida (outfeed)

  const segments = [];

  // Alimentación con mezcla de colores (uno por salida).
  segments.push({
    id: 'infeed', geom: { type: 'straight', from: [0, 0], to: [cellLen, 0] },
    height: 0.9, speed, pitch,
    source: { rate, cv: 0.3, colors, weights: opts.weights, max: opts.max },
    next: ['main0'],
  });

  for (let i = 0; i < outputs; i++) {
    const x = (i + 2) * cellLen;               // x del divert (fin de la celda i)
    const color = colors[i];
    const contId = i < outputs - 1 ? `main${i + 1}` : 'overflow';
    const O = `o${i}`;

    // celda de la línea principal con divert por color
    segments.push({
      id: `main${i}`, geom: { type: 'straight', from: [(i + 1) * cellLen, 0], to: [x, 0] },
      height: 0.9, speed, pitch,
      sort: { by: 'color', divertColor: color, lane: `${O}_in`, cont: contId },
      next: [`${O}_in`, contId],
    });
    // 1) cero presión de entrada a la salida (perpendicular, +y)
    segments.push({
      id: `${O}_in`, geom: { type: 'straight', from: [x, 0.6], to: [x, yLevels0 - 0.4] },
      height: 0.9, speed, pitch, color, next: [`${O}_up`],
    });
    // 2) elevador Kímarox: sube (cíclico, una caja)
    segments.push({
      id: `${O}_up`, geom: { type: 'lift', at: [x, yLevels0 - 0.2], h0: 0.9, h1: topH },
      elevator: { cycle: upCycle, cooldown }, color,
      next: Array.from({ length: levels }, (_, k) => `${O}_lvl${k}`),
    });
    // 3) buffer vertical de N niveles (cada nivel cero presión)
    for (let k = 0; k < levels; k++) {
      const xk = x + k * 0.35;                 // leve stagger para distinguirlos en vista superior
      segments.push({
        id: `${O}_lvl${k}`, geom: { type: 'straight', from: [xk, yLevels0], to: [xk, yLevels0 + levelLen] },
        height: baseH + k * levelStep, speed, pitch, color, next: [`${O}_down`],
      });
    }
    // 4) elevador de descenso: baja (cíclico, una caja)
    segments.push({
      id: `${O}_down`, geom: { type: 'lift', at: [x + 0.5, yDown], h0: topH, h1: 0.9 },
      elevator: { cycle: downCycle, cooldown }, color, next: [`${O}_zp`],
    });
    // 5) cero presión final, gobernado por el Virtual Pocket
    segments.push({
      id: `${O}_zp`, geom: { type: 'straight', from: [x + 0.5, yZp0], to: [x + 0.5, yZp0 + 2.2] },
      height: 0.9, speed, pitch, color, pocketBuffer: true, next: ['outfeed'],
    });
  }

  // overflow (no clasificado) y línea de salida del Virtual Pocket
  const xEnd = (outputs + 1) * cellLen;
  segments.push({
    id: 'overflow', geom: { type: 'straight', from: [xEnd, 0], to: [xEnd + cellLen, 0] },
    height: 0.9, speed, pitch, sink: true, reject: true,
  });
  segments.push({
    id: 'outfeed', geom: { type: 'straight', from: [cellLen, outY], to: [xEnd + cellLen, outY] },
    height: 0.9, speed: speed * 1.3, pitch, sink: true,
  });

  // Virtual Pocket: por defecto, cadena de 3 cajas por color en ciclo.
  const pocket = opts.pocket || { loop: true, steps: colors.map(c => ({ color: c, qty: 3 })) };

  return {
    meta: { name: `buffered-sorter-${outputs}`, boxSize: [0.4, 0.13, 0.3], rollerDia: 0.048, family: 'Intralox-4500+Kimarox' },
    segments,
    pocket,
  };
}

export default { COMPONENTS, buildDemo, buildComb, buildSorter4500, buildBufferedSorter };
