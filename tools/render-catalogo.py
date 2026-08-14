#!/usr/bin/env python3
"""Renderiza las imágenes de catálogo del sitio a partir de los modelos
paramétricos del motor (simulator/src/engine). Cada imagen sale del MISMO plan
que usa el configurador, así la foto del catálogo no puede divergir del equipo.

Uso:
    python3 tools/render-catalogo.py [--babylon /ruta/babylon.js]

Requisitos: playwright + Chromium (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers).
Salida: site/assets/img/prod-<slug>.png
"""
import argparse
import http.server
import json
import os
import shutil
import socketserver
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "assets" / "img"

# vista por modelo: params opcionales + cámara (alpha, beta, radio) + tamaño
VISTAS = [
    dict(slug="mt800", model="mt800_pro",
         params={"length": 2400, "width": 600, "belt_color": "#1b3a6b"},
         alpha=-1.10, beta=0.98, fit=0.84),
    dict(slug="mb400", model="mb400",
         params={"length": 2600, "width": 600, "belt_color": "#1b3a6b"},
         alpha=-1.10, beta=0.96, fit=0.84),
    dict(slug="mc400", model="mc400",
         params={"angle": 90, "inner_radius": 400, "width": 400, "belt_color": "#1b3a6b"},
         alpha=-0.78, beta=0.92, fit=0.92),
]

PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#EDF1F7}
canvas{width:100%;height:100%;display:block;outline:none}
</style></head><body>
<canvas id="c"></canvas>
<script src="/babylon.js"></script>
<script type="module">
import { configure } from '/simulator/src/engine/index.js';
import { createView } from '/simulator/src/render/babylonView.js';
import { getModel } from '/simulator/src/engine/index.js';
window.__render = async (spec) => {
  const view = createView(document.getElementById('c'), {});
  const model = getModel(spec.model);
  const params = { ...model.defaults(), ...spec.params };
  const res = configure(spec.model, params);
  view.setPlan(res.plan);
  const scene = BABYLON.EngineStore.LastCreatedScene;
  scene.clearColor = new BABYLON.Color4(0.929, 0.945, 0.968, 1);
  const cam = scene.activeCamera;
  if (params.belt_color) view.setBeltColor(params.belt_color);
  // el encuadre lo hace view.setPlan(); aquí solo se ajusta el punto de vista
  cam.alpha = spec.alpha; cam.beta = spec.beta;
  cam.radius = cam.radius * (spec.fit || 0.85);
  await new Promise(r => setTimeout(r, 1200));
  return { code: res.code, parts: res.total_parts };
};
window.__ready = true;
</script></body></html>
"""


BG_TOP = (237, 241, 247)
BG_BOT = (220, 228, 239)


def componer(src: Path, dest: Path, ratio=(16, 10), pad=0.07):
    """Recorta el render al contenido y lo centra sobre el degradado de la tarjeta.

    El encuadre de la escena 3D deja el equipo descentrado según el modelo; en vez
    de calibrar la cámara equipo por equipo, se recorta lo dibujado y se compone.
    """
    from PIL import Image

    im = Image.open(src).convert("RGB")
    w, h = im.size
    fondo = im.getpixel((4, 4))
    # máscara de contenido: pixel que se aparta del fondo plano
    dif = Image.new("L", (w, h))
    px_src, px_dif = im.load(), dif.load()
    for y in range(0, h):
        for x in range(0, w):
            r, g, b = px_src[x, y]
            d = abs(r - fondo[0]) + abs(g - fondo[1]) + abs(b - fondo[2])
            px_dif[x, y] = 255 if d > 10 else 0
    caja = dif.getbbox()
    if caja is None:
        shutil.copy(src, dest)
        return
    obj = im.crop(caja)
    ow, oh = obj.size

    # lienzo final con el degradado de la tarjeta
    W = 1600
    H = int(W * ratio[1] / ratio[0])
    lienzo = Image.new("RGB", (W, H))
    lz = lienzo.load()
    for y in range(H):
        k = y / (H - 1)
        col = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3))
        for x in range(W):
            lz[x, y] = col

    disp = min((W * (1 - 2 * pad)) / ow, (H * (1 - 2 * pad)) / oh)
    nw, nh = max(1, int(ow * disp)), max(1, int(oh * disp))
    obj = obj.resize((nw, nh), Image.LANCZOS)

    # el render trae su propio fondo plano: se pega con máscara para conservar
    # el degradado del lienzo alrededor de la silueta
    mask = dif.crop(caja).resize((nw, nh), Image.LANCZOS)
    lienzo.paste(obj, ((W - nw) // 2, (H - nh) // 2), mask)
    lienzo.save(dest, optimize=True)


def serve(directory: str, port: int):
    handler = type("H", (http.server.SimpleHTTPRequestHandler,), {
        "directory_": directory,
        "__init__": lambda self, *a, **k: http.server.SimpleHTTPRequestHandler.__init__(
            self, *a, directory=directory, **k),
        "log_message": lambda *a, **k: None,
    })
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--babylon", default="/tmp/babylon.js",
                    help="copia local de babylon.js (el CDN no es alcanzable sin red)")
    ap.add_argument("--port", type=int, default=8731)
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    stage = ROOT / ".render-stage"
    if stage.exists():
        shutil.rmtree(stage)
    (stage / "simulator" / "src").mkdir(parents=True)
    shutil.copytree(ROOT / "simulator" / "src" / "engine", stage / "simulator" / "src" / "engine")
    shutil.copytree(ROOT / "simulator" / "src" / "render", stage / "simulator" / "src" / "render")
    shutil.copy(args.babylon, stage / "babylon.js")
    (stage / "index.html").write_text(PAGE, encoding="utf-8")

    httpd = serve(str(stage), args.port)
    OUT.mkdir(parents=True, exist_ok=True)
    base = f"http://127.0.0.1:{args.port}/index.html"

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium"),
            args=["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        for v in VISTAS:
            page = browser.new_page(viewport={"width": 1200, "height": 750},
                                    device_scale_factor=2)
            page.goto(base, wait_until="load", timeout=60000)
            page.wait_for_function("window.__ready === true", timeout=30000)
            info = page.evaluate("(s) => window.__render(s)", v)
            page.wait_for_timeout(600)
            dest = OUT / f"prod-{v['slug']}.png"
            raw = OUT / f".raw-{v['slug']}.png"
            page.screenshot(path=str(raw), animations="disabled")
            componer(raw, dest)
            raw.unlink()
            print(f"{dest.name}: {info['code']} · {info['parts']} piezas")
            page.close()
        browser.close()

    httpd.shutdown()
    shutil.rmtree(stage)


if __name__ == "__main__":
    main()
