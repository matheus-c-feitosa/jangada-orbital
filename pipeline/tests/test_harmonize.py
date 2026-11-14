"""Calibration factor and shrinkage on toy data (no real data needed)."""

import pytest

from jangada.harmonize import M, fit
from jangada.normalize import connect


@pytest.fixture()
def con():
    c = connect()
    # State A: every month of 2012-2020, Aqua 50 vs source 100 (ratio 0.5).
    # State B: one month only (2012-01), Aqua 20 vs source 20 (ratio 1.0).
    c.execute("""
        CREATE TEMP TABLE sm AS
        SELECT 'A' AS uf, make_date(y, m, 1) AS month, 50.0 AS aqua_n, 100.0 AS src
        FROM range(2012, 2021) a(y), range(1, 13) b(m)
        UNION ALL SELECT 'B', DATE '2012-01-01', 20.0, 20.0
    """)
    fit(c, "f", "src", (2012, 2020))
    return c


def factor(con, uf: str, moy: int) -> float:
    return con.execute("SELECT factor FROM f WHERE uf = ? AND month_of_year = ?", [uf, moy]).fetchone()[0]


def test_well_observed_state_stays_near_its_own_ratio(con):
    nat = (9 * 50 + 20) / (9 * 100 + 20)
    assert factor(con, "A", 1) == pytest.approx((9 * 50 + M * nat) / (9 * 100 + M))


def test_sparse_state_is_pulled_toward_national(con):
    nat = (9 * 50 + 20) / (9 * 100 + 20)
    assert factor(con, "B", 1) == pytest.approx((20 + M * nat) / (20 + M))


def test_state_without_data_gets_national_factor(con):
    assert factor(con, "B", 2) == pytest.approx(0.5)


def test_every_state_and_month_has_a_factor_inside_its_band(con):
    rows = con.execute("SELECT count(*), count(*) FILTER (WHERE q25 <= factor AND factor <= q75) FROM f").fetchone()
    assert rows == (24, 24)
