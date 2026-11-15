"""Stratified held-out error: the pure parts, on toy numbers (no real data needed)."""

import math

import pytest

from jangada.strata import poisson_within, summarize


def test_poisson_noise_floor_grows_with_the_count():
    # sd = sqrt(lam): +-20% is ~0.9 sd at lam=20 and ~2 sd at lam=100, so a perfect estimate lands inside far more often.
    assert poisson_within(20) < poisson_within(100) < poisson_within(1000)
    assert poisson_within(1000) == pytest.approx(1.0, abs=1e-6)
    assert 0.6 < poisson_within(20) < 0.9


def test_poisson_noise_floor_edge_cases():
    assert poisson_within(0) == 0.0
    assert 0.0 <= poisson_within(1) <= 1.0


def test_summarize_bins_and_metrics():
    rows = [
        (20.0, 20.0),    # exact, bin 20-49
        (40.0, 60.0),    # +50%, bin 20-49
        (100.0, 110.0),  # +10%, bin 100-499
        (600.0, 480.0),  # -20%, bin >=500 (exactly on the tolerance: counts as within)
        (600.0, 300.0),  # -50%, bin >=500
    ]
    by_bin = {s["aqua_count"]: s for s in summarize(rows)}
    assert set(by_bin) == {"all", "20-49", "100-499", ">=500"}  # empty bins are left out
    assert by_bin["all"]["state_months"] == 5
    assert by_bin["20-49"]["within_20pct"] == 0.5
    assert by_bin["20-49"]["bias"] == pytest.approx((80 / 60) - 1, abs=1e-3)
    assert by_bin[">=500"]["within_20pct"] == 0.5
    assert by_bin[">=500"]["mean_abs_error"] == pytest.approx(0.35)
    assert math.isclose(by_bin["all"]["within_20pct"], 3 / 5)
