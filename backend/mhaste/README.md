# haste — Configurador eCATALOG M-haste

Configurador paramétrico de transportadores M-haste: muestra el modelo 3D,
genera el BOM y exporta CAD (STEP B-Rep + GLB), archivando cada configuración en
una biblioteca. Estilo 3Dfindit / PARTcommunity, sobre CadQuery (OpenCASCADE).

**Handoff técnico completo en [`CLAUDE.md`](./CLAUDE.md).**

## Estructura

```
src/        mt800.py (geometría B-Rep + BOM)  ·  library.py (registro + biblioteca)  ·  app.py (API)
web/        configurador-mt800.html  — configurador interactivo (autocontenido)
docs/       SISTEMA-MHASTE.md  — sistema de codificación y BOM
data/       manual_parts_index.csv  ·  bom/  — BOMs extraídos del manual y de ejemplo
```

## Quickstart

```bash
pip install -r requirements.txt
cd src && uvicorn app:app --reload      # API + docs en /docs
# configurador visual: abrir web/configurador-mt800.html
```

## Modelos

- **MT800-Pro** — listo (geometría, BOM, configurador, biblioteca).
- **MC400** — siguiente (componentes disponibles; ver CLAUDE.md §Tareas).

## Notas

- El manual PDF y los STEP/GLB pesados NO están versionados (`.gitignore`); sus
  datos útiles se extraen a `data/`.
- El backend (CadQuery/OpenCASCADE) necesita Python real; no corre en Workers.
