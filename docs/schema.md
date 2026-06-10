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

## Ejemplo mínimo

Ver el bloque `mini` en el README. Para modelos grandes, usar los generadores
paramétricos de `src/layouts.js` (`buildDemo`, `buildComb`).
