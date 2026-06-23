"""Tests de la API FastAPI del configurador M-haste."""
import pytest

pytest.importorskip("cadquery")
from fastapi.testclient import TestClient  # noqa: E402

import app as appmod  # noqa: E402

client = TestClient(appmod.app)


def test_models_lists_mt800():
    r = client.get("/models")
    assert r.status_code == 200
    ids = [m["id"] for m in r.json()["models"]]
    assert "mt800_pro" in ids


def test_schema_ok_and_404():
    r = client.get("/models/mt800_pro/schema")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "mt800_pro"
    assert any(p["key"] == "length" for p in body["params"])
    assert client.get("/models/desconocido/schema").status_code == 404


def test_generate_download_and_bom(tmp_path):
    r = client.post("/generate", json={"model": "mt800_pro",
                                       "params": {"length": 800, "width": 300}})
    assert r.status_code == 200
    data = r.json()
    assert data["total_parts"] > 0
    assert set(data["downloads"]) == {"step", "glb", "bom_csv", "bom_json"}

    code = data["code"]
    assert client.get(f"/download/{code}/{code}.step").status_code == 200
    assert client.get(f"/download/{code}/{code}.glb").status_code == 200
    assert client.get(f"/bom/{code}").json()["total_parts"] == data["total_parts"]


def test_generate_unknown_model_404():
    assert client.post("/generate", json={"model": "nope", "params": {}}).status_code == 404


def test_library_index_grows():
    client.post("/generate", json={"model": "mt800_pro", "params": {"length": 1000, "width": 400}})
    r = client.get("/library")
    assert r.status_code == 200
    assert len(r.json()["items"]) >= 1
