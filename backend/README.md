# Conveyone · eCATALOG backend

Motor de catálogo paramétrico para el **sorter multibanda** (banda estrecha).
Recibe parámetros y devuelve **geometría CAD real**, no mallas congeladas:

- **STEP** (AP214, B-Rep + color por componente) → entra nativo en Inventor / SolidWorks
- **GLB** (teselado + materiales PBR) → para el visor web (Babylon / Three / `<model-viewer>`)

Una sola fuente de verdad (CadQuery / OpenCASCADE) genera ambos formatos en la
misma pasada. Es la pieza que separa "modelo 3D bonito" de "catálogo descargable",
y es exactamente la capa que 3Dfindit (CADENAS) licencia por cinco cifras.

---

## Por qué esto es el núcleo de un eCATALOG

Un eCATALOG tiene cuatro capas. El visor PBR es la barata. Las caras son:

| Capa | Quién la cubre aquí |
|---|---|
| Render PBR | el visor (Babylon/Three) |
| **Geometría paramétrica B-Rep** | **este backend (CadQuery)** |
| **Export CAD nativo (STEP/IGES)** | **este backend** |
| Búsqueda geométrica | fase posterior (no incluida) |

El kernel CAD que CADENAS licencia es OpenCASCADE — el mismo que corre bajo
CadQuery. Aquí ya lo tienes.

---

## Mapeo de parámetros al plano

Los defaults reproducen las cotas de los insumos:

| Parámetro | Default | Origen en el plano |
|---|---|---|
| `lanes` | 3 | tres bandas en vista superior |
| `lane_gap` | 50 mm | cota `Min.50` entre bandas |
| `shaft_d` | 20 mm | eje motriz `Ø20` |
| `belt_width` | 46 mm | ancho de banda estrecha (fotos) |
| `pulley_d` | 52 mm | polea de extremo |
| `motor_box_l` × `motor_box_h` | 160 × 104 mm | caja motorreductor `160` / `72` |
| `frame_h` | 540 mm | altura de chasis |

Detalle CAD incluido: perfil estructural 40×40 **con ranura en T** y canal
central, poleas con **barreno** Ø20 (motrices) y pestañas, brackets racetrack
con **agujeros de eje + patrón M5 + ranuras ovaladas**, eje motriz continuo con
acoples por banda, motorreductor con **aletas de refrigeración**, y chasis con
**ruedas**.

---

## Arrancar

```bash
pip install -r requirements.txt
uvicorn app:app --reload
# docs interactivas: http://localhost:8000/docs
```

## Endpoints

| Método | Ruta | Función |
|---|---|---|
| GET | `/catalog` | productos disponibles |
| GET | `/catalog/{product}/schema` | esquema de parámetros (auto-formulario del panel) |
| POST | `/generate` | genera (o sirve de caché) STEP + GLB |
| GET | `/download/{key}.{step\|glb}` | descarga el artefacto |
| GET | `/metrics/{key}` | propiedades técnicas (envelope, paso, Ø) |

### Ejemplo

```bash
# 1) generar una variante de 4 bandas
curl -s -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"product":"sorter_multibanda","params":{"lanes":4,"belt_length":800,"belt_width":50}}'
# -> {"key":"7643bdef22e37b01","metrics":{...},"downloads":{...}}

# 2) descargar para Inventor (STEP B-Rep nativo)
curl -O http://localhost:8000/download/7643bdef22e37b01.step

# 3) descargar para el visor web (GLB)
curl -O http://localhost:8000/download/7643bdef22e37b01.glb
```

La caché en disco (`CATALOG_CACHE`, por defecto `/tmp/catalog_cache`) evita
regenerar combinaciones ya vistas: el segundo `POST` idéntico responde en ~3 ms
en lugar de ~2 s. Es el equivalente a las tablas de variantes precomputadas de
un eCATALOG comercial.

---

## Conectar el visor (cierra el círculo con Babylon)

El visor Babylon ya construido carga el GLB del endpoint en vez de geometría
procedural:

```js
// requiere el loader glTF de Babylon además del core
BABYLON.SceneLoader.ImportMesh(
  "", "http://localhost:8000/download/", "7643bdef22e37b01.glb",
  scene, (meshes) => { /* listo, con materiales PBR */ }
);
```

El panel de parámetros del visor se genera solo desde
`GET /catalog/sorter_multibanda/schema` (label, min, max, step, unidad por campo).

---

## Estructura

```
sorter.py          generador paramétrico (componentes + ensamblaje + export)
app.py             API FastAPI (catálogo, generate, download, caché)
requirements.txt
samples/           STEP + GLB de la configuración por defecto (3 bandas)
viewer/            visor Babylon (index.html) que cierra el círculo con el backend
```

## Roadmap (siguiente capa)

- IGES / nativos (Inventor `.ipt`) además de STEP
- Búsqueda por parámetros (SQL sobre el catálogo) → luego por similitud geométrica
- Más productos: rodillos CrossX, módulos de transferencia, toboganes
