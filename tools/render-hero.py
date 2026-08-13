#!/usr/bin/env python3
"""Renderiza la biblioteca de imágenes de marca desde los ensambles CAD reales.

No hay fotografía de planta, así que la "fotografía" del sitio se produce aquí:
tomas cinematográficas sobre fondo oscuro con luz de contra azul, y macros de
detalle (motriz, rodillos, estructura) que se usan como fondo de sección.

Uso:  python3 tools/render-hero.py [--three /tmp/three] [--solo <slug>]
Salida: site/assets/img/<slug>.jpg
"""
import argparse
import http.server
import os
import shutil
import socketserver
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "assets" / "img"
MODELOS = ROOT / "site" / "assets" / "models"

# foco: fracción del bounding box donde apunta la cámara (0 = un extremo, .5 = centro)
# radio: fracción de la diagonal → valores chicos = macro
VISTAS = [
    # --- tomas cinematográficas (fondo oscuro, para héroes y franjas) ------
    dict(slug="cine-banda-plana", glb="mc400-banda-plana.glb", material="acero",
         yaw=22, pitch=13, radio=0.52, foco=(0.30, 0.5, 0.5), fondo="oscuro",
         ratio=(21, 9)),
    dict(slug="cine-acumulacion", glb="zp2026-acumulacion.glb",
         yaw=32, pitch=17, radio=0.62, foco=(0.45, 0.5, 0.5), fondo="oscuro",
         ratio=(21, 9)),
    dict(slug="cine-mdr", glb="zp2026-mdr.glb",
         yaw=-38, pitch=20, radio=0.60, foco=(0.5, 0.5, 0.5), fondo="oscuro",
         ratio=(16, 9)),

    # --- macros de detalle -------------------------------------------------
    dict(slug="det-motriz", glb="mc400-banda-plana.glb", material="acero",
         yaw=40, pitch=18, radio=0.21, foco=(0.07, 0.62, 0.5), fondo="oscuro",
         ratio=(4, 3)),
    dict(slug="det-rodillos", glb="zp2026-acumulacion.glb",
         yaw=18, pitch=36, radio=0.36, foco=(0.34, 1.02, 0.5), fondo="oscuro",
         ratio=(4, 3)),
    dict(slug="det-estructura", glb="zp2026-acumulacion.glb",
         yaw=48, pitch=12, radio=0.38, foco=(0.88, 0.42, 0.5), fondo="oscuro",
         ratio=(4, 3)),
    dict(slug="det-transferencia", glb="sorter-transferencia.glb",
         yaw=40, pitch=24, radio=0.55, foco=(0.5, 0.5, 0.5), fondo="oscuro",
         ratio=(4, 3)),
]

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;overflow:hidden}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script>
</head><body>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from '/three/loaders/GLTFLoader.js';
import { RoomEnvironment } from '/three/environments/RoomEnvironment.js';
import { MeshoptDecoder } from '/three/libs/meshopt_decoder.module.js';

const cache = new Map();

window.__render = async (spec) => {
  const w = window.innerWidth, h = window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = spec.fondo === 'oscuro' ? 1.25 : 1.05;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const oscuro = spec.fondo === 'oscuro';
  scene.background = new THREE.Color(oscuro ? 0x0C1526 : 0xEDF1F7);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = oscuro ? 0.45 : 1.0;

  if (!cache.has(spec.glb)) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    cache.set(spec.glb, await loader.loadAsync('/models/' + spec.glb));
  }
  const raiz = cache.get(spec.glb).scene.clone(true);

  const caja = new THREE.Box3().setFromObject(raiz);
  const tam = caja.getSize(new THREE.Vector3());
  const centro = caja.getCenter(new THREE.Vector3());
  const diag = tam.length();
  raiz.position.sub(centro);
  raiz.position.y += tam.y / 2;

  const acero = new THREE.MeshStandardMaterial({
    color: oscuro ? 0x9AA4B2 : 0xB4BCC8, metalness: 0.92,
    roughness: 0.26, envMapIntensity: oscuro ? 1.5 : 1.15 });
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material;
    const plano = !m || (m.color && m.color.r > 0.92 && m.color.g > 0.92 && m.color.b > 0.92
                         && (m.metalness == null || m.metalness < 0.1));
    if (spec.material === 'acero' || plano) o.material = acero;
    else { m.envMapIntensity = oscuro ? 1.4 : 1.1; }
  });
  scene.add(raiz);

  // piso: recoge la sombra y el degradado del fondo
  const piso = new THREE.Mesh(
    new THREE.PlaneGeometry(diag * 8, diag * 8),
    oscuro ? new THREE.MeshStandardMaterial({ color: 0x0E1A2E, roughness: 0.62, metalness: 0.1 })
           : new THREE.ShadowMaterial({ opacity: 0.2 }));
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  scene.add(piso);

  // luz principal + contra azul de marca + relleno cálido tenue
  const key = new THREE.DirectionalLight(0xffffff, oscuro ? 3.1 : 2.2);
  key.position.set(diag * 0.55, diag * 0.95, diag * 0.45);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const s = diag * 0.7;
  Object.assign(key.shadow.camera,
    { left: -s, right: s, top: s, bottom: -s, near: diag * 0.02, far: diag * 4 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0005;
  scene.add(key);

  if (oscuro) {
    const rim = new THREE.DirectionalLight(0x2F7BE0, 3.4);      // azul de marca
    rim.position.set(-diag * 0.7, diag * 0.35, -diag * 0.6);
    scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0x7FB2FF, 1.5);
    rim2.position.set(diag * 0.2, diag * 0.1, -diag * 0.8);
    scene.add(rim2);
    scene.add(new THREE.AmbientLight(0x16233C, 1.1));
    scene.fog = new THREE.Fog(0x0C1526, diag * 0.9, diag * 3.4);
  } else {
    scene.add(new THREE.AmbientLight(0xffffff, 0.32));
  }

  // encuadre: el foco se expresa en fracciones del bounding box del ensamble
  const f = spec.foco || [0.5, 0.5, 0.5];
  const objetivo = new THREE.Vector3(
    (f[0] - 0.5) * tam.x,
    f[1] * tam.y,
    (f[2] - 0.5) * tam.z);

  const cam = new THREE.PerspectiveCamera(spec.fov || 30, w / h, diag * 0.002, diag * 20);
  const yaw = THREE.MathUtils.degToRad(spec.yaw);
  const pit = THREE.MathUtils.degToRad(spec.pitch);
  const r = diag * spec.radio;
  cam.position.set(
    objetivo.x + Math.cos(pit) * Math.sin(yaw) * r,
    objetivo.y + Math.sin(pit) * r,
    objetivo.z + Math.cos(pit) * Math.cos(yaw) * r);
  cam.lookAt(objetivo);

  renderer.render(scene, cam);
  await new Promise((res) => setTimeout(res, 500));
  renderer.render(scene, cam);
  return { diag: Math.round(diag * 1000) };
};
window.__ready = true;
</script></body></html>
"""


def serve(directory, port):
    handler = type("H", (http.server.SimpleHTTPRequestHandler,), {
        "__init__": lambda self, *a, **k: http.server.SimpleHTTPRequestHandler.__init__(
            self, *a, directory=directory, **k),
        "log_message": lambda *a, **k: None,
    })
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--three", default="/tmp/three")
    ap.add_argument("--port", type=int, default=8861)
    ap.add_argument("--solo")
    ap.add_argument("--ancho", type=int, default=1800)
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright
    from PIL import Image

    stage = ROOT / ".render-hero"
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir()
    shutil.copytree(MODELOS, stage / "models")
    shutil.copytree(args.three, stage / "three")
    (stage / "index.html").write_text(PAGE, encoding="utf-8")

    httpd = serve(str(stage), args.port)
    OUT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium"),
            args=["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        for v in VISTAS:
            if args.solo and v["slug"] != args.solo:
                continue
            ratio = v.get("ratio", (16, 9))
            w = args.ancho
            h = int(w * ratio[1] / ratio[0])
            page = browser.new_page(viewport={"width": w // 2, "height": h // 2},
                                    device_scale_factor=2)
            page.goto(f"http://127.0.0.1:{args.port}/index.html",
                      wait_until="load", timeout=60000)
            page.wait_for_function("window.__ready === true", timeout=30000)
            info = page.evaluate("(s) => window.__render(s)", v)
            page.wait_for_timeout(350)
            raw = OUT / f".raw-{v['slug']}.png"
            page.screenshot(path=str(raw), animations="disabled")
            # JPEG: son fotos de fondo, no necesitan canal alfa y pesan la mitad
            Image.open(raw).convert("RGB").save(OUT / f"{v['slug']}.jpg",
                                                quality=88, optimize=True, progressive=True)
            raw.unlink()
            kb = (OUT / f"{v['slug']}.jpg").stat().st_size // 1024
            print(f"{v['slug']}.jpg · {w}×{h} · {kb} kB · diag {info['diag']} mm")
            page.close()
        browser.close()

    httpd.shutdown()
    shutil.rmtree(stage)


if __name__ == "__main__":
    main()
