import os
import sys
import tempfile

# permite `import sorter`, `import app`
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# caché de pruebas aislada
os.environ.setdefault("CATALOG_CACHE", os.path.join(tempfile.gettempdir(), "catalog_cache_pytest"))
