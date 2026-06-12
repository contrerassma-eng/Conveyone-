# Biblioteca de conveyors — catálogo Hytrol 24" + modelador

Este documento respalda, de forma estructurada, el **catálogo paramétrico de
transportadores** (`src/catalog.js`), la **función callable** que da acceso a todos los
recursos del motor (`createConveyorLibrary` / `createSimulator`) y el **modelador 3D**
(`examples/builder.html`).

> **Honestidad de datos.** Los anchos, velocidades y pasos por defecto son valores
> razonables de industria para equipo 24" (rodillo Ø1.9" = 0.048 m, BF ≈ 22", 30–120 fpm
> = 0.15–0.6 m/s). **No** provienen de las hojas de corte exactas de Hytrol; cada modelo
> declara la **familia cinemática** (lo que el motor entiende) y el nombre comercial es
> una etiqueta + presets. Afínalos contra el cut-sheet real al dimensionar en serio.

## La función callable

```js
import { createSimulator } from './src/index.js';      // entrada única
const sim = createSimulator();
const lib = sim.library;                                // = createConveyorLibrary()

// 1) catálogo
lib.list();                  // [{id,label,group,kind,family}]
lib.groups();                // { 'Banda': ['TA','SBI',...], ... }
lib.get('SBI');              // definición completa del modelo
lib.defaults('SBI');         // config por defecto (con entry/exit height)

// 2) armar un grafo de piezas conectadas por nodos
const g = { instances: [], links: [] };
const a = lib.place('TA',  { x: 0, z: 0, rot: 0 }, { length: 6 }); g.instances.push(a);
const t = lib.place('T90', null);                                  g.instances.push(t);
lib.connect(g, a.id, t.id);  // out(A) -> in(B), con SNAP (continuidad C0 en el empalme)

// 3) validar reglas de diseño y compilar al motor
const issues = lib.validate(g);            // [{level:'error'|'warn', instId, msg}]
const model  = lib.graphToModel(g, { rate: 1200 });   // { meta, segments }
const engine = sim.run(model, { seed: 7 });           // ConveyorSim
await sim.mount(engine, { container: document.body }); // render 3D (solo navegador)
```

Cada **instancia** que devuelve `place()` lleva: `{ id, model, family, kind, cfg, pose,
nodes:{in,out} }`. Los **nodos** (`in`/`out`) son los puntos conectables: posición en el
plano y dirección del flujo. `connect()` con snap reubica la pieza aguas abajo para que su
nodo de entrada coincida con el de salida de la anterior.

## Catálogo (equipo 24")

| id | familia | comportamiento | inclinación máx | notas |
|----|---------|----------------|-----------------|-------|
| `E24CT` | recta | rodillo motorizado 24V (transporte) | 0° | MDR por zonas |
| `E34EZCT` | recta | acumulación EZLogic (cero presión) | 0° | pitch ≈ zona 0.6–0.9 m |
| `190-E24` | recta | rodillo vivo BDLR (transporte) | 0° | line-shaft 24V |
| `190-E24EZ` | recta | BDLR acumulación EZLogic | 0° | cero presión |
| `TA` | recta | banda de cama deslizante (horizontal) | 5° | mantiene espaciado |
| `SBI` | recta | banda inclinada con tacos | 30° | exige μ_s ≥ tanθ |
| `LBP` | recta | banda modular plástica (baja contrapresión) | 15° | admite curva |
| `LBP-CURVE` | curva | curva de banda modular 90° | 0° | sin inclinación dentro |
| `E24SS` | transferencia | transferencia de rodillo motorizado | 0° | ángulo 30°/90° |
| `T90` | transferencia | transferencia 90° (pop-up) | 0° | requiere hueco aguas arriba |
| `T30` | transferencia | spur de desvío 30° | 0° | alta tasa |
| `DV90` | desviador (1→2) | celda con salida recta + desvío 90° | 0° | reparte por hueco |
| `DV30` | desviador (1→2) | celda con salida recta + spur 30° | 0° | alta tasa |
| `MG` | merge (2→1) | confluencia de dos líneas a un tronco | 0° | sin solape (R4) |

Las **familias cinemáticas** (`src/catalog.js → FAMILIES`) son lo que el motor consume:

- **`straight`** — un segmento recto; inclina si `entryHeight ≠ exitHeight`.
- **`curve`** — un arco (`angleDeg`, `radius`); plano.
- **`transfer`** — polilínea que gira el flujo `angleDeg`; plano.
- **`divert`** — 1 entrada → 2 salidas: `out` continúa recto, `out2` desvía a `angleDeg`
  (dos segmentos: celda + spur). El motor reparte por hueco (round-robin).
- **`merge`** — 2 entradas (`in`, `in2`) → 1 tronco (`out`). El cero-presión evita solapes.

Los **nodos** de cada pieza dependen de la familia: `in`/`out` (recta/curva/transferencia),
`in`/`out`/`out2` (desviador), `in`/`in2`/`out` (merge). `lib.nodeKeys(id)` los enumera.
Un enlace lleva `{ from, fromNode, to, toNode }`; al conectar hacia un destino que ya tiene
entradas (p.ej. la 2ª línea de un merge), el snap mueve el ORIGEN en vez del destino.

Config (`cfg`) de cada pieza: `length`, `width`, `speed` (m/s), `pitch`, `entryHeight`,
`exitHeight`, y para curva/transferencia `angleDeg` (+ `radius`, `cw`).

## Reglas de diseño que aplica `validate()`

Destiladas de los handoffs (lo que rompe el realismo o es mecánicamente imposible):

| regla | nivel | por qué |
|-------|-------|---------|
| `pitch ≥ caja + 0.05 m` | error | con pitch menor las cajas se dibujan/empujan solapadas |
| inclinación ≤ tope de la familia | error | banda lisa resbala si `μ_s < tanθ`; sólo SBI/tacos sube fuerte |
| sin inclinación dentro de curva/transferencia | error | regla de layout (la caja "puentea" o se atasca) |
| empalme de nodos coincidente (< 5 cm) | aviso | continuidad C0; el snap de `connect()` lo garantiza |
| instancia suelta (sin enlaces) | aviso | no participa del flujo |

`graphToModel()` marca **fuente** automáticamente a toda pieza sin enlace de entrada y
**sumidero** (`sink`) a toda pieza sin enlace de salida, de modo que cualquier cadena que
armes es ejecutable de inmediato.

## El modelador 3D (`examples/builder.html`)

Interfaz navegable (three.js r158, ESM por importmap CDN, igual que `examples/index.html`):

- **Menú Biblioteca** (izquierda): los modelos agrupados por familia; tocar uno lo añade
  y lo autoconecta a la última pieza.
- **Inspector** (derecha): configura la pieza seleccionada — tipo (modelo), ancho, largo,
  altura de ingreso, altura de salida, velocidad (fpm), ángulo/radio (curva/transferencia)
  y su pose (X, Z, rotación). Mover una pieza re-pega en cascada las que cuelgan de ella.
- **Nodos conectables**: esferas verde (entrada `in`/`in2`) y azul (salida `out`/`out2`)
  en cada pieza. Con **🔗 Conectar** tocas una salida y luego una entrada → enlace con snap.
  Así armas desvíos (1→2) y empalmes (2→1) tocando los nodos correspondientes.
- **✓ Validar**: corre las reglas de arriba y las lista.
- **▶ Simular**: compila el grafo, corre `ConveyorSim` y anima las cajas por la cadena.
- **💾 / 📂 Guardar / Cargar**: exporta/importa el layout como JSON (`lib.serialize` /
  `lib.hydrate`); además guarda el último layout en `localStorage` y lo restaura al abrir.
- **ENTER VR** (Meta Quest): recorre a escala real la planta que armaste. Stick izquierdo
  camina (dirección de la mirada), stick derecho gira 45° (confort), gatillo teletransporta.
  Usa `renderer.setAnimationLoop` y referencia `local-floor` (WebXR exige https — GitHub
  Pages cumple).

## Pruebas

`node test/catalog.mjs` — 24 comprobaciones: todos los modelos se colocan y compilan,
exponen sus nodos, el snap deja empalmes coincidentes, el validador atrapa configs
imposibles, un grafo Hytrol fluye sin solapes, los **desviadores reparten 1→2**, los
**merges confluyen 2→1** sin solape, y **guardar/cargar** conserva el grafo y vuelve a
compilar.
