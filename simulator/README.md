# Conveyone · Simulador de catálogo (nuevo, modular)

Reescrito **desde cero** (el simulador viejo de Three.js queda descartado). Núcleo:
**representación exacta + BOM contado de la geometría + exportación STEP**, en
**Babylon.js**, con arquitectura **modular** (motor headless separado del render).

## Principio: una sola fuente de verdad

El **motor** (`src/engine/`) es *headless* — no dibuja nada. `buildPlan(params)`
produce un **plan**: la lista de piezas realmente colocadas (código de catálogo,
material, dimensión, primitiva geométrica y transform). De ese plan salen las tres
cosas, sin poder divergir entre sí:

```
                         ┌── render (Babylon)  → representación 3D
 params ─▶ buildPlan ─▶ PLAN ─┼── bom.js            → BOM contado del plan (no fórmula)
                         └── backendParams    → POST /generate → STEP B-Rep real (CadQuery)
```

- **BOM contado, no estimado.** `bomFromPlan()` cuenta las piezas del plan. Para
  L1400-W600 → **21 líneas, 407 piezas**, idéntico al backend `mt800.py`. Si cambias
  un parámetro o la geometría, el BOM se recalcula solo y sigue exacto.
- **STEP real.** El navegador no genera B-Rep; el botón *Exportar STEP* manda los
  mismos `params` al backend M-haste (CadQuery/OpenCASCADE) y, si el total de piezas
  del backend no coincide con el del simulador, lo avisa en rojo (contrato front=back).
- **Extensible.** `src/engine/index.js` es un registro de modelos. Hoy `mt800_pro`;
  MC400 y otros se añaden con la misma interfaz (`schema/validate/buildPlan/...`).

## Estructura

```
src/engine/
  models/mt800.js   modelo MT800-Pro: schema, validate, code, buildPlan (el plan)
  bom.js            bomFromPlan() · totalParts() · bomToCSV()
  index.js          registro de modelos + configure(model, params) -> {plan, bom, ...}
src/render/
  babylonView.js    createView(canvas): dibuja el plan, anima banda/poleas, encuadra
index.html          app: panel desde el schema + BOM en vivo + exportar STEP
test/               node --test (motor + BOM, sin navegador)
```

## Correr

```bash
# tests del motor (no necesitan navegador)
cd simulator && npm test          # node --test

# la app (sirve estáticos; los módulos ES necesitan http, no file://)
npx http-server . -p 8090         # o: python3 -m http.server 8090
# abrir http://localhost:8090/

# con STEP real, apuntando al backend M-haste:
#   http://localhost:8090/?api=http://localhost:8000
```

## Estado

- **MT800-Pro**: motor + plan + BOM (407 piezas) + render + exportación STEP. ✔
- **MC400** (curva de banda): motor + plan + BOM (90°/R400/W300 → 178 piezas) +
  render (rodillos radiales, bastidores en arco, banda sectorial) + STEP. ✔
- Selector de modelo en `index.html` (MT800 / MC400).
- Tests `node --test` (17 verdes): el **BOM == piezas colocadas** y coincide con el
  backend (MT800 407 / 21 líneas; MC400 178 / 18 líneas).

## Siguiente

- Registrar el sorter multibanda como modelo del motor.
- Animación de cajas sobre la banda (capa de simulación de flujo) si se necesita.
