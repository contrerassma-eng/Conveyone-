"""Tests del generador del sorter multibanda."""
import pytest

pytest.importorskip("cadquery")
import sorter  # noqa: E402


def test_validate_clamps():
    p = sorter.SorterParams(lanes=99, belt_length=1, pulley_d=999, belt_width=1).validate()
    assert 1 <= p.lanes <= 8
    assert p.belt_length == 200
    assert p.pulley_d == 120
    assert p.belt_width == 20


def test_metrics_shape():
    m = sorter.metrics(sorter.SorterParams())
    assert m["lanes"] == 3
    assert len(m["envelope_mm"]) == 3
    assert m["pulley_d_mm"] == 52


def test_build_produces_geometry():
    asm = sorter.build(sorter.SorterParams(lanes=2, belt_length=400))
    assert len(list(asm.traverse())) > 0


def test_more_lanes_more_parts():
    a2 = len(list(sorter.build(sorter.SorterParams(lanes=2)).traverse()))
    a4 = len(list(sorter.build(sorter.SorterParams(lanes=4)).traverse()))
    assert a4 > a2
