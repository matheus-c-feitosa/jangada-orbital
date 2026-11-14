"""Offline unit tests for the pipeline.

No network, no FIRMS MAP_KEY and no data files needed: these run on any machine in
under a second, so CI and every collaborator can run them before touching the data.

Run from pipeline/:

    uv run pytest
"""

from __future__ import annotations

import io
import urllib.error

import pytest

from jangada import check_access, config, probe_api


@pytest.fixture(autouse=True)
def reset_results():
    """check_access keeps a module-level results list; start and end each test clean."""
    check_access.results.clear()
    yield
    check_access.results.clear()


@pytest.fixture
def repo_root(tmp_path, monkeypatch):
    """Point config.ROOT at an empty temp dir, so the real .env is never read."""
    monkeypatch.setattr(config, "ROOT", tmp_path)
    monkeypatch.delenv("FIRMS_MAP_KEY", raising=False)
    return tmp_path


# --- URLs and scope ---------------------------------------------------------------


def test_yearly_url_uses_sensor_year_and_country():
    assert config.yearly_url("viirs-snpp", 2020) == (
        "https://firms.modaps.eosdis.nasa.gov/data/country/"
        "viirs-snpp/2020/viirs-snpp_2020_Brazil.csv"
    )


def test_yearly_url_accepts_another_country():
    assert config.yearly_url("modis", 2001, country="Peru").endswith("modis_2001_Peru.csv")


def test_bbox_brazil_has_valid_geographic_order():
    west, south, east, north = config.BBOX_BRAZIL
    assert -180 <= west < east <= 180
    assert -90 <= south < north <= 90


def test_bbox_ceara_sits_inside_brazil():
    bw, bs, be, bn = config.BBOX_BRAZIL
    cw, cs, ce, cn = config.BBOX_CEARA
    assert bw <= cw < ce <= be
    assert bs <= cs < cn <= bn


def test_api_sources_list_the_eight_firms_products_once():
    assert len(config.API_SOURCES) == 8
    assert len(set(config.API_SOURCES)) == 8
    assert all(source.endswith(("_SP", "_NRT")) for source in config.API_SOURCES)


def test_api_day_range_stays_within_the_firms_limit():
    assert config.API_MAX_DAYS == 5


# --- .env parsing and MAP_KEY lookup ----------------------------------------------


def test_read_env_file_ignores_comments_blank_lines_and_quotes(tmp_path):
    env = tmp_path / ".env"
    env.write_text(
        "# comment\n\nFIRMS_MAP_KEY=abc123\nOTHER='quoted'\nBROKEN_LINE\n",
        encoding="utf-8",
    )
    assert config._read_env_file(env) == {"FIRMS_MAP_KEY": "abc123", "OTHER": "quoted"}


def test_read_env_file_missing_returns_empty(tmp_path):
    assert config._read_env_file(tmp_path / "absent.env") == {}


def test_map_key_prefers_environment_over_dot_env(repo_root, monkeypatch):
    monkeypatch.setenv("FIRMS_MAP_KEY", "from-env")
    (repo_root / ".env").write_text("FIRMS_MAP_KEY=from-file\n", encoding="utf-8")
    assert config.map_key() == "from-env"


def test_map_key_falls_back_to_dot_env(repo_root):
    (repo_root / ".env").write_text("FIRMS_MAP_KEY=from-file\n", encoding="utf-8")
    assert config.map_key() == "from-file"


def test_map_key_is_none_without_environment_or_file(repo_root):
    assert config.map_key() is None


def test_redact_hides_every_occurrence_of_the_key():
    hidden = config.redact("csv/SECRETKEY/MODIS_SP -> SECRETKEY", "SECRETKEY")
    assert "SECRETKEY" not in hidden
    assert hidden.count("<MAP_KEY>") == 2


def test_redact_without_key_leaves_text_untouched():
    assert config.redact("nothing to hide", None) == "nothing to hide"


# --- fetch/report behaviour (network simulated, never called) ---------------------


def test_report_records_status_and_prints_it(capsys):
    check_access.report(check_access.WARN, "disk", "low")
    assert check_access.results == [(check_access.WARN, "disk", "low")]
    assert "[warn] disk: low" in capsys.readouterr().out


def test_fetch_turns_an_http_error_into_its_status_code(monkeypatch):
    def raise_404(*_args, **_kwargs):
        raise urllib.error.HTTPError("http://x", 404, "Not Found", hdrs=None, fp=io.BytesIO(b""))

    monkeypatch.setattr(check_access.urllib.request, "urlopen", raise_404)
    status, body, headers = check_access.fetch("http://x")
    assert (status, body, headers) == (404, b"", {})


def test_fetch_reports_a_dead_network_as_status_zero(monkeypatch):
    def raise_urlerror(*_args, **_kwargs):
        raise urllib.error.URLError("dns failure")

    monkeypatch.setattr(check_access.urllib.request, "urlopen", raise_urlerror)
    status, body, _ = check_access.fetch("http://x")
    assert status == 0
    assert b"dns failure" in body


# --- probe helpers ----------------------------------------------------------------


def test_probe_bbox_joins_coordinates_with_commas():
    assert probe_api.bbox((-41.5, -7.9, -37.2, -2.7)) == "-41.5,-7.9,-37.2,-2.7"
