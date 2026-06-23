import os
import sys
import tempfile

# permite `import mt800`, `import library`, `import app` desde src/
SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if SRC not in sys.path:
    sys.path.insert(0, SRC)

# biblioteca de pruebas aislada (no toca la real)
os.environ.setdefault("MHASTE_LIB", os.path.join(tempfile.gettempdir(), "mhaste_lib_pytest"))
