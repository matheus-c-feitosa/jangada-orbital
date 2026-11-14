"""Write the web app's data files (contract: specs/001-harmonized-fire-calendar/contracts/web-data-files.md).

  uv run jangada-export-web   -> web/public/data/{manifest.json, series.json, states.geojson,
                                                  observed.parquet, harmonized.parquet}

Files are sorted by (cell_lat, cell_lon, month) with ~100k-row groups, so the browser fetches only the row groups
an area needs; Snappy compression, which hyparquet decodes without extra codecs. Each file must stay at or under 50 MB.
GitHub Pages gzips .parquet responses, which breaks HTTP range requests, so the browser reads tiles/ instead:
one small Parquet per 2° x 2° tile and kind (h = harmonized, o = observed), fetched whole. The two big files stay
published as the downloadable dataset.
series.json precomputes Brazil and the 27 states, so the first screen and the state picker need no Parquet at all.
"""

from __future__ import annotations

import calendar
import hashlib
import json
import sys
import time
from datetime import date

from jangada import config
from jangada.normalize import connect
from jangada.regions import UF_CODES, load_states

WEB_DATA = config.ROOT / "web" / "public" / "data"
SCHEMA = 1
MAX_BYTES = 50 * 1024 * 1024
ROW_GROUP = 100_000
TILE_CELLS = 20  # 2 degrees = 20 cells of 0.1 degree
SATELLITES = ["Terra", "Aqua", "S-NPP", "NOAA-20", "NOAA-21"]  # index = code in observed.parquet
VIIRS = ("S-NPP", "NOAA-20", "NOAA-21")
UF_NAMES = {
    "RO": "Rondônia", "AC": "Acre", "AM": "Amazonas", "RR": "Roraima", "PA": "Pará", "AP": "Amapá", "TO": "Tocantins",
    "MA": "Maranhão", "PI": "Piauí", "CE": "Ceará", "RN": "Rio Grande do Norte", "PB": "Paraíba", "PE": "Pernambuco",
    "AL": "Alagoas", "SE": "Sergipe", "BA": "Bahia", "MG": "Minas Gerais", "ES": "Espírito Santo",
    "RJ": "Rio de Janeiro", "SP": "São Paulo", "PR": "Paraná", "SC": "Santa Catarina", "RS": "Rio Grande do Sul",
    "MS": "Mato Grosso do Sul", "MT": "Mato Grosso", "GO": "Goiás", "DF": "Distrito Federal",
}
assert set(UF_NAMES) == set(UF_CODES.values())


def write_series(con, cells, harmonized, regions, out) -> dict:
    """Monthly series for Brazil and each state: harmonized value/lo/hi, observed n per satellite, VIIRS ~1 km sum.

    Arrays are aligned to `months`. Observed values are null when the satellite was not flying that month anywhere
    in Brazil, and 0 when it flew and detected nothing in the area (CSV contract: empty vs 0).
    """
    months = [r[0] for r in con.execute(f"SELECT DISTINCT month FROM '{harmonized}' ORDER BY 1").fetchall()]
    index = {m: i for i, m in enumerate(months)}
    flying = {(s, m) for s, m in con.execute(f"SELECT DISTINCT satellite, month FROM '{cells}'").fetchall()}
    source = {m: s for m, s in con.execute(f"SELECT month, max(source) FROM '{harmonized}' GROUP BY 1").fetchall()}

    def empty(fill=0.0):
        return [fill] * len(months)

    areas = {"BR": {"name": "Brazil"}}
    areas.update({uf: {"name": UF_NAMES[uf]} for uf in sorted(UF_NAMES)})
    for area in areas.values():
        area.update(value=empty(), lo=empty(), hi=empty(),
                    observed={s: [0 if (s, m) in flying else None for m in months] for s in SATELLITES},
                    viirs_k=empty(0))
    rows = con.execute(f"""SELECT r.uf, h.month, sum(h.value), sum(h.lo), sum(h.hi)
                           FROM '{harmonized}' h JOIN '{regions}' r USING (cell_lat, cell_lon) GROUP BY ALL""").fetchall()
    for uf, m, v, lo, hi in rows:
        for key in (uf, "BR"):
            a, i = areas[key], index[m]
            a["value"][i] += v; a["lo"][i] += lo; a["hi"][i] += hi
    rows = con.execute(f"""SELECT r.uf, c.month, c.satellite, sum(c.n), sum(c.n_1km)
                           FROM '{cells}' c JOIN '{regions}' r USING (cell_lat, cell_lon)
                           WHERE c.month >= DATE '{months[0].isoformat()}' GROUP BY ALL""").fetchall()
    for uf, m, sat, n, k in rows:
        for key in (uf, "BR"):
            a, i = areas[key], index[m]
            a["observed"][sat][i] += int(n)
            if sat in VIIRS:
                a["viirs_k"][i] += int(k)
    for a in areas.values():
        for key in ("value", "lo", "hi"):
            a[key] = [round(x, 1) for x in a[key]]
    for code, km2 in area_km2(con).items():
        areas[code]["area_km2"] = km2
    doc = {"months": [m.isoformat()[:7] for m in months], "source": [int(source.get(m, 0)) for m in months],
           "satellites": SATELLITES, "areas": areas}
    out.write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    return doc


def write_tiles(con, cells, harmonized, codes) -> list[str]:
    """One harmonized and one observed Parquet per 2-degree tile; returns the tile ids "<ty>_<tx>"."""
    out = WEB_DATA / "tiles"
    if out.exists():
        for f in out.glob("*.parquet"):
            f.unlink()
    out.mkdir(parents=True, exist_ok=True)
    ids = con.execute(f"""SELECT DISTINCT floor(cell_lat / {TILE_CELLS})::INT, floor(cell_lon / {TILE_CELLS})::INT
                          FROM '{cells}' ORDER BY 1, 2""").fetchall()
    for ty, tx in ids:
        where = f"floor(cell_lat / {TILE_CELLS}) = {ty} AND floor(cell_lon / {TILE_CELLS}) = {tx}"
        con.execute(f"""COPY (SELECT cell_lat::SMALLINT AS cell_lat, cell_lon::SMALLINT AS cell_lon, month,
                                     (CASE satellite {codes} END)::TINYINT AS satellite, n::INTEGER AS n, n_1km::INTEGER AS n_1km
                              FROM '{cells}' WHERE {where} ORDER BY cell_lat, cell_lon, month)
                        TO '{out}/o_{ty}_{tx}.parquet' (FORMAT parquet, COMPRESSION snappy)""")
        con.execute(f"""COPY (SELECT * FROM '{harmonized}' WHERE {where} ORDER BY cell_lat, cell_lon, month)
                        TO '{out}/h_{ty}_{tx}.parquet' (FORMAT parquet, COMPRESSION snappy)""")
    return [f"{ty}_{tx}" for ty, tx in ids]


def area_km2(con) -> dict[str, float]:
    """Geodesic areas (WGS84 ellipsoid) of Brazil and each state from the IBGE outlines, for densities (T048)."""
    from jangada.download import load_border
    border = load_border(con)
    con.execute("SET geometry_always_xy = true")  # GeoJSON is lon/lat
    areas = {"BR": con.execute(f"SELECT ST_Area_Spheroid({border}) / 1e6").fetchone()[0]}
    for uf, geometry in load_states().items():
        areas[uf] = con.execute(f"SELECT ST_Area_Spheroid(ST_GeomFromGeoJSON('{geometry}')) / 1e6").fetchone()[0]
    return {k: round(v, 1) for k, v in areas.items()}


def write_states(con, out) -> int:
    """Simplified IBGE state outlines (map highlight and offline fallback) with code, name and bounding box."""
    con.execute("INSTALL spatial")
    con.execute("LOAD spatial")
    features = []
    for uf, geometry in sorted(load_states().items()):
        geo, bbox = con.execute(f"""
            WITH g AS (SELECT ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON('{geometry}'), 0.01) AS g)
            SELECT ST_AsGeoJSON(g), [ST_XMin(g), ST_YMin(g), ST_XMax(g), ST_YMax(g)] FROM g""").fetchone()
        features.append({"type": "Feature", "properties": {"uf": uf, "name": UF_NAMES[uf],
                                                           "bbox": [round(x, 3) for x in bbox]},
                         "geometry": json.loads(geo)})
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"),
                              ensure_ascii=False), encoding="utf-8")
    return len(features)


def log(message: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {message}", flush=True)


def sha256(path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    cells = config.PROCESSED / "cell_month.parquet"
    harmonized = config.PROCESSED / "harmonized_cell_month.parquet"
    report_file = config.PROCESSED / "harmonize_report.json"
    for f, cmd in ((cells, "jangada-aggregate"), (harmonized, "jangada-harmonize"), (report_file, "jangada-harmonize")):
        if not f.exists():
            sys.exit(f"missing {f.name}: run `uv run {cmd}` first")
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    t0 = time.monotonic()
    con = connect()
    # Byte-identical output for identical data (no churn in git, e.g. from the daily update): one writer thread,
    # insertion order kept.
    con.execute("SET threads = 1")
    con.execute("SET preserve_insertion_order = true")

    codes = " ".join(f"WHEN '{s}' THEN {i}" for i, s in enumerate(SATELLITES))
    files = {
        "observed": f"""SELECT cell_lat::SMALLINT AS cell_lat, cell_lon::SMALLINT AS cell_lon, month,
                               (CASE satellite {codes} END)::TINYINT AS satellite, n::INTEGER AS n, n_1km::INTEGER AS n_1km
                        FROM '{cells}' ORDER BY cell_lat, cell_lon, month, satellite""",
        "harmonized": f"SELECT * FROM '{harmonized}' ORDER BY cell_lat, cell_lon, month",
    }
    entries = {}
    for name, query in files.items():
        out = WEB_DATA / f"{name}.parquet"
        part = out.with_name(out.name + ".part")
        con.execute(f"COPY ({query}) TO '{part}' (FORMAT parquet, COMPRESSION snappy, ROW_GROUP_SIZE {ROW_GROUP})")
        part.rename(out)
        size = out.stat().st_size
        rows = con.execute(f"SELECT count(*) FROM '{out}'").fetchone()[0]
        if size > MAX_BYTES:
            sys.exit(f"{out.name} is {size / 1e6:.1f} MB, over the 50 MB limit")
        entries[name] = {"path": out.name, "bytes": size, "rows": rows, "sha256": sha256(out)}
        log(f"{out.name}: {rows:,} rows, {size / 1e6:.1f} MB")

    tiles = write_tiles(con, cells, harmonized, codes)
    tiles_info = {"path": "tiles/", "deg": TILE_CELLS / 10, "cells": TILE_CELLS, "ids": tiles}
    log(f"tiles/: {len(tiles)} tiles x 2 files")

    regions = config.PROCESSED / "cell_region.parquet"
    if not regions.exists():
        sys.exit("missing cell_region.parquet: run `uv run jangada-regions` first")
    series_file, states_file = WEB_DATA / "series.json", WEB_DATA / "states.geojson"
    doc = write_series(con, cells, harmonized, regions, series_file)
    n_states = write_states(con, states_file)
    for name, f in (("series", series_file), ("states", states_file)):
        entries[name] = {"path": f.name, "bytes": f.stat().st_size, "sha256": sha256(f)}
        log(f"{f.name}: {f.stat().st_size / 1e3:.0f} KB")
    log(f"series.json: {len(doc['areas'])} areas x {len(doc['months'])} months; states.geojson: {n_states} states")

    data_date = con.execute(
        f"SELECT max(acq_date) FROM read_parquet('{config.POINTS}/*.parquet', union_by_name = true)").fetchone()[0]
    first_month, last_month = con.execute(f"SELECT min(month), max(month) FROM '{harmonized}'").fetchone()
    report = json.loads(report_file.read_text(encoding="utf-8"))
    validation = report["validation"]
    days_in_month = calendar.monthrange(last_month.year, last_month.month)[1]
    # Near-real-time data for the export day is still arriving: count only complete days in the pro-rata comparison.
    last_day_partial = data_date >= date.today()
    complete_days = data_date.day - (1 if last_day_partial else 0)
    manifest = {
        "schema": SCHEMA,
        "data_version": date.today().isoformat(),
        "data_date": data_date.isoformat(),
        "model_version": report["model_version"],
        "unit": report["unit"],
        "grid_deg": 0.1,
        "first_month": first_month.isoformat(),
        "last_month": last_month.isoformat(),
        "last_month_days": max(1, complete_days) if (data_date.year, data_date.month) == (last_month.year, last_month.month)
        else days_in_month,
        "last_day_partial": last_day_partial,
        "files": entries,
        "tiles": tiles_info,
        "satellites": SATELLITES,
        "sources": {"0": "aqua_observed", "1": "terra_scaled", "2": "viirs_calibrated"},
        "segments": report["segments"],
        "validation": {
            "heldout_years": validation["heldout_years"],
            "mape_state": validation["mape_state_month"],
            "share_within_20pct": validation["share_within_20pct_state_month"],
            "mape_national_month": validation["mape_national_month"],
            "share_within_20pct_state_year": validation["share_within_20pct_state_year"],
        },
    }
    (WEB_DATA / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    log(f"manifest.json: data_date {manifest['data_date']}, last_month {manifest['last_month']} "
        f"({manifest['last_month_days']} days) in {time.monotonic() - t0:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
