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

export default { COMPONENTS, buildDemo, buildComb };
