"""Spec 002 extras: pure helpers, plus checks on the published files when they exist (they run in CI)."""

import json

import duckdb
import pytest

from jangada.export_web import WEB_DATA
from jangada.extras import _b36, encode_rows, oni_phases, round_geometry, usual_p90_sql, ytd_standing


def test_usual_p90_counts_years_without_fire_as_zero():
    # a cell that burned in August of 2 of the 21 usual years: its usual August is no fire, not the 2 fire years
    con = duckdb.connect()
    con.execute("""CREATE TABLE h AS SELECT * FROM (VALUES (1, 2, DATE '2010-08-01', 30.0), (1, 2, DATE '2020-08-01', 50.0),
                                                           (1, 3, DATE '2010-08-01', 30.0))
                   t(cell_lat, cell_lon, month, value)""")
    for y in range(2003, 2024):  # and a cell that burns every August
        con.execute(f"INSERT INTO h VALUES (5, 5, DATE '{y}-08-01', {10.0 + y - 2003})")
    p90 = {(la, lo): v for la, lo, v in con.execute(usual_p90_sql("h", 8)).fetchall()}
    assert p90[(1, 2)] == pytest.approx(0.0)  # was 48 with the fire years alone
    assert p90[(1, 3)] == pytest.approx(0.0)
    assert p90[(5, 5)] == pytest.approx(28.0)  # 10..30, 90th percentile


def _seasons(start_year, anomalies):
    return [(start_year + i // 12, i % 12 + 1, a) for i, a in enumerate(anomalies)]


def test_oni_years_with_both_phases_are_transitions():
    # 2009: La Nina until March (a run that began in 2008), El Nino from June; 2010: El Nino until April, La Nina from
    # June; 2011: La Nina all year
    ln, en, zero = -0.8, 1.0, 0.0
    years = oni_phases(_seasons(2008, [ln] * 12 + [ln] * 3 + [zero] * 2 + [en] * 7 + [en] * 4 + [zero] + [ln] * 7 + [ln] * 12))
    assert {y: d["phase"] for y, d in years.items()} == {"2008": "LN", "2009": "LN-EN", "2010": "EN-LN", "2011": "LN"}
    # a phase that covers only 1 or 2 of a year's seasons does not name the year
    years = oni_phases(_seasons(2014, [zero] * 10 + [en] * 2 + [en] * 3 + [zero] * 9))
    assert {y: d["phase"] for y, d in years.items()} == {"2014": None, "2015": "EN"}


def test_base36_and_row_encoding_round_trip():
    assert [_b36(n) for n in (0, 35, 36, 1295)] == ["0", "z", "10", "zz"]
    assert int(_b36(33554431), 36) == 33554431
    rows = [(-100, -400, 5), (-100, -399, 31), (-100, -395, 0), (-99, -500, 1)]
    assert encode_rows(rows) == {"-100": "-400.5,1.v,4.0", "-99": "-500.1"}


def test_outlines_round_to_three_decimals_and_keep_shared_borders():
    left = {"type": "Polygon", "coordinates": [[[0, 0], [1.00049, 0], [1.0004, 0.5], [1.00049, 1], [0, 1], [0, 0]]]}
    right = {"type": "Polygon", "coordinates": [[[1.00049, 0], [2, 0], [2, 1], [1.00049, 1], [1.0004, 0.5], [1.00049, 0]],
                                                [[1.5, 0.5], [1.5001, 0.5], [1.5, 0.5001], [1.5, 0.5]]]}
    a, b = round_geometry(left), round_geometry(right)
    # the shared border rounds the same way in both polygons, and a point that lands on its neighbour is dropped
    assert a["coordinates"] == [[[0, 0], [1.0, 0], [1.0, 0.5], [1.0, 1], [0, 1], [0, 0]]]
    assert b["coordinates"] == [[[1.0, 0], [2, 0], [2, 1], [1.0, 1], [1.0, 0.5], [1.0, 0]]]  # the tiny hole is gone
    multi = round_geometry({"type": "MultiPolygon", "coordinates": [left["coordinates"], [[[5, 5], [5.0001, 5], [5, 5.0001], [5, 5]]]]})
    assert multi["coordinates"] == [a["coordinates"]]


def test_published_biome_outlines_are_light():
    path = WEB_DATA / "biomes.geojson"
    if not path.exists():
        pytest.skip("biomes.geojson not published")
    doc = json.loads(path.read_text(encoding="utf-8"))
    coords = []

    def walk(c):
        if isinstance(c[0], (int, float)):
            coords.append(c)
        else:
            for x in c:
                walk(x)
    for f in doc["features"]:
        walk(f["geometry"]["coordinates"])
    assert all(round(x, 3) == x and round(y, 3) == y for x, y in coords)
    assert path.stat().st_size < 470_000  # 500 KB with 4 decimals


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
    # years before an area's first detection count as zero, as in the web rule (every complete year since 2001):
    # 2001-2007 have no rows (no detections) and 2008-2010 tie with this year, so 7 below and 3 ties of 10
    s = _series(lambda y, m: 1, [1], first=2008)
    assert ytd_standing(s, "2011-01", 31) == {"ytd": 1.0, "percentile": 85, "first": 2001, "last": 2010}
    # too little history gives no standing
    assert ytd_standing({"2004-01": 1.0}, "2004-01", 31) is None


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
