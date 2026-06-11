# HANDOFF v2 — Simulador 3D Sorter + Buffers por SKU + Virtual Pocket + Reporte PDF
## (Datos de producción Danich — Fresco)

Reemplaza/extiende el handoff v1. Cambios clave: **niveles = colores = SKUs** (16 SKUs
buffereados), **salida directa sin elevador** para el 15% restante, **distribución de
entrada realista** (mix de SKUs con dispersión aleatoria respetando el promedio de
referencia) y **reporte PDF**.

---

## 1. Datos de referencia (Danich, producto fresco)

**Caja dominante:** 170 mm (alto) × 600 mm (largo) × 400 mm (ancho), **22 kg**.

**Flujo de cajas:**

| | Mínimo | Promedio | P90 | Máximo | Desv. Est. |
|---|---|---|---|---|---|
| Cajas/día | 916 | **16,344** | 20,643 | 21,611 | 5,172 |
| Cajas/h | 38 | **681** | 860 | 900 | 215 |
| Cajas/min | 1 | **11** | 14 | 15 | 4 |

**ABC de SKUs:** 39 SKUs distintos; **13 SKUs generan el 80%**.

| Categoría | A+ | A | B | C | Total |
|---|---|---|---|---|---|
| Nº de SKUs | 5 | 8 | 10 | 16 | 39 |
| Cajas/periodo | 705,735 | 444,402 | 229,418 | 75,060 | 1,454,615 |
| % | 49% | 30% | 16% | 5% | 100% |

**Top SKUs por flujo (cajas/día — P90):** GO PpPna 57 Mr# 3516 · GO Pal S/Plateado Porc
Mr# 2313 · GO PpPna 59 Mr# 1852 · GO Chu Vet Porc 1764 · GO Cos 75 #TF 1732 · GO Chu
Ctro Porc 1484 · GO Chu Ctro Mr# 1097 · GO Chu Vet Repas 944 · GO Cos 75 Mit# 914 · GO
Gord chic# 878 · GO Pal S/Plateada Mr# 873 · GO PpPna 57# 815 · GO Cne Long# 800 · GO
Recortes 697 · GO Resto Hso# 662 · GO PpPna 59# 620 · … (cola larga hasta 39).

---

## 2. Arquitectura del sistema (revisada)

```
                 ┌──────── 16 SKUs (85%): 4 SALIDAS × 4 NIVELES ────────┐
ENTRADA  ──►  Sorter 4500  ──► por SKU a su (columna, nivel)
(mix de        (divert)         · cada NIVEL = un color = un SKU
SKUs con                        · elevador Kímarox coloca la caja en SU nivel
dispersión)                     · cada nivel acumula en CERO PRESIÓN
                                · elevador de descenso entrega por demanda
                 └──────────────────────────────────────────────────────┘
              └──► SALIDA DIRECTA (sin elevador) ──► para el 15% restante (cola C)

  Virtual Pocket  ──► BANDA DE SALIDA común (take-away) ──► entrega 24"
  (receta: orden de SKUs;       el tren ordenado se ve formarse aquí
   demanda vs inventario)
```

- **4 salidas con buffer**, cada una con **4 niveles verticales**. Los **niveles son
  colores**: cada celda (salida, nivel) es **un SKU** → **16 SKUs buffereados = 85%**
  de la producción.
- **1 salida DIRECTA, sin elevador**, a nivel de transportador, para el **15% restante**
  (SKUs de baja rotación / cola C, agrupados).
- El **nivel inferior (nivel 1) está a la misma altura** que los transportadores de
  entrada y de salida (0.9 m). Niveles: **0.9 / 1.5 / 2.1 / 2.7 m**.

> Nota: esto **reemplaza** la regla v1 de "llenar nivel 1 y luego subir". Ahora los
> niveles son SKUs dedicados: el elevador lleva cada caja **a su nivel/SKU**.

---

## 3. Distribución de ENTRADA (realista, con dispersión)

- La fuente genera cajas eligiendo SKU por **muestreo ponderado** según el flujo de
  referencia (los pesos de la tabla del §1). Los **16 SKUs principales** comparten el
  **85%**; el resto (cola) entra como **"directo" = 15%**.
- **Dispersión aleatoria entre SKUs respetando el promedio**: el muestreo es aleatorio
  (peso por SKU) y los intervalos entre cajas son **lognormales** alrededor de la media
  de referencia. La tasa total media ≈ **11 cajas/min** (P90 14, máx 15, desv 4); se
  puede escalar para estresar.
- Resultado esperado: la **mezcla a la entrada es desordenada**; el Virtual Pocket la
  entrega **ordenada en secuencia** a la salida.

```js
// pesos (ejemplo) normalizados: 16 SKUs -> 0.85 (curva ABC), "directo" -> 0.15
function pickSku(rng, skus) {            // skus: [{id, color, col, lvl, w}], + directo
  let r = rng() * 1.0, acc = 0;
  for (const s of skus) { acc += s.w; if (r <= acc) return s; }
  return skus[skus.length - 1];          // directo
}
// intervalo lognormal alrededor de la media de referencia (dispersión)
```

---

## 4. Mapeo de los 16 SKUs a la grilla 4×4

`SKU index s = columna*4 + nivel` (columna 0..3, nivel 0..3). Asignar los **16 SKUs de
mayor volumen** a la grilla (repartiendo A+/A para balancear columnas). Cada SKU lleva:
`{ id, nombre, color, col, lvl, w }`. Paleta de **16 colores distintos** (p. ej. HSL
equiespaciado). La salida directa usa un color neutro (gris) o el color del SKU si se
conoce.

---

## 5. Enrutado y física (reglas)

1. **Sorter (divert por columna/SKU):** cada celda de la línea principal deriva los SKUs
   de **su columna** a la entrada de esa columna; los SKUs "directo" continúan hasta la
   **salida directa**.
2. **Elevador de subida → nivel del SKU:** el Kímarox coloca la caja **en el nivel que
   corresponde a su SKU** (no "fill-first"). Si ese nivel está lleno → la caja espera
   (contrapresión hacia el sorter → overflow si se satura).
3. **Cero presión** en cada nivel y transportador (paso mínimo `pitch`).
4. **Elevadores cíclicos (capacidad 1)** con tiempo de ciclo + retorno (cuello real).
5. **Transferencias a ras (SIN HUECO):** la caja **aparece en el siguiente
   transportador SOLO cuando la transferencia es efectiva** y hay hueco real; **nunca
   antes** (no debe verse "flotando" ni invadiendo el transportador siguiente). Los
   extremos de los transportadores **van a tope** con los buffers/equipos (la caja no
   cae).
6. **Virtual Pocket (salida por demanda):** una **receta** define el **orden de SKUs**.
   El pocket libera el SKU demandado desde su nivel, vía el **elevador de descenso**, a
   la **banda de salida común**, inyectando en la **X de su columna** (el tren se ve
   formarse). Si el SKU demandado no está disponible → **espera** (demanda vs inventario).
   La **salida directa** libera su cola sin elevador.
7. **Velocidad de SALIDA regulable** (control): para **estresar** el sistema (si la
   salida es lenta, los buffers se llenan y aparece overflow; si es rápida, se vacían).
8. **Banda de entrega final = 24" (0.61 m)**, a ras (continua).

---

## 6. Controles (UI)

- Botón **mostrar/ocultar controles**.
- **Velocidad de SALIDA** (cajas/min) — estrés.
- **Velocidad de simulación** (×).
- **Tasa de ENTRADA** (× sobre el promedio de referencia) y/o día (P90/máx).
- **Receta del Virtual Pocket** (tren consecutivo 1 c/u por SKU; por familia; demanda
  alta de un SKU; FIFO).
- Vistas ISO / TOP / FRONT.
- **Botón "Generar PDF"** (ver §7).

---

## 7. Reporte PDF (entregable de la simulación)

Generar un PDF (p. ej. con **jsPDF** vía CDN) con:

1. **Distribución de ENTRADA por SKU**: cajas generadas y % por SKU, comparado con el %
   de referencia (Danich). Tabla + barras.
2. **Distribución de SALIDA por SKU**: cajas entregadas y % por SKU; y verificación del
   **orden de la secuencia** entregada (la receta).
3. **% de ocupación de buffers**: por nivel y por salida (promedio y pico), y del buffer
   total; tiempo de saturación / overflow.
4. **Parámetros de transporte**: velocidades (principal, carriles, salida), `pitch`,
   ciclo/cooldown de elevadores, capacidades (línea 60, nivel 15, buffer 60/salida),
   tamaño de caja (600×400×170, 22 kg), tasa de entrada (prom 11/min, P90 14/min),
   velocidad de salida usada, % buffereado (85) vs directo (15).
5. Encabezado con fecha/hora y duración simulada; pie con el nombre del modelo.

```js
// import { jsPDF } from 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm';
function generarPDF(sim) {
  const doc = new jsPDF();
  // 1) entrada por SKU  2) salida por SKU  3) ocupación buffers  4) parámetros
  // usar sim.statsBySku(), sim.bufferOccupancy(), sim.params()
  doc.save('reporte-simulacion.pdf');
}
```

El motor debe exponer: `statsBySku()` (entrada/salida por SKU), `bufferOccupancy()`
(promedio/pico por nivel y salida), `params()` (parámetros de transporte).

---

## 8. Geometría (continuidad, sin huecos)

- Extremos de segmentos **coincidentes** (a tope): `in.fin == buffer.inicio`,
  `nivel.fin == descenso`, `descenso → banda salida` en el **mismo punto** (sin salto).
- Nivel 1 a 0.9 m = altura de entrada y salida (transferencia horizontal a ras).
- Elevador de subida: base 0.9 m → altura del nivel del SKU.
- Banda de salida común a 0.9 m; entrega final 24" a ras.
- El render dibuja **camas + rieles** (bandas) y orienta cada caja al avance; **color de
  caja = color del SKU**.

---

## 9. Criterios de aceptación

1. Entrada **desordenada** (mix de 16 SKUs + directo, con dispersión) → salida
   **ordenada** por la receta.
2. Cada nivel contiene **solo su SKU**; el elevador lleva cada caja a su nivel.
3. **Sin huecos** visibles en transferencias (la caja aparece solo al transferir).
4. **Velocidad de salida** regulable estresa el sistema (overflow cuando corresponde).
5. **Salida directa (15%)** funciona sin elevador.
6. El **PDF** se genera con entrada/salida por SKU, ocupación de buffers y parámetros.
7. Validación headless del motor en verde antes del render.
