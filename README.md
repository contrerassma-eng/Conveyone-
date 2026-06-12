# Conveyor Sim — motor y render reutilizables para simulación de transportadores

Repositorio base que **destila el conocimiento** adquirido construyendo las
simulaciones de YoloTech/AC301: el comportamiento de las cajas en transportadores
(cero presión, transferencias, separaciones, generación, cuellos de botella) y la
navegación 3D. La idea es que toda nueva simulación se construya sobre este núcleo y
lo fortalezca, y que sirva de **semilla para un modelador online** donde se definan
entradas/salidas de cajas, direcciones, tramos y curvas, y de ahí salga el simulador.

## Principio rector: la física es independiente del render

El motor (`src/engine.js`) es **headless**: calcula el movimiento de las cajas sin
dibujar nada y se valida en Node con un arnés (`test/harness.mjs`) **antes** de
cualquier trabajo visual. El render (`src/render.js`) solo dibuja lo que el motor
entrega en `frame()`. Esta separación es lo que permite iterar el comportamiento con
confianza y reutilizarlo en cualquier layout.

## Qué hay dentro

```
src/
  geometry.js   Caminos paramétricos (rectas, arcos, polilíneas) con pointAt(s)/dirAt(s).
  engine.js     Motor headless: cajas, cero-presión, transferencias, fuentes,
                procesos (con fatiga), salidas, extracción, enrutado, cuellos.
  layouts.js    Generadores PARAMÉTRICOS de modelos (buildComb, buildDemo) —
                semilla del modelador: parámetros -> modelo.
  catalog.js    Biblioteca de conveyors (catálogo Hytrol 24") + createConveyorLibrary():
                place/connect/validate/graphToModel — arma modelos desde un grafo de nodos.
  builder-ui.js Modelador 3D reutilizable: initBuilder() construye la UI + escena.
  index.js      Entrada única: createSimulator() reúne catálogo + motor + render.
  render.js     Render 3D (Three.js) que consume el estado del motor + HUD + navegación.
modelador.html  PÁGINA DEDICADA del modelador (raíz), independiente del simulador
                principal (index.html). Carga src/builder-ui.js. Es la que se publica aparte.
examples/
  index.html    Ejemplo navegable: carga motor+render+layout, panel de control, auto-run.
  builder.html  Cáscara de ejemplo del modelador (misma UI que /modelador.html).
test/
  harness.mjs   Validación headless del motor (15 comprobaciones).
  catalog.mjs   Validación de la biblioteca de conveyors (13 comprobaciones).
docs/
  principles.md Aprendizajes clave (cero presión, generación, cuellos, render, ...).
  schema.md     Referencia del esquema de layout (el "lenguaje" del modelador).
  catalog.md    Catálogo Hytrol 24", la función callable y el modelador 3D.
  roadmap.md    Camino hacia el modelador online.
```

## Cómo correrlo

Validar el motor (no necesita navegador ni dependencias):

```
node test/harness.mjs
```

Ver el ejemplo navegable (necesita Three.js local y un servidor estático):

```
npm install            # instala three@0.158
npx http-server . -p 8080   # o: python3 -m http.server 8080
# abrir http://localhost:8080/examples/index.html
```

El ejemplo arranca solo (auto-run con warmup: las cajas se ven en movimiento al abrir),
con sliders de carriles, velocidad y fatiga, y botones de vista ISO/TOP/FRONT.

## El modelo (datos) en 30 segundos

Una simulación es un objeto `{ meta, segments }`. Cada **tramo** (`segment`) es un
camino con una geometría, una altura, una velocidad y un paso mínimo entre cajas
(cero presión). Los tramos se conectan con `next`. Un tramo puede además ser una
**fuente** (genera cajas), un **proceso** (operaria que llena, con fatiga), una
**salida** (sink) o un **punto de extracción** (pull). Ejemplo mínimo:

```js
{
  meta: { name: 'mini', boxSize: [0.4, 0.13, 0.3] },
  segments: [
    { id: 'in',  geom: { type: 'straight', from: [0,0], to: [6,0] }, height: 0.9,
      speed: 0.5, pitch: 0.5, source: { rate: 1200, cv: 0.2 }, next: ['curve'] },
    { id: 'curve', geom: { type: 'arc', center: [6,2], radius: 2, a0: Math.PI/2, a1: 0 },
      height: 0.9, speed: 0.5, next: ['work'] },
    { id: 'work', geom: { type: 'straight', from: [8,2], to: [14,2] }, height: 0.9,
      speed: 0.45, process: { at: 3, time: 2.0, operators: 2 }, next: ['out'] },
    { id: 'out', geom: { type: 'straight', from: [14,2], to: [20,2] }, height: 0.9,
      speed: 0.6, sink: true },
  ],
}
```

Cargarlo:

```js
import { ConveyorSim } from './src/engine.js';
import { mountSim } from './src/render.js';
const sim = new ConveyorSim(model);
mountSim(sim, { container: document.body }).start();
```

La referencia completa del esquema está en `docs/schema.md`. Los generadores
paramétricos de `layouts.js` muestran cómo producir modelos grandes desde parámetros
(p. ej. `buildComb({ lanes: 7 })` arma la fila AC301 entera). **Eso es exactamente lo
que hará el modelador online**: traducir lo que el usuario dibuja (entradas, salidas,
direcciones, tramos, curvas) a un modelo como estos.

## Comportamiento de las cajas (lo que se preservó)

- **Cero presión**: una caja nunca se acerca a la de adelante más que el `pitch` del
  tramo; al frenarse el frente, las de atrás se acumulan sin solaparse.
- **Transferencias con hueco**: una caja solo pasa al siguiente tramo si hay espacio
  al inicio (singulación / gap configurable por `pitch`).
- **Generación realista**: las fuentes generan con tasa, dispersión (`cv`) y ráfagas
  (`burst`) — distribución lognormal — con tope opcional de cajas en circulación.
- **Procesos con fatiga**: una operaria tarda un tiempo base con variabilidad y una
  curva de cansancio que se recupera en cada pausa de jornada.
- **Cuellos de botella**: detección estable (media móvil) que distingue flujo
  singulado normal de acumulación real, e identifica si el límite está en la
  evacuación/salida o en la alimentación.

Detalle y fundamentos en `docs/principles.md`.

## Roadmap

Hacia el modelador online: editor visual -> modelo JSON -> motor + render. Ver
`docs/roadmap.md`.
