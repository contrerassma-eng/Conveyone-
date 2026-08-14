/* ==========================================================================
   sim3d.js — la lógica ZPA corriendo SOBRE EL MODELO CAD REAL.

   Carga el mismo .glb del levantamiento que se ve en la ficha del equipo y
   hace circular cajas por él con el motor de `zpa.js`. La superficie de
   transporte no se asume: se encuentra lanzando rayos hacia abajo sobre el eje
   de la línea, así las cajas se apoyan donde están los rodillos de verdad.

   Cada zona muestra su estado sobre el bastidor — verde en marcha, rojo
   detenida — y su fotocélula se enciende en ámbar cuando queda tapada.
   ========================================================================== */

import { creaZPA } from './zpa.js';

/* Especificadores bare resueltos por el import map de la página: GLTFLoader
   importa "three" internamente y sin el mapa no carga. */
let libs = null;
async function carga() {
  if (libs) return libs;
  const [THREE, g, o, r, m] = await Promise.all([
    import('three'),
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/environments/RoomEnvironment.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  libs = { THREE, GLTFLoader: g.GLTFLoader, OrbitControls: o.OrbitControls,
           RoomEnvironment: r.RoomEnvironment, MeshoptDecoder: m.MeshoptDecoder };
  return libs;
}

/** Textura de caja: cartón kraft con la marca y la cinta de sellado. */
function texturaCaja(THREE, logo) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#E0C098');
  g.addColorStop(1, '#C49A69');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);

  // fibra del cartón
  x.globalAlpha = 0.05;
  for (let i = 0; i < 260; i++) {
    x.fillStyle = i % 2 ? '#6B4A22' : '#FFF3E0';
    x.fillRect(Math.random() * 512, Math.random() * 512, 26 + Math.random() * 46, 1);
  }
  x.globalAlpha = 1;

  // cinta de sellado
  x.fillStyle = 'rgba(255,255,255,.30)';
  x.fillRect(0, 74, 512, 34);

  if (logo && logo.complete && logo.naturalWidth) {
    const lw = 250;
    const lh = lw * (logo.naturalHeight / logo.naturalWidth);
    x.drawImage(logo, 256 - lw / 2, 268 - lh / 2, lw, lh);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export async function montaSim3D(host, opts = {}) {
  const { THREE, GLTFLoader, OrbitControls, RoomEnvironment, MeshoptDecoder } = await carga();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts.fondo != null ? opts.fondo : 0xE7ECF3);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // --- modelo CAD real
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(opts.glb);
  const equipo = gltf.scene;

  const caja0 = new THREE.Box3().setFromObject(equipo);
  const tam = caja0.getSize(new THREE.Vector3());
  const centro = caja0.getCenter(new THREE.Vector3());
  const diag = tam.length();
  equipo.position.sub(centro);
  equipo.position.y += tam.y / 2;          // apoyado en y = 0

  const acero = new THREE.MeshStandardMaterial({
    color: 0xB4BCC8, metalness: 0.88, roughness: 0.3, envMapIntensity: 1.15 });
  equipo.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material;
    const plano = !m || (m.color && m.color.r > 0.92 && m.color.g > 0.92 && m.color.b > 0.92
                         && (m.metalness == null || m.metalness < 0.1));
    if (opts.material === 'acero' || plano) o.material = acero;
  });
  scene.add(equipo);
  equipo.updateWorldMatrix(true, true);

  // --- superficie de transporte: se BUSCA, no se asume
  const bb = new THREE.Box3().setFromObject(equipo);
  const largoM = tam.x;                    // el eje largo del ensamble
  const rc = new THREE.Raycaster();
  const abajo = new THREE.Vector3(0, -1, 0);
  const alturas = [];
  for (let k = 0.2; k <= 0.8; k += 0.06) {
    const x = bb.min.x + largoM * k;
    rc.set(new THREE.Vector3(x, bb.max.y + diag * 0.2, 0), abajo);
    const hit = rc.intersectObject(equipo, true)[0];
    if (hit) alturas.push(hit.point.y);
  }
  alturas.sort((a, b) => a - b);
  const yRodillos = alturas.length ? alturas[Math.floor(alturas.length / 2)] : bb.max.y;

  // --- motor de la lógica, en milímetros
  const mm = largoM / (opts.largoMM || 3000);   // escala mm -> unidades de escena
  const zpa = creaZPA({
    largo: opts.largoMM || 3000,
    zonas: opts.zonas || 4,
    cajaL: opts.cajaL || 400,
  });

  // --- cajas
  const logo = new Image();
  logo.src = opts.logo || 'assets/img/mark.png';
  await new Promise((r) => { logo.onload = r; logo.onerror = r; });

  const CL = (opts.cajaL || 400) * mm;
  const CW = (opts.cajaW || 300) * mm;
  const CH = (opts.cajaH || 220) * mm;
  const geoCaja = new THREE.BoxGeometry(CL, CH, CW);
  const matCaja = new THREE.MeshStandardMaterial({
    map: texturaCaja(THREE, logo), roughness: 0.85, metalness: 0.0 });

  const mallasCaja = [];
  const grupoCajas = new THREE.Group();
  scene.add(grupoCajas);

  function malla(i) {
    if (!mallasCaja[i]) {
      const m = new THREE.Mesh(geoCaja, matCaja);
      m.castShadow = true;
      grupoCajas.add(m);
      mallasCaja[i] = m;
    }
    return mallasCaja[i];
  }

  // --- indicadores por zona sobre el bastidor
  const LZ = (opts.largoMM || 3000) / (opts.zonas || 4);
  const zLuz = bb.max.z + CW * 0.12;
  const marcas = zpa.zonas.map((z) => {
    const g = new THREE.Group();
    const luz = new THREE.Mesh(
      new THREE.SphereGeometry(diag * 0.008, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x14996B, emissive: 0x14996B, emissiveIntensity: 1.6 }));
    luz.position.set(bb.min.x + (z.ini + LZ / 2) * mm, yRodillos + CH * 0.18, zLuz);
    g.add(luz);

    // haz de la fotocélula, atravesando el ancho de la línea
    const haz = new THREE.Mesh(
      new THREE.CylinderGeometry(diag * 0.0016, diag * 0.0016, tam.z * 0.92, 8),
      new THREE.MeshBasicMaterial({ color: 0x2FA8E0, transparent: true, opacity: 0.5 }));
    haz.rotation.x = Math.PI / 2;
    haz.position.set(bb.min.x + z.ojo * mm, yRodillos + CH * 0.35, 0);
    g.add(haz);

    scene.add(g);
    return { luz, haz };
  });

  // --- luces y piso
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(diag * 0.5, diag * 0.95, diag * 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const s = diag * 0.7;
  Object.assign(key.shadow.camera,
    { left: -s, right: s, top: s, bottom: -s, near: diag * 0.02, far: diag * 4 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0006;
  scene.add(key);
  scene.add(new THREE.AmbientLight(0xffffff, 0.34));

  const piso = new THREE.Mesh(
    new THREE.PlaneGeometry(diag * 6, diag * 6),
    new THREE.ShadowMaterial({ opacity: 0.18 }));
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  scene.add(piso);

  // --- cámara
  const cam = new THREE.PerspectiveCamera(34, host.clientWidth / host.clientHeight,
                                          diag * 0.01, diag * 20);
  const yaw = THREE.MathUtils.degToRad(opts.yaw != null ? opts.yaw : 34);
  const pit = THREE.MathUtils.degToRad(opts.pitch != null ? opts.pitch : 24);
  const rad = diag * (opts.fit || 1.05) * 1.2;
  cam.position.set(Math.cos(pit) * Math.sin(yaw) * rad,
                   Math.sin(pit) * rad + tam.y * 0.6,
                   Math.cos(pit) * Math.cos(yaw) * rad);

  const ctrl = new OrbitControls(cam, renderer.domElement);
  ctrl.target.set(0, yRodillos, 0);
  ctrl.enableDamping = true;
  ctrl.dampingFactor = 0.08;
  ctrl.enablePan = false;
  ctrl.minDistance = diag * 0.4;
  ctrl.maxDistance = diag * 2.6;
  ctrl.maxPolarAngle = Math.PI / 2 - 0.05;
  ctrl.update();

  const ro = new ResizeObserver(() => {
    if (!host.clientWidth || !host.clientHeight) return;
    renderer.setSize(host.clientWidth, host.clientHeight);
    cam.aspect = host.clientWidth / host.clientHeight;
    cam.updateProjectionMatrix();
  });
  ro.observe(host);

  // --- bucle
  const VERDE = new THREE.Color(0x14996B);
  const ROJO = new THREE.Color(0xC4562F);
  const AMBAR = new THREE.Color(0xF7A928);
  const CYAN = new THREE.Color(0x2FA8E0);

  let corriendo = true;
  let vivo = true;
  let ultimo = performance.now();

  function bucle(t) {
    if (!vivo) return;
    requestAnimationFrame(bucle);
    const dt = Math.min(48, t - ultimo);
    ultimo = t;
    if (corriendo) zpa.paso(dt);

    // cajas
    const cajas = zpa.estado.cajas;
    cajas.forEach((b, i) => {
      const m = malla(i);
      m.visible = true;
      // b.s es el FRENTE de la caja, medido desde el inicio del tramo
      const xc = bb.min.x + (b.s - zpa.cfg.cajaL / 2) * mm;
      m.position.set(xc, yRodillos + CH / 2, 0);
    });
    for (let i = cajas.length; i < mallasCaja.length; i++) mallasCaja[i].visible = false;

    // estado de zonas
    zpa.zonas.forEach((z, i) => {
      const mk = marcas[i];
      const col = z.motor ? VERDE : ROJO;
      mk.luz.material.color.copy(col);
      mk.luz.material.emissive.copy(col);
      mk.haz.material.color.copy(z.ocupada ? AMBAR : CYAN);
      mk.haz.material.opacity = z.ocupada ? 0.85 : 0.4;
    });

    ctrl.update();
    renderer.render(scene, cam);
  }
  requestAnimationFrame(bucle);

  return {
    modo(m) { zpa.modo(m); },
    salida(libre) { zpa.salida(libre); },
    play(on) { corriendo = on; },
    reset() { zpa.reset(); },
    zonas: zpa.zonas,
    dims: [tam.x, tam.y, tam.z],
    destruir() { vivo = false; ro.disconnect(); renderer.dispose(); host.innerHTML = ''; },
  };
}

export default { montaSim3D };
