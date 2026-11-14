"""Aggregate normalized hotspots into monthly counts per 0.1° cell and per satellite.

  uv run jangada-aggregate             default filters (see below)
  uv run jangada-aggregate --keep-low  also keep low-confidence detections

Filters, applied before counting:
  - only vegetation fires: `type` 0; NRT rows have no `type`, so we drop NRT rows that fall on a ~1 km position
    that standard processing ever marked as a static land source (type 2) or offshore (type 3);
  - low-confidence detections are dropped (MODIS confidence < 30, VIIRS "l").

Counts per cell, month and satellite:
  n        detections as delivered (one per pixel: 1 km MODIS, 375 m VIIRS)
  n_1km    distinct ~1 km positions (0.01°) per overpass: several VIIRS pixels of one fire collapse into one,
           which is the first step to compare VIIRS with MODIS
  n_day    detections in daytime overpasses
  frp_sum  total fire radiative power (MW)

Outputs in data/processed/: cell_month.parquet, brazil_month.csv, overlap_annual.csv
"""

from __future__ import annotations

import argparse
import sys
import time

from jangada import config
from jangada.normalize import connect

SATELLITES = ("Terra", "Aqua", "S-NPP", "NOAA-20", "NOAA-21")


def log(message: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {message}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--keep-low", action="store_true", help="keep low-confidence detections")
    args = parser.parse_args()

    files = sorted(config.POINTS.glob("*.parquet"))
    if not files:
        sys.exit("no data: run `uv run jangada-download all` first")
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    con = connect()
    t0 = time.monotonic()
    con.execute(f"CREATE VIEW points AS SELECT * FROM read_parquet('{config.POINTS}/*.parquet', union_by_name = true)")

    # Guard: the same satellite and year must not come from two routes (yearly file and API).
    dup = con.execute("""
        SELECT satellite, year(acq_date) AS y, list(DISTINCT product ORDER BY product) AS products
        FROM points GROUP BY ALL
        HAVING count(DISTINCT CASE WHEN product = 'yearly' THEN 'yearly' ELSE 'api' END) > 1
    """).fetchall()
    if dup:
        sys.exit(f"same satellite-year from yearly and API files: {dup}")
    unknown = con.execute("SELECT DISTINCT satellite FROM points WHERE satellite LIKE 'unknown:%'").fetchall()
    if unknown:
        log(f"warning: unknown satellite codes {unknown}; add them to normalize.py")

    low = "" if args.keep_low else "AND confidence <> 'low'"
    con.execute(f"""
        CREATE TEMP TABLE pix AS
        WITH static AS (
            SELECT DISTINCT floor(lat * 100)::INT AS lat100, floor(lon * 100)::INT AS lon100
            FROM points WHERE type IN (2, 3)
        ),
        kept AS (
            SELECT p.*, floor(p.lat * 100)::INT AS lat100, floor(p.lon * 100)::INT AS lon100
            FROM points p
            WHERE (p.type = 0 OR p.type IS NULL) {low}
        )
        SELECT k.satellite, k.acq_date, k.acq_time, k.lat100, k.lon100,
               count(*) AS n, sum(k.frp) AS frp, count(*) FILTER (WHERE k.daynight = 'D') AS n_day
        FROM kept k
        ANTI JOIN static s ON k.type IS NULL AND k.lat100 = s.lat100 AND k.lon100 = s.lon100
        GROUP BY ALL
    """)
    log(f"filtered and collapsed to ~1 km positions per overpass ({time.monotonic() - t0:.0f} s)")

    out = config.PROCESSED / "cell_month.parquet"
    con.execute(f"""
        COPY (
            SELECT floor(lat100 / 10)::INT AS cell_lat,      -- cell south edge = cell_lat / 10 degrees
                   floor(lon100 / 10)::INT AS cell_lon,      -- cell west edge  = cell_lon / 10 degrees
                   date_trunc('month', acq_date)::DATE AS month,
                   satellite,
                   sum(n)::INT AS n, count(*)::INT AS n_1km, sum(n_day)::INT AS n_day,
                   round(sum(frp), 1) AS frp_sum
            FROM pix GROUP BY ALL
            ORDER BY cell_lat, cell_lon, month, satellite
        ) TO '{out}' (FORMAT parquet, COMPRESSION zstd)
    """)
    rows = con.execute(f"SELECT count(*) FROM '{out}'").fetchone()[0]
    log(f"{out.name}: {rows:,} rows, {out.stat().st_size / 1e6:.1f} MB")

    national = config.PROCESSED / "brazil_month.csv"
    con.execute(f"""
        COPY (SELECT month, satellite, sum(n) AS n, sum(n_1km) AS n_1km, round(sum(frp_sum)) AS frp_sum
              FROM '{out}' GROUP BY ALL ORDER BY month, satellite) TO '{national}' (HEADER)
    """)

    overlap = config.PROCESSED / "overlap_annual.csv"
    con.execute(f"""
        COPY (SELECT year(month) AS year, satellite, sum(n) AS n, sum(n_1km) AS n_1km
              FROM '{out}' GROUP BY ALL ORDER BY year, satellite) TO '{overlap}' (HEADER)
    """)

    # First look at the harmonization problem: VIIRS vs MODIS counts in the years both flew.
    totals: dict[int, dict[str, tuple[int, int]]] = {}
    for year, sat, n, k in con.execute(f"""
            SELECT year(month), satellite, sum(n), sum(n_1km) FROM '{out}' GROUP BY ALL ORDER BY 1, 2""").fetchall():
        totals.setdefault(year, {})[sat] = (int(n), int(k))
    log(f"done in {(time.monotonic() - t0) / 60:.1f} min\n")

    def ratio(row: dict[str, tuple[int, int]], a: str, b: str, i: int) -> str:
        return f"{row[a][i] / row[b][i]:5.2f}" if a in row and b in row and row[b][i] else "    -"

    print("Hotspots per year in Brazil, as delivered (n) and as ~1 km positions (k), with VIIRS / Aqua ratios")
    print("year  " + "".join(f"{s:>22}" for s in SATELLITES) + "   S-NPP/Aqua n     k   NOAA-20/Aqua n     k")
    for year, row in totals.items():
        cells = "".join(f"{row[s][0]:>11,}{row[s][1]:>11,}" if s in row else f"{'-':>22}" for s in SATELLITES)
        print(f"{year}  {cells}   {ratio(row, 'S-NPP', 'Aqua', 0)} {ratio(row, 'S-NPP', 'Aqua', 1)}"
              f"            {ratio(row, 'NOAA-20', 'Aqua', 0)} {ratio(row, 'NOAA-20', 'Aqua', 1)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
