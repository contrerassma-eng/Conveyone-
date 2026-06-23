"""Tests del generador MC400 (curva) y su BOM contado de la geometría."""
import pytest

pytest.importorskip("cadquery")
import mc400  # noqa: E402


def test_validate_clamps():
    p = mc400.MC400Params(angle=33, inner_radius=10, width=9999, roller_d=5).validate()
    assert p.angle == 90            # ángulo inválido -> 90
    assert p.inner_radius == 200
    assert p.width == 600
    assert p.roller_d == 25


def test_roller_count_scales():
    n30 = mc400.MC400Params(angle=30).validate().rollers()
    n90 = mc400.MC400Params(angle=90).validate().rollers()
    assert n90 > n30 >= 2


def test_bom_known_quantities_default():
    p = mc400.MC400Params()
    n = p.rollers()
    rows = mc400.bom(p)
    q = {r["code"]: r["qty"] for r in rows}
    assert q["MC400-DRV-W300"] == 1
    assert q.get("MC400-ROL-W300", 0) == n - 1
    assert q["MC400-BRG-625"] == 2 * n
    assert q["DIN912-M5x12"] == 4 * n
    assert q["MT800-TN-M5"] == 4 * n
    assert q["MA4080"] == 4
    assert sum(r["qty"] for r in rows) == 178   # coincide con el simulador JS
    assert len(rows) == 18
    assert all(r["qty"] > 0 for r in rows)


def test_bom_counts_match_placed_geometry():
    p = mc400.MC400Params()
    asm, led = mc400._assemble(p)
    rows = led.aggregate()
    rollers_geom = sum(1 for name, _ in asm.traverse() if name.startswith("roller_"))
    rollers_bom = sum(r["qty"] for r in rows if r["code"] in ("MC400-DRV-W300", "MC400-ROL-W300"))
    assert rollers_geom == rollers_bom == p.rollers()


def test_no_bolts_when_disabled():
    codes = {r["code"] for r in mc400.bom(mc400.MC400Params(bolts=False))}
    assert "DIN912-M5x12" not in codes


def test_metrics_and_code():
    m = mc400.metrics(mc400.MC400Params())
    assert m["rollers"] == mc400.MC400Params().rollers()
    assert m["total_parts"] == 178
    assert mc400.bom_code(mc400.MC400Params()) == "MC400-Pro-90-A-R400-W300-S2-LA2-UGN2-DM1"
