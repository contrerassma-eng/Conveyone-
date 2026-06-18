// geometry.js — Caminos paramétricos para los tramos del transportador.
//
// Cada camino expone una parametrización por longitud de arco `s` (en metros):
//   - length        longitud total del camino
//   - pointAt(s)    -> [x, y] posición en el plano a distancia s del inicio
//   - dirAt(s)      -> [dx, dy] vector unitario tangente (sentido de avance)
//
// El motor (engine.js) trabaja SOLO en términos de `s`; nunca necesita saber si el
// tramo es recta, arco o polilínea. El render usa pointAt/dirAt para dibujar y para
// orientar las cajas. Esta abstracción es la que permite curvas (Hytrol y demás)
// sin tocar la física.

const TWO_PI = Math.PI * 2;

function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
function len2(a) { return Math.hypot(a[0], a[1]); }

// ---------- Recta ----------
function straight(geom) {
  const from = geom.from, to = geom.to;
  const d = sub(to, from);
  const length = len2(d);
  const ux = length > 0 ? d[0] / length : 1;
  const uy = length > 0 ? d[1] / length : 0;
  return {
    type: 'straight',
    length,
    pointAt(s) {
      const t = clamp(s, 0, length);
      return [from[0] + ux * t, from[1] + uy * t];
    },
    dirAt() { return [ux, uy]; },
  };
}

// ---------- Arco ----------
// Gira desde a0 hasta a1 alrededor de `center` con radio `radius`. El sentido
// (horario / antihorario) se infiere del signo de (a1 - a0).
function arc(geom) {
  const center = geom.center, radius = geom.radius;
  const a0 = geom.a0, a1 = geom.a1;
  const sweep = a1 - a0;                 // con signo
  const length = Math.abs(sweep) * radius;
  const sign = sweep >= 0 ? 1 : -1;
  return {
    type: 'arc',
    length,
    center, radius, a0, a1,
    pointAt(s) {
      const t = clamp(s, 0, length);
      const a = a0 + sign * (t / radius);
      return [center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)];
    },
    dirAt(s) {
      const t = clamp(s, 0, length);
      const a = a0 + sign * (t / radius);
      // tangente: derivada de (cos,sin) -> (-sin,cos), por el sentido
      return [-sign * Math.sin(a), sign * Math.cos(a)];
    },
  };
}

// ---------- Polilínea ----------
// Secuencia de puntos unidos por rectas. Útil para trazados libres del modelador.
function polyline(geom) {
  const pts = geom.points;
  const segs = [];
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const d = sub(b, a);
    const l = len2(d);
    if (l === 0) continue;
    segs.push({ a, ux: d[0] / l, uy: d[1] / l, l, s0: length });
    length += l;
  }
  return {
    type: 'polyline',
    length,
    pointAt(s) {
      const t = clamp(s, 0, length);
      const seg = locate(segs, t);
      const local = t - seg.s0;
      return [seg.a[0] + seg.ux * local, seg.a[1] + seg.uy * local];
    },
    dirAt(s) {
      const t = clamp(s, 0, length);
      const seg = locate(segs, t);
      return [seg.ux, seg.uy];
    },
  };
}

function locate(segs, t) {
  for (let i = 0; i < segs.length; i++) {
    if (t <= segs[i].s0 + segs[i].l) return segs[i];
  }
  return segs[segs.length - 1];
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ---------- Elevador (camino vertical) ----------
// Footprint fijo en el plano (`at`), pero recorre en ALTURA de h0 a h1. La longitud
// del camino es el recorrido vertical; la altura la interpola el motor (heightFrom/To).
function lift(geom) {
  const at = geom.at || [0, 0];
  const length = Math.max(1e-6, Math.abs((geom.h1 != null ? geom.h1 : 1) - (geom.h0 != null ? geom.h0 : 0)));
  return {
    type: 'lift', length, h0: geom.h0, h1: geom.h1, at,
    pointAt() { return [at[0], at[1]]; },
    dirAt() { return [1, 0]; },
  };
}

// Fábrica: a partir de un descriptor `geom` produce el camino compilado.
export function makePath(geom) {
  switch (geom.type) {
    case 'straight': return straight(geom);
    case 'arc': return arc(geom);
    case 'polyline': return polyline(geom);
    case 'lift': return lift(geom);
    default: throw new Error(`geometry: tipo desconocido '${geom.type}'`);
  }
}

export const _internals = { clamp, TWO_PI };
