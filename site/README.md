# Sitio conveyone.tech

Sitio público de Conveyone SpA: catálogo de equipos, fichas con el modelo 3D
real y configurador paramétrico en línea con despiece y solicitud de cotización.

**Sin build ni framework.** Son archivos HTML, CSS y módulos JS que se sirven tal
cual. Se puede publicar en Cloudflare Pages, GitHub Pages o cualquier hosting
estático apuntando a esta carpeta.

## Estructura

```
site/
  index.html          portada
  productos.html      catálogo con filtro por familia
  equipo.html?e=slug  ficha de equipo + visor 3D del ensamble CAD real
  configurador.html   configurador paramétrico (3D + despiece + cotización)
  cotizacion.html     lista de equipos configurados + envío de la solicitud
  ingenieria.html     servicios de ingeniería y simulación de flujo
  nosotros.html       empresa
  contacto.html       formulario y datos de contacto
  data/catalogo.js    ÚNICA fuente de verdad del catálogo
  assets/
    css/site.css      sistema de diseño (paleta del logo: #0662C5 / #16233C)
    js/               site.js (común) + un módulo por página
    img/              logo y renders de catálogo
    models/           ensambles CAD reales (.glb, meshopt)
```

## Las dos representaciones (no son intercambiables)

| | Ensamble CAD real (`.glb`) | Modelo paramétrico (motor) |
|---|---|---|
| Origen | Levantamiento CADENAS PARTsolutions AP203 | `simulator/src/engine/` |
| Contiene | Estructura, rodillos, motores, brackets, guardas, cableado | Geometría esquemática por parámetros |
| Sirve para | Mostrar cómo es el equipo de verdad | Dimensionar y contar el despiece |
| Dónde | Portada, catálogo, ficha de equipo | Configurador |

El configurador importa el motor directamente desde `../simulator/src/engine/`,
así el despiece que ve el cliente es el mismo que produce el backend CadQuery.
No hay una copia del catálogo de piezas en el sitio.

## Cómo verlo en local

Hay que servir la **raíz del repositorio** (no la carpeta `site/`), porque el
configurador importa el motor desde `simulator/`:

```bash
python3 -m http.server 8080
# abrir http://localhost:8080/site/index.html
```

## Herramientas de apoyo (no son parte del sitio publicado)

```bash
# regenerar las páginas desde tools/paginas/ (cabecera y pie compartidos)
python3 tools/build-paginas.py

# renderizar las imágenes de catálogo desde los ensambles CAD reales
python3 tools/render-glb.py

# renderizar las imágenes de los modelos paramétricos
python3 tools/render-catalogo.py

# revisión headless: errores de consola y de red + capturas en /tmp/qa-sitio
python3 tools/qa-sitio.py --shots
```

Los renderizadores necesitan Playwright con Chromium y una copia local de
`three.js` (`--three`) o de `babylon.js` (`--babylon`) cuando no hay salida a
los CDN.

## Simulación de la lógica ZPA

`assets/js/zpa.js` es el motor de la acumulación de cero presión: zonas con
fotocélula, tarjeta y motor, donde cada tarjeta decide mirando SOLO la zona
siguiente. No dibuja nada. Lo consumen dos vistas:

- `assets/js/sim3d.js` — corre **sobre el ensamble CAD real**: carga el mismo
  `.glb` de la ficha y hace circular cajas por sus rodillos. La superficie de
  transporte no se asume: se encuentra lanzando rayos hacia abajo sobre el eje
  de la línea.
- `assets/js/simzp.js` — vista 2D de respaldo, con la misma lógica, para
  navegadores sin WebGL o si el ensamble no carga.

Modos: `cero` (cada zona frena su caja sin tocar la de adelante), `singulado`
(entrega de a una) y `tren` (todas arrancan a la vez y sale el lote).

## Import map de three.js

Las páginas que usan three (`equipo.html`) llevan un `<script type="importmap">`
que resuelve `three` y `three/addons/`. **Es obligatorio**: `GLTFLoader` importa
internamente el especificador `three`, y sin el mapa el visor no carga en
ningún navegador. También evita que se instancien dos copias de THREE.

## Pendientes conocidos

- La solicitud de cotización se envía por `mailto:` con el detalle redactado. Al
  existir un endpoint, solo cambia `envia()` en `assets/js/cotizacion.js`.
- Los `.glb` pesan entre 2 y 6 MB. Se cargan **bajo demanda** (botón «Ver el
  modelo 3D real»), pero conviene pasarlos por Draco antes de publicar.
- Falta la versión en inglés para el mercado regional.
