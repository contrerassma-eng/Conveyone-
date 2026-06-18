# HANDOFF — Simulador 3D navegable: Sorter Intralox 4500 + Kímarox + buffers verticales + Virtual Pocket

## 1. Objetivo

Construir un **simulador 3D navegable** (Three.js) de un sistema de clasificación y
bufferización de cajas. El motor de física es **headless** (calcula sin dibujar) y el
render solo dibuja lo que el motor entrega. Toda nueva conducta se valida en un arnés
antes de tocar el render.

**Principio rector:** la física es independiente del render. Se itera el comportamiento
con un arnés headless y se reutiliza en cualquier layout.

---

## 2. Topología física (qué representa)

Una **línea principal de clasificación (sorter Intralox Serie 4500)** con **N salidas
perpendiculares** (regulable, por defecto 6). Cada salida está **dedicada a un color**
(salida 1 = rojo, salida 2 = azul, 3 = verde, 4 = amarillo, 5 = naranja, 6 = morado).

**Cadena por cada salida** (en este orden exacto):

```
Línea 4500 ──(divert perpendicular por color)──►
  1) Transportador de CERO PRESIÓN (infeed de la salida)
  2) Elevador KÍMAROX (vertical, SUBE) — cíclico, 1 caja por ciclo
  3) BUFFER VERTICAL de 4 NIVELES (cada nivel es cero presión)
  4) Elevador de DESCENSO (vertical, BAJA) — cíclico, 1 caja por ciclo
  5) Transportador de CERO PRESIÓN
  6) VIRTUAL POCKET (libera por demanda) ──► línea de SALIDA (outfeed)
```

Las cajas no clasificadas (si un buffer se llena) siguen por la línea principal hasta un
**rechazo/overflow** al final.

---

## 3. Parámetros y valores por defecto

| Parámetro | Valor |
|---|---|
| Salidas (N) | 6 (regulable 1–8) |
| Colores | red, blue, green, yellow, orange, purple, cyan, pink |
| Tamaño de caja | 0.40 × 0.13 × 0.30 m |
| `pitch` (paso mínimo entre cajas = cero presión) | 0.50 m |
| Capacidad línea principal | 60 cajas (6 celdas × 10) |
| Buffer por salida | 4 niveles × 15 cajas = 60 cajas |
| Alturas de los 4 niveles | 1.2 / 1.8 / 2.4 / 3.0 m |
| Altura de banda (transportadores) | 0.9 m |
| Velocidad línea principal | ~0.6 m/s |
| Velocidad carriles/buffers | ~0.5–0.6 m/s |
| Elevador: tiempo de ciclo | ~3 s por caja |
| Elevador: tiempo de retorno (cooldown) | ~2 s |
| Capacidad del elevador | **1 caja** (es un cuello de botella) |
| Generación (fuente) | tasa configurable, dispersión `cv` ~0.3, ráfagas opcionales |

---

## 4. Modelo de datos (el "lenguaje" del simulador)

Una simulación es `{ meta, segments, pocket }`. Cada **tramo** (`segment`) es un camino
con geometría, altura, velocidad y paso mínimo.

```js
{
  meta: { name, boxSize: [0.4, 0.13, 0.3] },
  segments: [
    // Celda de la línea principal con divert por color:
    { id:'main0', geom:{ type:'straight', from:[x0,0], to:[x1,0] }, height:0.9,
      speed:0.6, pitch:0.5,
      sort:{ by:'color', divertColor:'red', lane:'o0_in', cont:'main1' },
      next:['o0_in','main1'] },

    // Cero presión de entrada (perpendicular, +y):
    { id:'o0_in', geom:{ type:'straight', from:[x,0.6], to:[x,2.6] }, height:0.9,
      speed:0.6, pitch:0.5, color:'red', next:['o0_up'] },

    // Elevador Kímarox (SUBE) — geometría vertical 'lift':
    { id:'o0_up', geom:{ type:'lift', at:[x,2.9], h0:0.9, h1:3.0 },
      elevator:{ cycle:3, cooldown:2 }, color:'red',
      next:['o0_lvl0','o0_lvl1','o0_lvl2','o0_lvl3'] },

    // 4 niveles de buffer (cero presión), uno por altura:
    { id:'o0_lvl0', geom:{ type:'straight', from:[x,3.1], to:[x,8.6] }, height:1.2,
      speed:0.6, pitch:0.5, color:'red', next:['o0_down'] },
    // ...lvl1 height:1.8, lvl2 height:2.4, lvl3 height:3.0...

    // Elevador de DESCENSO (BAJA):
    { id:'o0_down', geom:{ type:'lift', at:[x,8.9], h0:3.0, h1:0.9 },
      elevator:{ cycle:3, cooldown:2 }, color:'red', next:['o0_zp'] },

    // Cero presión final, gobernado por el Virtual Pocket:
    { id:'o0_zp', geom:{ type:'straight', from:[x,9.2], to:[x,11.0] }, height:0.9,
      speed:0.6, pitch:0.5, color:'red', pocketBuffer:true, next:['outfeed'] },

    // Salida del Virtual Pocket y rechazo:
    { id:'outfeed',  geom:{ type:'straight', from:[..], to:[..] }, height:0.9, speed:0.8, pitch:0.5, sink:true },
    { id:'overflow', geom:{ type:'straight', from:[..], to:[..] }, height:0.9, speed:0.6, pitch:0.5, sink:true, reject:true },
  ],
  pocket: { loop:true, steps:[ {color:'red',qty:3}, {color:'blue',qty:3}, /* ... */ ] },
}
```

### Tipos de geometría
- `straight`: `{ from:[x,y], to:[x,y] }`
- `arc`: `{ center:[x,y], radius, a0, a1 }` (curvas Hytrol)
- `polyline`: `{ points:[[x,y], ...] }`
- `lift`: `{ at:[x,y], h0, h1 }` (vertical, cambia la **altura**)

El plano usa `[x,y]`; el render mapea `y` del plano → eje Z del mundo, y `height` → eje
Y. En `lift`, la altura se interpola de `h0` a `h1`.

---

## 5. Comportamiento del motor (reglas — esto es lo crítico)

1. **Cero presión**: una caja **nunca** se acerca a la de adelante más que el `pitch`
   del tramo. Se resuelve ordenando las cajas de cada tramo por posición (frente
   primero) y limitando el avance de cada caja a `s_frente − pitch`. Al frenarse el
   frente, las de atrás se acumulan sin solaparse.

2. **Transferencias con hueco (singulación)**: una caja solo pasa al siguiente tramo si
   **hay espacio al inicio** (la caja más atrasada del destino está al menos a `pitch`
   del origen). Si no, espera al final del tramo (acumula).

3. **Clasificación (sort / divert)**: en cada celda de la línea principal, si la caja es
   del color de esa celda y el carril destino tiene hueco, **deriva**; si no,
   **continúa** por la principal. Si nunca cabe, llega al rechazo.

4. **Elevador cíclico (1 caja)**: capacidad **una sola caja**. La caja recorre la altura
   en `cycle` segundos; luego el elevador entra en `cooldown` (tiempo de retorno) antes
   de admitir la siguiente. Es un **cuello de botella real**.

5. **Buffer de 4 niveles**: el elevador de subida reparte las cajas entre los 4 niveles
   (round-robin, al que tenga hueco). Cada nivel acumula en cero presión hasta su
   capacidad (~15). El elevador de descenso retira de los niveles.

6. **Virtual Pocket (liberación por demanda)**: el tramo final de cada salida
   (`pocketBuffer`) **solo libera cuando el pocket lo demanda**. La receta es una lista
   de pasos `{ color, qty }`:
   - `color` string → **cadena**: libera `qty` cajas de ese color, en orden.
   - `color` array → **lote "todo junto"**: libera `qty` de cualquiera de esos colores.
   - sin pasos → **FIFO** (libera lo que llegue).
   - `loop:true` → demanda continua (reinicia la receta).
   - Recetas **dinámicas** (cambiables en caliente).
   - Si el color demandado no está disponible en su buffer, el pocket **espera** (la
     salida se "muere de hambre" → muestra la interacción demanda vs. inventario).

7. **Generación realista**: las fuentes generan con tasa (cajas/hora), dispersión
   lognormal (`cv`) y ráfagas (`burst`), con tope opcional de cajas en circulación.

8. **Cuellos de botella**: detección por media móvil de ocupación (cajas / capacidad
   teórica = `longitud/pitch`). Clasifica la causa: **evacuación** (el siguiente tramo
   también está saturado) o **alimentación**.

9. **Determinismo**: RNG con semilla (misma semilla → misma corrida) para que las
   pruebas sean reproducibles.

---

## 6. Qué muestra el render 3D (y cómo se navega)

- **Three.js** (r158+), con **OrbitControls** desde `three/addons/controls/OrbitControls.js`.
- **Navegación**: un dedo / arrastrar = rotar; dos dedos / rueda = zoom; dos dedos mover
  = desplazar. `controls.enableDamping = true` y `controls.update()` en cada cuadro.
- **Luces**: `HemisphereLight` + `DirectionalLight` (intensidad ≤ 1). Sin luces, los
  materiales Standard se ven negros.
- **Encuadre automático**: se calculan los límites (min/max de todos los puntos) y se
  ubica la cámara a una distancia proporcional al tamaño. Vistas **ISO / TOP / FRONT**.
- **Tramos**: se dibujan como líneas (o camas/rieles) a partir de sus puntos. Color por
  tipo: banda (gris acero), elevador (cian), buffer (azul), rechazo (rojo).
- **Cajas**: una malla por caja viva (pool por id); se actualiza posición / orientación
  / color cada cuadro. **El color de la caja = el color de su salida destino**.
  Orientadas al avance: `rotation.y = atan2(dirX, dirZ)`. Posición vertical = altura del
  tramo (los elevadores las suben/bajan de verdad).
- **HUD** (divs HTML sobre el canvas): cronómetro, generadas, liberadas, rechazo, en
  sistema, throughput, nivel de cada buffer, color demandado por el pocket, cuellos.
- **Auto-run con warmup**: la simulación se pre-puebla antes del primer cuadro para que
  se vean cajas en movimiento al abrir.

---

## 7. Separación motor / render (interfaz)

```js
sim.step(dt)   // avanza la física (no dibuja)
sim.frame()    // devuelve:
// {
//   time,
//   boxes:    [{ id, x, y, z, dx, dz, color, held }],
//   segments: [{ id, points:[[x,y,z],...], kind }],
//   stats:    { generated, released, rejected, inSystem, throughput },
//   buffers:  [{ id, color, count, cap }],
//   pocket:   { demand, remaining, released, byColor },
//   bottlenecks: [{ id, occupancy, cause }],
// }
```

El render consume `sim.frame()` cada cuadro. Para "otro proceso" **no se reescribe el
3D**: se entrega otro `{ meta, segments, pocket }`.

---

## 8. Criterios de aceptación (qué validar)

1. Arnés headless en verde: cero presión, transferencias, clasificación por color,
   capacidades 60 y 4×15, elevador capacidad 1, transporte vertical real, liberación por
   receta, overflow de color no demandado, determinismo.
2. Las cajas **suben y bajan** de verdad por los elevadores (cambian de altura).
3. Cada buffer **solo contiene su color**; nunca excede su capacidad.
4. El Virtual Pocket libera **en el orden de la receta** (cadena) y reparte parejo en
   ciclo.
5. Los elevadores cíclicos aparecen como **cuellos** cuando la carga es alta.
6. Salidas **regulables** desde los controles.

---

## 9. Nota crítica de despliegue (por qué a veces "no se ve")

- Los **módulos ES + importmap NO cargan por `file://`** (CORS) → pantalla negra. Hay
  que **servir por http** (`python3 -m http.server 8080` o `http-server`) y abrir
  `http://localhost:8080/...`, **o** servir por una URL (GitHub Pages / hosting).
- Un **visor de archivos** (preview en apps) **no ejecuta WebGL**: solo un navegador
  real renderiza el 3D navegable.
- En móvil, la vía fiable es una **URL servida por https**.

---

## 10. Resumen para construirlo

1. Servir por http; confirmar que una escena mínima (cubo + OrbitControls) navega.
2. Implementar el **motor headless** con las reglas de la sección 5 y validarlo con un
   arnés antes de dibujar.
3. Generar el **modelo** del sistema (sección 4): N salidas, cada una con la cadena
   cero presión → elevador ↑ → 4 niveles → elevador ↓ → cero presión → Virtual Pocket.
4. Montar el **render** (sección 6) que consume `sim.frame()`.
5. Exponer controles: salidas, receta del Virtual Pocket, velocidad, carga, vistas.
