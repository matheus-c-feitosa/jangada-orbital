"""Held-out error of the harmonization, by size of the reference (state-months binned by Aqua count).

  uv run jangada-strata

The headline held-out number (`jangada-harmonize`) pools every state-month with at least 20 Aqua detections. That hides
how the error depends on the count. This reports the same model (fit 2012-2020, test 2021-2022) per bin of Aqua count,
next to the share a perfect estimate would reach given only Aqua's own Poisson counting noise. Fire counts are
clustered, so the true noise is larger than Poisson: that column is an upper bound, not a target.

Read-only: it writes nothing to data/. The numbers on the Method page come from this command.
"""

from __future__ import annotations

import json
import math
import sys

from jangada import config
from jangada.harmonize import FIT_TEST, HELDOUT, MIN_REF, fit
from jangada.normalize import connect

#: (low, high) Aqua count per bin, high exclusive
BINS: list[tuple[int, float]] = [(20, 50), (50, 100), (100, 500), (500, math.inf)]
TOLERANCE = 0.2


def poisson_within(lam: float, tol: float = TOLERANCE) -> float:
    """P(|X - lam| <= tol * lam) for X ~ Poisson(lam), summing the pmf in log space."""
    if lam <= 0:
        return 0.0
    lo, hi = math.ceil(lam * (1 - tol)), math.floor(lam * (1 + tol))
    return sum(math.exp(k * math.log(lam) - lam - math.lgamma(k + 1)) for k in range(max(lo, 0), hi + 1))


def _label(low: int, high: float) -> str:
    return f">={low}" if math.isinf(high) else f"{low}-{int(high) - 1}"


def summarize(rows: list[tuple[float, float]]) -> list[dict]:
    """`rows` are (reference, estimate) pairs. One dict for all rows, then one per bin of the reference."""
    groups = [("all", rows)] + [(_label(a, b), [r for r in rows if a <= r[0] < b]) for a, b in BINS]
    out = []
    for name, g in groups:
        if not g:
            continue
        errors = sorted(abs(est - ref) / ref for ref, est in g)
        out.append({
            "aqua_count": name,
            "state_months": len(g),
            "within_20pct": round(sum(e <= TOLERANCE for e in errors) / len(g), 3),
            "perfect_estimate_within_20pct": round(sum(poisson_within(ref) for ref, _ in g) / len(g), 3),
            "mean_abs_error": round(sum(errors) / len(g), 3),
            "median_abs_error": round(errors[len(errors) // 2], 3),
            "bias": round(sum(est for _, est in g) / sum(ref for ref, _ in g) - 1, 3),
        })
    return out


def heldout_pairs(con) -> list[tuple[float, float]]:
    """(Aqua count, estimate from S-NPP) per held-out state-month, built exactly as in `jangada.harmonize`."""
    cells = config.PROCESSED / "cell_month.parquet"
    regions = config.PROCESSED / "cell_region.parquet"
    con.execute(f"""
        CREATE TEMP TABLE cm AS
        SELECT r.uf, c.month,
               sum(n) FILTER (WHERE satellite = 'Aqua')::DOUBLE AS aqua_n,
               sum(n_1km) FILTER (WHERE satellite = 'S-NPP')::DOUBLE AS snpp_k
        FROM '{cells}' c JOIN '{regions}' r USING (cell_lat, cell_lon)
        GROUP BY ALL
    """)
    con.execute("""
        CREATE TEMP TABLE sm AS
        SELECT uf, month, coalesce(sum(aqua_n), 0) AS aqua_n, coalesce(sum(snpp_k), 0) AS snpp_k
        FROM cm GROUP BY ALL
    """)
    fit(con, "f_test", "snpp_k", FIT_TEST)
    h0, h1 = HELDOUT
    return con.execute(f"""
        SELECT sm.aqua_n, f.factor * sm.snpp_k
        FROM sm JOIN f_test f ON f.uf = sm.uf AND f.month_of_year = month(sm.month)
        WHERE year(sm.month) BETWEEN {h0} AND {h1} AND sm.aqua_n >= {MIN_REF}
    """).fetchall()


def main() -> int:
    for f, cmd in (("cell_month.parquet", "jangada-aggregate"), ("cell_region.parquet", "jangada-regions")):
        if not (config.PROCESSED / f).exists():
            sys.exit(f"missing {f}: run `uv run {cmd}` first")
    print(json.dumps({"fit_years": f"{FIT_TEST[0]}-{FIT_TEST[1]}", "heldout_years": f"{HELDOUT[0]}-{HELDOUT[1]}",
                      "min_reference_count": MIN_REF, "strata": summarize(heldout_pairs(connect()))}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
