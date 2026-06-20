// box-layouts.js — Layouts para el simulador de COMPORTAMIENTO de la caja (box-physics.js).
//
// Modelo simple, enfocado en la caja (sin alturas, sin procesos, sin recetas):
//   entrada -> curva 60° -> tramo de presión (con DESVIADOR y salida a 30°) ->
//   curva 60° -> salida.
//
// Cada vía tiene su propia `speed` (el "cerebro de velocidades" del HUD la edita en
// caliente). Bajar la velocidad de una vía aguas abajo crea el cuello: las cajas de
// atrás embisten (colisión) y, antes de una curva, pueden perder la trayectoria.

const D2R = Math.PI / 180;

// dir unit a partir de un ángulo (grados desde +x)
function dirDeg(a) { return [Math.cos(a * D2R), Math.sin(a * D2R)]; }
function add(p, d, len) { return [p[0] + d[0] * len, p[1] + d[1] * len]; }

// Línea de demostración con dos curvas de 60° y una salida (desvío) a 30°.
//
//   opts.speed     velocidad base de las vías (m/s)            default 0.6
//   opts.rate      tasa de la fuente (cajas/hora)              default 1500
//   opts.divertFrac fracción de cajas que toma la salida 30°   default 0.45
//   opts.width     ancho de banda (m)                          default 0.6
export function buildBehaviorLine(opts = {}) {
  const v = opts.speed != null ? opts.speed : 0.6;
  const rate = opts.rate != null ? opts.rate : 1500;
  const width = opts.width != null ? opts.width : 0.6;
  const divertFrac = opts.divertFrac != null ? opts.divertFrac : 0.45;
  const R = opts.radius != null ? opts.radius : 1.5;   // radio de curva (m). Curvas cerradas -> derrape alcanzable.

  // --- ENTRADA: recta +x, con la fuente ---
  const inFrom = [0, 0], inTo = [8, 0];

  // --- CURVA 1: 60° a la izquierda (ccw). Centro arriba del fin de la entrada. ---
  const c1Center = [inTo[0], inTo[1] + R];      // [8, 3]
  const c1a0 = -Math.PI / 2;                    // el fin de la entrada visto desde el centro
  const c1a1 = c1a0 + 60 * D2R;                 // +60°
  const c1End = [c1Center[0] + R * Math.cos(c1a1), c1Center[1] + R * Math.sin(c1a1)];
  const dirAfterC1 = [-Math.sin(c1a1), Math.cos(c1a1)]; // tangente de salida (ccw)

  // --- PRESIÓN: recta diagonal de 6 m. Aquí vive el DESVIADOR y la salida a 30°. ---
  const pressFrom = c1End;
  const pressTo = add(pressFrom, dirAfterC1, 6);

  // ángulo de la recta de presión (para construir la salida a 30°)
  const pressAngDeg = Math.atan2(dirAfterC1[1], dirAfterC1[0]) / D2R; // ~60°

  // --- SALIDA 30°: arranca a 2.5 m del inicio de la presión, hacia la derecha a 30°. ---
  const exitStart = add(pressFrom, dirAfterC1, 2.5);
  const exitDir = dirDeg(pressAngDeg - 30);     // 30° menos = se abre a la derecha
  const exitEnd = add(exitStart, exitDir, 5.5);

  // --- CURVA 2: 60° a la derecha (cw). Vuelve el flujo hacia +x. ---
  const rightNormal = [dirAfterC1[1], -dirAfterC1[0]]; // normal derecha del avance
  const c2Center = add(pressTo, rightNormal, R);
  const c2a0 = Math.atan2(pressTo[1] - c2Center[1], pressTo[0] - c2Center[0]);
  const c2a1 = c2a0 - 60 * D2R;                 // cw -> -60°
  const c2End = [c2Center[0] + R * Math.cos(c2a1), c2Center[1] + R * Math.sin(c2a1)];

  // --- SALIDA: recta +x ---
  const outFrom = c2End;
  const outTo = add(outFrom, [1, 0], 8);

  return {
    meta: { name: 'behavior-line', boxSize: [0.4, 0.13, 0.3] },
    conveyors: [
      { id: 'entrada', kind: 'source', width, speed: v + 0.1,
        geom: { type: 'straight', from: inFrom, to: inTo },
        source: { rate }, next: ['curva1'] },

      { id: 'curva1', kind: 'curve', width, speed: v,
        geom: { type: 'arc', center: c1Center, radius: R, a0: c1a0, a1: c1a1 },
        next: ['presion'] },

      { id: 'presion', kind: 'divert', width, speed: v,
        geom: { type: 'straight', from: pressFrom, to: pressTo },
        divert: { branch: 'salida30', frac: divertFrac, fromFrac: 0.35, side: 'right' },
        next: ['curva2', 'salida30'] },

      { id: 'salida30', kind: 'sink', width, speed: v,
        geom: { type: 'straight', from: exitStart, to: exitEnd },
        sink: true },

      { id: 'curva2', kind: 'curve', width, speed: v * 0.85,
        geom: { type: 'arc', center: c2Center, radius: R, a0: c2a0, a1: c2a1 },
        next: ['salida'] },

      { id: 'salida', kind: 'sink', width, speed: v,
        geom: { type: 'straight', from: outFrom, to: outTo },
        sink: true },
    ],
  };
}

export default { buildBehaviorLine };
