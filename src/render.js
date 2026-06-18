// render.js — Render 3D (Three.js) que SOLO dibuja lo que el motor entrega.
//
// Genérico y data-driven: en cada cuadro lee `sim.frame()` y dibuja. Toda la física
// vive en engine.js. Para "otro proceso" no se reescribe el 3D: se entrega otro modelo.
//
//   import { ConveyorSim } from './src/engine.js';
//   import { mountSim }   from './src/render.js';
//   mountSim(new ConveyorSim(model), { container: document.body }).start();
//
// Navegación con OrbitControls (un dedo = rotar, dos dedos = zoom/pan). Encuadre
// automático a los límites del modelo, luces hemisférica + direccional, y sonda WebGL.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const KIND_COLORS = {
  belt: 0x8a929c, source: 0x2e7d32, sink: 0x8e24aa, reject: 0xb71c1c,
  process: 0xf9a825, pull: 0x00897b, buffer: 0x3f51b5, sort: 0x6b7a8f,
  elevator: 0x26c6da,
};
const PALETTE = {
  red: 0xe53935, blue: 0x1e88e5, green: 0x43a047, yellow: 0xfdd835,
  orange: 0xfb8c00, purple: 0x8e24aa, cyan: 0x00acc1, pink: 0xd81b60,
};
function boxColorHex(b) {
  if (b.held) return 0xff7043;
  if (b.color && PALETTE[b.color] != null) return PALETTE[b.color];
  return 0xc8a073; // cartón
}

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

export function mountSim(sim, opts = {}) {
  const container = opts.container || document.body;

  if (!webglOK()) {
    container.innerHTML = '<div style="color:#fff;padding:24px;font:16px system-ui">' +
      'Tu navegador no tiene WebGL activo. Prueba otro navegador o actívalo en ajustes ' +
      '(Safari: Ajustes → Safari → Avanzado → WebGL).</div>';
    const noop = { start() { return noop; }, stop() { return noop; }, setSpeed() { return noop; }, view() { return noop; } };
    return noop;
  }

  const W = () => container.clientWidth || window.innerWidth;
  const H = () => container.clientHeight || window.innerHeight;
  const small = Math.min(W(), H()) < 700;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117);

  const camera = new THREE.PerspectiveCamera(52, W() / H(), 0.1, 3000);

  const renderer = new THREE.WebGLRenderer({ antialias: !small, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.setSize(W(), H());
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Luces: sin esto, MeshStandardMaterial se ve negro.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2f38, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(8, 18, 10);
  scene.add(sun);

  // --- límites del modelo (para encuadre y grilla) ---
  const frame0 = sim.frame();
  const b = computeBounds(frame0.segments);

  const grid = new THREE.GridHelper(Math.ceil(b.span * 2), Math.ceil(b.span * 2), 0x2a3550, 0x18202c);
  grid.position.set(b.cx, 0, b.cz);
  scene.add(grid);

  // --- tramos como líneas (rectas, arcos y elevadores por igual) ---
  const segGroup = new THREE.Group();
  scene.add(segGroup);
  for (const seg of frame0.segments) {
    const pts = seg.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    segGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: KIND_COLORS[seg.kind] || KIND_COLORS.belt })));
  }

  // --- cajas: una malla por caja viva (pool por id) ---
  const [bw, bh, bd] = frame0.boxSize;
  const boxGeo = new THREE.BoxGeometry(bw, bh, bd);
  const pool = new Map();
  function updateBoxes(boxes) {
    const seen = new Set();
    for (const bx of boxes) {
      seen.add(bx.id);
      let m = pool.get(bx.id);
      if (!m) {
        m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 }));
        scene.add(m); pool.set(bx.id, m);
      }
      m.material.color.setHex(boxColorHex(bx));
      m.position.set(bx.x, bx.y + bh / 2 + 0.02, bx.z);
      m.rotation.set(0, Math.atan2(bx.dx, bx.dz), 0);
    }
    for (const [id, m] of pool) if (!seen.has(id)) { scene.remove(m); pool.delete(id); }
  }

  // --- vistas (encuadradas a los límites) ---
  const views = {
    iso: { pos: [b.cx + b.span * 0.7, b.span * 0.85, b.cz - b.span * 0.7], tar: [b.cx, 0.6, b.cz] },
    top: { pos: [b.cx, b.span * 1.7, b.cz + 0.01], tar: [b.cx, 0, b.cz] },
    front: { pos: [b.cx, b.span * 0.5, b.cz - b.span * 1.15], tar: [b.cx, 0.8, b.cz] },
  };
  function applyView(v) {
    camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
    controls.target.set(v.tar[0], v.tar[1], v.tar[2]);
    controls.update();
  }
  applyView(views.iso);

  // --- HUD ---
  const hud = document.createElement('div');
  Object.assign(hud.style, {
    position: 'absolute', top: '8px', left: '8px', font: '12px monospace',
    color: '#cdd6e0', background: 'rgba(13,17,23,.72)', padding: '8px 10px',
    borderRadius: '6px', whiteSpace: 'pre', pointerEvents: 'none', zIndex: 5,
  });
  container.appendChild(hud);

  let running = false, raf = 0, last = 0, speedMul = 1;

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    if (running) {
      const steps = Math.max(1, Math.round((dt * speedMul) / 0.033));
      for (let k = 0; k < steps; k++) sim.step(0.033 * speedMul);
    }
    const f = sim.frame();
    updateBoxes(f.boxes);
    controls.update();
    renderer.render(scene, camera);

    const s = f.stats;
    let t = `t=${f.time.toFixed(1)}s   generadas ${s.generated}   liberadas ${s.released || 0}   rechazo ${s.rejected || 0}\n` +
            `en sistema ${s.inSystem}   throughput ${Math.round(s.throughput)}/h`;
    if (f.buffers && f.buffers.length) {
      t += `\nbuffers: ${f.buffers.slice(0, 4).map(x => `${x.color} ${x.count}/${x.cap}`).join('  ')}`;
    }
    if (f.pocket) t += `\nvirtual pocket → demanda: ${(f.pocket.demand || ['FIFO']).join('+')}`;
    if (f.bottlenecks.length) t += `\ncuellos: ${f.bottlenecks.slice(0, 4).map(x => x.id).join(', ')}`;
    hud.textContent = t;
  }

  function onResize() {
    camera.aspect = W() / H(); camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
  }
  addEventListener('resize', onResize);

  const api = {
    start() { if (!running) { running = true; last = performance.now(); } if (!raf) raf = requestAnimationFrame(loop); return api; },
    stop() { running = false; return api; },
    setSpeed(m) { speedMul = m; return api; },
    view(name) { applyView(views[name] || views.iso); return api; },
    sim, scene, camera, renderer, controls,
  };

  // warmup: corre el motor sin dibujar para abrir ya con cajas en movimiento
  if (opts.warmup !== false) {
    const dtW = 0.08, n = Math.floor((opts.warmup || 8) / dtW);
    for (let k = 0; k < n; k++) sim.step(dtW);
  }
  raf = requestAnimationFrame(loop);
  return api;
}

function computeBounds(segments) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const seg of segments) for (const p of seg.points) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  if (!isFinite(minX)) { minX = maxX = minZ = maxZ = 0; }
  const w = maxX - minX, h = maxZ - minZ;
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w, h, span: Math.max(w, h, 6) };
}
