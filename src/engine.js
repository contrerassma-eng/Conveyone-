// engine.js — Motor headless de simulación de transportadores.
//
// No dibuja nada. Calcula, paso a paso (`step(dt)`), el movimiento de las cajas
// sobre una red de tramos. El render consume `frame()`. Toda la física vive aquí y
// se valida con test/harness.mjs antes de cualquier trabajo visual.
//
// Comportamientos preservados (ver docs/principles.md):
//   - Cero presión: una caja nunca invade el `pitch` de la de adelante.
//   - Transferencias con hueco: solo pasa al siguiente tramo si hay espacio al inicio.
//   - Generación realista: fuentes lognormal con tasa, dispersión (cv) y ráfagas.
//   - Procesos con fatiga: estaciones que retienen cajas con tiempo variable.
//   - Cuellos de botella: detección por media móvil de la ocupación.

import { makePath } from './geometry.js';

// --------- RNG determinista (mulberry32) ---------
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Muestra una variable lognormal con media `mean` y coef. de variación `cv`.
function sampleLognormal(rng, mean, cv) {
  if (!cv || cv <= 0) return mean;
  const sigma = Math.sqrt(Math.log(1 + cv * cv));
  const mu = Math.log(mean) - 0.5 * sigma * sigma;
  // Box-Muller
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(mu + sigma * z);
}

let _boxSeq = 0;

export class ConveyorSim {
  constructor(model, opts = {}) {
    this.model = model;
    this.meta = model.meta || {};
    this.boxSize = this.meta.boxSize || [0.4, 0.13, 0.3];
    this.rng = makeRng(opts.seed != null ? opts.seed : 12345);
    this.time = 0;             // segundos simulados
    this.boxes = [];           // todas las cajas vivas
    this.stats = {
      generated: 0, delivered: 0, extracted: 0,
      inSystem: 0, throughput: 0,
    };
    this._deliveredWindow = [];   // marcas de tiempo de entregas (para throughput)
    this._compile();
  }

  _compile() {
    this.segments = new Map();
    for (const s of this.model.segments) {
      const path = makePath(s.geom);
      const seg = {
        id: s.id,
        raw: s,
        path,
        length: path.length,
        height: s.height != null ? s.height : 0.9,
        speed: s.speed != null ? s.speed : 0.5,
        pitch: s.pitch != null ? s.pitch : 0.4,
        next: s.next || [],
        source: s.source || null,
        process: s.process || null,
        sink: !!s.sink,
        pull: s.pull || null,
        // estado de fuente
        _nextGen: 0,
        _routeIx: 0,
        // estado de proceso (estaciones)
        _station: s.process ? makeStation(s.process) : null,
        // media móvil de ocupación (cuellos)
        _occAvg: 0,
        boxes: [],   // cajas en este tramo, se rellena cada step (ordenadas por s desc)
      };
      this.segments.set(s.id, seg);
    }
    // primeras fuentes: programa el primer arribo
    for (const seg of this.segments.values()) {
      if (seg.source) seg._nextGen = this._genInterval(seg);
    }
  }

  _genInterval(seg) {
    // rate en cajas/hora -> intervalo medio en segundos
    const rate = seg.source.rate || 600;
    const meanGap = 3600 / rate;
    const cv = seg.source.cv != null ? seg.source.cv : 0.2;
    return sampleLognormal(this.rng, meanGap, cv);
  }

  // ---------------- paso de simulación ----------------
  step(dt) {
    this.time += dt;
    this._generate(dt);
    this._advance(dt);
    this._transferAndSink();
    this._updateStats(dt);
  }

  _generate(dt) {
    for (const seg of this.segments.values()) {
      if (!seg.source) continue;
      const cap = seg.source.max != null ? seg.source.max : Infinity;
      seg._nextGen -= dt;
      let guard = 0;
      while (seg._nextGen <= 0 && guard++ < 50) {
        if (this.stats.inSystem < cap && this._hasRoomAtStart(seg)) {
          this._spawn(seg);
        }
        // ráfaga: con prob `burst` encadena otra generación inmediata
        const burst = seg.source.burst || 0;
        const extra = this._genInterval(seg);
        seg._nextGen += (burst > 0 && this.rng() < burst) ? extra * 0.15 : extra;
      }
    }
  }

  _hasRoomAtStart(seg) {
    // hay hueco si la caja más atrasada del tramo está al menos a `pitch` del inicio
    let minS = Infinity;
    for (const b of this.boxes) if (b.segId === seg.id) minS = Math.min(minS, b.s);
    return minS === Infinity || minS >= seg.pitch;
  }

  _spawn(seg) {
    const box = { id: ++_boxSeq, segId: seg.id, s: 0, held: 0, bornAt: this.time };
    this.boxes.push(box);
    this.stats.generated++;
  }

  // Avance con cero-presión, resuelto tramo por tramo de adelante hacia atrás.
  _advance(dt) {
    // agrupa cajas por tramo y ordénalas por s descendente (frente primero)
    for (const seg of this.segments.values()) seg.boxes.length = 0;
    for (const b of this.boxes) {
      const seg = this.segments.get(b.segId);
      if (seg) seg.boxes.push(b);
    }
    for (const seg of this.segments.values()) {
      seg.boxes.sort((a, b) => b.s - a.s);
      const pitch = seg.pitch;
      let frontLimit = Infinity; // límite que impone la caja de adelante
      for (let i = 0; i < seg.boxes.length; i++) {
        const box = seg.boxes[i];
        // proceso: si la caja está retenida en una estación, no avanza
        if (this._heldByStation(seg, box, dt)) {
          frontLimit = box.s - pitch;
          continue;
        }
        const target = Math.min(box.s + seg.speed * dt, seg.length, frontLimit - 0);
        box.s = Math.max(box.s, Math.min(target, frontLimit));
        if (box.s > seg.length) box.s = seg.length;
        frontLimit = box.s - pitch; // la siguiente no puede pasar de aquí
      }
    }
  }

  _heldByStation(seg, box, dt) {
    if (!seg.process || !seg._station) return false;
    const st = seg._station;
    const at = seg.process.at;
    // ¿la caja llegó a la posición de trabajo y aún no fue procesada?
    if (box._done) return false;
    if (box.s + 1e-6 < at) return false;
    // fija la caja en `at`
    box.s = at;
    // asigna a una estación libre si no tiene
    if (box._stationIx == null) {
      const free = st.free();
      if (free < 0) { box.held += dt; return true; } // espera turno
      box._stationIx = free;
      box._procTime = stationProcTime(st, free, this.rng, seg.process);
      box._procElapsed = 0;
      st.busy[free] = true;
    }
    box._procElapsed += dt;
    box.held += dt;
    if (box._procElapsed >= box._procTime) {
      st.busy[box._stationIx] = false;
      st.completed++;
      st.tick(dt); // avanza fatiga al completar
      box._done = true;
      box._stationIx = null;
      return false;
    }
    return true;
  }

  _transferAndSink() {
    for (const box of this.boxes) {
      const seg = this.segments.get(box.segId);
      if (!seg) continue;
      if (box.s < seg.length - 1e-6) continue; // aún no llega al final

      // punto de extracción (pull): retira con probabilidad/condición
      if (seg.pull && this._shouldPull(seg, box)) {
        box._remove = true; box._extracted = true; continue;
      }
      if (seg.sink) { box._remove = true; box._delivered = true; continue; }

      const nextId = this._pickNext(seg);
      if (!nextId) { box._remove = true; box._delivered = true; continue; }
      const nseg = this.segments.get(nextId);
      if (nseg && this._hasRoomAtStart(nseg)) {
        box.segId = nextId;
        box.s = 0;
        box._done = false;          // reinicia estado de proceso en el nuevo tramo
        box._stationIx = null;
      }
      // si no hay hueco, la caja espera en el final (acumulación / cero presión)
    }
    // limpia removidas y contabiliza
    if (this.boxes.some(b => b._remove)) {
      const kept = [];
      for (const b of this.boxes) {
        if (b._remove) {
          if (b._delivered) { this.stats.delivered++; this._deliveredWindow.push(this.time); }
          if (b._extracted) this.stats.extracted++;
        } else kept.push(b);
      }
      this.boxes = kept;
    }
  }

  _pickNext(seg) {
    if (!seg.next || seg.next.length === 0) return null;
    if (seg.next.length === 1) return seg.next[0];
    // enrutado round-robin balanceado por hueco disponible
    const n = seg.next.length;
    for (let k = 0; k < n; k++) {
      const ix = (seg._routeIx + k) % n;
      const cand = this.segments.get(seg.next[ix]);
      if (cand && this._hasRoomAtStart(cand)) {
        seg._routeIx = (ix + 1) % n;
        return seg.next[ix];
      }
    }
    return seg.next[seg._routeIx % n];
  }

  _shouldPull(seg, box) {
    const p = seg.pull;
    if (typeof p.every === 'number' && p.every > 0) {
      seg._pullCount = (seg._pullCount || 0) + 1;
      return seg._pullCount % p.every === 0;
    }
    if (typeof p.rate === 'number') return this.rng() < p.rate;
    return false;
  }

  _updateStats(dt) {
    this.stats.inSystem = this.boxes.length;
    // throughput: entregas en los últimos 60 s -> por hora
    const cutoff = this.time - 60;
    while (this._deliveredWindow.length && this._deliveredWindow[0] < cutoff) {
      this._deliveredWindow.shift();
    }
    const span = Math.min(this.time, 60) || 1;
    this.stats.throughput = (this._deliveredWindow.length / span) * 3600;

    // cuellos: media móvil de ocupación por tramo (cajas / capacidad teórica)
    for (const seg of this.segments.values()) {
      const cap = Math.max(1, Math.floor(seg.length / seg.pitch));
      const occ = (seg.boxes.length) / cap;
      seg._occAvg = seg._occAvg * 0.9 + occ * 0.1;
    }
  }

  // ---------------- lectura para el render / HUD ----------------
  frame() {
    const boxes = [];
    for (const b of this.boxes) {
      const seg = this.segments.get(b.segId);
      if (!seg) continue;
      const p = seg.path.pointAt(b.s);
      const d = seg.path.dirAt(b.s);
      boxes.push({
        id: b.id,
        x: p[0], y: seg.height, z: p[1],
        angle: Math.atan2(d[1], d[0]),
        held: b.held > 0,
      });
    }
    return {
      time: this.time,
      boxes,
      segments: this._segmentGeometry(),
      stats: { ...this.stats },
      bottlenecks: this.bottlenecks(),
      boxSize: this.boxSize,
    };
  }

  _segmentGeometry() {
    const out = [];
    for (const seg of this.segments.values()) {
      const N = Math.max(2, Math.ceil(seg.length / 0.5));
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const s = (i / N) * seg.length;
        const p = seg.path.pointAt(s);
        pts.push([p[0], seg.height, p[1]]);
      }
      out.push({ id: seg.id, points: pts, kind: kindOf(seg) });
    }
    return out;
  }

  // Detección de cuellos: tramos con ocupación media alta y sostenida.
  bottlenecks(threshold = 0.7) {
    const list = [];
    for (const seg of this.segments.values()) {
      if (seg._occAvg >= threshold) {
        // ¿el límite está aguas abajo (evacuación) o arriba (alimentación)?
        const downstreamFull = seg.next.some(id => {
          const n = this.segments.get(id);
          return n && n._occAvg >= threshold;
        });
        list.push({ id: seg.id, occupancy: seg._occAvg, cause: downstreamFull ? 'evacuation' : 'feed' });
      }
    }
    return list;
  }

  // Conveniencia: corre N segundos a paso fijo (para warmup/headless).
  run(seconds, dt = 1 / 30) {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) this.step(dt);
    return this;
  }
}

// ---------------- Estaciones con fatiga ----------------
function makeStation(process) {
  const operators = process.operators || 1;
  return {
    operators,
    busy: new Array(operators).fill(false),
    completed: 0,
    fatigue: 0,        // 0..1, sube con el trabajo, baja en pausas
    free() { return this.busy.findIndex(b => !b); },
    tick(dt) {
      // cada completado añade fatiga; se recupera lentamente
      this.fatigue = Math.min(1, this.fatigue + 0.004);
    },
    rest(dt) { this.fatigue = Math.max(0, this.fatigue - 0.02 * dt); },
  };
}

function stationProcTime(st, ix, rng, process) {
  const base = process.time || 2.0;
  const cv = process.cv != null ? process.cv : 0.25;
  // la fatiga estira el tiempo hasta +40%
  const fatigueFactor = 1 + 0.4 * st.fatigue;
  return sampleLognormal(rng, base * fatigueFactor, cv);
}

function kindOf(seg) {
  if (seg.source) return 'source';
  if (seg.sink) return 'sink';
  if (seg.process) return 'process';
  if (seg.pull) return 'pull';
  return 'belt';
}

export { makeRng, sampleLognormal };
