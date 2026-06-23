"""Tests de la API FastAPI del eCATALOG del sorter."""
import pytest

pytest.importorskip("cadquery")
from fastapi.testclient import TestClient  # noqa: E402

import app as appmod  # noqa: E402

client = TestClient(appmod.app)


def test_catalog_lists_product():
    r = client.get("/catalog")
    assert r.status_code == 200
    assert any(p["id"] == "sorter_multibanda" for p in r.json()["products"])


def test_schema_ok_and_404():
    assert client.get("/catalog/sorter_multibanda/schema").status_code == 200
    assert client.get("/catalog/desconocido/schema").status_code == 404


def test_generate_and_download():
    r = client.post("/generate", json={"product": "sorter_multibanda",
                                       "params": {"lanes": 2, "belt_length": 400}})
    assert r.status_code == 200
    data = r.json()
    assert set(data["downloads"]) == {"step", "glb"}
    key = data["key"]
    assert client.get(f"/download/{key}.step").status_code == 200
    assert client.get(f"/download/{key}.glb").status_code == 200
    assert client.get(f"/metrics/{key}").status_code == 200


def test_download_bad_format():
    assert client.get("/download/whatever.iges").status_code == 400
