#!/usr/bin/env python3
"""Arma las páginas del sitio a partir de un chrome común (cabecera + pie) y el
contenido de cada página, que vive en tools/paginas/<nombre>.html.

El resultado son archivos HTML planos en site/ — el sitio se sigue sirviendo sin
build ni framework. Esto existe solo para no mantener la cabecera copiada a mano
en siete archivos.

Uso:  python3 tools/build-paginas.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(__file__).resolve().parent / "paginas"
OUT = ROOT / "site"

HEAD = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#16233C">
<link rel="icon" type="image/png" href="assets/img/favicon.png">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/site.css">
{extrahead}</head>
<body{bodyattr}>

<div class="prog"></div>
<div class="scrim"></div>

<!-- riel lateral: el sitio se recorre como una línea -->
<aside class="rail" aria-label="Barra lateral">
  <span class="rail-prog" id="railProg"></span>
  <a class="rail-logo" href="index.html" aria-label="Conveyone — inicio">
    <img src="assets/img/mark.png" alt="Conveyone">
  </a>
  <div class="rail-word">CONVEYONE&nbsp;&nbsp;<b>SpA</b></div>
  <div class="rail-dots" id="railDots"></div>
  <div class="rail-ig">
    <a href="mailto:scontreras@conveyone.tech" aria-label="Correo" title="scontreras@conveyone.tech">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 6.5 9 6.5 9-6.5"/></svg>
    </a>
    <a href="tel:+56979583700" aria-label="Teléfono" title="+56 9 7958 3700">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5h4l2 5-2.5 1.5a12 12 0 0 0 5.5 5.5L14.5 14l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 3 5.5a1 1 0 0 1 1-1Z"/></svg>
    </a>
  </div>
</aside>

<header class="hdr">
  <div class="wrap">
    <a class="hdr-logo" href="index.html" aria-label="Conveyone — inicio">
      <img class="lg-dark" src="assets/img/logo.png" alt="Conveyone SpA">
      <img class="lg-light" src="assets/img/logo-dark.png" alt="Conveyone SpA">
    </a>
    <nav class="nav" aria-label="Principal">
      <a href="productos.html">Equipos</a>
      <a href="temporada.html">Temporada</a>
      <a href="seleccion.html">Cómo elegir</a>
      <a href="configurador.html">Configurador</a>
      <a href="ingenieria.html">Ingeniería</a>
      <a href="nosotros.html">Nosotros</a>
      <a href="contacto.html">Contacto</a>
    </nav>
    <div class="hdr-actions">
      <a class="hdr-quote" href="cotizacion.html" data-cart-host data-empty="1">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2 6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M6 6h12"/><path d="M10 11h4"/></svg>
        <span class="lbl">Cotización</span>
        <span class="cnt" data-cart-count>0</span>
      </a>
      <button class="burger" aria-label="Abrir menú"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>

<main>
"""

FOOT = """</main>

<footer class="ftr">
  <div class="wrap">
    <div class="ftr-top">
      <div>
        <img class="flogo" src="assets/img/logo-dark.png" alt="Conveyone SpA">
        <p>Diseño, fabricación y montaje de transportadores modulares para la industria agroalimentaria y logística. Chile.</p>
      </div>
      <div>
        <h5>Equipos</h5>
        <ul>
          <li><a href="configurador.html?m=mt800_pro">MT800-Pro · Banda estrecha</a></li>
          <li><a href="configurador.html?m=mb400">MB400 · Banda modular</a></li>
          <li><a href="configurador.html?m=mc400">MC400 · Curva</a></li>
          <li><a href="productos.html">Catálogo completo</a></li>
          <li><a href="seleccion.html">Cómo elegir</a></li>
        </ul>
      </div>
      <div>
        <h5>Empresa</h5>
        <ul>
          <li><a href="temporada.html">Temporada de cereza</a></li>
          <li><a href="nosotros.html">Nosotros</a></li>
          <li><a href="ingenieria.html">Ingeniería</a></li>
          <li><a href="contacto.html">Contacto</a></li>
          <li><a href="cotizacion.html">Mi cotización</a></li>
        </ul>
      </div>
      <div>
        <h5>Contacto</h5>
        <ul>
          <li><a href="mailto:scontreras@conveyone.tech">scontreras@conveyone.tech</a></li>
          <li><a href="tel:+56979583700">+56 9 7958 3700</a></li>
          <li>Santiago, Chile</li>
        </ul>
      </div>
    </div>
    <div class="ftr-bt">
      <span>© <span data-year>2026</span> Conveyone SpA · Chile</span>
      <span>Transportadores modulares · Plug and play, a medida</span>
    </div>
  </div>
</footer>

{scripts}<script type="module" src="assets/js/site.js"></script>
</body>
</html>
"""


def meta(txt, clave, defecto=""):
    m = re.search(rf"<!--\s*{clave}:\s*(.*?)\s*-->", txt)
    return m.group(1) if m else defecto


def main():
    hechas = []
    for f in sorted(SRC.glob("*.html")):
        raw = f.read_text(encoding="utf-8")
        cuerpo = re.sub(r"<!--\s*\w+:.*?-->\n?", "", raw)
        html = HEAD.format(
            title=meta(raw, "title", "Conveyone SpA"),
            desc=meta(raw, "desc", ""),
            extrahead=meta(raw, "extrahead", "").replace("\\n", "\n"),
            bodyattr=(" " + meta(raw, "bodyattr")) if meta(raw, "bodyattr") else "",
        ) + cuerpo.strip() + "\n\n" + FOOT.format(
            scripts=meta(raw, "scripts", "").replace("\\n", "\n"),
        )
        dest = OUT / f.name
        dest.write_text(html, encoding="utf-8")
        hechas.append(f.name)
    print("páginas generadas:", ", ".join(hechas))


if __name__ == "__main__":
    main()
