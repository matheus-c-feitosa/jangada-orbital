"""Spec 002 extras: pure helpers, plus checks on the published files when they exist (they run in CI)."""

import json

import pytest

from jangada.export_web import WEB_DATA
from jangada.extras import _b36, encode_rows, ytd_standing


def test_base36_and_row_encoding_round_trip():
    assert [_b36(n) for n in (0, 35, 36, 1295)] == ["0", "z", "10", "zz"]
    assert int(_b36(33554431), 36) == 33554431
    rows = [(-100, -400, 5), (-100, -399, 31), (-100, -395, 0), (-99, -500, 1)]
    assert encode_rows(rows) == {"-100": "-400.5,1.v,4.0", "-99": "-500.1"}


def _series(per_month, current, first=2001, last=2010, year=2011):
    s = {f"{y}-{m:02d}": per_month(y, m) for y in range(first, last + 1) for m in range(1, 13)}
    s.update({f"{year}-{m:02d}": v for m, v in enumerate(current, start=1)})
    return s


def test_ytd_standing_matches_the_web_rule():
    # a year twice the usual is above every previous year
    s = _series(lambda y, m: 10 + y % 3, [30, 30, 30, 30])
    assert ytd_standing(s, "2011-04", 30) == {"ytd": 120.0, "percentile": 100, "first": 2001, "last": 2010}
    # the partial month is compared pro rata: 15 of 30 April days at the usual pace is the median
    s = _series(lambda y, m: 10, [10, 10, 10, 5])
    assert ytd_standing(s, "2011-04", 15)["percentile"] == 50
    # too little history gives no standing
    assert ytd_standing(_series(lambda y, m: 1, [1], first=2008), "2011-01", 31) is None


def _load(name):
    path = WEB_DATA / name
    if not path.exists():
        pytest.skip(f"run `uv run jangada-extras` first ({name} missing)")
    return json.loads(path.read_text(encoding="utf-8"))


def test_biomes_partition_brazil():
    biomes = _load("biome_series.json")
    brazil = json.loads((WEB_DATA / "series.json").read_text(encoding="utf-8"))["areas"]["BR"]
    assert len(biomes["areas"]) == 6
    for i in range(len(brazil["value"])):
        total = sum(a["value"][i] for a in biomes["areas"].values())
        assert total == pytest.approx(brazil["value"][i], abs=1.0)


def test_recurrence_masks_stay_in_the_period():
    r = _load("recurrence.json")
    span = r["last"] - r["first"] + 1
    for line in r["rows"].values():
        for item in line.split(","):
            assert 0 < int(item.split(".")[1], 36) < (1 << span)


def test_validation_reproduces_the_published_metrics():
    v = _load("validation.json")["metrics"]
    m = json.loads((WEB_DATA / "manifest.json").read_text(encoding="utf-8"))["validation"]
    assert v["mape_national_month"] == pytest.approx(m["mape_national_month"], abs=0.005)
    assert v["share_within_20pct_state_year"] == pytest.approx(m["share_within_20pct_state_year"], abs=0.01)


def test_aqua_overpass_in_2012_is_near_its_design_time():
    hour = _load("overpass.json")["satellites"]["Aqua"]["2012"][0]
    assert 13.0 <= hour <= 14.0  # SC-014


def test_intensity_never_mixes_sensors():
    areas = _load("intensity.json")["areas"]
    assert set(areas["BR"]) <= {"aqua", "snpp"}  # SC-013: one series per sensor, no harmonized FRP


def test_extra_files_are_in_the_manifest():
    files = json.loads((WEB_DATA / "manifest.json").read_text(encoding="utf-8"))["files"]
    for entry in files.values():
        assert (WEB_DATA / entry["path"]).exists(), entry["path"]
