// render.js — Render 3D (Three.js) que SOLO dibuja lo que el motor entrega.
//
// El render no contiene física: en cada cuadro lee `sim.frame()` y actualiza la
// escena. Toda la lógica vive en engine.js. Esto permite reutilizar el mismo render
// en cualquier layout y cambiar el motor sin tocar el dibujo (y viceversa).
//
//   import { ConveyorSim } from './src/engine.js';
//   import { mountSim }   from './src/render.js';
//   const sim = new ConveyorSim(model);
//   mountSim(sim, { container: document.body }).start();

import * as THREE from 'three';

const COLORS = {
  belt: 0x3a4150, source: 0x2e7d32, sink: 0x8e24aa, reject: 0xb71c1c,
  process: 0xf9a825, pull: 0x00897b, buffer: 0x4558a8, sort: 0x546e7a,
  elevator: 0x26c6da, box: 0xc98a3b, boxHeld: 0xe53935,
};

// Paleta para cajas con color (salidas por color del sorter).
const PALETTE = {
  red: 0xe53935, blue: 0x1e88e5, green: 0x43a047, yellow: 0xfdd835,
  orange: 0xfb8c00, purple: 0x8e24aa, cyan: 0x00acc1, pink: 0xd81b60,
};
function boxColor(b) {
  if (b.held) return COLORS.boxHeld;
  if (b.color && PALETTE[b.color] != null) return PALETTE[b.color];
  return COLORS.box;
}

export function mountSim(sim, opts = {}) {
  const container = opts.container || document.body;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1116);

  const camera = new THREE.PerspectiveCamera(55, renderer.domElement.width / renderer.domElement.height, 0.1, 500);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(10, 20, 10);
  scene.add(sun);
  scene.add(new THREE.GridHelper(60, 60, 0x223044, 0x182230));

  // --- tramos (líneas) ---
  const segGroup = new THREE.Group();
  scene.add(segGroup);
  const frame0 = sim.frame();
  const center = sceneCenter(frame0.segments);
  for (const seg of frame0.segments) {
    const pts = seg.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: COLORS[seg.kind] || COLORS.belt });
    segGroup.add(new THREE.Line(geom, mat));
  }

  // --- cajas (instancias) ---
  const [bw, bh, bd] = frame0.boxSize;
  const boxGeom = new THREE.BoxGeometry(bw, bh, bd);
  const boxMat = new THREE.MeshLambertMaterial({ color: COLORS.box });
  const heldMat = new THREE.MeshLambertMaterial({ color: COLORS.boxHeld });
  const MAX = 4000;
  const mesh = new THREE.InstancedMesh(boxGeom, boxMat, MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const dummy = new THREE.Object3D();

  // --- cámara / navegación (órbita táctil: arrastrar = rotar, pellizcar/rueda = zoom) ---
  const extent = sceneExtent(frame0.segments);
  const target = new THREE.Vector3(center.x, 0, center.z);
  const orbit = { radius: extent * 1.4, theta: Math.PI / 4, phi: Math.PI / 3.2 };
  const PHI_MIN = 0.15, PHI_MAX = Math.PI / 2 - 0.02;

  function updateCamera() {
    const r = orbit.radius, t = orbit.theta, p = orbit.phi;
    camera.position.set(
      target.x + r * Math.sin(p) * Math.sin(t),
      target.y + r * Math.cos(p),
      target.z + r * Math.sin(p) * Math.cos(t),
    );
    camera.lookAt(target);
  }
  const views = {
    iso: () => { orbit.theta = Math.PI / 4; orbit.phi = Math.PI / 3.2; orbit.radius = extent * 1.4; updateCamera(); },
    top: () => { orbit.phi = PHI_MIN; orbit.radius = extent * 1.5; updateCamera(); },
    front: () => { orbit.theta = 0; orbit.phi = Math.PI / 2.1; orbit.radius = extent * 1.5; updateCamera(); },
  };
  views.iso();

  // gestos: 1 dedo/ratón = rotar; 2 dedos = pellizco para zoom; rueda = zoom.
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  const ptrs = new Map();
  let pinch0 = 0;
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  el.addEventListener('pointermove', e => {
    const prev = ptrs.get(e.pointerId); if (!prev) return;
    if (ptrs.size >= 2) {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...ptrs.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinch0) orbit.radius = clampNum(orbit.radius * (pinch0 / d), extent * 0.4, extent * 4);
      pinch0 = d;
    } else {
      orbit.theta -= (e.clientX - prev.x) * 0.006;
      orbit.phi = clampNum(orbit.phi - (e.clientY - prev.y) * 0.006, PHI_MIN, PHI_MAX);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    updateCamera();
  });
  const endPtr = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
  el.addEventListener('pointerup', endPtr);
  el.addEventListener('pointercancel', endPtr);
  el.addEventListener('wheel', e => { e.preventDefault(); orbit.radius = clampNum(orbit.radius * (1 + Math.sign(e.deltaY) * 0.1), extent * 0.4, extent * 4); updateCamera(); }, { passive: false });

  // --- HUD ---
  const hud = document.createElement('div');
  Object.assign(hud.style, {
    position: 'absolute', top: '8px', left: '8px', font: '12px monospace',
    color: '#cdd6e0', background: 'rgba(14,17,22,.7)', padding: '8px 10px',
    borderRadius: '6px', whiteSpace: 'pre', pointerEvents: 'none',
  });
  container.appendChild(hud);

  let running = false, raf = 0, last = 0, speedMul = 1;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (running) sim.step(dt * speedMul);
    draw();
  }

  function draw() {
    const f = sim.frame();
    const n = Math.min(f.boxes.length, MAX);
    for (let i = 0; i < n; i++) {
      const b = f.boxes[i];
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, -b.angle, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt && mesh.setColorAt(i, new THREE.Color(boxColor(b)));
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const s = f.stats;
    let txt =
      `t=${f.time.toFixed(1)}s\n` +
      `generadas ${s.generated}  liberadas ${s.released || 0}  rechazo ${s.rejected || 0}\n` +
      `en sistema ${s.inSystem}  throughput ${Math.round(s.throughput)}/h\n`;
    if (f.buffers && f.buffers.length) {
      txt += `buffers: ${f.buffers.map(b => `${b.color} ${b.count}/${b.cap}`).join('  ')}\n`;
    }
    if (f.pocket) {
      txt += `virtual pocket -> demanda: ${(f.pocket.demand || ['FIFO']).join('+')} (x${f.pocket.remaining})\n`;
    }
    txt += `cuellos: ${f.bottlenecks.map(b => `${b.id}(${b.cause})`).join(', ') || '—'}`;
    hud.textContent = txt;
    renderer.render(scene, camera);
  }

  addEventListener('resize', () => {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  });

  const api = {
    start() { if (!running) { running = true; last = performance.now(); } if (!raf) raf = requestAnimationFrame(tick); return api; },
    stop() { running = false; return api; },
    setSpeed(m) { speedMul = m; return api; },
    view(name) { (views[name] || views.iso)(); return api; },
    sim, scene, camera, renderer,
  };
  // warmup: corre headless unos segundos para abrir ya con cajas en movimiento
  if (opts.warmup !== false) sim.run(opts.warmup || 8);
  raf = requestAnimationFrame(tick);
  return api;
}

function sceneCenter(segments) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const seg of segments) for (const p of seg.points) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
}

function sceneExtent(segments) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const seg of segments) for (const p of seg.points) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  return Math.max(8, Math.hypot(maxX - minX, maxZ - minZ));
}

function clampNum(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
