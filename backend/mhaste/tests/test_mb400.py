"""Tests del generador MB400 (módulo de banda modular)."""
import pytest

pytest.importorskip("cadquery")
import mb400  # noqa: E402


def test_validate_clamps():
    p = mb400.MB400Params(length=1, width=9999, sprocket_d=5).validate()
    assert p.length == 600
    assert p.width == 1200
    assert p.sprocket_d == 60


def test_bom_known_quantities_default():
    p = mb400.MB400Params()
    ns = p.sprockets()
    rows = mb400.bom(p)
    q = {r["code"]: r["qty"] for r in rows}
    spr = q.get("MB400-SPR-DRV-D90", 0) + q.get("MB400-SPR-IDL-D90", 0)
    assert spr == 2 * ns
    assert q["MB400-BRG-UCF"] == 4
    assert q["MA4080"] == 4
    assert q["MB400-MOD"] > 0
    assert sum(r["qty"] for r in rows) == 404   # coincide con el simulador JS
    assert len(rows) == 21
    assert all(r["qty"] > 0 for r in rows)


def test_bom_counts_match_geometry():
    p = mb400.MB400Params()
    asm, led = mb400._assemble(p)
    rows = led.aggregate()
    spr_geom = sum(1 for name, _ in asm.traverse() if name.startswith("pulley_"))
    spr_bom = sum(r["qty"] for r in rows if r["code"].startswith("MB400-SPR-"))
    assert spr_geom == spr_bom == 2 * p.sprockets()


def test_no_bolts_when_disabled():
    codes = {r["code"] for r in mb400.bom(mb400.MB400Params(bolts=False))}
    assert "DIN912-M6x16" not in codes


def test_metrics_and_code():
    m = mb400.metrics(mb400.MB400Params())
    assert m["sprockets"] == mb400.MB400Params().sprockets()
    assert m["total_parts"] == 404
    assert mb400.bom_code(mb400.MB400Params()) == "MB400-Pro-FL-A-L2000-W400-S2-LA2-UGN2-DM1"
