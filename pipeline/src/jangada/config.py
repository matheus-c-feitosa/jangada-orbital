"""Shared settings: paths, FIRMS endpoints, sensors and the FIRMS MAP_KEY."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # repo root (src/jangada/config.py -> pipeline -> root)
DATA = ROOT / "data"
RAW = DATA / "raw"
INTERIM = DATA / "interim"
PROCESSED = DATA / "processed"

FIRMS = "https://firms.modaps.eosdis.nasa.gov"
USER_AGENT = "jangada-orbital/0.1 (NASA Space Apps Challenge 2026)"

# MVP scope: Brazil. FIRMS publishes one yearly CSV per country and sensor (no key needed).
COUNTRY = "Brazil"
BBOX_BRAZIL = (-74.0, -34.0, -34.7, 5.4)  # west, south, east, north
BBOX_CEARA = (-41.5, -7.9, -37.2, -2.7)

# Yearly country files available on 2026-11-14 (checked by hand; check_access re-checks the edges).
# NOAA-21 has no yearly country files: it comes from the area API, like everything from 2026.
YEARLY = {
    "modis": (2000, 2025),        # Terra + Aqua, MODIS Collection 6.1, 1 km
    "viirs-snpp": (2012, 2025),   # Suomi NPP, 375 m (S-NPP data end on 2026-11-02)
    "viirs-jpss1": (2018, 2025),  # NOAA-20, 375 m
}

# Sources of the area API (/api/area/csv/KEY/SOURCE/west,south,east,north/DAY_RANGE/DATE), DAY_RANGE 1..5.
API_SOURCES = (
    "MODIS_SP", "MODIS_NRT",
    "VIIRS_SNPP_SP", "VIIRS_SNPP_NRT",
    "VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT",
    "VIIRS_NOAA21_SP", "VIIRS_NOAA21_NRT",
)
API_MAX_DAYS = 5


def yearly_url(sensor: str, year: int, country: str = COUNTRY) -> str:
    return f"{FIRMS}/data/country/{sensor}/{year}/{sensor}_{year}_{country}.csv"


def _read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def map_key() -> str | None:
    """FIRMS MAP_KEY from the environment or from the repo's .env file. Never print it."""
    key = os.environ.get("FIRMS_MAP_KEY") or _read_env_file(ROOT / ".env").get("FIRMS_MAP_KEY")
    return key or None


def redact(text: str, key: str | None) -> str:
    """Remove the MAP_KEY from any message before it is printed or logged."""
    return text.replace(key, "<MAP_KEY>") if key else text
