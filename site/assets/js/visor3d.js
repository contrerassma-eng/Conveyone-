/* ==========================================================================
   visor3d.js — visor de los ENSAMBLES CAD REALES (.glb) con three.js.

   Es distinto del visor del configurador: aquí no hay parámetros, hay
   geometría levantada del CAD (estructura, rodillos, motores, brackets,
   guardas). Se carga bajo demanda porque los ensambles pesan varios MB.

   Los GLB vienen comprimidos con meshopt y, al ser exportaciones CAD, muchos
   llegan sin material: se les aplica un acabado industrial para que se lean
   como equipo y no como maqueta blanca.
   ========================================================================== */

/* Los módulos se piden por especificador BARE y se resuelven con el import map
   de la página. Es obligatorio: GLTFLoader importa internamente "three", y sin
   el mapa el navegador no sabe resolverlo y el visor no carga. Además evita
   cargar dos instancias distintas de THREE. */
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

/**
 * Monta un ensamble GLB en un contenedor.
 * @param {HTMLElement} host  contenedor (se le agrega el canvas)
 * @param {string} url        ruta del .glb
 * @param {object} opts       {fondo, yaw, pitch, fit, girar, alFinal}
 */
export async function montaVisor(host, url, opts = {}) {
  const { THREE, GLTFLoader, OrbitControls, RoomEnvironment, MeshoptDecoder } = await carga();

  const fondo = opts.fondo != null ? opts.fondo : 0xE7ECF3;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: opts.fondo === null });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  if (opts.fondo !== null) scene.background = new THREE.Color(fondo);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const raiz = gltf.scene;

  const caja = new THREE.Box3().setFromObject(raiz);
  const tam = caja.getSize(new THREE.Vector3());
  const centro = caja.getCenter(new THREE.Vector3());
  const diag = tam.length();

  raiz.position.sub(centro);
  raiz.position.y += tam.y / 2;

  const acero = new THREE.MeshStandardMaterial({
    color: 0xB4BCC8, metalness: 0.88, roughness: 0.30, envMapIntensity: 1.15 });
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    const plano = !m || (m.color && m.color.r > 0.92 && m.color.g > 0.92 && m.color.b > 0.92
                         && (m.metalness == null || m.metalness < 0.1));
    if (opts.material === 'acero' || plano) o.material = acero;
    else { m.envMapIntensity = 1.1; }
  });
  scene.add(raiz);

  const piso = new THREE.Mesh(
    new THREE.PlaneGeometry(diag * 6, diag * 6),
    new THREE.ShadowMaterial({ opacity: 0.2 }));
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  scene.add(piso);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(diag * 0.6, diag * 1.0, diag * 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const s = diag * 0.75;
  Object.assign(key.shadow.camera,
    { left: -s, right: s, top: s, bottom: -s, near: diag * 0.05, far: diag * 4 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0006;
  scene.add(key);
  scene.add(new THREE.AmbientLight(0xffffff, 0.32));

  const cam = new THREE.PerspectiveCamera(34, host.clientWidth / host.clientHeight,
                                          diag * 0.01, diag * 20);
  const yaw = THREE.MathUtils.degToRad(opts.yaw != null ? opts.yaw : 32);
  const pit = THREE.MathUtils.degToRad(opts.pitch != null ? opts.pitch : 20);
  const rad = diag * (opts.fit || 0.95) * 1.25;
  cam.position.set(Math.cos(pit) * Math.sin(yaw) * rad,
                   Math.sin(pit) * rad + tam.y * 0.5,
                   Math.cos(pit) * Math.cos(yaw) * rad);

  const ctrl = new OrbitControls(cam, renderer.domElement);
  ctrl.target.set(0, tam.y * 0.5, 0);
  ctrl.enableDamping = true;
  ctrl.dampingFactor = 0.07;
  ctrl.enablePan = false;
  ctrl.minDistance = diag * 0.35;
  ctrl.maxDistance = diag * 3;
  ctrl.maxPolarAngle = Math.PI / 2 - 0.04;
  ctrl.autoRotate = !!opts.girar;
  ctrl.autoRotateSpeed = 0.55;
  ctrl.update();

  const ro = new ResizeObserver(() => {
    if (!host.clientWidth || !host.clientHeight) return;
    renderer.setSize(host.clientWidth, host.clientHeight);
    cam.aspect = host.clientWidth / host.clientHeight;
    cam.updateProjectionMatrix();
  });
  ro.observe(host);

  let vivo = true;
  (function bucle() {
    if (!vivo) return;
    requestAnimationFrame(bucle);
    ctrl.update();
    renderer.render(scene, cam);
  })();

  const api = {
    girar(on) { ctrl.autoRotate = on; },
    encuadra() { ctrl.reset(); },
    dims: [tam.x, tam.y, tam.z],
    destruir() { vivo = false; ro.disconnect(); renderer.dispose(); host.innerHTML = ''; },
  };
  if (opts.alFinal) opts.alFinal(api);
  return api;
}

export default { montaVisor };
