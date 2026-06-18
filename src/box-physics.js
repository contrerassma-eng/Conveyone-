// box-physics.js — Motor 2D de COMPORTAMIENTO de la caja (con colisiones e inercia).
//
// A diferencia de engine.js (cero presión: las cajas NUNCA se tocan y van pegadas a
// la línea), este motor modela la caja como un cuerpo libre en el plano:
//
//   - El transportador EMPUJA la caja hacia la velocidad de banda (tracción con tope).
//   - Las cajas CHOCAN entre sí y transmiten el empuje (acumulación con contacto).
//   - Al frenar un equipo, la de atrás embiste a la de adelante (cuello / culebreo).
//   - En una curva la caja tiende a seguir RECTO (su vector de avance). La guía/riel
//     la obliga a girar; si el empuje o la velocidad superan la fuerza de la guía,
//     la caja se SALE de la curva (derrape / pérdida de trayectoria).
//
// No dibuja nada. El render lee frame(). La física se valida en test/box-physics.mjs.
//
// Es deliberadamente independiente de engine.js (no lo toca ni lo importa): es "otro
// simulador" derivado del mismo repositorio, enfocado solo en la caja, sin alturas.

import { makePath } from './geometry.js';

// ---------------- RNG determinista (mulberry32) ----------------
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- Constantes físicas (afinables desde el HUD) ----------------
export const DEFAULTS = {
  tau: 0.18,            // s, constante de tiempo de la tracción (qué tan rápido la caja toma la velocidad de banda)
  tractionMax: 6.0,     // m/s², tope de aceleración que la banda puede imprimir (grip)
  railK: 700,           // rigidez de la guía/riel lateral
  railC: 12,            // amortiguación de la guía (solo cuando NO está saturada)
  railMax: 3.0,         // m/s², FUERZA MÁXIMA de la guía (≈ centrípeta máx). Si v²/R la supera -> derrape
  derailPen: 0.13,      // m, penetración del riel que confirma el derrape (caja fuera de la banda)
  latFric: 1.2,         // fricción lateral de la banda (resiste el deslizamiento de costado)
  friction: 1.4,        // fricción al coastear fuera de la banda (caja derrapada)
  restitution: 0.04,    // rebote en choques (casi inelástico: las cajas se "amontonan")
  colRadius: 0.18,      // m, radio de colisión de la caja
};

let _seq = 0;

export class BoxFlowSim {
  constructor(model, opts = {}) {
    this.model = model;
    this.meta = model.meta || {};
    this.boxSize = this.meta.boxSize || [0.4, 0.13, 0.3];
    this.rng = makeRng(opts.seed != null ? opts.seed : 7);
    this.cfg = { ...DEFAULTS, ...(opts.cfg || {}) };
    this.time = 0;
    this.boxes = [];
    this.stats = { generated: 0, delivered: 0, diverted: 0, derailed: 0, inSystem: 0, contacts: 0 };
    this._compile();
  }

  _compile() {
    this.conveyors = [];
    this.byId = new Map();
    for (const c of this.model.conveyors) {
      const path = makePath(c.geom);
      const conv = {
        id: c.id,
        raw: c,
        geom: c.geom,
        path,
        length: path.length,
        width: c.width != null ? c.width : 0.6,
        speed: c.speed != null ? c.speed : 0.5,
        baseSpeed: c.speed != null ? c.speed : 0.5,
        next: c.next || [],
        source: c.source || null,
        sink: !!c.sink,
        divert: c.divert || null,     // { branch, frac, fromFrac, side:'left'|'right' }
        kind: c.kind || (c.source ? 'source' : c.sink ? 'sink' : c.divert ? 'divert' : c.geom.type === 'arc' ? 'curve' : 'belt'),
        _nextGen: 0,
      };
      this.conveyors.push(conv);
      this.byId.set(c.id, conv);
    }
  }

  setSpeed(id, speed) { const c = this.byId.get(id); if (c) c.speed = Math.max(0, speed); }
  setConfig(patch) { Object.assign(this.cfg, patch); }
  reset() { this.time = 0; this.boxes = []; _seq = 0; this.stats = { generated: 0, delivered: 0, diverted: 0, derailed: 0, inSystem: 0, contacts: 0 }; for (const c of this.conveyors) c._nextGen = 0; }

  // ---------------- proyección de un punto sobre una vía ----------------
  // Devuelve { s, lateral, latDir:[x,y], tangent:[x,y], L, onPath }.
  //   lateral  = desplazamiento perpendicular firmado (a lo largo de latDir)
  //   latDir   = dirección en la que se mide `lateral` (normal izq. en recta, radial en arco)
  _project(conv, P) {
    const g = conv.geom;
    if (g.type === 'arc') return projectArc(g, P);
    return projectStraight(g, P);
  }

  // ¿el punto cae dentro del footprint de la vía? (con un pequeño margen en los extremos)
  _contains(conv, P, margin = 0.0) {
    const pr = this._project(conv, P);
    const half = conv.width / 2 + this.cfg.colRadius;
    return pr.s >= -0.05 && pr.s <= pr.L + 0.05 && Math.abs(pr.lateral) <= half + margin;
  }

  // ---------------- paso ----------------
  step(dt) {
    this.time += dt;
    this._spawn(dt);
    this._assign();
    this._forces(dt);
    this._integrate(dt);
    this._collisions();
    this._handoff();
    this._stats();
  }

  _spawn(dt) {
    for (const conv of this.conveyors) {
      if (!conv.source) continue;
      const rate = conv.source.rate || 600;       // cajas/hora
      conv._nextGen -= dt;
      if (conv._nextGen > 0) continue;
      conv._nextGen += 3600 / rate;
      // hueco en la boca: ninguna caja dentro de un radio de arranque
      const start = conv.path.pointAt(0);
      const gap = this.cfg.colRadius * 2 + 0.12;
      let room = true;
      for (const b of this.boxes) { if (Math.hypot(b.p[0] - start[0], b.p[1] - start[1]) < gap) { room = false; break; } }
      if (!room) continue;
      const dir = conv.path.dirAt(0);
      this.boxes.push({
        id: ++_seq, convId: conv.id,
        p: [start[0], start[1]],
        v: [dir[0] * conv.speed, dir[1] * conv.speed],
        offTrack: false, divert: false, divertChecked: false,
        state: 'ok', bornAt: this.time,
      });
      this.stats.generated++;
    }
  }

  // Cada caja se queda en la vía cuyo footprint la contiene mejor (con histéresis hacia
  // la actual). Así la transferencia entre vías es geométrica y continua.
  _assign() {
    for (const b of this.boxes) {
      // una caja derrapada NO se recupera: se salió de la línea (coastea hasta perderse).
      if (b.offTrack) continue;
      const cur = this.byId.get(b.convId);
      if (!cur) continue;
      const pr = this._project(cur, b.p);

      // DESVIADOR: al pasar el punto de desvío, decide (una vez) si la caja toma la rama.
      if (cur.divert) {
        const fromFrac = cur.divert.fromFrac != null ? cur.divert.fromFrac : 0.4;
        if (!b.divertChecked && pr.s >= fromFrac * pr.L) {
          b.divertChecked = true;
          b.divert = this.rng() < (cur.divert.frac != null ? cur.divert.frac : 0.5);
        }
        // si va desviada y ya alcanzó el punto de desvío, el desviador la pasa a la rama
        if (b.divert && b.divertChecked && pr.s >= fromFrac * pr.L) {
          if (!b._countedDivert) { b._countedDivert = true; this.stats.diverted++; }
          this._switchTo(b, cur.divert.branch);
          continue;
        }
      }

      // handoff normal: la vía cuyo footprint contiene mejor a la caja (histéresis a la actual)
      const best = this._bestConveyor(b.p, b.convId, [b.convId, ...cur.next]);
      if (best && best !== b.convId) this._switchTo(b, best);
    }
  }

  // Traspaso a otra vía: realinea la velocidad con la tangente de la nueva vía (mantiene
  // la rapidez). En curvas el empalme es tangencial (no cambia nada); en el desvío a 30°
  // hace que la caja se "despegue" limpio en esa dirección, sin falso derrape.
  _switchTo(b, id) {
    b.convId = id;
    const nseg = this.byId.get(id);
    if (!nseg) return;
    const npr = this._project(nseg, b.p);
    const spd = Math.hypot(b.v[0], b.v[1]);
    b.v[0] = npr.tangent[0] * spd; b.v[1] = npr.tangent[1] * spd;
  }

  _bestConveyor(P, prefer, ids = null) {
    const list = ids ? ids.map(id => this.byId.get(id)).filter(Boolean) : this.conveyors;
    let best = null, bestLat = Infinity;
    let preferOk = false;
    for (const conv of list) {
      const pr = this._project(conv, P);
      const half = conv.width / 2 + this.cfg.colRadius;
      const inside = pr.s >= -0.05 && pr.s <= pr.L + 0.05 && Math.abs(pr.lateral) <= half;
      if (!inside) continue;
      if (conv.id === prefer) preferOk = true;
      if (Math.abs(pr.lateral) < bestLat) { bestLat = Math.abs(pr.lateral); best = conv.id; }
    }
    // histéresis: si la vía actual aún contiene la caja, quédate en ella salvo que
    // otra sea claramente mejor (caja claramente más centrada en la otra).
    if (preferOk && best !== prefer) {
      const prc = this.byId.get(prefer);
      const prp = this._project(prc, P);
      if (Math.abs(prp.lateral) < bestLat + 0.08) return prefer;
    }
    return best;
  }

  _forces(dt) {
    const cfg = this.cfg;
    for (const b of this.boxes) {
      b._a = [0, 0];
      const conv = this.byId.get(b.convId);
      if (b.offTrack || !conv) {
        // caja derrapada: sin tracción, solo fricción -> coastea en línea recta
        b._a[0] -= b.v[0] * cfg.friction;
        b._a[1] -= b.v[1] * cfg.friction;
        b.state = 'derail';
        continue;
      }
      const pr = this._project(conv, b.p);

      // 1) TRACCIÓN: la banda ajusta la velocidad LONGITUDINAL hacia la de banda, a lo
      //    largo de la tangente. NO redirige la inercia lateral: la caja "quiere seguir
      //    recto" y es la guía (paso 2) la que debe doblarla en la curva.
      const tx = pr.tangent[0], ty = pr.tangent[1];
      const vt = b.v[0] * tx + b.v[1] * ty;        // componente tangencial actual
      let dvt = (conv.speed - vt) / cfg.tau;
      if (dvt > cfg.tractionMax) dvt = cfg.tractionMax;
      else if (dvt < -cfg.tractionMax) dvt = -cfg.tractionMax;
      b._a[0] += dvt * tx; b._a[1] += dvt * ty;
      // fricción lateral de la banda: resiste el deslizamiento de costado (no centra).
      const vl = b.v[0] * pr.latDir[0] + b.v[1] * pr.latDir[1];
      b._a[0] -= cfg.latFric * vl * pr.latDir[0];
      b._a[1] -= cfg.latFric * vl * pr.latDir[1];

      // Una caja en proceso de desvío está GUIADA por el brazo del desviador: cruza el
      // borde de la vía principal hacia la rama a propósito, así que no se le aplica el
      // riel principal ni cuenta como derrape (eso lo decide _forces más abajo).
      const beingDiverted = !!(conv.divert && b.divert);

      // 2) GUÍA / RIEL lateral: mantiene la caja dentro del ancho. Aquí vive el
      //    derrape: en curva, redirigir la caja exige fuerza; si supera railMax, se sale.
      const half = conv.width / 2 - cfg.colRadius;
      const over = Math.abs(pr.lateral) - half;
      if (over > 0 && !beingDiverted) {
        const sgn = pr.lateral > 0 ? 1 : -1;
        // Fuerza de guía = resorte hacia adentro, TOPADA en railMax (capacidad del riel).
        let f = cfg.railK * over;
        const saturated = f > cfg.railMax;
        if (saturated) f = cfg.railMax;
        else {
          // amortiguación suave solo cuando NO está saturada (estabilidad, no dispara derrape)
          const outwardV = b.v[0] * pr.latDir[0] * sgn + b.v[1] * pr.latDir[1] * sgn;
          f = Math.min(cfg.railMax, f + cfg.railC * Math.max(0, outwardV));
        }
        b._a[0] -= sgn * pr.latDir[0] * f;
        b._a[1] -= sgn * pr.latDir[1] * f;
        // DERRAPE: la caja penetró el riel más que el margen porque la fuerza topada no
        // alcanzó a redirigirla (v²/R > railMax) o la empujaron por encima del riel.
        // Un derrape es un incidente: se cuenta una sola vez por caja.
        if (over > cfg.derailPen) {
          b.offTrack = true; b.state = 'derail';
          if (!b._everDerailed) { b._everDerailed = true; this.stats.derailed++; }
        }
      }

      // (El desvío se resuelve en _assign como un traspaso temprano a la rama: el
      //  desviador "agarra" la caja en el punto de desvío y la pasa a la salida a 30°.)

      // estado para el render: contacto se marca en _collisions; aquí ok/divert
      b.state = b.divert ? 'divert' : 'ok';
    }
  }

  _integrate(dt) {
    for (const b of this.boxes) {
      b.v[0] += b._a[0] * dt; b.v[1] += b._a[1] * dt;
      b.p[0] += b.v[0] * dt; b.p[1] += b.v[1] * dt;
    }
  }

  // Colisiones caja-caja: separación posicional + impulso (casi inelástico). Es lo que
  // produce la acumulación con contacto y el "culebreo" (las cajas se empujan de lado).
  _collisions() {
    const r = this.cfg.colRadius, minD = 2 * r, e = this.cfg.restitution;
    const n = this.boxes.length;
    let contacts = 0;
    for (let i = 0; i < n; i++) {
      const a = this.boxes[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.boxes[j];
        let dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1];
        let d = Math.hypot(dx, dy);
        if (d >= minD || d === 0) { if (d === 0) { dx = 1e-3; dy = 0; d = 1e-3; } else continue; }
        if (d >= minD) continue;
        contacts++;
        const nx = dx / d, ny = dy / d;
        const pen = minD - d;
        // separa por igual
        const corr = pen / 2;
        a.p[0] -= nx * corr; a.p[1] -= ny * corr;
        b.p[0] += nx * corr; b.p[1] += ny * corr;
        // impulso normal
        const rvn = (b.v[0] - a.v[0]) * nx + (b.v[1] - a.v[1]) * ny;
        if (rvn < 0) {
          const jimp = -(1 + e) * rvn / 2;
          a.v[0] -= jimp * nx; a.v[1] -= jimp * ny;
          b.v[0] += jimp * nx; b.v[1] += jimp * ny;
          if (!a.offTrack) a.state = 'contact';
          if (!b.offTrack) b.state = 'contact';
        }
      }
    }
    this.stats.contacts = contacts;
  }

  _handoff() {
    const kept = [];
    for (const b of this.boxes) {
      const conv = this.byId.get(b.convId);
      if (!conv) { // sin vía
        if (this._outOfBounds(b.p)) continue; // se perdió fuera del layout
        kept.push(b); continue;
      }
      const pr = this._project(conv, b.p);
      if (b.offTrack) {
        if (this._outOfBounds(b.p)) continue; // caja derrapada que salió del área
        kept.push(b); continue;
      }
      if (pr.s >= pr.L - 1e-3) {
        // llegó al final de la vía
        if (conv.sink && (!conv.next || conv.next.length === 0)) {
          this.stats.delivered++; continue; // entregada
        }
        if (!conv.next || conv.next.length === 0) {
          // fin sin continuación ni sink declarado: sigue libre (puede derrapar/perderse)
          if (this._outOfBounds(b.p)) continue;
        }
      }
      kept.push(b);
    }
    this.boxes = kept;
  }

  _outOfBounds(P) {
    const bb = this.bounds();
    const m = 3;
    return P[0] < bb.minX - m || P[0] > bb.maxX + m || P[1] < bb.minY - m || P[1] > bb.maxY + m;
  }

  _stats() { this.stats.inSystem = this.boxes.length; }

  // límites del layout (para encuadre y "fuera de área")
  bounds() {
    if (this._bounds) return this._bounds;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const conv of this.conveyors) {
      const N = Math.max(2, Math.ceil(conv.length / 0.3));
      for (let i = 0; i <= N; i++) {
        const p = conv.path.pointAt((i / N) * conv.length);
        const w = conv.width / 2 + 0.3;
        minX = Math.min(minX, p[0] - w); maxX = Math.max(maxX, p[0] + w);
        minY = Math.min(minY, p[1] - w); maxY = Math.max(maxY, p[1] + w);
      }
    }
    if (!isFinite(minX)) { minX = maxX = minY = maxY = 0; }
    this._bounds = { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
    return this._bounds;
  }

  // ---------------- lectura para el render ----------------
  frame() {
    const boxes = this.boxes.map(b => ({
      id: b.id, x: b.p[0], y: b.p[1],
      angle: Math.atan2(b.v[1], b.v[0]),
      speed: Math.hypot(b.v[0], b.v[1]),
      state: b.state,
    }));
    return {
      time: this.time,
      boxes,
      conveyors: this._geometry(),
      stats: { ...this.stats },
      boxSize: this.boxSize,
      bounds: this.bounds(),
    };
  }

  _geometry() {
    const out = [];
    for (const conv of this.conveyors) {
      const N = Math.max(2, Math.ceil(conv.length / 0.25));
      const center = [], left = [], right = [];
      const halfW = conv.width / 2;
      for (let i = 0; i <= N; i++) {
        const s = (i / N) * conv.length;
        const p = conv.path.pointAt(s);
        const d = conv.path.dirAt(s);
        const nx = -d[1], ny = d[0];
        center.push([p[0], p[1]]);
        left.push([p[0] + nx * halfW, p[1] + ny * halfW]);
        right.push([p[0] - nx * halfW, p[1] - ny * halfW]);
      }
      out.push({ id: conv.id, kind: conv.kind, width: conv.width, speed: conv.speed, baseSpeed: conv.baseSpeed, center, left, right });
    }
    return out;
  }

  run(seconds, dt = 1 / 60) { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) this.step(dt); return this; }
}

// ================= proyecciones de geometría =================
function projectStraight(g, P) {
  const ax = g.from[0], ay = g.from[1];
  const dx = g.to[0] - ax, dy = g.to[1] - ay;
  const L = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / L, uy = dy / L;        // tangente
  const nx = -uy, ny = ux;               // normal izquierda
  const rx = P[0] - ax, ry = P[1] - ay;
  const s = rx * ux + ry * uy;
  const lateral = rx * nx + ry * ny;
  return { s, lateral, latDir: [nx, ny], tangent: [ux, uy], L, onPath: s >= 0 && s <= L };
}

function projectArc(g, P) {
  const C = g.center, R = g.radius;
  const a0 = g.a0, a1 = g.a1;
  const sweep = a1 - a0, sign = sweep >= 0 ? 1 : -1, sweepAbs = Math.abs(sweep);
  const L = sweepAbs * R;
  const dx = P[0] - C[0], dy = P[1] - C[1];
  const r = Math.hypot(dx, dy) || 1e-6;
  const ang = Math.atan2(dy, dx);
  let dAng = (ang - a0) * sign;           // avance angular firmado a lo largo del sweep
  while (dAng < -Math.PI) dAng += 2 * Math.PI;
  while (dAng > Math.PI) dAng -= 2 * Math.PI;
  const sClamped = Math.max(0, Math.min(dAng, sweepAbs));
  const s = sClamped * R;
  const a = a0 + sign * sClamped;
  const tangent = [-sign * Math.sin(a), sign * Math.cos(a)];
  const latDir = [dx / r, dy / r];        // radial hacia afuera
  const lateral = r - R;                  // + = afuera de la curva
  return { s, lateral, latDir, tangent, L, onPath: dAng >= 0 && dAng <= sweepAbs };
}

export { makeRng };
export const _internals = { projectStraight, projectArc };
