// babylonView.js — render Babylon de un PLAN del motor.
// Dibuja cada pieza colocada (representación). La geometría EXACTA (B-Rep) la da
// el STEP del backend; aquí se representa con primitivas teseladas.
//
// Requiere el global BABYLON (CDN) cargado antes de instanciar.
// Convención del plan: CAD Z-arriba (X largo, Y ancho, Z vertical).
// Babylon es Y-arriba => world = (x, z, y).

const S = 0.01; // mm -> unidades de escena

const MAT = {
  belt_profile: [0.78, 0.79, 0.81, 0.82, 0.50],
  rail:         [0.63, 0.65, 0.68, 0.78, 0.52],
  head_plate:   [0.87, 0.88, 0.90, 0.90, 0.34],
  pulley:       [0.72, 0.74, 0.77, 0.95, 0.26],
  bearing:      [0.50, 0.52, 0.56, 0.95, 0.30],
  belt:         [0.09, 0.09, 0.10, 0.00, 0.66],
  shaft:        [0.69, 0.71, 0.74, 0.95, 0.24],
  bolt:         [0.40, 0.41, 0.44, 0.90, 0.40],
  motor:        [0.27, 0.28, 0.31, 0.55, 0.48],
  motor_plate:  [0.81, 0.82, 0.84, 0.85, 0.35],
  foot:         [0.34, 0.35, 0.38, 0.70, 0.50],
  wheel:        [0.12, 0.12, 0.13, 0.10, 0.60],
};

export function createView(canvas, opts = {}) {
  const B = window.BABYLON;
  if (!B) throw new Error('Babylon.js no está cargado (global BABYLON ausente).');
  const V3 = B.Vector3, C3 = B.Color3;

  const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true }, true);
  const scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(0.80, 0.84, 0.875, 1);

  const camera = new B.ArcRotateCamera('cam', -Math.PI / 2.5, 1.05, 14, V3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 2; camera.upperRadiusLimit = 120;
  camera.lowerBetaLimit = 0.12; camera.upperBetaLimit = Math.PI / 2 - 0.03;
  camera.wheelDeltaPercentage = 0.012; camera.pinchDeltaPercentage = 0.012;
  camera.minZ = 0.05; camera.maxZ = 2000; camera.panningSensibility = 0;

  // luces
  const hemi = new B.HemisphericLight('h', new V3(0.1, 1, 0.15), scene);
  hemi.intensity = 0.55; hemi.groundColor = new C3(0.45, 0.48, 0.53);
  const key = new B.DirectionalLight('k', new V3(-0.55, -1, -0.42), scene);
  key.position = new V3(9, 22, 7); key.intensity = 2.0;
  new B.DirectionalLight('r', new V3(0.6, -0.45, 0.7), scene).intensity = 0.7;

  let shadow = null;
  try {
    shadow = new B.ShadowGenerator(1024, key);
    shadow.useBlurExponentialShadowMap = true; shadow.blurKernel = 22; shadow.darkness = 0.5;
  } catch (e) { /* sin sombras */ }

  const ground = B.MeshBuilder.CreateGround('g', { width: 600, height: 600 }, scene);
  const gm = new B.PBRMetallicRoughnessMaterial('gm', scene);
  gm.baseColor = new C3(0.86, 0.885, 0.905); gm.metallic = 0; gm.roughness = 0.85;
  ground.material = gm; ground.receiveShadows = true;

  try {
    const dp = new B.DefaultRenderingPipeline('dp', true, scene, [camera]);
    dp.fxaaEnabled = true; dp.samples = 4; dp.imageProcessingEnabled = true;
    dp.imageProcessing.toneMappingEnabled = true;
    dp.imageProcessing.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    dp.imageProcessing.exposure = 1.05; dp.imageProcessing.contrast = 1.12;
  } catch (e) { /* sin post */ }

  const matCache = new Map();
  function mat(name) {
    if (matCache.has(name)) return matCache.get(name);
    const [r, g, b, metal, rough] = MAT[name] || [0.7, 0.7, 0.72, 0.4, 0.5];
    const m = new B.PBRMetallicRoughnessMaterial('m_' + name, scene);
    m.baseColor = new C3(r, g, b); m.metallic = metal; m.roughness = rough;
    matCache.set(name, m);
    return m;
  }

  // textura de banda (con color configurable)
  const beltTex = new B.DynamicTexture('belt', { width: 256, height: 48 }, scene, false);
  beltTex.wrapU = B.Texture.WRAP_ADDRESSMODE; beltTex.uScale = 10;
  function drawBelt(hex) {
    const c = beltTex.getContext();
    c.fillStyle = hex; c.fillRect(0, 0, 256, 48);
    c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 2;
    for (let x = 0; x < 256; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 48); c.stroke(); }
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 1;
    for (let x = 32; x < 256; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 48); c.stroke(); }
    beltTex.update();
  }
  drawBelt(opts.beltColor || '#161616');
  const beltMat = new B.PBRMetallicRoughnessMaterial('beltM', scene);
  beltMat.baseTexture = beltTex; beltMat.metallic = 0; beltMat.roughness = 0.66;

  const v = (pos) => new V3(pos[0] * S, pos[2] * S, pos[1] * S); // CAD -> world

  let root = null, pulleys = [];
  const state = { showBolts: false, anim: true, autoRotate: true };

  function racetrack(span, r, seg = 20) {
    const pts = [], hx = span / 2;
    for (let i = 0; i <= seg; i++) pts.push([-hx + (i / seg) * span, r]);
    for (let i = 1; i < seg; i++) { const a = Math.PI / 2 - (i / seg) * Math.PI; pts.push([hx + r * Math.cos(a), r * Math.sin(a)]); }
    for (let i = 0; i <= seg; i++) pts.push([hx - (i / seg) * span, -r]);
    for (let i = 1; i < seg; i++) { const a = -Math.PI / 2 - (i / seg) * Math.PI; pts.push([-hx + r * Math.cos(a), r * Math.sin(a)]); }
    return pts;
  }

  function addPart(p) {
    const B2 = B, MB = B.MeshBuilder;
    let mesh = null;
    if (p.kind === 'box') {
      mesh = MB.CreateBox(p.id, { width: p.args.dx * S, height: p.args.dz * S, depth: p.args.dy * S }, scene);
      mesh.position = v(p.pos);
    } else if (p.kind === 'tslot') {
      const a = p.args, side = a.side * S, len = a.len * S;
      const dim = p.axis === 'X' ? { width: len, height: side, depth: side }
        : p.axis === 'Y' ? { width: side, height: side, depth: len }
        : { width: side, height: len, depth: side };
      mesh = MB.CreateBox(p.id, dim, scene);
      mesh.position = v(p.pos);
    } else if (p.kind === 'cyl') {
      mesh = MB.CreateCylinder(p.id, { diameter: p.args.d * S, height: p.args.len * S, tessellation: 24 }, scene);
      if (p.axis === 'Y') mesh.rotation.x = Math.PI / 2;       // CAD Y -> world Z
      else if (p.axis === 'X') mesh.rotation.z = Math.PI / 2;  // CAD X -> world X
      mesh.position = v(p.pos);
      if ((p.mat === 'pulley')) pulleys.push(mesh);
    } else if (p.kind === 'beltLoop') {
      const seg = 22, pts = racetrack(p.args.span, p.args.r, seg), hw = p.args.width / 2;
      const pl = pts.map(([x, z]) => new V3((p.pos[0] + x) * S, (p.pos[2] + z) * S, (p.pos[1] - hw) * S));
      const pr = pts.map(([x, z]) => new V3((p.pos[0] + x) * S, (p.pos[2] + z) * S, (p.pos[1] + hw) * S));
      mesh = MB.CreateRibbon(p.id, { pathArray: [pl, pr], closePath: true, sideOrientation: B2.Mesh.DOUBLESIDE }, scene);
      mesh.material = beltMat;
    }
    if (!mesh) return;
    if (p.kind !== 'beltLoop') mesh.material = mat(p.mat || 'rail');
    if (p.hideByDefault) mesh.setEnabled(state.showBolts);
    mesh.parent = root;
    if (shadow) shadow.addShadowCaster(mesh, true);
    mesh.metadata = { part: p };
  }

  function frameCamera() {
    root.computeWorldMatrix(true);
    const bb = root.getHierarchyBoundingVectors(true);
    const ctr = bb.min.add(bb.max).scale(0.5);
    const size = bb.max.subtract(bb.min).length();
    root.position.y -= bb.min.y; // apoyar en el suelo
    camera.setTarget(new V3(ctr.x, (bb.max.y - bb.min.y) / 2, ctr.z));
    camera.radius = size * 0.95;
  }

  function setPlan(plan) {
    if (root) root.dispose(false, true);
    pulleys = [];
    root = new B.TransformNode('machine', scene);
    for (const p of plan.parts) addPart(p);
    if (plan.meta && plan.meta.belt_color) drawBelt(plan.meta.belt_color);
    frameCamera();
  }

  // animación: scroll de la banda + giro de poleas + auto-rotación
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    if (state.anim) {
      beltTex.uOffset -= 0.6 * dt;
      for (const m of pulleys) m.rotation.y += 1.5 * dt;
    }
    if (state.autoRotate) camera.alpha += 0.0012;
  });
  let down = false;
  canvas.addEventListener('pointerdown', () => { down = true; });
  window.addEventListener('pointerup', () => { down = false; });
  scene.registerBeforeRender(() => { if (down) state.autoRotate = false; });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  return {
    scene, engine, camera,
    setPlan,
    setBeltColor: (hex) => drawBelt(hex),
    setShowBolts: (on) => { state.showBolts = on; if (root) root.getChildMeshes().forEach((m) => { if (m.metadata?.part?.hideByDefault) m.setEnabled(on); }); },
    setAnim: (on) => { state.anim = on; },
    setAutoRotate: (on) => { state.autoRotate = on; },
    dispose: () => engine.dispose(),
  };
}

export default { createView };
