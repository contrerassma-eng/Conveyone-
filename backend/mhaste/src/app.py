"""app.py — Configurador M-haste con biblioteca.
    GET  /models                 -> modelos registrados (MT800; futuro MC400...)
    GET  /models/{id}/schema     -> parámetros del configurador
    POST /generate               -> genera STEP+GLB+BOM, archiva en biblioteca
    GET  /library                -> índice de configuraciones generadas
    GET  /download/{code}/{file} -> descarga STEP | GLB | BOM
Arrancar: uvicorn app:app --reload
"""
import os, json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
import library

app = FastAPI(title="M-haste configurador", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class GenReq(BaseModel):
    model: str = Field(default="mt800_pro")
    params: dict = Field(default_factory=dict)

@app.get("/models")
def models():
    return {"models": [{"id": k, "name": v["schema"]["name"]} for k, v in library.MODELS.items()]}

@app.get("/models/{model_id}/schema")
def schema(model_id: str):
    if model_id not in library.MODELS:
        raise HTTPException(404, "modelo no registrado")
    return library.MODELS[model_id]["schema"]

@app.post("/generate")
def generate(req: GenReq):
    if req.model not in library.MODELS:
        raise HTTPException(404, "modelo no registrado")
    code, metrics, bom = library.generate(req.model, req.params)
    return JSONResponse({
        "code": code, "metrics": metrics, "bom": bom,
        "total_parts": sum(r["qty"] for r in bom),
        "downloads": {
            "step": f"/download/{code}/{code}.step",
            "glb": f"/download/{code}/{code}.glb",
            "bom_csv": f"/download/{code}/{code}.bom.csv",
            "bom_json": f"/download/{code}/{code}.bom.json",
        }})

@app.get("/library")
def lib():
    return {"items": library.index()}

@app.get("/bom/{code}")
def bom(code: str):
    p = library.file_path(code, f"{code}.bom.json")
    if not p: raise HTTPException(404, "no encontrado")
    return json.load(open(p))

@app.get("/download/{code}/{fname}")
def download(code: str, fname: str):
    p = library.file_path(code, fname)
    if not p: raise HTTPException(404, "archivo no encontrado")
    ext = fname.rsplit(".", 1)[-1].lower()
    media = {"step":"application/step","glb":"model/gltf-binary","csv":"text/csv","json":"application/json"}.get(ext,"application/octet-stream")
    return FileResponse(p, media_type=media, filename=fname)

@app.get("/")
def root():
    return {"service":"M-haste configurador","docs":"/docs","models":"/models","library":"/library"}
