"""
app.py — Backend de catálogo paramétrico (eCATALOG privado · Conveyone).

Flujo:
    GET  /catalog                      -> productos disponibles
    GET  /catalog/{product}/schema     -> esquema de parámetros (auto-formulario)
    POST /generate                     -> genera (o sirve de caché) STEP + GLB
    GET  /download/{key}.{ext}         -> descarga el artefacto (step|glb)
    GET  /metrics/{key}                -> propiedades técnicas

La generación bloquea CPU (OpenCASCADE), por eso los endpoints pesados son
síncronos: FastAPI los ejecuta en su threadpool sin congelar el event loop.
La caché en disco evita regenerar combinaciones ya vistas (igual que las
tablas de variantes precomputadas de un eCATALOG comercial).

Arrancar:  uvicorn app:app --reload
"""

import hashlib
import json
import os
from dataclasses import asdict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

import sorter

CACHE_DIR = os.environ.get("CATALOG_CACHE", "/tmp/catalog_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

app = FastAPI(title="Conveyone eCATALOG backend", version="1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# --------------------------------------------------------------------------
# Esquema de parámetros (alimenta el panel del visor automáticamente)
# group / label / min / max / step / unit
# --------------------------------------------------------------------------
PARAM_SCHEMA = {
    "product": "sorter_multibanda",
    "name": "Sorter multibanda (banda estrecha)",
    "params": [
        {"key": "lanes",       "label": "Número de bandas", "type": "int",   "default": 3,   "min": 1,   "max": 8,    "step": 1,   "unit": "",   "group": "Layout"},
        {"key": "belt_length", "label": "Largo de banda",   "type": "float", "default": 720, "min": 200, "max": 2400, "step": 10,  "unit": "mm", "group": "Layout"},
        {"key": "lane_gap",    "label": "Separación bandas","type": "float", "default": 50,  "min": 20,  "max": 200,  "step": 5,   "unit": "mm", "group": "Layout"},
        {"key": "belt_width",  "label": "Ancho de banda",   "type": "float", "default": 46,  "min": 20,  "max": 120,  "step": 2,   "unit": "mm", "group": "Banda"},
        {"key": "belt_thk",    "label": "Espesor de banda", "type": "float", "default": 3.2, "min": 1.5, "max": 8,    "step": 0.1, "unit": "mm", "group": "Banda"},
        {"key": "pulley_d",    "label": "Diámetro polea",   "type": "float", "default": 52,  "min": 20,  "max": 120,  "step": 2,   "unit": "mm", "group": "Transmisión"},
        {"key": "shaft_d",     "label": "Eje motriz Ø",     "type": "float", "default": 20,  "min": 10,  "max": 40,   "step": 1,   "unit": "mm", "group": "Transmisión"},
        {"key": "frame_h",     "label": "Altura de chasis", "type": "float", "default": 540, "min": 300, "max": 1100, "step": 10,  "unit": "mm", "group": "Estructura"},
        {"key": "profile",     "label": "Perfil estructural","type": "float","default": 40,  "min": 30,  "max": 60,   "step": 5,   "unit": "mm", "group": "Estructura"},
    ],
}


class GenerateRequest(BaseModel):
    product: str = Field(default="sorter_multibanda")
    params: dict = Field(default_factory=dict)


def _key(product: str, params: dict) -> str:
    norm = json.dumps(params, sort_keys=True)
    return hashlib.sha1(f"{product}|{norm}".encode()).hexdigest()[:16]


def _build_and_export(product: str, raw: dict):
    """Construye geometría y exporta a la caché. Devuelve (key, metrics)."""
    valid = {p["key"]: raw[p["key"]] for p in PARAM_SCHEMA["params"] if p["key"] in raw}
    params = sorter.SorterParams(**valid).validate()
    key = _key(product, asdict(params))
    stem = os.path.join(CACHE_DIR, key)
    met = sorter.metrics(params)

    if not (os.path.exists(stem + ".step") and os.path.exists(stem + ".glb")):
        asm = sorter.build(params)
        sorter.export(asm, stem)
        with open(stem + ".json", "w") as f:
            json.dump({"params": asdict(params), "metrics": met}, f)
    return key, met


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------
@app.get("/catalog")
def catalog():
    return {"products": [{"id": PARAM_SCHEMA["product"], "name": PARAM_SCHEMA["name"]}]}


@app.get("/catalog/{product}/schema")
def schema(product: str):
    if product != PARAM_SCHEMA["product"]:
        raise HTTPException(404, "producto no encontrado")
    return PARAM_SCHEMA


@app.post("/generate")
def generate(req: GenerateRequest):
    if req.product != PARAM_SCHEMA["product"]:
        raise HTTPException(404, "producto no encontrado")
    key, met = _build_and_export(req.product, req.params)
    return JSONResponse({
        "key": key,
        "metrics": met,
        "downloads": {
            "step": f"/download/{key}.step",
            "glb": f"/download/{key}.glb",
        },
    })


@app.get("/download/{name}")
def download(name: str):
    key, _, ext = name.partition(".")
    if ext not in ("step", "glb"):
        raise HTTPException(400, "formato no soportado (step|glb)")
    path = os.path.join(CACHE_DIR, f"{key}.{ext}")
    if not os.path.exists(path):
        raise HTTPException(404, "artefacto no encontrado; genera primero con POST /generate")
    media = "model/gltf-binary" if ext == "glb" else "application/step"
    fname = f"sorter_multibanda_{key}.{ext}"
    return FileResponse(path, media_type=media, filename=fname)


@app.get("/metrics/{key}")
def metrics(key: str):
    path = os.path.join(CACHE_DIR, f"{key}.json")
    if not os.path.exists(path):
        raise HTTPException(404, "no encontrado")
    return json.load(open(path))


@app.get("/")
def root():
    return {"service": "Conveyone eCATALOG backend", "docs": "/docs", "catalog": "/catalog"}
