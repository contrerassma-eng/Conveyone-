# Despliegue de los backends

Los backends son **CadQuery / OpenCASCADE**: necesitan Python real con binarios
nativos. **No** corren en Cloudflare Workers ni en Supabase Edge Functions. Van en
un host de contenedores (Railway, Fly.io, Render, una VM, etc.).

Cada subsistema trae su `Dockerfile`. La imagen base es `python:3.11-slim` más las
librerías de runtime que OCP necesita (`libgl1`, `libxrender1`, …).

## Local con Docker

```bash
# Sorter eCATALOG
cd backend/sorter
docker build -t conveyone-sorter .
docker run --rm -p 8000:8000 -v sorter_cache:/data conveyone-sorter
# -> http://localhost:8000/docs

# Configurador M-haste
cd backend/mhaste
docker build -t conveyone-mhaste .
docker run --rm -p 8001:8000 -v mhaste_lib:/data conveyone-mhaste
# -> http://localhost:8001/docs
```

El volumen en `/data` persiste la caché (sorter) y la biblioteca de
configuraciones (M-haste) entre reinicios.

## Railway / Fly.io

- **Railway:** *New Project → Deploy from repo*, *Root Directory* = `backend/sorter`
  (o `backend/mhaste`). Detecta el `Dockerfile`. Añade un volumen montado en `/data`.
- **Fly.io:** `fly launch` dentro de `backend/sorter` (o `backend/mhaste`); usa el
  `Dockerfile`. Crea un volumen (`fly volumes create data`) y móntalo en `/data`.

Variables de entorno útiles:

| Var | Subsistema | Default | Para qué |
|---|---|---|---|
| `CATALOG_CACHE` | sorter | `/data/cache` (Docker) | dónde cachear STEP/GLB |
| `MHASTE_LIB`    | mhaste | `/data/library` (Docker) | biblioteca de configuraciones |

CORS ya está abierto (`allow_origins=["*"]`), así que el configurador web puede
llamar al backend desde cualquier origen.

## Conectar el visor

Los visores Babylon llaman al backend si les pasas la URL:

```
configurador-mt800.html?api=https://mhaste.up.railway.app
viewer/index.html?api=https://sorter.up.railway.app
```

(o define `window.CONVEYONE_API` antes de cargar el script). El botón
**“Generar CAD”** hace `POST /generate` y muestra los enlaces de descarga reales
(STEP + GLB + BOM). Sin `?api`, el visor sigue funcionando en modo procedural.

## Tests (CI)

```bash
cd backend
pip install -r requirements-dev.txt
pip install cadquery==2.8.0        # pesado; cachéalo en CI
( cd sorter && python -m pytest -q )
( cd mhaste && python -m pytest -q )
```
