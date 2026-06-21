// builder-ui.js — Modelador 3D de transportadores (UI + escena three.js). Inyecta su
// propia interfaz y monta la escena; lo usan páginas-cáscara como modelador.html (raíz)
// y examples/builder.html. Requiere un importmap con `three` y `three/addons/` (CDN).
//
//   import { initBuilder } from './src/builder-ui.js';
//   initBuilder();   // construye DOM + escena y arranca
//
// Toda la lógica de conveyors vive en catalog.js; aquí solo está la interacción visual.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { createConveyorLibrary } from './catalog.js';
import { ConveyorSim } from './engine.js';

const CSS = `
  :root { --bg:#0e1116; --fg:#cdd6e0; --panel:rgba(20,26,34,.96); --line:#2a3645; --accent:#4da3ff; }
  html,body { margin:0; height:100%; background:var(--bg); overflow:hidden; }
  body { font:13px system-ui,sans-serif; color:var(--fg); }
  #app { position:fixed; inset:0; }
  .pane { position:fixed; z-index:20; background:var(--panel); border:1px solid var(--line); border-radius:12px; box-sizing:border-box; }
  #lib { top:10px; left:10px; width:230px; max-height:92vh; overflow:auto; padding:10px; }
  #lib h1 { font-size:13px; margin:0 0 8px; }
  #lib .grp { font:700 11px system-ui; color:#8fa3bd; margin:8px 0 3px; text-transform:uppercase; letter-spacing:.4px; }
  #lib button { width:100%; text-align:left; background:#161d28; color:var(--fg); border:1px solid var(--line); border-radius:8px; padding:7px 8px; margin:2px 0; cursor:pointer; font-size:11px; line-height:1.25; }
  #lib button:hover { border-color:var(--accent); }
  #insp { top:10px; right:10px; width:236px; max-height:92vh; overflow:auto; padding:12px; display:none; }
  #insp h2 { font-size:13px; margin:0 0 8px; color:#9fc3ff; }
  #insp label { display:grid; grid-template-columns:1fr 70px; gap:6px; align-items:center; font-size:11px; color:#aeb9c6; margin:5px 0; }
  #insp input { background:#121821; color:#fff; border:1px solid var(--line); border-radius:6px; padding:5px; font-size:11px; text-align:right; }
  #insp .note { font-size:10px; color:#7f8ca3; line-height:1.35; margin-top:6px; }
  #insp .del { width:100%; margin-top:8px; background:#3a1620; color:#ffb4b4; border:1px solid #5a2330; border-radius:8px; padding:7px; cursor:pointer; font-size:11px; }
  #bar { left:50%; transform:translateX(-50%); bottom:12px; display:flex; gap:6px; padding:7px; align-items:center; flex-wrap:wrap; max-width:96vw; }
  #bar button { background:#1b2330; color:var(--fg); border:1px solid var(--line); border-radius:8px; padding:8px 12px; cursor:pointer; font:600 12px system-ui; }
  #bar button.on { border-color:var(--accent); color:#fff; background:#1e3559; }
  #bar .ctl { display:flex; align-items:center; gap:4px; font-size:11px; color:#aeb9c6; border-left:1px solid var(--line); padding-left:8px; }
  #bar .ctl input, #bar .ctl select { background:#121821; color:#fff; border:1px solid var(--line); border-radius:6px; padding:5px; font-size:11px; width:54px; }
  #hud { left:10px; bottom:12px; font:11px/1.5 monospace; color:#cdd6e0; padding:8px 10px; max-width:300px; white-space:pre-wrap; }
  #hint { position:fixed; top:10px; left:50%; transform:translateX(-50%); z-index:25; background:rgba(20,40,80,.9); border:1px solid var(--accent); color:#fff; padding:6px 12px; border-radius:8px; font-size:12px; display:none; }
`;
const SCAFFOLD = `
  <div id="app"></div>
  <div id="hint"></div>
  <div id="lib" class="pane">
    <h1>📚 Biblioteca de conveyors</h1>
    <div style="font-size:10px;color:#7f8ca3;margin-bottom:4px">Equipo 24" — toca un modelo para añadirlo</div>
    <div id="libList"></div>
  </div>
  <div id="insp" class="pane">
    <h2 id="iTitle">—</h2><div id="iFields"></div>
    <div class="note" id="iNote"></div>
    <button class="del" id="iDel">🗑 Eliminar pieza</button>
  </div>
  <div id="hud" class="pane"></div>
  <div id="bar" class="pane">
    <button id="bConnect">🔗 Conectar</button>
    <button id="bValidate">✓ Validar</button>
    <button id="bRun">▶ Simular</button>
    <button id="bStopOut" title="Detener la salida: las cajas se acumulan (cero presión)">⏸ Salida</button>
    <span class="ctl">Tasa <input id="cRate" type="number" min="1" max="120" step="1" value="30"> c/min</span>
    <span class="ctl">Veloc. <select id="cSpeed"><option value="1">1×</option><option value="3" selected>3×</option><option value="6">6×</option></select></span>
    <button id="bFrame" title="Encuadrar cámara al layout">⤢ Ver</button>
    <button id="bSave">💾</button><button id="bLoad">📂</button><button id="bClear">🧹</button>
  </div>
  <input id="fileIn" type="file" accept="application/json" style="display:none">
  <a id="dl" style="display:none"></a>
`;

export function initBuilder() {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.innerHTML = SCAFFOLD;
  while (root.firstChild) document.body.appendChild(root.firstChild);

  const lib = createConveyorLibrary();
  const FPM = lib.units.FPM;
  const graph = { instances: [], links: [] };
  let selected = null, connectMode = false, connectFrom = null, sim = null, running = false;

  // ---------- escena ----------
  const app = document.getElementById('app');
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0e1116);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);
  camera.position.set(8, 9, 12);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight); app.appendChild(renderer.domElement);
  renderer.xr.enabled = true;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.target.set(4, 0.5, 2);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x202830, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(10, 20, 6); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.001; scene.add(ground);
  scene.add(new THREE.GridHelper(200, 200, 0x232a33, 0x1a2029));

  const convRoot = new THREE.Group(); scene.add(convRoot);
  const nodeRoot = new THREE.Group(); scene.add(nodeRoot);
  const linkRoot = new THREE.Group(); scene.add(linkRoot);
  const boxRoot = new THREE.Group(); scene.add(boxRoot);
  const raycaster = new THREE.Raycaster(); const ptr = new THREE.Vector2();

  // ---------- biblioteca (menú) ----------
  const groups = lib.groups();
  const libList = document.getElementById('libList');
  for (const grp of Object.keys(groups)) {
    const h = document.createElement('div'); h.className = 'grp'; h.textContent = grp; libList.appendChild(h);
    for (const id of groups[grp]) {
      const m = lib.get(id);
      const btn = document.createElement('button');
      btn.innerHTML = `<b>${m.id}</b><br><span style="color:#8fa3bd">${m.label.split('·')[1] ? m.label.split('·')[1].trim() : m.kind}</span>`;
      btn.onclick = () => addPiece(id); libList.appendChild(btn);
    }
  }

  function addPiece(modelId) {
    const last = graph.instances[graph.instances.length - 1];
    let inst;
    if (last) { inst = lib.place(modelId, { x: 0, z: 0, rot: 0 }); graph.instances.push(inst); lib.connect(graph, last.id, inst.id); }
    else { inst = lib.place(modelId, { x: 0, z: 0, rot: 0 }); graph.instances.push(inst); }
    select(inst); rebuild(); frameView();
  }

  // ---------- dibujo de una pieza ----------
  const COLByKind = { roller: 0x9aa3b0, accum: 0x6f9bd6, belt: 0x394150, incline: 0x4a6a3a, transfer: 0xb07a2a, divert: 0xb07a2a, merge: 0x7a6ab0 };
  function instPolyline(inst) {
    const n = inst.nodes, c = inst.cfg;
    if (inst.family === 'curve') {
      const pts = [], sweep = Math.abs(n._a1 - n._a0), N = Math.max(12, Math.round(sweep / (Math.PI / 36))); // ~5° por tramo (curva suave)
      for (let i = 0; i <= N; i++) { const a = n._a0 + (n._a1 - n._a0) * i / N; pts.push([n._center[0] + c.radius * Math.cos(a), n._center[1] + c.radius * Math.sin(a)]); }
      return pts;
    }
    if (inst.family === 'transfer') return [n.in.p, n._mid, n.out.p];
    return [n.in.p, n.out.p];
  }
  function instBranchPoly(inst) { return (inst.family === 'divert') ? [inst.nodes._mid, inst.nodes.out2.p] : null; }
  function heightsAlong(inst, k, total) {
    const c = inst.cfg, h0 = c.entryHeight, h1 = c.exitHeight != null ? c.exitHeight : c.entryHeight;
    const t = total > 1 ? k / total : 0; return h0 + (h1 - h0) * t;
  }
  // materiales (galvanizado, rodillo, banda, motor) — compartidos
  const matFrame = new THREE.MeshStandardMaterial({ color: 0xc2c8ce, metalness: 0.5, roughness: 0.45 });
  const matRail = new THREE.MeshStandardMaterial({ color: 0xb6bdc4, metalness: 0.45, roughness: 0.5 });
  const matRoller = new THREE.MeshStandardMaterial({ color: 0xccd0d4, metalness: 0.7, roughness: 0.28 });
  const matAxle = new THREE.MeshStandardMaterial({ color: 0x40464d, metalness: 0.6, roughness: 0.4 });
  const matBelt = new THREE.MeshStandardMaterial({ color: 0x20252b, roughness: 0.9, metalness: 0.04 });
  // Banda MODULAR plástica estilo Intralox Serie 1000 (flat top): textura de módulos en
  // ladrillo generada por canvas (procedimental, sin assets). En headless se omite.
  function makeModularTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const ctx = cv.getContext && cv.getContext('2d'); if (!ctx) return null;
    ctx.fillStyle = '#c9d2da'; ctx.fillRect(0, 0, 128, 128);          // acetal claro (S1000)
    ctx.strokeStyle = '#7e8893'; ctx.lineWidth = 2;
    const rows = 4, cols = 8, rh = 128 / rows, cw = 128 / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw / 2);
      ctx.strokeRect(-cw, r * rh, 128 + 2 * cw, rh);
      for (let c = -1; c <= cols + 1; c++) { ctx.beginPath(); ctx.moveTo(c * cw + off, r * rh + 2); ctx.lineTo(c * cw + off, (r + 1) * rh - 2); ctx.stroke(); }
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 2); return t;
  }
  const _modTex = makeModularTex();
  const matBeltModular = new THREE.MeshStandardMaterial({ map: _modTex || null, color: _modTex ? 0xffffff : 0xb9c2cb, roughness: 0.55, metalness: 0.05 });
  const matLeg = new THREE.MeshStandardMaterial({ color: 0x969ca2, metalness: 0.4, roughness: 0.55 });
  const matMotor = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.3, roughness: 0.6 });
  const matSel = new THREE.MeshStandardMaterial({ color: 0x2e6fd6, metalness: 0.4, roughness: 0.5, emissive: 0x12345a, emissiveIntensity: 0.45 });
  const rollerGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
  const axleGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  const _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1), _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), _Dv = new THREE.Vector3(), _dummy = new THREE.Object3D();
  const TOR = 0.025;   // top of roller/belt (la altura de la pieza = superficie de transporte)

  function segMeta(p0, p1) { const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz) || 1e-3; return { dx: dx / L, dz: dz / L, L, rotY: Math.atan2(dx, dz), mx: (p0[0] + p1[0]) / 2, mz: (p0[1] + p1[1]) / 2 }; }
  function hdir(p0, p1) { const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz) || 1e-3; return { dx: dx / L, dz: dz / L, L, px: dz / L, pz: -dx / L }; }
  function box(group, w, h, d, x, y, z, rotY, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = rotY; group.add(m); return m; }
  // caja ORIENTADA en 3D de A a B (sección tw×th). Si A.y≠B.y se INCLINA → el modelo SÍ sube.
  function strut(group, A, B, tw, th, mat) {
    _Dv.set(B[0] - A[0], B[1] - A[1], B[2] - A[2]); const L = _Dv.length() || 1e-3; _Dv.multiplyScalar(1 / L);
    const m = new THREE.Mesh(new THREE.BoxGeometry(tw, th, L), mat);
    _q.setFromUnitVectors(_Z, _Dv); m.quaternion.copy(_q);
    m.position.set((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2); group.add(m); return m;
  }

  // BASTIDOR de canal formado en C (alma + alas) + riel-guía, INCLINADO con el tramo.
  function addFrame(group, p0, p1, h0, h1, width, depth, railH, sel) {
    const d = hdir(p0, p1), fm = sel ? matSel : matFrame, rm = sel ? matSel : matRail, web = 0.005, flange = 0.035;
    for (const sd of [-1, 1]) {
      const ox = d.px * sd * width / 2, oz = d.pz * sd * width / 2;
      const Ax = p0[0] + ox, Az = p0[1] + oz, Bx = p1[0] + ox, Bz = p1[1] + oz, sA = h0 + TOR, sB = h1 + TOR;
      strut(group, [Ax, sA - depth / 2, Az], [Bx, sB - depth / 2, Bz], web, depth, fm);                              // alma
      const ix = -d.px * sd * flange / 2, iz = -d.pz * sd * flange / 2;
      strut(group, [Ax + ix, sA - 0.004, Az + iz], [Bx + ix, sB - 0.004, Bz + iz], flange, 0.008, fm);               // ala superior
      strut(group, [Ax + ix, sA - depth + 0.004, Az + iz], [Bx + ix, sB - depth + 0.004, Bz + iz], flange, 0.008, fm); // ala inferior
      if (railH > 1e-4) strut(group, [Ax, sA + railH / 2, Az], [Bx, sB + railH / 2, Bz], web * 1.6, railH, rm);       // riel-guía
    }
  }
  // RODILLOS reales (OD/paso) con muñón; cónicos en curvas (radio variable). Eje horizontal.
  function addRollers(group, p0, p1, h0, h1, width, dia, pitch, sp) {
    const d = hdir(p0, p1), n = Math.max(1, Math.round(d.L / pitch)), len = Math.max(0.1, width - 0.075);
    const tapered = !!(sp && sp.tapered), geo = tapered ? new THREE.CylinderGeometry((sp.rollerTaper || dia * 0.7) / 2, dia / 2, 1, 14) : rollerGeo;
    const roll = new THREE.InstancedMesh(geo, matRoller, n), axl = new THREE.InstancedMesh(axleGeo, matAxle, n);
    _ax.set(d.dz, 0, -d.dx).normalize(); _q.setFromUnitVectors(_Y, _ax);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t, y = (h0 + (h1 - h0) * t) + TOR - dia / 2;
      _dummy.position.set(x, y, z); _dummy.quaternion.copy(_q);
      _dummy.scale.set(tapered ? 1 : dia, len, tapered ? 1 : dia); _dummy.updateMatrix(); roll.setMatrixAt(k, _dummy.matrix);
      _dummy.scale.set(0.011, width + 0.02, 0.011); _dummy.updateMatrix(); axl.setMatrixAt(k, _dummy.matrix);
    }
    roll.instanceMatrix.needsUpdate = axl.instanceMatrix.needsUpdate = true;
    roll.userData.instId = axl.userData.instId = group.userData.instId; group.add(roll); group.add(axl);
  }
  // BANDA: correa de carga + pan + retorno (todas inclinadas) envolviendo poleas de extremo.
  function addBelt(group, poly, sp, width, sel, h0fn, pulley) {
    const belt = sp.belt || 0.006;
    for (let i = 0; i < poly.length - 1; i++) {
      const hA = h0fn(i) + TOR, hB = h0fn(i + 1) + TOR;
      const A = [poly[i][0], hA, poly[i][1]], B = [poly[i + 1][0], hB, poly[i + 1][1]];
      strut(group, [A[0], A[1] - belt / 2, A[2]], [B[0], B[1] - belt / 2, B[2]], width - 0.04, belt, sel ? matSel : (sp.modular ? matBeltModular : matBelt));   // carga (modular = Intralox S1000)
      strut(group, [A[0], A[1] - belt - 0.006, A[2]], [B[0], B[1] - belt - 0.006, B[2]], width - 0.05, 0.01, matFrame);          // pan
      strut(group, [A[0], A[1] - pulley - belt, A[2]], [B[0], B[1] - pulley - belt, B[2]], width - 0.04, belt, matBelt);         // retorno
    }
    for (const e of [0, poly.length - 1]) {
      const p = poly[e], h = h0fn(e) + TOR, a = Math.max(0, e - 1), b = Math.min(poly.length - 1, e + 1), d = hdir(poly[a], poly[b]);
      _ax.set(d.dz, 0, -d.dx).normalize(); _q.setFromUnitVectors(_Y, _ax);
      const pl = new THREE.Mesh(new THREE.CylinderGeometry(pulley / 2, pulley / 2, width - 0.05, 16), matRoller);
      pl.position.set(p[0], h - pulley / 2, p[1]); pl.quaternion.copy(_q); group.add(pl);
    }
  }
  // PAQUETE de accionamiento (motor + guarda de cadena) junto a la polea motriz.
  function addDrive(group, p, rotY, h, width, pulley) {
    const off = width / 2 + 0.12;
    box(group, 0.16, 0.16, 0.28, p[0] + Math.cos(rotY) * off, h - pulley / 2, p[1] - Math.sin(rotY) * off, rotY, matMotor);
    box(group, 0.06, pulley + 0.06, 0.10, p[0] + Math.cos(rotY) * (width / 2 + 0.02), h - pulley / 2, p[1] - Math.sin(rotY) * (width / 2 + 0.02), rotY, matFrame);
  }
  // SOPORTE de piso tipo H (patas + travesaño + placas + rodilla diagonal).
  function addSupport(group, p, rotY, height, width, depth) {
    const top = Math.max(0.1, height - depth + TOR), ox = Math.cos(rotY), oz = -Math.sin(rotY);
    for (const sd of [-1, 1]) {
      const lx = p[0] + ox * sd * width / 2, lz = p[1] + oz * sd * width / 2;
      box(group, 0.045, top, 0.045, lx, top / 2, lz, rotY, matLeg);
      box(group, 0.12, 0.014, 0.12, lx, 0.007, lz, rotY, matLeg);
    }
    box(group, 0.045, 0.05, width, p[0], top - 0.03, p[1], rotY, matLeg);
    const brace = box(group, 0.03, 0.03, top * 0.7, p[0], top * 0.4, p[1], rotY, matLeg);
    brace.position.set(p[0] + Math.sin(rotY) * 0.18, top * 0.4, p[1] + Math.cos(rotY) * 0.18); brace.rotation.set(0.5, rotY, 0);
  }

  function drawRun(g, inst, poly, sp, sel, supports) {
    const c = inst.cfg, w = c.width;
    const dia = sp && sp.rollerDia ? sp.rollerDia : 0.0483;
    const pitch = c.rollerPitch || (sp && sp.rollerPitch) || 0.0762;
    const pulley = c.pulleyDia || (sp && sp.pulleyDia) || 0.10;
    const depth = sp ? sp.frameDepth : 0.14, railH = sp ? sp.railHeight : 0.04, useRollers = !sp || sp.surface === 'rollers';
    const hAt = i => heightsAlong(inst, i, poly.length - 1);
    for (let i = 0; i < poly.length - 1; i++) {
      addFrame(g, poly[i], poly[i + 1], hAt(i), hAt(i + 1), w, depth, railH, sel);
      if (useRollers) addRollers(g, poly[i], poly[i + 1], hAt(i), hAt(i + 1), w, dia, pitch, sp);
    }
    if (!useRollers) {
      addBelt(g, poly, sp, w, sel, hAt, pulley);
      const r1 = segMeta(poly[poly.length - 2], poly[poly.length - 1]).rotY;
      addDrive(g, poly[poly.length - 1], r1, hAt(poly.length - 1) + TOR, w, pulley);
    }
    if (supports) {
      const r0 = segMeta(poly[0], poly[1]).rotY, r1 = segMeta(poly[poly.length - 2], poly[poly.length - 1]).rotY;
      addSupport(g, poly[0], r0, c.entryHeight, w, depth);
      addSupport(g, poly[poly.length - 1], r1, c.exitHeight ?? c.entryHeight, w, depth);
    }
  }

  // TOMAS: ingreso (verde, flecha al flujo) / salida (rojo, flecha hacia afuera) con su
  // ángulo al flujo, lado y distancia desde el inicio.
  const matTapIn = new THREE.MeshStandardMaterial({ color: 0x2ee56a, emissive: 0x0c5a28, emissiveIntensity: 0.5 });
  const matTapOut = new THREE.MeshStandardMaterial({ color: 0xff6a4d, emissive: 0x5a1a0c, emissiveIntensity: 0.5 });
  const coneGeo = new THREE.ConeGeometry(0.07, 0.18, 10);
  function drawTaps(group, inst) {
    const c = inst.cfg; if (inst.family !== 'straight' || !c.taps || !c.taps.length) return;
    const p0 = inst.nodes.in.p, p1 = inst.nodes.out.p, d = hdir(p0, p1);
    for (const tp of c.taps) {
      const dist = Math.max(0, Math.min(tp.distance || 0, d.L)), t = d.L ? dist / d.L : 0;
      const bx = p0[0] + (p1[0] - p0[0]) * t, bz = p0[1] + (p1[1] - p0[1]) * t;
      const h = c.entryHeight + ((c.exitHeight ?? c.entryHeight) - c.entryHeight) * t + TOR;
      const sd = tp.side === 'R' ? 1 : -1, a = Math.PI * (tp.angleDeg || 30) / 180;
      const mx = d.dx * Math.cos(a) + sd * d.px * Math.sin(a), mz = d.dz * Math.cos(a) + sd * d.pz * Math.sin(a); // dir de merge/desvío
      const mat = tp.kind === 'in' ? matTapIn : matTapOut, S = 0.7, sign = tp.kind === 'in' ? -1 : 1;
      strut(group, [bx, h - 0.05, bz], [bx + sign * S * mx, h - 0.05, bz + sign * S * mz], 0.18, 0.05, mat);  // mini-spur angulado
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), mat); ball.position.set(bx, h + 0.08, bz); group.add(ball);
      const av = tp.kind === 'in' ? [d.dx, d.dz] : [mx, mz];                                                  // flecha
      const cone = new THREE.Mesh(coneGeo, mat); _ax.set(av[0], 0, av[1]).normalize(); _q.setFromUnitVectors(_Y, _ax); cone.quaternion.copy(_q);
      cone.position.set(bx + av[0] * 0.13, h + 0.08, bz + av[1] * 0.13); group.add(cone);
    }
  }

  // MÁQUINA en línea (Niverplast): cinta interna + GUILLOTINA visible en el hueco del
  // ingreso (entre la banda modular y la cinta Niverplast) + housing retraído.
  const matMachine = new THREE.MeshStandardMaterial({ color: 0x55606b, metalness: 0.5, roughness: 0.5 });
  const matBlade = new THREE.MeshStandardMaterial({ color: 0xc6ccd2, metalness: 0.9, roughness: 0.18 });
  const matHaz = new THREE.MeshStandardMaterial({ color: 0xf4c11e, metalness: 0.3, roughness: 0.6, emissive: 0x3a2c00, emissiveIntensity: 0.25 });
  const matInox = new THREE.MeshStandardMaterial({ color: 0xd6dde3, metalness: 0.8, roughness: 0.25 });
  const lp = (x, z, r, lx, lz) => [x + lx * Math.cos(r) + lz * Math.sin(r), z - lx * Math.sin(r) + lz * Math.cos(r)];
  function drawMachine(g, inst, sel) {
    const c = inst.cfg, p0 = inst.nodes.in.p, p1 = inst.nodes.out.p, d = hdir(p0, p1), h = c.entryHeight, W = c.width || 1;
    const gap = 0.35;                                                                          // hueco de ingreso (donde va la guillotina)
    const inGap = [p0[0] + d.dx * gap / 2, p0[1] + d.dz * gap / 2];
    const bx = p0[0] + d.dx * (gap + (d.L - gap) / 2), bz = p0[1] + d.dz * (gap + (d.L - gap) / 2), rotY = Math.atan2(d.dx, d.dz);
    box(g, W, 0.04, d.L - gap, bx, h + TOR, bz, rotY, matBelt);                                 // cinta Niverplast (después del hueco)
    box(g, W + 0.22, 1.15, d.L - gap, bx, h + 0.62, bz, rotY, sel ? matSel : matMachine);       // housing (retraído, deja ver la guillotina)
    // PÓRTICO de la guillotina en el hueco de ingreso: dos columnas + travesaño + cuchilla
    for (const sd of [-1, 1]) { const q = lp(inGap[0], inGap[1], rotY, sd * (W / 2 + 0.05), 0); box(g, 0.07, h + 0.95, 0.09, q[0], (h + 0.95) / 2, q[1], rotY, matMachine); }
    box(g, W + 0.22, 0.12, 0.12, inGap[0], h + 0.95, inGap[1], rotY, matMachine);               // travesaño superior
    box(g, W + 0.05, 0.42, 0.025, inGap[0], h + 0.5, inGap[1], rotY, matBlade);                 // CUCHILLA (placa, baja desde el travesaño)
    box(g, W + 0.07, 0.06, 0.05, inGap[0], h + 0.74, inGap[1], rotY, matHaz);                   // banda hazard amarilla sobre la cuchilla
    addSupport(g, p0, rotY, h, W, 0.14); addSupport(g, p1, rotY, h, W, 0.14);
  }
  const matSkin = new THREE.MeshStandardMaterial({ color: 0xd7a98a, roughness: 0.7 });
  const matVest = new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.6, emissive: 0x4a3a00, emissiveIntensity: 0.2 });
  // ELEMENTO ESTÁTICO: mesa de inox / rack de tapas (3 niveles con minicarriles) / operario.
  function drawProp(g, inst, sel) {
    const c = inst.cfg, x = inst.pose.x, z = inst.pose.z, r = inst.pose.rot, L = c.length || 1.5, W = c.width || 0.8, h = c.entryHeight || 0.9;
    if (inst.model === 'OPERATOR') {                                                            // figura de persona
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.55, 12), sel ? matSel : matVest); cap.position.set(x, 0.95, z); g.add(cap);   // torso (chaleco)
      for (const sd of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8), matMotor); const q = lp(x, z, r, sd * 0.09, 0); leg.position.set(q[0], 0.35, q[1]); g.add(leg); }   // piernas
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), matSkin); head.position.set(x, 1.32, z); g.add(head); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 12), matVest).translateX(0)); g.children[g.children.length - 1].position.set(x, 1.42, z);   // casco
      return;
    }
    if (inst.model === 'INOXTABLE') {
      box(g, W, 0.03, L, x, h, z, r, sel ? matSel : matInox);                                  // tablero
      for (const a of [-1, 1]) for (const b of [-1, 1]) { const q = lp(x, z, r, a * (W / 2 - 0.04), b * (L / 2 - 0.04)); box(g, 0.04, h, 0.04, q[0], h / 2, q[1], r, matInox); }
    } else {                                                                                   // LIDRACK
      for (const a of [-1, 1]) for (const b of [-1, 1]) { const q = lp(x, z, r, a * (W / 2 - 0.03), b * (L / 2 - 0.03)); box(g, 0.035, h + 0.6, 0.035, q[0], (h + 0.6) / 2, q[1], r, matFrame); }
      for (let lv = 0; lv < 3; lv++) { const yy = h - 0.25 + lv * 0.3;
        box(g, W, 0.02, L, x, yy, z, r, sel ? matSel : matInox);                               // bandeja
        for (const k of [-1, 0, 1]) box(g, 0.015, 0.04, L, x + Math.cos(r) * k * W * 0.28, yy + 0.03, z - Math.sin(r) * k * W * 0.28, r, matRail); // minicarriles
      }
    }
  }
  function addSideTables(group, poly, hAt, width, tw) {     // mini-mesas a ambos lados (gravedad)
    for (const sd of [-1, 1]) for (let i = 0; i < poly.length - 1; i++) {
      const d = hdir(poly[i], poly[i + 1]), ox = d.px * sd * (width / 2 + tw / 2), oz = d.pz * sd * (width / 2 + tw / 2);
      strut(group, [poly[i][0] + ox, hAt(i) + TOR - 0.01, poly[i][1] + oz], [poly[i + 1][0] + ox, hAt(i + 1) + TOR - 0.01, poly[i + 1][1] + oz], tw, 0.02, matInox);
    }
  }

  function rebuild() {
    for (const r of [convRoot, nodeRoot, linkRoot]) while (r.children.length) r.remove(r.children[0]);
    for (const inst of graph.instances) {
      const g = new THREE.Group(); g.userData.instId = inst.id; convRoot.add(g);
      const sel = selected && selected.id === inst.id, sp = lib.spec(inst.model);
      if (inst.family === 'machine') drawMachine(g, inst, sel);
      else if (inst.family === 'prop') drawProp(g, inst, sel);
      else {
        const poly = instPolyline(inst);
        drawRun(g, inst, poly, sp, sel, true);          // tramo principal (con soportes)
        if (sp && sp.sideTable) addSideTables(g, poly, i => heightsAlong(inst, i, poly.length - 1), inst.cfg.width, sp.sideTable);
        const br = instBranchPoly(inst);                // spur de los desviadores (sin soportes extra)
        if (br) drawRun(g, inst, br, sp, sel, false);
        drawTaps(g, inst);                              // tomas de ingreso/salida
      }
      if (inst.family !== 'prop') for (const key of lib.nodeKeys(inst.model)) mkNode(inst, key);  // los props no exponen nodos
    }
    for (const l of graph.links) {
      const A = byId(l.from), B = byId(l.to); if (!A || !B) continue;
      const na = A.nodes[l.fromNode || 'out'], nb = B.nodes[l.toNode || 'in']; if (!na || !nb) continue;
      const ha = (l.fromNode || 'out').startsWith('out') ? (A.cfg.exitHeight ?? A.cfg.entryHeight) : A.cfg.entryHeight;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(na.p[0], ha, na.p[1]), new THREE.Vector3(nb.p[0], B.cfg.entryHeight, nb.p[1])]);
      linkRoot.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x3a4a5a })));
    }
    validateHud();
  }
  function mkNode(inst, key) {
    const node = inst.nodes[key]; if (!node) return;
    const isExit = key.startsWith('out'), col = isExit ? 0x4da3ff : 0x2ee56a;
    const h = isExit ? (inst.cfg.exitHeight ?? inst.cfg.entryHeight) : inst.cfg.entryHeight;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.4 }));
    s.position.set(node.p[0], h + 0.06, node.p[1]); s.userData = { instId: inst.id, nodeKey: key, isExit }; nodeRoot.add(s);
  }
  const byId = id => graph.instances.find(i => i.id === id);

  // encuadra la cámara a TODO el layout (evita abrir mirando vacío)
  function frameView() {
    const pts = [];
    for (const inst of graph.instances) {
      const n = inst.nodes;
      if (inst.family === 'prop') pts.push([inst.pose.x, inst.pose.z]);
      else { for (const k of ['in', 'out', 'out2']) if (n[k]) pts.push(n[k].p); if (n._center) pts.push(n._center); }
    }
    if (!pts.length) return;
    let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (const p of pts) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[1]); mxz = Math.max(mxz, p[1]); }
    const cx = (mnx + mxx) / 2, cz = (mnz + mxz) / 2, span = Math.max(mxx - mnx, mxz - mnz, 3);
    controls.target.set(cx, 0.6, cz);
    camera.position.set(cx + span * 0.55, span * 0.85, cz + span * 0.9);
    camera.near = 0.1; camera.far = Math.max(1000, span * 12); camera.updateProjectionMatrix();
    controls.update();
  }

  // ---------- selección + inspector ----------
  function select(inst) { selected = inst; renderInspector(); rebuild(); }
  const insp = document.getElementById('insp'), iFields = document.getElementById('iFields');
  function field(label, val, on, step = 0.1, min = 0) {
    const wrap = document.createElement('label'); const span = document.createElement('span'); span.textContent = label;
    const inp = document.createElement('input'); inp.type = 'number'; inp.value = val; inp.step = step; inp.min = min;
    inp.onchange = () => on(parseFloat(inp.value)); wrap.appendChild(span); wrap.appendChild(inp); return wrap;
  }
  function selectField(label, options, current, on) {   // options: [val] o [[label,val]]
    const wrap = document.createElement('label'); const span = document.createElement('span'); span.textContent = label;
    const sel = document.createElement('select'); sel.style.cssText = 'background:#121821;color:#fff;border:1px solid #2a3645;border-radius:6px;padding:4px;font-size:11px';
    for (const o of options) { const val = Array.isArray(o) ? o[1] : o, lab = Array.isArray(o) ? o[0] : o; const e = document.createElement('option'); e.value = String(val); e.textContent = lab; if (String(val) === String(current)) e.selected = true; sel.appendChild(e); }
    sel.onchange = () => on(sel.value); wrap.appendChild(span); wrap.appendChild(sel); return wrap;
  }
  // editor de TOMAS de ingreso/salida (solo en tramos rectos)
  function tapsSection(c, upd) {
    if (selected.family !== 'straight') return;
    c.taps = c.taps || [];
    const hdr = document.createElement('div'); hdr.style.cssText = 'margin-top:8px;border-top:1px solid #243049;padding-top:6px;font-size:11px;color:#9fc3ff'; hdr.textContent = 'Tomas de ingreso / salida';
    iFields.appendChild(hdr);
    const bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:6px;margin:4px 0';
    const mk = (label, kind) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'flex:1;background:#1b2330;color:#cdd6e0;border:1px solid #2a3645;border-radius:6px;padding:5px;cursor:pointer;font-size:11px'; b.onclick = () => { const mid = Math.max(0.3, (c.length || 4) / 2); c.taps.push(kind === 'in' ? { kind: 'in', side: 'R', angleDeg: 30, distance: mid, ratePerMin: 15, cv: 0.3 } : { kind: 'out', side: 'L', angleDeg: 30, distance: mid, frac: 1 }); upd(); }; return b; };
    bar.appendChild(mk('+ Ingreso', 'in')); bar.appendChild(mk('+ Salida', 'out')); iFields.appendChild(bar);
    c.taps.forEach((tp, i) => {
      const card = document.createElement('div'); card.style.cssText = 'border:1px solid #243049;border-radius:6px;padding:5px;margin:3px 0;background:#10151c';
      const top = document.createElement('div'); top.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:' + (tp.kind === 'in' ? '#2ee56a' : '#ff8a65'); top.innerHTML = '<b>' + (tp.kind === 'in' ? 'Ingreso' : 'Salida') + ' ' + (i + 1) + '</b>';
      const del = document.createElement('span'); del.textContent = '✕'; del.style.cssText = 'cursor:pointer;color:#9fb0c8'; del.onclick = () => { c.taps.splice(i, 1); upd(); }; top.appendChild(del); card.appendChild(top);
      card.appendChild(selectField('Lado', [['Izquierda', 'L'], ['Derecha', 'R']], tp.side, v => { tp.side = v; upd(); }));
      card.appendChild(selectField('Ángulo al flujo', [30, 45], tp.angleDeg, v => { tp.angleDeg = +v; upd(); }));
      card.appendChild(field('Distancia inicio (m)', tp.distance, v => { tp.distance = Math.max(0, Math.min(v, c.length || 9)); upd(); }, 0.1));
      if (tp.kind === 'in') { card.appendChild(field('Tasa (c/min)', tp.ratePerMin, v => { tp.ratePerMin = Math.max(0, v); upd(); }, 1)); card.appendChild(field('Dispersión (cv)', tp.cv, v => { tp.cv = Math.max(0, Math.min(2, v)); upd(); }, 0.05)); }
      else card.appendChild(field('Desvío (%)', Math.round((tp.frac ?? 1) * 100), v => { tp.frac = Math.max(0, Math.min(1, v / 100)); upd(); }, 5));
      iFields.appendChild(card);
    });
  }
  const IN_M = 0.0254;
  // construye los controles de los PARÁMETROS PROPIOS del modelo (lib.params)
  function paramFields(c, sp, upd) {
    for (const p of lib.params(selected.model)) {
      const get = () => {
        if (p.unit === 'in') return Math.round(((c[p.cfg] != null ? c[p.cfg] : (sp ? sp[p.cfg] : 0)) || 0) / IN_M);
        if (p.unit === 'fpm') return Math.round((c.speed || 0) / FPM);
        if (p.unit === 'incline') return Math.round(Math.atan2((c.exitHeight ?? c.entryHeight) - c.entryHeight, c.length || 1) * 180 / Math.PI);
        return c[p.cfg];
      };
      const set = v => {
        if (p.unit === 'in') c[p.cfg] = parseFloat(v) * IN_M;
        else if (p.unit === 'fpm') c.speed = parseFloat(v) * FPM;
        else if (p.unit === 'incline') c.exitHeight = c.entryHeight + (c.length || 1) * Math.tan(parseFloat(v) * Math.PI / 180);
        else if (p.unit === 'bool') c[p.cfg] = (v === 'true');
        else c[p.cfg] = (p.type === 'number') ? parseFloat(v) : (isNaN(+v) ? v : +v);
        upd();
      };
      if (p.type === 'select') iFields.appendChild(selectField(p.label, p.options, get(), set));
      else iFields.appendChild(field(p.label + (p.unit === 'fpm' ? ' (fpm)' : ''), get(), set, p.step || 1, p.min || 0));
    }
  }
  function renderInspector() {
    if (!selected) { insp.style.display = 'none'; return; }
    insp.style.display = 'block';
    const m = lib.get(selected.model), c = selected.cfg;
    const ref = lib.ref(selected.model);
    document.getElementById('iTitle').textContent = m.id + (ref && ref.hytrol !== m.id ? ' · Hytrol ' + ref.hytrol : '');
    const sp = lib.spec(selected.model); const mm = v => v != null ? (v * 1000).toFixed(0) + ' mm' : '—';
    let html = (ref ? `<b style="color:#9fc3ff">Hytrol ${ref.hytrol}</b> — ${ref.note}<br>` : '') + m.note;
    if (sp) {
      html += '<br><span style="color:#8fa3bd">Ficha (' + (sp.src || 'web') + '):</span> ';
      if (sp.surface === 'rollers') html += `rodillo Ø${mm(sp.rollerDia)} (${sp.inches.rollerDiaIn}") × ${sp.gauge} ga · paso ${mm(sp.rollerPitch)} (${sp.inches.rollerPitchIn}" centers)`;
      else html += `banda${sp.modular ? ' modular' : ' cama deslizante'} · polea Ø${mm(sp.pulleyDia)}`;
      html += ` · bastidor ${mm(sp.frameDepth)}` + (sp.railHeight ? ` · riel-guía ${mm(sp.railHeight)}` : '');
      if (sp.speedFpm) html += ` · ${sp.speedFpm[0]}–${sp.speedFpm[1]} fpm`;
    }
    if (ref) html += `<br><a href="${ref.doc}" target="_blank" style="color:#4da3ff">ficha/manual</a> · <a href="${ref.cat}" target="_blank" style="color:#4da3ff">catálogo</a>`;
    document.getElementById('iNote').innerHTML = html;
    iFields.innerHTML = '';
    const upd = () => { lib.refresh(selected); resnap(selected); rebuild(); };
    const fam = selected.family;
    // 1) parámetros PROPIOS del modelo (centros de rodillo, ancho BR, drive, ángulo, radio…)
    paramFields(c, sp, upd);
    // 2) parámetros comunes de tramo
    if (fam === 'straight' || fam === 'transfer' || fam === 'divert' || fam === 'merge')
      iFields.appendChild(field('Largo (m)', c.length, v => { c.length = Math.max(0.3, v); upd(); }));
    iFields.appendChild(field('Altura ingreso (m)', c.entryHeight, v => { c.entryHeight = v; upd(); }, 0.05));
    iFields.appendChild(field('Altura salida (m)', c.exitHeight ?? c.entryHeight, v => { c.exitHeight = v; upd(); }, 0.05));
    iFields.appendChild(field('Pos X (m)', selected.pose.x, v => { selected.pose.x = v; upd(); }, 0.25));
    iFields.appendChild(field('Pos Z (m)', selected.pose.z, v => { selected.pose.z = v; upd(); }, 0.25));
    iFields.appendChild(field('Rotación (°)', Math.round(selected.pose.rot * 180 / Math.PI), v => { selected.pose.rot = v * Math.PI / 180; upd(); }, 15));
    // 3) tomas de ingreso/salida agregables (distancia, lado, ángulo, tasa, dispersión)
    tapsSection(c, () => { if (running) startSim(); upd(); });
  }
  function resnap(inst) {
    for (const l of graph.links.filter(l => l.from === inst.id)) {
      if (graph.links.filter(x => x.to === l.to).length > 1) continue;
      lib.connect(graph, inst.id, l.to, { fromNode: l.fromNode, toNode: l.toNode, snapWhich: 'to' });
      resnap(byId(l.to));
    }
  }
  document.getElementById('iDel').onclick = () => {
    if (!selected) return;
    graph.instances = graph.instances.filter(i => i.id !== selected.id);
    graph.links = graph.links.filter(l => l.from !== selected.id && l.to !== selected.id);
    selected = null; renderInspector(); rebuild();
  };

  // ---------- interacción ----------
  const hint = document.getElementById('hint');
  function showHint(t) { hint.textContent = t; hint.style.display = t ? 'block' : 'none'; }
  renderer.domElement.addEventListener('pointerdown', e => {
    ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(ptr, camera);
    if (connectMode) {
      const hit = raycaster.intersectObjects(nodeRoot.children, false)[0];
      if (!hit) return;
      const { instId, nodeKey, isExit } = hit.object.userData;
      if (!connectFrom) { if (isExit) { connectFrom = { instId, nodeKey }; showHint('Ahora toca el nodo de ENTRADA (verde) de la otra pieza'); } else showHint('Empieza por un nodo de SALIDA (azul)'); }
      else if (!isExit && instId !== connectFrom.instId) {
        lib.connect(graph, connectFrom.instId, instId, { fromNode: connectFrom.nodeKey, toNode: nodeKey });
        connectFrom = null; setConnect(false); rebuild();
      }
      return;
    }
    const hit = raycaster.intersectObjects(convRoot.children, true)[0];
    if (hit) { let o = hit.object; while (o && !o.userData.instId) o = o.parent; if (o) select(byId(o.userData.instId)); }
  });

  // ---------- barra ----------
  function setConnect(on) { connectMode = on; connectFrom = null; document.getElementById('bConnect').classList.toggle('on', on); showHint(on ? 'Toca un nodo de SALIDA (azul) y luego uno de ENTRADA (verde)' : ''); }
  document.getElementById('bConnect').onclick = () => setConnect(!connectMode);
  document.getElementById('bValidate').onclick = () => validateHud(true);
  document.getElementById('bFrame').onclick = () => frameView();
  document.getElementById('bClear').onclick = () => { stopSim(); graph.instances = []; graph.links = []; selected = null; renderInspector(); rebuild(); };
  document.getElementById('bRun').onclick = () => running ? stopSim() : startSim();

  document.getElementById('bSave').onclick = () => {
    const blob = new Blob([lib.serialize(graph)], { type: 'application/json' });
    const a = document.getElementById('dl'); a.href = URL.createObjectURL(blob); a.download = 'layout.json'; a.click();
    try { localStorage.setItem('builder.layout', lib.serialize(graph)); } catch (e) {}
    showHint('Layout guardado (descarga + localStorage)'); setTimeout(() => showHint(''), 2500);
  };
  document.getElementById('bLoad').onclick = () => document.getElementById('fileIn').click();
  document.getElementById('fileIn').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => loadGraph(r.result); r.readAsText(f); e.target.value = '';
  };
  function loadGraph(json) {
    try {
      const g = lib.hydrate(json); stopSim();
      graph.instances = g.instances; graph.links = g.links; selected = null; renderInspector(); rebuild(); frameView();
      showHint(`Cargado: ${g.instances.length} piezas`); setTimeout(() => showHint(''), 2500);
    } catch (err) { showHint('JSON inválido: ' + err.message); }
  }

  // ── parámetros de simulación (tasa de llegada y velocidad de reloj) ──
  let simRate = 30, simSpeed = 3, stopOut = false, sinkSegs = [];
  const cRate = document.getElementById('cRate'), cSpeed = document.getElementById('cSpeed');
  cRate.onchange = () => { simRate = Math.max(1, +cRate.value || 30); if (sim) for (const s of sim.segments.values()) if (s.source) s.source.rate = simRate * 60; };
  cSpeed.onchange = () => { simSpeed = +cSpeed.value || 3; };
  document.getElementById('bStopOut').onclick = e => { stopOut = !stopOut; e.target.classList.toggle('on', stopOut); applyStopOut(); };
  function applyStopOut() {   // detener salida = los sumideros dejan de consumir -> acumulación cero presión
    if (!sim) return;
    for (const id of sinkSegs) { const s = sim.segments.get(id); if (!s) continue; if (stopOut) { s.sink = false; s.speed = 0; } else { s.sink = true; s.speed = s.raw && s.raw.speed != null ? s.raw.speed : 0.5; } }
  }

  function startSim() {
    if (!graph.instances.length) { showHint('Añade al menos una pieza'); return; }
    const issues = lib.validate(graph);
    if (issues.some(i => i.level === 'error')) { validateHud(true); showHint('Corrige los errores antes de simular'); return; }
    const model = lib.graphToModel(graph, { rate: simRate * 60, cv: 0.25, burst: 0.1 });   // tasa en c/min → c/hora
    sinkSegs = model.segments.filter(s => s.sink).map(s => s.id);
    sim = new ConveyorSim(model, { seed: 7 }); running = true; applyStopOut();
    document.getElementById('bRun').textContent = '⏹ Detener'; document.getElementById('bRun').classList.add('on');
  }
  function stopSim() {
    running = false; sim = null; while (boxRoot.children.length) boxRoot.remove(boxRoot.children[0]);
    const b = document.getElementById('bRun'); b.textContent = '▶ Simular'; b.classList.remove('on');
  }

  function validateHud(verbose) {
    const issues = lib.validate(graph);
    const errs = issues.filter(i => i.level === 'error'), warns = issues.filter(i => i.level === 'warn');
    let t = `piezas ${graph.instances.length} · enlaces ${graph.links.length} · ` + (errs.length ? `✗ ${errs.length} error(es)` : '✓ sin errores') + (warns.length ? ` · ⚠ ${warns.length}` : '');
    if (verbose && issues.length) t += '\n' + issues.map(i => `${i.level === 'error' ? '✗' : '⚠'} ${i.msg}`).join('\n');
    if (running && sim) {
      const s = sim.stats, tput = (s.throughput / 60);   // motor da c/hora → mostrar c/min
      const accum = sim.boxes.filter(b => b._blocked).length;
      t += `\n▶ entrada ${simRate} c/min · salida ${tput.toFixed(1)} c/min`;
      t += `\n   entregadas ${s.delivered} · en sistema ${s.inSystem} · acumulando ${accum}`;
      const bn = (sim.bottlenecks && sim.bottlenecks()) || [];
      if (bn.length) t += `\n   ⚠ cuello: ${bn.map(b => b.segId || b.id || b).slice(0, 2).join(', ')}`;
      if (stopOut) t += `\n   ⏸ salida detenida (buffer acumulando)`;
    }
    document.getElementById('hud').textContent = t;
  }

  const boxPool = new Map();
  function drawBoxes() {
    if (!sim) return;
    const fr = sim.frame(), seen = new Set();
    const [bw, bh, bd] = fr.boxSize;
    for (const bx of fr.boxes) {
      seen.add(bx.id); let m = boxPool.get(bx.id);
      // la caja viaja con su lado LARGO en el sentido del flujo (largo a lo largo, ancho cruzado)
      if (!m) { m = new THREE.Mesh(new THREE.BoxGeometry(bd, bh, bw), new THREE.MeshStandardMaterial({ roughness: 0.7 })); boxRoot.add(m); boxPool.set(bx.id, m); }
      m.material.color.setHex(bx.held ? 0xff7043 : 0xffc04d);            // retenida vs en marcha
      m.position.set(bx.x, bx.y + 0.025 + bh / 2, bx.z); m.rotation.y = Math.atan2(bx.dx, bx.dz);  // sobre la superficie (TOR)
    }
    for (const [id, m] of boxPool) if (!seen.has(id)) { boxRoot.remove(m); boxPool.delete(id); }
  }

  // ---------- VR (WebXR · Meta Quest) ----------
  const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
  const VRC = { move: 2.0, snap: Math.PI / 4, on: 0.7, off: 0.3, dead: 0.15, maxTp: 14, vigK: 0.55, turned: false };
  const _U = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4();
  const tpMark = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 24), new THREE.MeshBasicMaterial({ color: 0x2ee56a, side: THREE.DoubleSide }));
  tpMark.rotation.x = -Math.PI / 2; tpMark.visible = false; scene.add(tpMark);
  const vig = new THREE.Mesh(new THREE.RingGeometry(0.55, 3.5, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false }));
  vig.position.z = -0.6; vig.renderOrder = 999; camera.add(vig);
  const xrCtrls = [];
  for (let i = 0; i < 2; i++) {
    const ct = renderer.xr.getController(i);
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x4da3ff }));
    ray.visible = false; ct.add(ray); ct.userData.ray = ray;
    ct.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0xe8e8e8 })).rotateX(Math.PI / 2));
    ct.addEventListener('connected', e => { ct.userData.src = e.data; });
    ct.addEventListener('selectstart', () => { ct.userData.aim = true; ray.visible = true; });
    ct.addEventListener('selectend', () => {
      ct.userData.aim = false; ray.visible = false; tpMark.visible = false;
      const t = ct.userData.tp; ct.userData.tp = null;
      if (t) { camera.getWorldPosition(_a); rig.position.x += t.x - _a.x; rig.position.z += t.z - _a.z; }
    });
    rig.add(ct); xrCtrls.push(ct);
  }
  if (renderer.xr.setReferenceSpaceType) renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.addEventListener('sessionstart', () => { controls.enabled = false; rig.position.set(2, 0, -2); rig.rotation.y = 0; renderer.setPixelRatio(1); if (renderer.xr.setFoveation) renderer.xr.setFoveation(1); });
  renderer.xr.addEventListener('sessionend', () => { controls.enabled = true; rig.position.set(0, 0, 0); rig.rotation.y = 0; vig.material.opacity = 0; });
  function xrUpdate(dt) {
    if (!renderer.xr.isPresenting) return;
    const session = renderer.xr.getSession(); let moving = false;
    if (session) for (const src of session.inputSources) {
      if (!src.gamepad || !src.gamepad.axes) continue;
      const ax = src.gamepad.axes, x = ax.length > 2 ? ax[2] : (ax[0] || 0), y = ax.length > 3 ? ax[3] : (ax[1] || 0);
      if (src.handedness === 'right') {
        if (Math.abs(x) > VRC.on && !VRC.turned) { VRC.turned = true; const a = -Math.sign(x) * VRC.snap; camera.getWorldPosition(_a); const px = rig.position.x - _a.x, pz = rig.position.z - _a.z, ca = Math.cos(a), sa = Math.sin(a); rig.position.x = _a.x + px * ca + pz * sa; rig.position.z = _a.z - px * sa + pz * ca; rig.rotation.y += a; }
        else if (Math.abs(x) < VRC.off) VRC.turned = false;
      } else if (Math.hypot(x, y) > VRC.dead) { moving = true; camera.getWorldDirection(_a); _a.y = 0; _a.normalize(); _b.crossVectors(_a, _U); rig.position.addScaledVector(_a, -y * VRC.move * dt).addScaledVector(_b, x * VRC.move * dt); }
    }
    const vt = moving ? VRC.vigK : 0; vig.material.opacity += (vt - vig.material.opacity) * Math.min(1, dt * 6);
    for (const ct of xrCtrls) {
      if (!ct.userData.aim) continue;
      _m.identity().extractRotation(ct.matrixWorld); _b.set(0, 0, -1).applyMatrix4(_m); _a.setFromMatrixPosition(ct.matrixWorld);
      let hit = false; if (_b.y < -0.08) { const t = -_a.y / _b.y; if (t > 0 && t < VRC.maxTp) { _c.copy(_a).addScaledVector(_b, t); hit = true; } }
      if (hit) { ct.userData.tp = { x: _c.x, z: _c.z }; tpMark.position.set(_c.x, 0.02, _c.z); tpMark.visible = true; }
      else { ct.userData.tp = null; tpMark.visible = false; }
    }
  }
  const vrBtn = VRButton.createButton(renderer);
  Object.assign(vrBtn.style, { position: 'fixed', right: '10px', bottom: '64px', left: 'auto', width: 'auto' });
  document.body.appendChild(vrBtn);

  // ---------- loop ----------
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  let last = 0;
  renderer.setAnimationLoop(ts => {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    if (running && sim) { const n = Math.max(1, Math.round(simSpeed)); for (let k = 0; k < n; k++) sim.step(dt); drawBoxes(); validateHud(); }
    if (_modTex) _modTex.offset.y -= dt * 0.35 * (running ? simSpeed : 1);   // la cinta modular SIGUE corriendo (mínima presión: desliza bajo las cajas)
    xrUpdate(dt);
    if (!renderer.xr.isPresenting) controls.update();
    renderer.render(scene, camera);
  });

  // restaura el último layout (localStorage), o el layout EMBEBIDO (build standalone), o una recta TA
  let seeded = false;
  try { const saved = localStorage.getItem('builder.layout'); if (saved) { loadGraph(saved); seeded = true; } } catch (e) {}
  if (!seeded && typeof window !== 'undefined' && window.__seedLayout) { try { loadGraph(JSON.stringify(window.__seedLayout)); seeded = true; } catch (e) {} }
  if (!seeded) addPiece('TA');
  frameView();   // arranca encuadrando todo el layout (no abrir mirando vacío)
  showHint('Biblioteca (izq) · selecciona para configurar · 🔗 conecta nodos · ▶ simula · 💾/📂 guarda-carga · ENTER VR (Quest)');
  setTimeout(() => showHint(''), 7000);

  return { lib, graph };
}

export default initBuilder;
