"""
library.py — Registro de modelos M-haste y biblioteca de configuraciones.

Cada modelo expone la misma interfaz (build / metrics / bom / code / export),
así el sistema es extensible: hoy MT800-Pro, mañana MC400 y los demás se
registran añadiendo un módulo con esa interfaz.

Cada configuración generada se archiva en library/{código}/ con STEP, GLB,
BOM (CSV+JSON) y meta.json — replicando el "briefcase" de PARTcommunity:
el configurador no solo muestra, va construyendo una biblioteca trazable.
"""

import json
import os
from dataclasses import asdict

import mt800

LIB = os.environ.get("MHASTE_LIB", os.path.join(os.path.dirname(__file__), "library"))

# Esquema de parámetros -> alimenta el formulario del configurador
MT800_SCHEMA = {
    "id": "mt800_pro",
    "name": "MT800-Pro · Transportador de banda estrecha",
    "params": [
        {"key": "length",         "label": "Largo (L)",        "type": "float", "default": 1400, "min": 400, "max": 6000, "step": 50, "unit": "mm"},
        {"key": "width",          "label": "Ancho (W)",        "type": "float", "default": 600,  "min": 80,  "max": 1500, "step": 20, "unit": "mm"},
        {"key": "belt_width",     "label": "Banda (T)",        "type": "float", "default": 25,   "min": 15,  "max": 80,   "step": 5,  "unit": "mm"},
        {"key": "belt_pitch",     "label": "Paso entre bandas","type": "float", "default": 85,   "min": 30,  "max": 200,  "step": 5,  "unit": "mm"},
        {"key": "pulley_d",       "label": "Polea Ø",          "type": "float", "default": 34,   "min": 20,  "max": 80,   "step": 2,  "unit": "mm"},
        {"key": "understructure", "label": "Soporte (UGN)",    "type": "enum",  "default": "legs", "options": ["legs", "low"]},
        {"key": "leg_height",     "label": "Altura de patas",  "type": "float", "default": 700,  "min": 300, "max": 1200, "step": 10, "unit": "mm"},
        {"key": "drive_end",      "label": "Motriz (DM)",      "type": "enum",  "default": "left", "options": ["left", "right"]},
        {"key": "side_guides",    "label": "Guías laterales (LA)", "type": "bool", "default": True},
        {"key": "casters",        "label": "Ruedas",           "type": "bool",  "default": True},
        {"key": "belt_color",     "label": "Color de banda",   "type": "color", "default": "#161616"},
    ],
}

MODELS = {
    "mt800_pro": {
        "schema": MT800_SCHEMA,
        "params": mt800.MT800Params,
        "build": mt800.build,
        "metrics": mt800.metrics,
        "bom": mt800.bom,
        "code": mt800.bom_code,
        "export": mt800.export,
        "export_bom": mt800.export_bom,
    },
    # "mc400": { ... }   # se añade registrando otro módulo con la misma interfaz
}


def _valid_params(model_id, raw):
    m = MODELS[model_id]
    keys = set(asdict(m["params"]()).keys())
    return m["params"](**{k: v for k, v in raw.items() if k in keys}).validate()


def generate(model_id, raw_params):
    """Genera (o reutiliza) una configuración y la archiva en la biblioteca."""
    if model_id not in MODELS:
        raise KeyError(model_id)
    m = MODELS[model_id]
    params = _valid_params(model_id, raw_params)
    code = m["code"](params)
    folder = os.path.join(LIB, code)
    os.makedirs(folder, exist_ok=True)
    stem = os.path.join(folder, code)

    if not os.path.exists(stem + ".step"):
        asm = m["build"](params)
        m["export"](asm, stem)
        m["export_bom"](params, stem)
        meta = {
            "model": model_id,
            "code": code,
            "params": asdict(params),
            "metrics": m["metrics"](params),
            "files": {
                "step": code + ".step",
                "glb": code + ".glb",
                "bom_csv": code + ".bom.csv",
                "bom_json": code + ".bom.json",
            },
        }
        json.dump(meta, open(stem + ".meta.json", "w"), indent=2, ensure_ascii=False)

    return code, m["metrics"](params), m["bom"](params)


def index():
    """Índice de la biblioteca (todas las configuraciones generadas)."""
    items = []
    if os.path.isdir(LIB):
        for code in sorted(os.listdir(LIB)):
            meta = os.path.join(LIB, code, code + ".meta.json")
            if os.path.exists(meta):
                items.append(json.load(open(meta)))
    return items


def file_path(code, fname):
    p = os.path.join(LIB, code, fname)
    return p if os.path.exists(p) else None
