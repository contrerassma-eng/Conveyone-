# Esquema de layout — el "lenguaje" del modelador

Una simulación es un objeto `{ meta, segments }`. El modelador online produce
exactamente esta estructura a partir de lo que el usuario dibuja.

## `meta`

| campo      | tipo            | descripción                                   |
|------------|-----------------|-----------------------------------------------|
| `name`     | string          | nombre del modelo                             |
| `boxSize`  | `[w, h, d]` (m) | tamaño de caja para render y cero presión     |
| `rollerDia`| número (m)      | diámetro de rodillo (metadato físico)         |

## `segments[]` (tramos)

Cada tramo es un camino con una geometría y propiedades de transporte.

| campo     | tipo      | descripción                                                        |
|-----------|-----------|--------------------------------------------------------------------|
| `id`      | string    | identificador único                                                |
| `geom`    | objeto    | geometría del camino (ver abajo)                                   |
| `height`  | número (m)| altura de la banda sobre el suelo                                  |
| `speed`   | número m/s| velocidad de banda                                                 |
| `pitch`   | número (m)| paso mínimo entre cajas (cero presión)                             |
| `next`    | string[]  | ids de tramos siguientes (varios = desviador, enrutado por hueco)  |
| `source`  | objeto?   | convierte el tramo en **fuente** (genera cajas)                    |
| `process` | objeto?   | estación de **proceso** con operarias y fatiga                     |
| `sink`    | bool?      | si `true`, el tramo es **salida** (consume cajas)                 |
| `pull`    | objeto?   | **punto de extracción** (retira cajas)                             |

### `geom`

```js
{ type: 'straight', from: [x, y], to: [x, y] }
{ type: 'arc', center: [x, y], radius, a0, a1 }      // a0->a1 en radianes, con signo
{ type: 'polyline', points: [[x, y], ...] }
```

El plano usa `[x, y]`; el motor mapea `y` del plano al eje Z del mundo 3D y usa
`height` como Y. Todo camino expone `length`, `pointAt(s)` y `dirAt(s)`.

### `source`

| campo  | tipo   | descripción                                            |
|--------|--------|--------------------------------------------------------|
| `rate` | n/hora | tasa media de generación                               |
| `cv`   | número | coef. de variación (dispersión lognormal)              |
| `burst`| 0..1   | probabilidad de encadenar generación en ráfaga         |
| `max`  | número | tope opcional de cajas en circulación                  |

### `process`

| campo       | tipo   | descripción                                       |
|-------------|--------|---------------------------------------------------|
| `at`        | m      | distancia dentro del tramo donde está la estación |
| `time`      | s      | tiempo base de operación por caja                 |
| `operators` | número | estaciones en paralelo                            |
| `cv`        | número | variabilidad del tiempo de operación              |

### `pull`

| campo   | tipo   | descripción                                  |
|---------|--------|----------------------------------------------|
| `every` | número | retira 1 de cada N cajas                      |
| `rate`  | 0..1   | probabilidad de retirar cada caja            |

### Color en las cajas

Una fuente puede generar cajas con color:

```js
source: { rate: 3600, cv: 0.3, colors: ['red','blue','green'], weights: [3,2,1] }
```

- `colors`  paleta; sin `weights` la mezcla es round-robin (pareja y determinista).
- `weights` opcional; pesos relativos por color.

Cada caja lleva `box.color` y el render la pinta según `PALETTE`.

### `sort` (clasificador / divert)

Convierte el final de un tramo en un punto de derivación por atributo. Si la caja es
del color de la celda y el carril tiene hueco, deriva; si no, continúa.

```js
sort: { by: 'color', divertColor: 'red', lane: 'lane_red', cont: 'main1' }
```

| campo         | descripción                                            |
|---------------|--------------------------------------------------------|
| `divertColor` | color que esta celda deriva                            |
| `lane`        | id del carril/buffer destino                           |
| `cont`        | id del tramo por el que sigue si no deriva             |

### `pocketBuffer` + `pocket` (Virtual Pocket)

Un tramo con `pocketBuffer: true` acumula en cero presión y **solo libera cuando el
Virtual Pocket lo demanda**. La receta vive en `model.pocket`:

```js
pocket: {
  loop: true,
  steps: [
    { color: 'red', qty: 3 },                 // cadena: 3 rojas en orden
    { color: ['blue','green'], qty: 6 },       // lote "todo junto": 6 de azul/verde
  ],
}
```

- `color` string -> **cadena** (libera `qty` de ese color, en orden).
- `color` array  -> **lote** (libera `qty` de cualquiera de esos colores disponible).
- `loop`         -> demanda continua (reinicia la receta al terminar).
- sin `steps`    -> **FIFO** (libera lo que llegue).
- Recetas dinámicas en caliente: `sim.pocket.setRecipe({...})`.

Si el color demandado no está en su buffer, el pocket espera (la salida se "muere de
hambre"): así se ve la interacción demanda vs. inventario.

> Generador listo: `buildSorter4500({ colors, mainCapacity: 60, bufferCapacity: 20, pocket })`
> arma un clasificador Intralox Serie 4500 con 6 salidas perpendiculares por color,
> buffers de cero presión y Virtual Pocket.

### Transporte vertical: `geom: 'lift'` + `elevator`

Un tramo puede ser un **elevador** (Kímarox de subida / descenso). Su geometría es
vertical y cambia la altura de la caja:

```js
{ id: 'up', geom: { type: 'lift', at: [x, y], h0: 0.9, h1: 3.0 },
  elevator: { cycle: 3, cooldown: 2 }, next: ['lvl0','lvl1','lvl2','lvl3'] }
```

- `geom.lift` recorre de `h0` a `h1` en el footprint `at`; la longitud es el recorrido.
- `elevator.cycle`   segundos en subir/bajar una caja (velocidad = recorrido/cycle).
- `elevator.cooldown` tiempo de retorno antes de admitir la siguiente caja.
- Capacidad **una sola caja** (es un cuello potencial, como en la realidad).
- La altura se interpola; también puede darse `height: [h0, h1]` en tramos no-lift.

### Sistema completo: `buildBufferedSorter`

```js
buildBufferedSorter({ outputs: 6, levels: 4, perLevel: 15, upCycle: 3, downCycle: 3 })
```

Arma, por cada salida (dedicada a un color): cero presión → elevador Kímarox (sube) →
buffer vertical de `levels` niveles (cero presión, `perLevel` c/u) → elevador de
descenso (baja) → cero presión → Virtual Pocket → salida. `outputs` es regulable.

## Ejemplo mínimo

Ver el bloque `mini` en el README. Para modelos grandes, usar los generadores
paramétricos de `src/layouts.js` (`buildDemo`, `buildComb`).
