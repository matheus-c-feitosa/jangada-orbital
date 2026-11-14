"""One schema for every FIRMS file, whatever the sensor or product.

MODIS and VIIRS files differ (brightness vs bright_ti4, numeric vs letter confidence, `type` only in
standard-processing files, zero-padded acq_time only in yearly files). Every raw CSV goes through
`NORMALIZED_SELECT` so the rest of the pipeline sees the same columns.
"""

from __future__ import annotations

import duckdb

from jangada import config

# Output columns:
#   satellite   Terra | Aqua | S-NPP | NOAA-20 | NOAA-21
#   instrument  MODIS | VIIRS
#   lat, lon    degrees
#   acq_date    DATE, acq_time SMALLINT (HHMM, UTC), daynight D | N
#   confidence  low | nominal | high  (MODIS: <30, 30-79, >=80, as in the FIRMS guidance; VIIRS: l, n, h)
#   frp         fire radiative power, MW
#   scan, track pixel size along scan and track, km
#   bright      brightness temperature: MODIS channel 21/22, VIIRS I-4 (K)
#   type        0 vegetation fire, 1 volcano, 2 other static land source, 3 offshore; NULL in NRT data
#   product     yearly | SP | NRT
NORMALIZED_SELECT = """
SELECT
    CASE satellite
        WHEN 'Terra' THEN 'Terra' WHEN 'T' THEN 'Terra'
        WHEN 'Aqua' THEN 'Aqua' WHEN 'A' THEN 'Aqua'
        WHEN 'N' THEN 'S-NPP' WHEN 'NPP' THEN 'S-NPP'
        WHEN 'N20' THEN 'NOAA-20' WHEN '1' THEN 'NOAA-20'
        WHEN 'N21' THEN 'NOAA-21' WHEN '2' THEN 'NOAA-21'
        ELSE 'unknown:' || satellite
    END                                              AS satellite,
    instrument,
    CAST(latitude AS DOUBLE)                         AS lat,
    CAST(longitude AS DOUBLE)                        AS lon,
    CAST(acq_date AS DATE)                           AS acq_date,
    TRY_CAST(TRY_CAST(acq_time AS INTEGER) AS SMALLINT)      AS acq_time,
    daynight,
    CASE
        WHEN instrument = 'MODIS' AND TRY_CAST(confidence AS INTEGER) < 30 THEN 'low'
        WHEN instrument = 'MODIS' AND TRY_CAST(confidence AS INTEGER) < 80 THEN 'nominal'
        WHEN instrument = 'MODIS' THEN 'high'
        WHEN lower(confidence) IN ('l', 'low') THEN 'low'
        WHEN lower(confidence) IN ('h', 'high') THEN 'high'
        ELSE 'nominal'
    END                                              AS confidence,
    TRY_CAST(frp AS DOUBLE)                              AS frp,
    TRY_CAST(scan AS DOUBLE)                             AS scan,
    TRY_CAST(track AS DOUBLE)                            AS track,
    TRY_CAST(COALESCE({bright}) AS DOUBLE)               AS bright,
    {type_expr}                                      AS type,
    '{product}'                                      AS product
FROM {source}
"""


def connect() -> duckdb.DuckDBPyConnection:
    tmp = config.DATA / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(f"SET memory_limit = '{config.DUCKDB_MEMORY}'")
    con.execute(f"SET threads = {config.DUCKDB_THREADS}")
    con.execute(f"SET temp_directory = '{tmp}'")
    con.execute("SET preserve_insertion_order = false")
    con.execute("SET max_temp_directory_size = '2GiB'")  # fail fast instead of filling a tight disk
    return con


def csv_columns(con: duckdb.DuckDBPyConnection, source: str) -> set[str]:
    return {row[0] for row in con.execute(f"DESCRIBE SELECT * FROM {source}").fetchall()}


def select_for(con: duckdb.DuckDBPyConnection, source: str, product: str) -> str:
    """Build the normalizing SELECT for a CSV source expression (read_csv(...))."""
    cols = csv_columns(con, source)
    bright = ", ".join(c for c in ("brightness", "bright_ti4") if c in cols) or "NULL"
    type_expr = "TRY_CAST(type AS TINYINT)" if "type" in cols else "CAST(NULL AS TINYINT)"
    return NORMALIZED_SELECT.format(bright=bright, type_expr=type_expr, product=product, source=source)


def read_csv_expr(paths: list[str]) -> str:
    files = ", ".join(f"'{p}'" for p in paths)
    return f"read_csv([{files}], header = true, all_varchar = true, union_by_name = true)"
