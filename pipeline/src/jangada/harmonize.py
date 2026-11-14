"""Calibrate VIIRS (and early Terra) counts to Aqua-MODIS-equivalent detections and build the harmonized series.

  uv run jangada-harmonize

Method (see specs/001-harmonized-fire-calendar/research.md, R2):
  - factor per state (UF) and month of year: f = sum(Aqua n) / sum(source), pooled over the fit years;
  - shrinkage toward the national factor of the same month, as a pseudo-count:
    (sum(Aqua) + M*f_nat) / (sum(source) + M), M = source detections (state-months with few fires stay national);
  - VIIRS source = S-NPP ~1 km positions (k), the only VIIRS satellite flying in every fit year;
  - from 2024 the series uses mean(NOAA-20 k, NOAA-21 k) x g, where g = S-NPP / mean(NOAA-20, NOAA-21) over the
    months all three flew in full;
  - validation: fit 2012-2020, test 2021-2022 (held out) against Aqua; production fit 2012-2023.

Series:  2000-11..2002-07 Terra x f_terra (source 1) | 2002-08..2023-12 Aqua observed (source 0)
         | 2024-01.. VIIRS calibrated (source 2)

Outputs in data/processed/: calibration.csv, harmonized_cell_month.parquet, harmonize_report.json
"""

from __future__ import annotations

import json
import sys
import time

from jangada import config
from jangada.normalize import connect

MODEL_VERSION = "cal-1.0"
M = 100                    # shrinkage strength, in source detections (pseudo-count)
MIN_SOURCE = 10            # minimum source count for a month to enter the spread (q25/q75)
MIN_REF = 20               # minimum Aqua count for a state-month to enter the validation metrics
FIT_TEST = (2012, 2020)
HELDOUT = (2021, 2022)
FIT_PROD = (2012, 2023)
FIT_TERRA = (2003, 2012)
AQUA_FROM = "2002-08-01"   # first full month of Aqua data
VIIRS_FROM = "2024-01-01"  # Aqua/Terra drift: the VIIRS/Aqua ratio drops from 2024


def log(message: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {message}", flush=True)


def fit(con, name: str, source_col: str, years: tuple[int, int]) -> None:
    """Create table `name` with one factor per (uf, month_of_year), from table `sm` (state-month)."""
    y0, y1 = years
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH pairs AS (
            SELECT uf, month(month) AS moy, aqua_n AS t, {source_col} AS s
            FROM sm WHERE year(month) BETWEEN {y0} AND {y1} AND {source_col} > 0
        ),
        nat AS (SELECT moy, sum(t) / sum(s) AS f_nat FROM pairs GROUP BY moy),
        st AS (SELECT uf, moy, sum(t) AS st, sum(s) AS ss, sum(t) / sum(s) AS f_raw, count(*) AS w
               FROM pairs GROUP BY uf, moy),
        spread AS (
            SELECT uf, moy, count(*) AS k, quantile_cont(t / s, 0.25) AS q25, quantile_cont(t / s, 0.75) AS q75
            FROM pairs WHERE s >= {MIN_SOURCE} GROUP BY uf, moy
        ),
        nat_spread AS (
            SELECT p.moy, quantile_cont((p.t / p.s) / n.f_nat, 0.25) AS r25, quantile_cont((p.t / p.s) / n.f_nat, 0.75) AS r75
            FROM pairs p JOIN nat n USING (moy) WHERE p.s >= {MIN_SOURCE} GROUP BY p.moy
        ),
        ufs AS (SELECT DISTINCT uf FROM sm),
        grid AS (SELECT uf, moy FROM ufs CROSS JOIN range(1, 13) r(moy))
        SELECT g.uf, g.moy AS month_of_year,
               (coalesce(st.st, 0) + {M} * n.f_nat) / (coalesce(st.ss, 0) + {M}) AS factor,
               st.f_raw AS factor_raw,
               coalesce(st.w, 0) AS n_months,
               CASE WHEN sp.k >= 4 THEN sp.q25 ELSE n.f_nat * ns.r25 END AS q25,
               CASE WHEN sp.k >= 4 THEN sp.q75 ELSE n.f_nat * ns.r75 END AS q75
        FROM grid g JOIN nat n USING (moy) JOIN nat_spread ns USING (moy)
        LEFT JOIN st USING (uf, moy) LEFT JOIN spread sp USING (uf, moy)
    """)
    # Keep the band around the factor (a skewed spread can leave the shrunk factor outside q25..q75).
    con.execute(f"UPDATE {name} SET q25 = least(q25, factor), q75 = greatest(q75, factor)")


def validate(con) -> dict:
    fit(con, "f_test", "snpp_k", FIT_TEST)
    h0, h1 = HELDOUT
    row = con.execute(f"""
        WITH pred AS (
            SELECT sm.uf, sm.month, sm.aqua_n AS ref, f.factor * sm.snpp_k AS est
            FROM sm JOIN f_test f ON f.uf = sm.uf AND f.month_of_year = month(sm.month)
            WHERE year(sm.month) BETWEEN {h0} AND {h1}
        ),
        state_months AS (SELECT * FROM pred WHERE ref >= {MIN_REF}),
        national AS (SELECT month, sum(ref) AS ref, sum(est) AS est FROM pred GROUP BY month),
        annual AS (SELECT uf, year(month) AS y, sum(ref) AS ref, sum(est) AS est FROM pred GROUP BY ALL HAVING sum(ref) >= {MIN_REF})
        SELECT
            (SELECT count(*) FROM state_months),
            (SELECT avg(abs(est - ref) / ref) FROM state_months),
            (SELECT avg((abs(est - ref) / ref <= 0.2)::INT) FROM state_months),
            (SELECT median(abs(est - ref) / ref) FROM state_months),
            (SELECT avg(abs(est - ref) / ref) FROM national),
            (SELECT avg((abs(est - ref) / ref <= 0.2)::INT) FROM national),
            (SELECT avg(abs(est - ref) / ref) FROM annual),
            (SELECT avg((abs(est - ref) / ref <= 0.2)::INT) FROM annual),
            (SELECT sum(est) / sum(ref) - 1 FROM pred)
    """).fetchone()
    keys = ["state_months", "mape_state_month", "share_within_20pct_state_month", "median_ape_state_month",
            "mape_national_month", "share_within_20pct_national_month",
            "mape_state_year", "share_within_20pct_state_year", "total_bias"]
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in zip(keys, row)}


def main() -> int:
    cells = config.PROCESSED / "cell_month.parquet"
    regions = config.PROCESSED / "cell_region.parquet"
    for f, cmd in ((cells, "jangada-aggregate"), (regions, "jangada-regions")):
        if not f.exists():
            sys.exit(f"missing {f.name}: run `uv run {cmd}` first")
    t0 = time.monotonic()
    con = connect()

    # One row per cell and month with each satellite in its own column.
    con.execute(f"""
        CREATE TEMP TABLE cm AS
        SELECT c.cell_lat, c.cell_lon, r.uf, c.month,
               sum(n) FILTER (WHERE satellite = 'Terra')::DOUBLE AS terra_n,
               sum(n) FILTER (WHERE satellite = 'Aqua')::DOUBLE AS aqua_n,
               sum(n_1km) FILTER (WHERE satellite = 'S-NPP')::DOUBLE AS snpp_k,
               sum(n_1km) FILTER (WHERE satellite = 'NOAA-20')::DOUBLE AS n20_k,
               sum(n_1km) FILTER (WHERE satellite = 'NOAA-21')::DOUBLE AS n21_k
        FROM '{cells}' c JOIN '{regions}' r USING (cell_lat, cell_lon)
        GROUP BY ALL
    """)
    con.execute("""
        CREATE TEMP TABLE sm AS
        SELECT uf, month,
               coalesce(sum(terra_n), 0) AS terra_n, coalesce(sum(aqua_n), 0) AS aqua_n,
               coalesce(sum(snpp_k), 0) AS snpp_k, coalesce(sum(n20_k), 0) AS n20_k, coalesce(sum(n21_k), 0) AS n21_k
        FROM cm GROUP BY ALL
    """)

    metrics = validate(con)
    log(f"held-out {HELDOUT[0]}-{HELDOUT[1]}: {json.dumps(metrics)}")

    fit(con, "f_viirs", "snpp_k", FIT_PROD)
    fit(con, "f_terra", "terra_n", FIT_TERRA)

    # g: S-NPP relative to mean(NOAA-20, NOAA-21), months where all three flew a full month.
    g, g_months = con.execute(f"""
        WITH nat AS (SELECT month, sum(snpp_k) s, sum(n20_k) a, sum(n21_k) b FROM sm GROUP BY month)
        SELECT sum(s) / sum((a + b) / 2), count(*) FROM nat
        WHERE month >= DATE '{VIIRS_FROM}' AND month < DATE '2026-11-01' AND s > 0 AND a > 0 AND b > 0
    """).fetchone()
    log(f"g (S-NPP / mean(NOAA-20, NOAA-21)) = {g:.4f} over {g_months} months")

    calibration = config.PROCESSED / "calibration.csv"
    con.execute(f"""
        COPY (
            SELECT 'viirs_snpp_k->aqua_n' AS pair, uf, month_of_year, round(factor, 5) AS factor,
                   round(factor_raw, 5) AS factor_raw, round(q25, 5) AS q25, round(q75, 5) AS q75, n_months,
                   '{FIT_PROD[0]}-{FIT_PROD[1]}' AS fit_years, '{MODEL_VERSION}' AS model_version FROM f_viirs
            UNION ALL
            SELECT 'terra_n->aqua_n', uf, month_of_year, round(factor, 5), round(factor_raw, 5), round(q25, 5),
                   round(q75, 5), n_months, '{FIT_TERRA[0]}-{FIT_TERRA[1]}', '{MODEL_VERSION}' FROM f_terra
            ORDER BY pair, uf, month_of_year
        ) TO '{calibration}' (HEADER)
    """)

    out = config.PROCESSED / "harmonized_cell_month.parquet"
    con.execute(f"""
        COPY (
            WITH v AS (
                SELECT cm.cell_lat, cm.cell_lon, cm.month,
                       CASE
                           WHEN cm.month < DATE '{AQUA_FROM}' THEN coalesce(cm.terra_n, 0) * t.factor
                           WHEN cm.month < DATE '{VIIRS_FROM}' THEN coalesce(cm.aqua_n, 0)
                           ELSE (coalesce(cm.n20_k, 0) + coalesce(cm.n21_k, 0)) / 2 * {g} * f.factor
                       END AS value,
                       CASE
                           WHEN cm.month < DATE '{AQUA_FROM}' THEN coalesce(cm.terra_n, 0) * t.q25
                           WHEN cm.month < DATE '{VIIRS_FROM}' THEN coalesce(cm.aqua_n, 0)
                           ELSE (coalesce(cm.n20_k, 0) + coalesce(cm.n21_k, 0)) / 2 * {g} * f.q25
                       END AS lo,
                       CASE
                           WHEN cm.month < DATE '{AQUA_FROM}' THEN coalesce(cm.terra_n, 0) * t.q75
                           WHEN cm.month < DATE '{VIIRS_FROM}' THEN coalesce(cm.aqua_n, 0)
                           ELSE (coalesce(cm.n20_k, 0) + coalesce(cm.n21_k, 0)) / 2 * {g} * f.q75
                       END AS hi,
                       CASE WHEN cm.month < DATE '{AQUA_FROM}' THEN 1
                            WHEN cm.month < DATE '{VIIRS_FROM}' THEN 0 ELSE 2 END AS source
                FROM cm
                JOIN f_viirs f ON f.uf = cm.uf AND f.month_of_year = month(cm.month)
                JOIN f_terra t ON t.uf = cm.uf AND t.month_of_year = month(cm.month)
            )
            SELECT cell_lat::SMALLINT AS cell_lat, cell_lon::SMALLINT AS cell_lon, month,
                   value::FLOAT AS value, lo::FLOAT AS lo, hi::FLOAT AS hi, source::TINYINT AS source
            FROM v WHERE value > 0
            ORDER BY cell_lat, cell_lon, month
        ) TO '{out}' (FORMAT parquet, COMPRESSION zstd)
    """)
    rows, bad = con.execute(f"""SELECT count(*), count(*) FILTER (WHERE NOT (lo <= value AND value <= hi) OR value < 0)
                                FROM '{out}'""").fetchone()
    if bad:
        sys.exit(f"{bad} rows break lo <= value <= hi")
    log(f"{out.name}: {rows:,} rows, {out.stat().st_size / 1e6:.1f} MB")

    report = {
        "model_version": MODEL_VERSION, "unit": "Aqua-MODIS-equivalent detections per month",
        "fit_years_viirs": f"{FIT_PROD[0]}-{FIT_PROD[1]}", "fit_years_terra": f"{FIT_TERRA[0]}-{FIT_TERRA[1]}",
        "validation": {"fit_years": f"{FIT_TEST[0]}-{FIT_TEST[1]}", "heldout_years": f"{HELDOUT[0]}-{HELDOUT[1]}",
                       "min_reference_count": MIN_REF, **metrics},
        "g_snpp_over_noaa20_noaa21": round(g, 5), "g_months": g_months,
        "segments": {"terra_scaled": f"2000-11..{AQUA_FROM[:7]} (exclusive)", "aqua_observed": f"{AQUA_FROM[:7]}..2023-12",
                     "viirs_calibrated": f"{VIIRS_FROM[:7]}.."},
        "shrinkage_m": M,
    }
    (config.PROCESSED / "harmonize_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    # Sanity view: national yearly totals, harmonized vs each sensor.
    print("\nyear   harmonized        aqua_n      snpp_k   mean(n20,n21)_k")
    for y, h, a, s, nn in con.execute(f"""
            WITH h AS (SELECT year(month) y, sum(value) h FROM '{out}' GROUP BY 1),
                 s AS (SELECT year(month) y, sum(aqua_n) a, sum(snpp_k) s, sum((n20_k + n21_k) / 2) nn FROM sm GROUP BY 1)
            SELECT y, h, a, s, nn FROM h JOIN s USING (y) WHERE y >= 2019 ORDER BY y""").fetchall():
        print(f"{y}  {h:>11,.0f}  {a:>12,.0f}  {s:>10,.0f}  {nn:>14,.0f}")
    log(f"done in {time.monotonic() - t0:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
