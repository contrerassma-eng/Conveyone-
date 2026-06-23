"""Tests del generador MT800-Pro y, sobre todo, del BOM contado de la geometría."""
import collections
import re

import pytest

pytest.importorskip("cadquery")  # los tests de geometría necesitan OpenCASCADE
import mt800  # noqa: E402


def test_validate_clamps():
    p = mt800.MT800Params(length=99999, width=1, belt_width=999).validate()
    assert p.length == 6000
    assert p.width == 80
    assert p.belt_width == 80


def test_lanes_from_width_and_pitch():
    assert mt800.MT800Params(width=600, belt_pitch=85).lanes() == 7
    assert mt800.MT800Params(width=300, belt_pitch=85).lanes() == 4


def test_bom_counts_match_placed_geometry():
    """La garantía central: el BOM no inventa cantidades; cuenta lo colocado."""
    p = mt800.MT800Params()
    asm, led = mt800._assemble(p)
    rows = led.aggregate()
    tally = collections.Counter()
    for name, _obj in asm.traverse():
        tally[re.sub(r"[_\-].*$", "", name)] += 1

    bolts_bom = sum(r["qty"] for r in rows if r["code"] == "DIN912-M5x12")
    plates_bom = sum(r["qty"] for r in rows if r["code"] in ("MTB800-207", "MTB800-207-I"))
    pulleys_bom = sum(r["qty"] for r in rows if r["code"].startswith("MT800-PUL-"))

    assert bolts_bom == tally["bolt"]
    assert plates_bom == tally["plate"]
    assert pulleys_bom == tally["pulley"]


def test_bom_known_quantities_default():
    """Cierra el contrato con cantidades exactas (L1400-W600 -> 7 bandas)."""
    rows = mt800.bom(mt800.MT800Params())
    q = {r["code"]: r["qty"] for r in rows}
    assert q["DIN912-M5x12"] == 140        # antes 108 (fórmula): ahora exacto
    assert q["MT800-TN-M5"] == 140         # tuerca 1:1 con tornillo
    assert q["MTB800-207"] + q["MTB800-207-I"] == 28
    assert q["MT800-BRG-625"] == 28        # 2 anillos x 2 extremos x 7
    assert sum(r["qty"] for r in rows) == 407
    assert all(r["qty"] > 0 for r in rows)
    assert all("source" in r for r in rows)


def test_bom_scales_with_lanes():
    small = sum(r["qty"] for r in mt800.bom(mt800.MT800Params(width=200)))
    big = sum(r["qty"] for r in mt800.bom(mt800.MT800Params(width=900)))
    assert big > small


def test_bolts_off_removes_fasteners():
    rows = mt800.bom(mt800.MT800Params(bolts=False))
    codes = {r["code"] for r in rows}
    assert "DIN912-M5x12" not in codes
    assert "MT800-TN-M5" not in codes


def test_bom_code_format():
    c = mt800.bom_code(mt800.MT800Params())
    assert c.startswith("MT800-Pro-FL-A-L1400-W600-25TU1")
    assert c.endswith("DM1")


def test_metrics_has_part_totals():
    m = mt800.metrics(mt800.MT800Params())
    assert m["lanes"] == 7
    assert m["bom_lines"] == 21
    assert m["total_parts"] == 407
    assert len(m["envelope_mm"]) == 3
