#!/usr/bin/env python3
"""Revisión headless del sitio: carga cada página, recoge errores de consola y
de red, y guarda una captura en /tmp/qa-sitio/.

Uso:  python3 tools/qa-sitio.py [--shots]

Sirve la RAÍZ del repositorio (el configurador importa el motor desde
simulator/) y abre /site/<pagina>. Si no hay red, el CDN de Babylon se sustituye
por una copia local con --babylon.
"""
import argparse
import http.server
import os
import socketserver
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path("/tmp/qa-sitio")

PAGINAS = ["index.html", "productos.html", "equipo.html?e=acumulacion-24v",
           "configurador.html", "cotizacion.html", "ingenieria.html",
           "nosotros.html", "contacto.html"]

# ruido esperado sin red: fuentes de Google y el CDN
IGNORAR = ("fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net")


def serve(directory, port):
    handler = type("H", (http.server.SimpleHTTPRequestHandler,), {
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
    ap.add_argument("--port", type=int, default=8801)
    ap.add_argument("--babylon", default="/tmp/babylon.js")
    ap.add_argument("--shots", action="store_true", help="guardar capturas")
    ap.add_argument("--width", type=int, default=1440)
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    httpd = serve(str(ROOT), args.port)
    SHOTS.mkdir(exist_ok=True)
    bab = Path(args.babylon)
    fallos = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium"),
            args=["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        for pag in PAGINAS:
            page = browser.new_page(viewport={"width": args.width, "height": 950})
            errores, red = [], []
            # "Failed to load resource" duplica lo que ya reporta requestfailed
            page.on("console", lambda m: errores.append(m.text)
                    if m.type == "error" and "Failed to load resource" not in m.text else None)
            page.on("pageerror", lambda e: errores.append("pageerror: " + str(e)))
            page.on("requestfailed", lambda r: red.append(r.url)
                    if not any(s in r.url for s in IGNORAR) else None)

            if bab.exists():
                page.route("**/babylon.js", lambda route: route.fulfill(
                    path=str(bab), content_type="application/javascript"))

            page.goto(f"http://127.0.0.1:{args.port}/site/{pag}",
                      wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(1800)
            # recorrer la página para que se disparen los revelados por scroll
            page.evaluate("""async () => {
              // el sitio usa scroll-behavior:smooth; para el barrido conviene salto seco
              const antes = document.documentElement.style.scrollBehavior;
              document.documentElement.style.scrollBehavior = 'auto';
              const h = document.body.scrollHeight;
              for (let y = 0; y < h; y += window.innerHeight * 0.8) {
                window.scrollTo(0, y);
                await new Promise(r => setTimeout(r, 220));
              }
              window.scrollTo(0, 0);
              document.documentElement.style.scrollBehavior = antes;
              await new Promise(r => setTimeout(r, 1200));
            }""")

            estado = "OK "
            if errores or red:
                estado = "FALLA"
                fallos += 1
            print(f"[{estado}] {pag}")
            for e in errores[:6]:
                print("        consola:", e[:180])
            for r in red[:6]:
                print("        red:", r[:180])

            if args.shots:
                completa = not pag.startswith("configurador")
                nombre = pag.split("?")[0].replace(".html", "")
                page.screenshot(path=str(SHOTS / (nombre + ".png")),
                                full_page=completa)
            page.close()
        browser.close()

    httpd.shutdown()
    print("\ncapturas en", SHOTS if args.shots else "(no se pidieron)")
    raise SystemExit(1 if fallos else 0)


if __name__ == "__main__":
    main()
