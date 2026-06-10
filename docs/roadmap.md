# Roadmap — hacia el modelador online y la biblioteca de componentes

Objetivo: editor visual -> modelo JSON -> motor + render. El usuario dibuja entradas,
salidas, direcciones, tramos y curvas; el sistema produce un `{ meta, segments }` y lo
simula.

## Estado actual (base sembrada)

- [x] Motor headless con cero presión, transferencias, fuentes, procesos con fatiga,
      salidas, extracción, enrutado y cuellos de botella (`src/engine.js`).
- [x] Geometría paramétrica: rectas, arcos, polilíneas (`src/geometry.js`).
- [x] Generadores paramétricos y biblioteca de componentes inicial
      (`src/layouts.js`: `COMPONENTS`, `buildDemo`, `buildComb`).
- [x] Render 3D con HUD y vistas ISO/TOP/FRONT (`src/render.js`).
- [x] Arnés de validación headless (`test/harness.mjs`).

## Próximos pasos

1. **Biblioteca de componentes Hytrol** — modelar el catálogo como componentes
   paramétricos con `width`, `pitch`, `rollerDia`, `speed`, ángulo y radio:
   - Curvas (90°/45°/180°), curvas de banda y de rodillo.
   - Desviadores / clasificadores (divert, pop-up, sorter).
   - Acumuladores de cero presión, transferencias de 90°, merges.
   - Cada componente expone sus puntos de entrada/salida para encadenarse.
2. **Conector de componentes** — snap automático de entradas/salidas (alinear `from`/`to`
   y ángulos) para que dibujar = encadenar `COMPONENTS`.
3. **Editor visual** — lienzo 2D (planta) que emite el modelo JSON en vivo.
4. **Validación del modelo** — chequear continuidad geométrica, huecos, capacidades.
5. **Persistencia** — guardar/cargar modelos (JSON) y compartirlos.
6. **Métricas** — throughput por línea, utilización de estaciones, mapa de calor de
   cuellos, exportación de resultados.

## Principio para crecer

Toda nueva simulación se construye sobre este núcleo y lo fortalece: si un layout
necesita un comportamiento nuevo, primero se añade al motor con su comprobación en el
arnés, y solo después se usa en el render. Así la base no se degrada.
