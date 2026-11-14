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
