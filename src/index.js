// index.js — Punto de entrada único de la biblioteca de simulación de transportadores.
//
// Reúne todos los recursos (motor headless, geometría, layouts paramétricos, catálogo
// Hytrol y render 3D) detrás de UNA función: `createSimulator()`. Llamándola tienes a
// mano el catálogo de conveyors, el constructor de modelos a partir de un grafo de
// nodos, el motor y (en navegador) el render.
//
//   import { createSimulator } from './src/index.js';
//   const sim = createSimulator();
//   const lib = sim.library;                       // catálogo + place/connect/validate/graphToModel
//   const model = lib.graphToModel(miGrafo);       // {meta, segments}
//   const engine = sim.run(model, { seed: 7 });    // ConveyorSim listo
//   sim.mount(engine, { container: document.body });// render 3D + navegación (solo navegador)
//
// El motor y el catálogo son headless (Node/navegador); `mount` requiere three.js.

import { ConveyorSim } from './engine.js';
import { makePath } from './geometry.js';
import * as layouts from './layouts.js';
import { createConveyorLibrary, CATALOG, BOX } from './catalog.js';

export { ConveyorSim, makePath, layouts, createConveyorLibrary, CATALOG };

// Crea el "kit" completo. `render:false` (o entorno sin DOM) omite cargar el render.
export function createSimulator() {
  const library = createConveyorLibrary();
  return {
    library,                                  // biblioteca de conveyors (la función callable)
    layouts,                                  // generadores paramétricos (comb, demo, sorter4500…)
    BOX,
    // construye un modelo desde un grafo {instances, links} de la biblioteca
    build(graph, opts) { return library.graphToModel(graph, opts); },
    // instancia el motor sobre un modelo {meta, segments}
    run(model, opts = {}) { return new ConveyorSim(model, opts); },
    // render 3D — import dinámico para no exigir three.js en Node/headless
    async mount(engine, opts = {}) {
      const { mountSim } = await import('./render.js');
      return mountSim(engine, opts);
    },
  };
}

export default createSimulator;
