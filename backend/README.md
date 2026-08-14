# Conveyone · backends de catálogo paramétrico

Backends en Python que generan **geometría CAD real** (B-Rep, no mallas
congeladas) con **CadQuery / OpenCASCADE** —el mismo kernel que corre bajo
3Dfindit / PARTcommunity (CADENAS)— y exportan **STEP** (nativo para
Inventor/SolidWorks) + **GLB** (visor web). Es la capa que separa "modelo 3D
bonito" de "catálogo descargable".

Cada subsistema es autocontenido (su propio `requirements.txt` y visor). El visor
web usa **Babylon.js**.

## Subsistemas

| Carpeta | Producto | Qué hace |
|---|---|---|
| [`sorter/`](./sorter) | Sorter multibanda (banda estrecha) | eCATALOG paramétrico: STEP + GLB con caché de variantes |
| [`mhaste/`](./mhaste) | Configurador M-haste (MT800-Pro…) | STEP + GLB **+ BOM trazable**, biblioteca de configuraciones, registry extensible |

## Arrancar

Cada subsistema trae su propio README con el detalle. En resumen:

```bash
# Sorter eCATALOG
cd sorter && pip install -r requirements.txt && uvicorn app:app --reload

# Configurador M-haste
cd mhaste && pip install -r requirements.txt && cd src && uvicorn app:app --reload
```

> El backend CadQuery necesita Python + OpenCASCADE: **no** corre en Cloudflare
> Workers ni en Supabase. Va en un host Python (Railway/Fly/VM) o en local/CI.
