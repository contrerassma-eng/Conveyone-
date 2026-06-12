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

## Ficha física del equipo (capa WEB · `docs/web_facts.json`)

Para que el equipo se vea **tal cual** (pitch, OD de rodillo, bastidor, soportes), el
render usa specs de **ficha técnica Hytrol con procedencia** (URL + fecha + cita), no
inventadas. `lib.spec(id)` las entrega en metros (+ pulgadas en `.inches`). Origen:
disciplina del método foto3d — capa `web`, jamás se funde sin cita.

| spec | valor (cut-sheet) | fuente |
|------|-------------------|--------|
| Rodillo 190-E24 / E24EZ / E24SS | **Ø1.9" × 16 ga sobre centros de 3"** (Ø48.3 mm, paso 76.2 mm) | [E24.pdf · Bulletin 713](https://cdn.hytrol.com/E24.pdf) |
| Velocidad 190-E24 | **25–174 fpm** (0.13–0.88 m/s) | E24.pdf |
| Capacidad | **37 lb/ft · 75 lb por motor/zona** | E24.pdf |
| Curva 190-E24C/EZC | rodillo **2.5" cónico a 1-11/16" × 16 ga** | E24.pdf |
| Zonas EZLogic | **18 / 24 / 30 / 36"** | E24.pdf |
| 190-E24MC | 2"/3" centers · **30–180 fpm** · soportes con ruedas | [190-E24MC focus sheet](https://cdn.hytrol.com/190-E24MC-Product-Focus-Sheet.pdf) |
| TA (banda) | ancho banda 6–30"; **bed = banda + 4"**; cama deslizante; soportes a ambos extremos del drive | [TA IMM · Bulletin 642](https://cdn.hytrol.com/2012_642_ta.pdf) |
| Bastidor rodillo vivo | **canal 6" × 4 ga, riel-guía 1-5/8"** *(confianza media)* | [190-NSP · Bulletin 677](https://cdn.hytrol.com/2015_677_190nsp.pdf) |
| Soportes | piso ajustable: pipe + side channel + leg, nivelable y anclado | [Supports · Bulletin 667](https://cdn.hytrol.com/2014_667_support.pdf) |

**Match con el catálogo Hytrol.** `lib.ref(id)` devuelve la **designación real** y el enlace
a ficha/manual y catálogo. Confirmado contra `hytrol.com/products` + Bulletin 713:
`190-E24`, `190-E24EZ`, `190-E24SS` (spur 30°/45°), `190-E24C` (curva), `TA`, **`SBI`
(Inclined Slider Bed)**, `SB`/`SBC` son modelos reales. Los códigos del usuario que no son
SKU exacto se mapean a su familia real (`E24CT→190-E24`, `E34EZCT→190-E24EZ`,
`T90/T30/DV→190-E24SS`, `LBP-CURVE→SBC`) — ver `docs/web_facts.json › catalog_model_verification`.

**Render de alta resolución (vistas laterales).** El equipo se dibuja según la elevación
real: bastidor de **canal formado en C** (alma + alas + riel-guía), **rodillos Ø1.9" a 3"
con muñón** en cada extremo (InstancedMesh), bandas con **cama deslizante + correa de carga
y de retorno envolviendo poleas de extremo + paquete motriz** (motor + guarda de cadena), y
**soportes de piso tipo H** (patas de canal + placas + travesaño + rodilla diagonal).

**Parámetros propios por modelo** (`lib.params(id)`): el inspector ofrece las opciones de
cut-sheet de cada modelo — centros de rodillo (2"/3"), ancho BR, zona EZLogic, ancho de
banda, polea/drive (4"/8"), ángulo y radio de curva, ángulo de desvío, inclinación (SBI).
Todo se dibuja **inclinado en 3D**: al cambiar la altura de salida el tramo sube de verdad
(struts orientados A→B, no cajas planas a altura media). Las curvas se muestrean cada ~5°
y `190-E24C` usa **rodillos cónicos** dispuestos radialmente.

**Asumido** (no de cut-sheet, marcado en `web_facts.json`): profundidad de bastidor de las
bandas, diámetro de polea (~4"), espesor de banda y sección de las patas de soporte.

**Limitación honesta:** no hay capa `measured` (no se corrió fotogrametría COLMAP/OpenMVS
ni hay fotos del usuario en este repo). El equipo se modela a partir de la **ficha del
fabricante**, que es la fuente correcta para equipo de catálogo. Si quieres geometría
medida desde fotos reales, hay que correr el pipeline foto3d (otro repo) con tus fotos.

## Pruebas

`node test/catalog.mjs` — 24 comprobaciones: todos los modelos se colocan y compilan,
exponen sus nodos, el snap deja empalmes coincidentes, el validador atrapa configs
imposibles, un grafo Hytrol fluye sin solapes, los **desviadores reparten 1→2**, los
**merges confluyen 2→1** sin solape, y **guardar/cargar** conserva el grafo y vuelve a
compilar.
