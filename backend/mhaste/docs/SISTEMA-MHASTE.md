# Sistema M-haste — codificación, BOM y biblioteca

Derivado del catálogo (`三款样册`, 62 págs) y del briefcase de **PARTcommunity**
(la plataforma de CADENAS donde M-haste publica su eCATALOG). Este documento fija
la nomenclatura para que el configurador genere geometría **y** BOM trazable.

---

## 1. Sistema de codificación

```
M{serie}{tamaño}-Pro-{orientación}-{var}-L{largo}-W{ancho}-{banda}T{tipo}-S{n}-LA{n}-UGN{n}-DM{n}
└─────┬─────┘      └────┬────┘                                      └──────────┬──────────┘
   serie+tamaño      orientación                                          opciones
```

| Segmento | Valores | Significado |
|---|---|---|
| Serie | MT (banda plana), MB (módulo banda), MA (perfil), MC (curva) | familia |
| Tamaño | 300 / 400 / 600 / 800 | serie de perfil / ancho máx. |
| Pro | — | línea premium |
| Orientación | FL / FR / DL / DR / FM | F=fijo, D=motriz, L/R=izq/der, M=motor |
| Variante | A, B… | variante constructiva |
| L | nº (mm), modular (L25, L50, L1000…) | largo |
| W | nº (mm) | ancho útil |
| T | `25T` = banda 25 mm + tipo (U1, T1…) | banda |
| S | S0 / S2… | configuración de soporte |
| LA | LA0 / LA2… | guías laterales |
| UGN | UGN0 / UGN2… | understructure (Untergestell) |
| DM | DM1 / DM2 | accionamiento + control board (M10/M2) |

Ejemplo (el modelo de partida): `MT800-Pro-FL-A-L3000-W600-25TU1-S2-LA2-UGN2-DM1`
→ MT800-Pro, fijo, var. A, 3000×600 mm, banda 25 mm tipo U1, soporte 2, guías 2,
understructure 2, accionamiento 1.

### Numeración de piezas

| Patrón | Categoría |
|---|---|
| `MT800-NNN` | piezas del transportador |
| `MTB800-NNN` | brackets / accesorios (B = bracket) |
| `-2XX` | placas / cabezales |
| `-3XX` | conectores / soportes |
| `-7XX` | accesorios / pies |
| `-W{n}` | sufijo de variante de ancho |

---

## 2. Biblioteca de componentes (del briefcase PARTcommunity)

Piezas reales descargadas, con dimensiones verificadas del STEP:

| Código | Dim (mm) | Rol |
|---|---|---|
| MT800-05-301-W100 | 192×30×30 | perfil de banda (módulo, variante W) |
| MT800-217 | 45×15×15 | tope / conector de banda |
| MTB800-207 | 250×220×6 | placa de cabezal / motor (6 mm) |
| MTB800-301 | 64×28×28 | conector corto |
| MTB800-302 | 147×28×28 | soporte / travesaño |
| MTB800-304 | 104×28×28 | soporte medio |
| MTB800-317 | 71×15×15 | conector perfil 15 |
| MTB800-331 | 48×48×36 | pie / conector de esquina |

Secciones de perfil del sistema: **15, 28, 30 mm** (no 40). El motorreductor del
ensamble mide **160×72 mm**.

---

## 3. BOM — generación

`mt800.bom(params)` deriva el despiece de los parámetros, con cantidades en
función del nº de bandas (W/paso), el largo y las opciones. Salida en CSV y JSON.

Ejemplo (`L1400-W600-25T`, 7 bandas) → **21 líneas, 319 piezas**, agrupadas en
Perfil · Cabezal · Conector · Transmisión · Banda · Accionamiento · Soporte ·
Tornillería. Cada línea lleva código de catálogo, descripción, cantidad,
dimensión y material.

---

## 4. App / biblioteca

```
configurador (web)  ──POST /generate──▶  registry de modelos
       ▲                                      │
       │                                      ├─ build()  → STEP (B-Rep) + GLB
       └──────  /library, /download  ◀───────├─ bom()    → BOM (CSV + JSON)
                                              └─ archiva en library/{código}/
```

- **Registry extensible** (`library.MODELS`): MT800-Pro hoy. MC400 y los demás se
  añaden registrando un módulo con la misma interfaz (`build / metrics / bom / code`).
- **Biblioteca**: cada configuración generada se archiva en `library/{código}/`
  con STEP, GLB, BOM y `meta.json` — replicando el briefcase de PARTcommunity.
  El configurador no solo muestra: construye una biblioteca trazable.

### Endpoints

| Método | Ruta | Función |
|---|---|---|
| GET | `/models` | modelos registrados |
| GET | `/models/{id}/schema` | parámetros (auto-formulario) |
| POST | `/generate` | genera y archiva; devuelve código + BOM + descargas |
| GET | `/library` | índice de configuraciones generadas |
| GET | `/download/{code}/{file}` | STEP \| GLB \| BOM |

---

## 5. Roadmap

1. **MT800-Pro** — geometría + BOM + configurador (hecho).
2. **MC400** — registrar módulo con la misma interfaz.
3. Resto de series (MT300/400/600, MB, MA) → biblioteca completa.
4. Refinar el BOM contra el despiece exacto del catálogo (páginas de parts list).
5. Búsqueda en la biblioteca (por parámetros → luego por similitud geométrica).
