# CLAUDE.md — Configurador eCATALOG M-haste

Handoff para retomar el proyecto desde Claude Code sin contexto previo.

## Qué es

Configurador paramétrico estilo **3Dfindit / PARTcommunity (CADENAS)** para los
transportadores **M-haste**. Objetivo: dado un código de catálogo o unos
parámetros, **mostrar el modelo 3D, generar el BOM y exportar geometría CAD**
(STEP B-Rep + GLB), archivando cada configuración en una biblioteca.

M-haste publica su eCATALOG real en PARTcommunity; este proyecto reconstruye ese
flujo en infraestructura propia (sin licenciar el kernel CAD: usamos CadQuery /
OpenCASCADE, el mismo motor que corre bajo CADENAS).

## Arquitectura

```
┌─ web/configurador-mt800.html ─┐      configurador interactivo (autocontenido)
│  Babylon core (sin loaders)   │      geometría PROCEDURAL en JS (representativa)
│  parámetros en vivo + BOM JS  │      BOM = misma aritmética que el backend
└───────────────┬───────────────┘
                │  (al descargar / generar)
┌───────────────▼───────────────┐
│  src/app.py  (FastAPI)        │      API: /models /generate /library /download
│  src/library.py (registry+lib)│      registro de modelos + biblioteca en disco
│  src/mt800.py  (CadQuery)     │      geometría B-Rep + BOM + export STEP/GLB
└───────────────────────────────┘
```

- **Frontend (configurador):** corre en el navegador, sin servidor. La geometría
  es procedural en JS porque CadQuery no corre en el navegador. El BOM en JS es
  **idéntico** al de `mt800.py` (mismas cantidades), así que coinciden.
- **Backend (CadQuery):** genera el STEP B-Rep exacto y el GLB. Necesita Python +
  OpenCASCADE — NO corre en Cloudflare Workers ni en Supabase. Va en un host
  Python (Railway / Fly / VM) o se ejecuta en local / CI.
- **Biblioteca:** cada `POST /generate` archiva `library/{código}/` con STEP, GLB,
  BOM (CSV+JSON) y `meta.json` — replica el "briefcase" de PARTcommunity.

## Sistema de codificación M-haste

Detalle completo en `docs/SISTEMA-MHASTE.md`. Resumen:

```
M{serie}{tamaño}-Pro-{orientación}-{var}-L{largo}-W{ancho}-{banda}T{tipo}-S{n}-LA{n}-UGN{n}-DM{n}
```
- Series: MT (banda plana), MB (módulo banda), MA (perfil). Tamaños 300/400/600/800.
- Orientación: FL/FR (fijo izq/der), DL/DR (motriz izq/der), FM.
- Piezas `MT800-NNN`, brackets `MTB800-NNN` (-2XX placas, -3XX conectores, -7XX accesorios).
- Ejemplo de referencia: `MT800-Pro-FL-A-L3000-W600-25TU1-S2-LA2-UGN2-DM1`.

Perfiles del sistema: secciones **15/28/30 mm** (no 40). Motorreductor **160×72**.

## Estado actual (funciona)

- **MT800-Pro:** geometría CadQuery calibrada al STEP real (low-profile, banda
  estrecha, ~7 bandas de 25 mm en W600), 12 categorías de material discriminadas.
- **BOM contado de la geometría:** `mt800.bom(params)` ya no estima por fórmula:
  un *ledger* registra cada pieza a medida que `build()` la coloca, así el BOM no
  puede divergir del modelo. Para L1400-W600 → **21 líneas, 407 piezas** (antes la
  fórmula daba 319: subcontaba 140 tornillos como 108 y 28 placas como 4). Líneas
  no modeladas (tuercas 1:1, conectores, control board) se marcan `source:"derived"`.
  Export CSV + JSON. **El BOM en JS del configurador replica estas cantidades 1:1.**
- **Tests:** `tests/` (pytest) — `test_mt800.py` verifica que el BOM == geometría
  colocada; `test_api.py` cubre la API con TestClient. `cd src/.. && pytest`.
- **Deploy:** `Dockerfile` + `../DEPLOY.md` (Railway/Fly, volumen en `/data`).
- **Visor ↔ API:** el configurador llama al backend con `?api=URL` (botón
  “Generar CAD”): `POST /generate` y enlaces de descarga STEP/GLB/BOM reales.
- **Configurador interactivo:** `web/configurador-mt800.html` — sliders/toggles que
  reconstruyen modelo + BOM + código en vivo. Autocontenido.
- **App + biblioteca:** `src/app.py` + `src/library.py` — genera, archiva, lista,
  sirve descargas. Probado con TestClient.
- **Índice de piezas del manual:** `data/manual_parts_index.csv` (10 familias).

## Cómo correr

```bash
pip install -r requirements.txt

# backend + API
cd src && uvicorn app:app --reload        # docs: http://localhost:8000/docs

# generar una configuración (geometría + BOM, se archiva en biblioteca)
curl -s -X POST http://localhost:8000/generate -H "Content-Type: application/json" \
  -d '{"model":"mt800_pro","params":{"length":2000,"width":600,"belt_width":25}}'

# configurador visual: abrir web/configurador-mt800.html en el navegador
```

## Decisiones y gotchas (importantes)

1. **El paquete `babylonjs-loaders` NO carga** en sandboxes con CSP estricta
   (probadas 10 versiones de cdnjs, todas fallan). Solución adoptada: NO usar
   loaders. El visor "estático" reconstruye la malla con `BABYLON.VertexData`
   (core); el configurador usa geometría procedural. Solo se carga
   `babylonjs/8.20.0/babylon.js` desde cdnjs (ese sí carga).
2. **Y-up:** CadQuery exporta GLB en Y-up estándar. No re-rotar.
3. **Teselación del GLB para el visor:** usar `angularTolerance` alto (≥1.2) en el
   export para bajar triángulos; los tornillos se desactivan (`bolts=False`) en la
   versión de visor (invisibles a escala). El STEP de catálogo va con detalle pleno.
4. **El manual NO va al repo** (peso): `.gitignore` excluye `*.pdf *.zip *.step *.glb`.
   Sus datos útiles (BOMs / índice de piezas) se extraen a `data/` como CSV/JSON.
5. **Credenciales:** ningún token en código ni en chats. `gh auth login` en local.

## Tareas pendientes (priorizadas)

1. ~~**Registrar MC400.**~~ ✔ Hecho: `src/mc400.py` (curva de banda, geometría por
   `revolve` + rodillos radiales) con la misma interfaz que `mt800.py`, registrado
   en `library.MODELS`. BOM contado de la geometría (90°/R400/W300 → 18 líneas, 178
   piezas), **idéntico al modelo `mc400` del simulador JS** (front == back).
   También disponible en el simulador online (selector de modelo). Tests en
   `tests/test_mc400.py`. Pendiente: refinar dimensiones/códigos contra el briefcase
   PARTcommunity real (MC400-201..225, drive shaft).
2. **Refinar BOMs por modelo desde el manual.** `data/manual_parts_index.csv` tiene
   el índice de piezas; falta el despiece exacto por modelo (rasterizar las páginas
   de "parts list" del PDF y mapear cantidades). Ver `docs/SISTEMA-MHASTE.md` §3.
3. **Infra de despliegue:**
   - Frontend (configurador) → Cloudflare Pages (ya se usa Pages para conveyone.tech).
   - Backend CadQuery → host Python (Railway/Fly). No Workers.
   - Biblioteca/BOMs → Supabase (Postgres + Storage) o Cloudflare R2/D1.
4. **Búsqueda en la biblioteca** (por parámetros → luego por similitud geométrica).
5. **Multi-modelo en el configurador web** (selector de modelo MT/MC/MB).

## Fuentes (fuera del repo)

- Manual: `M-haste_三款样册_整合.pdf` (62 págs, 3 familias). Solo sus datos van al repo.
- Briefcases PARTcommunity (STEP+RFA de componentes): MT800, MC400, MA4080, MC300.
- STEP de referencia del ensamble: `MT800-Pro-...-L3000-W600-25TU1-...`.
