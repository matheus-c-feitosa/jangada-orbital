"""Invariants of the exported web data (SC-004 and the web-data-files contract). Skipped if data is not built."""

import hashlib
import json
import random

import duckdb
import pytest

from jangada import config
from jangada.export_web import MAX_BYTES, SATELLITES, WEB_DATA

CELLS = config.PROCESSED / "cell_month.parquet"
OBSERVED = WEB_DATA / "observed.parquet"
HARMONIZED = WEB_DATA / "harmonized.parquet"
MANIFEST = WEB_DATA / "manifest.json"

pytestmark = pytest.mark.skipif(
    not all(p.exists() for p in (CELLS, OBSERVED, HARMONIZED, MANIFEST)),
    reason="run jangada-aggregate, jangada-harmonize and jangada-export-web first",
)


@pytest.fixture(scope="module")
def con():
    return duckdb.connect()


def random_areas(con, count=40, seed=7):
    lat0, lat1, lon0, lon1 = con.execute(
        f"SELECT min(cell_lat), max(cell_lat), min(cell_lon), max(cell_lon) FROM '{CELLS}'").fetchone()
    rng = random.Random(seed)
    for _ in range(count):
        h, w = rng.randint(1, 60), rng.randint(1, 60)
        a, b = rng.randint(lat0, lat1 - h), rng.randint(lon0, lon1 - w)
        yield a, a + h, b, b + w


def test_observed_sums_equal_aggregation_for_random_areas(con):
    """SC-004: for any area, the web file gives the same totals as the pipeline output."""
    codes = " ".join(f"WHEN '{s}' THEN {i}" for i, s in enumerate(SATELLITES))
    for a, b, c, d in random_areas(con):
        where = f"cell_lat BETWEEN {a} AND {b} AND cell_lon BETWEEN {c} AND {d}"
        mismatches = con.execute(f"""
            WITH x AS (SELECT month, (CASE satellite {codes} END) AS sat, sum(n) n, sum(n_1km) k
                       FROM '{CELLS}' WHERE {where} GROUP BY ALL),
                 y AS (SELECT month, satellite AS sat, sum(n) n, sum(n_1km) k
                       FROM '{OBSERVED}' WHERE {where} GROUP BY ALL)
            SELECT count(*) FROM x FULL JOIN y USING (month, sat)
            WHERE x.n IS DISTINCT FROM y.n OR x.k IS DISTINCT FROM y.k
        """).fetchone()[0]
        assert mismatches == 0, f"area {a}..{b} x {c}..{d}"


def test_harmonized_values_are_consistent(con):
    bad = con.execute(f"""
        SELECT count(*) FILTER (WHERE value < 0 OR lo > value OR value > hi),
               count(*) FILTER (WHERE source NOT IN (0, 1, 2)),
               count(*) FILTER (WHERE (source = 1 AND month >= DATE '2002-08-01')
                                   OR (source = 0 AND (month < DATE '2002-08-01' OR month >= DATE '2024-01-01'))
                                   OR (source = 2 AND month < DATE '2024-01-01'))
        FROM '{HARMONIZED}'""").fetchone()
    assert bad == (0, 0, 0)


def test_files_are_sorted_for_range_requests(con):
    for f in (OBSERVED, HARMONIZED):
        unsorted = con.execute(f"""
            SELECT count(*) FROM (
                SELECT cell_lat, cell_lon, month,
                       lag(cell_lat) OVER w AS pl, lag(cell_lon) OVER w AS pc, lag(month) OVER w AS pm
                FROM read_parquet('{f}', file_row_number = true) WINDOW w AS (ORDER BY file_row_number))
            WHERE pl IS NOT NULL AND (pl, pc, pm) > (cell_lat, cell_lon, month)""").fetchone()[0]
        assert unsorted == 0, f.name


def test_manifest_matches_contract():
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for key in ("schema", "data_version", "data_date", "model_version", "unit", "grid_deg", "first_month",
                "last_month", "last_month_days", "files", "satellites", "validation"):
        assert key in m, key
    assert m["schema"] == 1 and m["grid_deg"] == 0.1 and m["satellites"] == SATELLITES
    assert 1 <= m["last_month_days"] <= 31
    for entry in m["files"].values():
        path = WEB_DATA / entry["path"]
        assert path.stat().st_size == entry["bytes"] <= MAX_BYTES
        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"]


SERIES = WEB_DATA / "series.json"


@pytest.mark.skipif(not SERIES.exists(), reason="run jangada-export-web first")
def test_series_matches_parquet_and_states_add_up(con):
    doc = json.loads(SERIES.read_text(encoding="utf-8"))
    months, areas = doc["months"], doc["areas"]
    assert len(areas) == 28 and "BR" in areas
    br = areas["BR"]
    for key in ("value", "lo", "hi", "viirs_k"):
        assert all(len(a[key]) == len(months) for a in areas.values())
    # Brazil harmonized equals the Parquet total for every month (within rounding of 1 decimal per area).
    totals = dict(con.execute(f"""SELECT strftime(month, '%Y-%m'), sum(value) FROM '{HARMONIZED}' GROUP BY 1""").fetchall())
    for i, m in enumerate(months):
        assert br["value"][i] == pytest.approx(totals.get(m, 0.0), abs=1.0), m
        states = sum(a["value"][i] for k, a in areas.items() if k != "BR")
        assert states == pytest.approx(br["value"][i], abs=3.0), m
    # Observed: Brazil per satellite equals the aggregation; null only where the satellite never flew that month.
    observed = {(m, s): n for m, s, n in con.execute(
        f"SELECT strftime(month, '%Y-%m'), satellite, sum(n) FROM '{CELLS}' GROUP BY ALL").fetchall()}
    for s in SATELLITES:
        for i, m in enumerate(months):
            v = br["observed"][s][i]
            assert v == observed.get((m, s)), (s, m)


@pytest.mark.skipif(not (WEB_DATA / "tiles").exists(), reason="run jangada-export-web first")
def test_tiles_partition_the_big_files(con):
    """The browser reads tiles; together they must hold exactly the rows of the published big files."""
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    tiles = WEB_DATA / "tiles"
    assert len(list(tiles.glob("h_*.parquet"))) == len(m["tiles"]["ids"]) == len(list(tiles.glob("o_*.parquet")))
    for kind, big in (("h", HARMONIZED), ("o", OBSERVED)):
        a = con.execute(f"SELECT count(*), sum(cell_lat::BIGINT * 1000 + cell_lon) FROM '{tiles}/{kind}_*.parquet'").fetchone()
        b = con.execute(f"SELECT count(*), sum(cell_lat::BIGINT * 1000 + cell_lon) FROM '{big}'").fetchone()
        assert a == b, kind
    wrong = con.execute(f"""SELECT count(*) FROM read_parquet('{tiles}/h_*.parquet', filename = true)
                            WHERE regexp_extract(filename, 'h_(-?\\d+)_(-?\\d+)', 1)::INT <> floor(cell_lat / 20)
                               OR regexp_extract(filename, 'h_(-?\\d+)_(-?\\d+)', 2)::INT <> floor(cell_lon / 20)""").fetchone()[0]
    assert wrong == 0


MUNICIPALITIES = WEB_DATA / "municipalities"


@pytest.mark.skipif(not (MUNICIPALITIES / "index.json").exists(), reason="run jangada-municipalities first")
def test_municipality_index_matches_state_files():
    index = json.loads((MUNICIPALITIES / "index.json").read_text(encoding="utf-8"))
    assert len(index) > 5500
    ids = [row[0] for row in index]
    assert len(ids) == len(set(ids))
    by_state: dict[str, set[str]] = {}
    for mid, name, uf, w, s, e, n in index:
        assert name and len(mid) == 7 and mid.startswith(tuple("12345"))
        assert -74.5 <= w <= e <= -28 and -34.5 <= s <= n <= 5.5, (mid, name)
        by_state.setdefault(uf, set()).add(mid)
    assert len(by_state) == 27
    for uf, expected in by_state.items():
        f = MUNICIPALITIES / f"{uf}.geojson"
        assert f.stat().st_size <= 1_000_000, uf
        doc = json.loads(f.read_text(encoding="utf-8"))
        assert {feat["properties"]["id"] for feat in doc["features"]} == expected, uf


@pytest.mark.skipif(not SERIES.exists(), reason="run jangada-export-web first")
def test_areas_match_ibge_official_figures():
    """T048: densities need correct areas. IBGE official areas (2022): Brazil 8,510,345.540 km², Ceará 148,894.442 km²,
    Amazonas 1,559,255.881 km², Distrito Federal 5,760.784 km²."""
    areas = json.loads(SERIES.read_text(encoding="utf-8"))["areas"]
    official = {"BR": 8_510_345.540, "CE": 148_894.442, "AM": 1_559_255.881, "DF": 5_760.784}
    for code, km2 in official.items():
        assert areas[code]["area_km2"] == pytest.approx(km2, rel=0.02), code
    states = sum(a["area_km2"] for k, a in areas.items() if k != "BR")
    assert states == pytest.approx(areas["BR"]["area_km2"], rel=0.01)
