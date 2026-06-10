# Principios y aprendizajes preservados

Este documento captura el "porqué" detrás del motor. Cada principio está cubierto por
una comprobación en `test/harness.mjs`.

## 1. La física es independiente del render

El motor calcula posiciones en términos de longitud de arco `s` sobre cada tramo.
Nunca dibuja. El render lee `frame()` y dibuja. Beneficio: se puede validar el
comportamiento en Node (rápido, reproducible) antes de cualquier trabajo visual, y
reutilizar el mismo render en cualquier layout.

## 2. Cero presión

Una caja nunca se acerca a la de adelante más que el `pitch` del tramo. Se resuelve
ordenando las cajas de cada tramo por `s` descendente (frente primero) y limitando el
avance de cada caja a `s_frente - pitch`. Cuando el frente se frena (sink lento,
estación ocupada, falta de hueco aguas abajo), las de atrás se acumulan sin solaparse.

## 3. Transferencias con hueco (singulación)

Una caja solo pasa al siguiente tramo si hay espacio al inicio: la caja más atrasada
del tramo destino debe estar al menos a `pitch` del origen. Si no hay hueco, la caja
espera al final del tramo actual. Esto evita el "teletransporte" y produce
singulación realista al entrar a curvas y desviadores.

## 4. Generación realista

Las fuentes generan con intervalos lognormales derivados de `rate` (cajas/hora) y
dispersión `cv`. `burst` encadena generaciones cercanas para simular ráfagas. `max`
limita las cajas en circulación. La generación respeta el hueco al inicio: si la
boca está llena, no inyecta (la presión se propaga hacia atrás de forma natural).

## 5. Procesos con fatiga

Una estación retiene la caja en `at` durante un tiempo lognormal alrededor de `time`.
Con varias `operators` se procesan cajas en paralelo. La **fatiga** crece con cada
caja completada y estira el tiempo de operación (hasta +40%); se recupera en las
pausas. Las cajas que esperan turno se acumulan aguas arriba por cero presión.

## 6. Cuellos de botella

Se mide la ocupación de cada tramo (cajas / capacidad teórica = `length/pitch`) con
una media móvil para distinguir flujo singulado normal de acumulación real y estable.
Cuando un tramo supera el umbral, se reporta y se clasifica la causa:
- **`evacuation`**: el tramo siguiente también está saturado (límite aguas abajo).
- **`feed`**: el tramo está lleno pero el siguiente no (límite en la alimentación).

## 7. Determinismo

El RNG es una secuencia con semilla (`mulberry32`). Misma semilla -> misma corrida.
Esto hace los experimentos repetibles y las pruebas estables.
