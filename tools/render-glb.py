#!/usr/bin/env python3
"""Renderiza las imágenes de catálogo a partir de los ENSAMBLES CAD REALES
(site/assets/models/*.glb), no de la representación esquemática.

Los GLB vienen del levantamiento CAD (CADENAS PARTsolutions AP203) e incluyen
estructura, rodillos, motores, brackets y guardas. Estas son las imágenes que
van en el sitio; la geometría procedural del motor queda para el configurador
paramétrico, donde las medidas cambian en vivo.

Se usa three.js (no Babylon): el paquete babylonjs-loaders no carga en este
entorno, y con three el GLB se lee sin problema.

Uso:  python3 tools/render-glb.py [--three /tmp/three] [--solo <slug>]
Salida: site/assets/img/prod-<slug>.png
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

# yaw/pitch en grados sobre el centro del ensamble; fit = holgura del encuadre
VISTAS = [
    dict(slug="banda-plana", glb="mc400-banda-plana.glb", yaw=26, pitch=17, fit=0.92, material="acero"),
    dict(slug="mdr-24v", glb="zp2026-mdr.glb", yaw=34, pitch=22, fit=0.95),
    dict(slug="acumulacion-24v", glb="zp2026-acumulacion.glb", yaw=34, pitch=22, fit=0.95),
    dict(slug="transferencia", glb="sorter-transferencia.glb", yaw=42, pitch=27, fit=1.0),
]

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;background:#EDF1F7;overflow:hidden}
canvas{width:100%;height:100%;display:block}</style>
<script type="importmap">{"imports":{"three":"/three/three.module.js",
"three/addons/":"/three/"}}</script></head><body>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from '/three/loaders/GLTFLoader.js';
import { RoomEnvironment } from '/three/environments/RoomEnvironment.js';
import { MeshoptDecoder } from '/three/libs/meshopt_decoder.module.js';

window.__render = async (spec) => {
  const w = window.innerWidth, h = window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xEDF1F7);

  // iluminación de estudio: entorno para los reflejos metálicos + luz principal
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // los GLB del levantamiento vienen comprimidos con meshopt
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync('/models/' + spec.glb);
  const raiz = gltf.scene;

  const caja = new THREE.Box3().setFromObject(raiz);
  const tam = caja.getSize(new THREE.Vector3());
  const centro = caja.getCenter(new THREE.Vector3());
  const diag = tam.length();

  // centrar el ensamble en el origen y apoyarlo en el piso
  raiz.position.sub(centro);
  raiz.position.y += tam.y / 2;
  // Los GLB del levantamiento CAD vienen sin materiales (blanco plano). Se les
  // aplica un acabado industrial para que se lean como equipo, no como maqueta.
  const acero = new THREE.MeshStandardMaterial({
    color: 0xB4BCC8, metalness: 0.88, roughness: 0.30, envMapIntensity: 1.15 });
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material;
    const plano = !m || (m.color && m.color.r > 0.92 && m.color.g > 0.92 && m.color.b > 0.92
                         && (m.metalness == null || m.metalness < 0.1));
    if (spec.material === 'acero' || plano) o.material = acero;
    else { m.envMapIntensity = 1.1; if (m.metalness != null && m.metalness < 0.05) m.roughness = 0.5; }
  });
  scene.add(raiz);

  const piso = new THREE.Mesh(
    new THREE.PlaneGeometry(diag * 6, diag * 6),
    new THREE.ShadowMaterial({ opacity: 0.22 }));
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  scene.add(piso);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(diag * 0.6, diag * 1.0, diag * 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const s = diag * 0.75;
  Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s,
                                     near: diag * 0.05, far: diag * 4 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0006;
  scene.add(key);
  scene.add(new THREE.DirectionalLight(0xdce6f5, 0.6).translateX(-diag));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const cam = new THREE.PerspectiveCamera(32, w / h, diag * 0.01, diag * 20);
  const yaw = THREE.MathUtils.degToRad(spec.yaw);
  const pit = THREE.MathUtils.degToRad(spec.pitch);
  const r = diag * spec.fit * 1.25;
  cam.position.set(
    Math.cos(pit) * Math.sin(yaw) * r,
    Math.sin(pit) * r + tam.y * 0.5,
    Math.cos(pit) * Math.cos(yaw) * r);
  cam.lookAt(0, tam.y * 0.5, 0);

  renderer.render(scene, cam);
  await new Promise((res) => setTimeout(res, 400));
  renderer.render(scene, cam);

  let mallas = 0;
  raiz.traverse((o) => { if (o.isMesh) mallas++; });
  return { mallas, bbox: [tam.x, tam.y, tam.z].map((v) => Math.round(v * 1000) / 1000) };
};
window.__ready = true;
</script></body></html>
"""

BG_TOP = (237, 241, 247)
BG_BOT = (220, 228, 239)


def componer(src: Path, dest: Path, ratio=(16, 10), pad=0.05):
    """Recorta al contenido dibujado y lo compone sobre el degradado de la tarjeta."""
    from PIL import Image

    im = Image.open(src).convert("RGB")
    w, h = im.size
    fondo = im.getpixel((3, 3))
    dif = Image.new("L", (w, h))
    ps, pd = im.load(), dif.load()
    for y in range(h):
        for x in range(w):
            r, g, b = ps[x, y]
            if abs(r - fondo[0]) + abs(g - fondo[1]) + abs(b - fondo[2]) > 8:
                pd[x, y] = 255
    caja = dif.getbbox()
    if caja is None:
        shutil.copy(src, dest)
        return
    obj, mask = im.crop(caja), dif.crop(caja)
    ow, oh = obj.size

    W = 1600
    H = int(W * ratio[1] / ratio[0])
    lienzo = Image.new("RGB", (W, H))
    lz = lienzo.load()
    for y in range(H):
        k = y / (H - 1)
        col = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3))
        for x in range(W):
            lz[x, y] = col

    esc = min((W * (1 - 2 * pad)) / ow, (H * (1 - 2 * pad)) / oh)
    nw, nh = max(1, int(ow * esc)), max(1, int(oh * esc))
    lienzo.paste(obj.resize((nw, nh), Image.LANCZOS),
                 ((W - nw) // 2, (H - nh) // 2),
                 mask.resize((nw, nh), Image.LANCZOS))
    lienzo.save(dest, optimize=True)


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
    ap.add_argument("--three", default="/tmp/three", help="carpeta con three.module.js y addons")
    ap.add_argument("--port", type=int, default=8841)
    ap.add_argument("--solo", help="renderizar solo este slug")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    stage = ROOT / ".render-glb"
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
            page = browser.new_page(viewport={"width": 1200, "height": 750},
                                    device_scale_factor=2)
            errores = []
            page.on("pageerror", lambda e: errores.append(str(e)))
            page.goto(f"http://127.0.0.1:{args.port}/index.html", wait_until="load", timeout=60000)
            page.wait_for_function("window.__ready === true", timeout=30000)
            info = page.evaluate("(s) => window.__render(s)", v)
            page.wait_for_timeout(500)
            raw = OUT / f".raw-{v['slug']}.png"
            page.screenshot(path=str(raw), animations="disabled")
            componer(raw, OUT / f"prod-{v['slug']}.png")
            raw.unlink()
            print(f"prod-{v['slug']}.png · {info['mallas']} mallas · bbox {info['bbox']} mm"
                  + (f" · ERRORES: {errores[:2]}" if errores else ""))
            page.close()
        browser.close()

    httpd.shutdown()
    shutil.rmtree(stage)


if __name__ == "__main__":
    main()
