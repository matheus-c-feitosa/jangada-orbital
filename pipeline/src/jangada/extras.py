"""Extra web data for spec 002 (new data and charts), derived from the published web data and public sources.

  uv run jangada-extras all            every step below, in order
  uv run jangada-extras biomes         IBGE biomes: outlines + monthly series per biome (FR-028)
  uv run jangada-extras recurrence     years with fire per 0.1-degree cell, 2001 to the last complete year (FR-022)
  uv run jangada-extras municipalities this year so far per municipality, for the ranking (FR-024)
  uv run jangada-extras validation     predicted vs observed Aqua on the held-out months (FR-027)
  uv run jangada-extras oni            El Nino / La Nina years from the NOAA ONI index (FR-031)
  uv run jangada-extras recent         FIRMS last-7-days detections per cell, in Aqua-MODIS units (FR-029)
  uv run jangada-extras intensity      FRP and night share per area and year, per sensor family (FR-025)
  uv run jangada-extras overpass       median local overpass time of Aqua, Terra and VIIRS per year (FR-027)

Inputs: web/public/data/{harmonized,observed}.parquet and series.json (written by jangada-export-web), the
normalized FIRMS points in data/interim/points/ (jangada-download yearly; only for intensity, overpass, recent),
and public files cached in data/raw/extras/: IBGE biomes (1:250,000), NOAA CPC ONI, FIRMS 7-day CSVs. No key needed.
Every output is listed in manifest.json with its size and SHA-256.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import zipfile
from datetime import date
from pathlib import Path

from jangada import config
from jangada.download import download_file
from jangada.export_web import UF_NAMES, WEB_DATA, sha256
from jangada.normalize import connect, read_csv_expr, select_for
from jangada.regions import STATES, load_states

EXTRAS = config.RAW / "extras"
HARMONIZED = WEB_DATA / "harmonized.parquet"
OBSERVED = WEB_DATA / "observed.parquet"
SERIES = WEB_DATA / "series.json"
MANIFEST = WEB_DATA / "manifest.json"
# 0.01-degree cells where FIRMS flagged static sources (types 2 and 3: volcanoes, industry, gas flares) in the archive
STATIC_SOURCES = Path(__file__).with_name("static_sources.parquet")

BIOMES_URL = "https://geoftp.ibge.gov.br/informacoes_ambientais/estudos_ambientais/biomas/vetores/Biomas_250mil.zip"
# CD_Bioma of the IBGE file -> id used by the app, official name
BIOMES = {
    1: ("amazonia", "Amazônia"), 2: ("caatinga", "Caatinga"), 3: ("cerrado", "Cerrado"),
    4: ("mata_atlantica", "Mata Atlântica"), 5: ("pampa", "Pampa"), 6: ("pantanal", "Pantanal"),
}
ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
RECENT_URLS = {
    "MODIS": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_South_America_7d.csv",
    "S-NPP": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_America_7d.csv",
    "NOAA-20": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_7d.csv",
    "NOAA-21": "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_America_7d.csv",
}
SAT_CODE = {"Terra": 0, "Aqua": 1, "S-NPP": 2, "NOAA-20": 3, "NOAA-21": 4}

FIRE_MIN = 0.5            # Aqua-MODIS-equivalent detections for a cell-year to count as "had fire" (recurrence)
MIN_HISTORY = 5           # previous complete years needed for a percentile
FIRST_YEAR = 2001         # first complete year of the series (it starts in November 2000)
SIMPLIFY_BIOMES = 0.01    # degrees (~1 km): the biome outline is a map overlay, the cells carry the statistics
SMALL_SAMPLE = 20         # detections; below this an FRP median is flagged as a small sample
USUAL_YEARS = (2003, 2023)  # complete Aqua years: "more than usual" compares with the same month of these years


def log(message: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {message}", flush=True)


def need(path, hint: str) -> None:
    if not path.exists():
        sys.exit(f"missing {path}: {hint}")


def cached(url: str, name: str):
    path = EXTRAS / name
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        download_file(url, path)
        log(f"downloaded {name} ({path.stat().st_size / 1e6:.1f} MB)")
    return path


def write_json(name: str, doc) -> None:
    out = WEB_DATA / name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    key = name.rsplit(".", 1)[0].replace("/", "_")
    manifest["files"][key] = {"path": name, "bytes": out.stat().st_size, "sha256": sha256(out)}
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"{name}: {out.stat().st_size / 1e3:.0f} KB")


def manifest_dates() -> tuple[str, int, str]:
    """(last month "YYYY-MM", days of data in it, data date)."""
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return m["last_month"][:7], int(m["last_month_days"]), m["data_date"]


def spatial(con) -> None:
    con.execute("INSTALL spatial")
    con.execute("LOAD spatial")
    con.execute("SET geometry_always_xy = true")


def assign_cells(con, polygons: str, table: str) -> None:
    """Table `table` (cell_lat, cell_lon, code): the polygon of `polygons` (code, geom) that contains each cell centre;
    cells whose centre is outside every polygon (coast, border) take the nearest one."""
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE {table} AS
        WITH cells AS (SELECT DISTINCT cell_lat, cell_lon,
                              ST_Point((cell_lon + 0.5) / 10, (cell_lat + 0.5) / 10) AS pt FROM '{HARMONIZED}'),
        inside AS (SELECT c.cell_lat, c.cell_lon, min(p.code) AS code
                   FROM cells c JOIN {polygons} p ON ST_Contains(p.geom, c.pt) GROUP BY ALL),
        outside AS (SELECT c.* FROM cells c ANTI JOIN inside i USING (cell_lat, cell_lon)),
        nearest AS (SELECT o.cell_lat, o.cell_lon, arg_min(p.code, ST_Distance(p.geom, o.pt)) AS code
                    FROM outside o CROSS JOIN {polygons} p GROUP BY ALL)
        SELECT * FROM inside UNION ALL SELECT * FROM nearest
    """)


def ytd_standing(series: dict[str, float], last_month: str, days: int) -> dict | None:
    """This year since January against the same date of previous complete years (same rule as the web app)."""
    year, upto = int(last_month[:4]), int(last_month[5:7])
    dim = (date(year + (upto == 12), upto % 12 + 1, 1) - date(year, upto, 1)).days
    fraction = min(1.0, days / dim)

    def to_date(y: int) -> float:
        total = 0.0
        for m in range(1, upto + 1):
            v = series.get(f"{y}-{m:02d}", 0.0)
            total += v * (fraction if (m == upto and y != year) else 1.0)
        return total

    # every complete year since 2001, as in the web rule: a year with no detections in the area counts as zero
    history = [to_date(y) for y in range(FIRST_YEAR, year)]
    if len(history) < MIN_HISTORY:
        return None
    current = to_date(year)
    below = sum(h < current for h in history)
    ties = sum(h == current for h in history)
    return {"ytd": round(current, 1), "percentile": round(100 * (below + ties / 2) / len(history)),
            "first": FIRST_YEAR, "last": year - 1}


# ---------------------------------------------------------------- biomes

def biomes(con) -> None:
    spatial(con)
    shp = cached(BIOMES_URL, "Biomas_250mil.zip")
    name = next(n for n in zipfile.ZipFile(shp).namelist() if n.endswith(".shp"))
    con.execute(f"""CREATE OR REPLACE TEMP TABLE bio AS
                    SELECT CD_Bioma::INT AS code, geom FROM ST_Read('/vsizip/{shp.as_posix()}/{name}')""")
    codes = {r[0] for r in con.execute("SELECT code FROM bio").fetchall()}
    if codes != set(BIOMES):
        sys.exit(f"unexpected biome codes {sorted(codes)}")
    assign_cells(con, "bio", "cell_biome")

    # outlines for the map: simplified, with id, name and bounding box
    features = []
    for code, geo, bbox, km2 in con.execute(f"""
            SELECT code, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, {SIMPLIFY_BIOMES})),
                   [ST_XMin(geom), ST_YMin(geom), ST_XMax(geom), ST_YMax(geom)], ST_Area_Spheroid(geom) / 1e6
            FROM bio ORDER BY code""").fetchall():
        bid, bname = BIOMES[code]
        g = json.loads(geo)
        features.append({"type": "Feature", "properties": {"id": bid, "name": bname, "bbox": [round(x, 3) for x in bbox],
                                                           "area_km2": round(km2, 1)},
                         "geometry": round_geometry(g)})
    write_json("biomes.geojson", {"type": "FeatureCollection", "features": features})

    # monthly series per biome, in the shape of series.json areas
    doc = json.loads(SERIES.read_text(encoding="utf-8"))
    months = doc["months"]
    index = {m: i for i, m in enumerate(months)}
    flying = {(s, m) for s, m in con.execute(f"SELECT DISTINCT satellite, strftime(month, '%Y-%m') FROM '{OBSERVED}'").fetchall()}
    sats = doc["satellites"]
    areas = {}
    for code, (bid, bname) in BIOMES.items():
        km2 = next(f["properties"]["area_km2"] for f in features if f["properties"]["id"] == bid)
        areas[bid] = {"name": bname, "value": [0.0] * len(months), "lo": [0.0] * len(months), "hi": [0.0] * len(months),
                      "observed": {s: [0 if (i, m) in flying else None for m in months] for i, s in enumerate(sats)},
                      "viirs_k": [0] * len(months), "area_km2": km2}
    for code, m, v, lo, hi in con.execute(f"""
            SELECT b.code, strftime(h.month, '%Y-%m'), sum(h.value), sum(h.lo), sum(h.hi)
            FROM '{HARMONIZED}' h JOIN cell_biome b USING (cell_lat, cell_lon) GROUP BY ALL""").fetchall():
        if m in index:
            a, i = areas[BIOMES[code][0]], index[m]
            a["value"][i] += v; a["lo"][i] += lo; a["hi"][i] += hi
    for code, m, sat, n, k in con.execute(f"""
            SELECT b.code, strftime(o.month, '%Y-%m'), o.satellite, sum(o.n), sum(o.n_1km)
            FROM '{OBSERVED}' o JOIN cell_biome b USING (cell_lat, cell_lon) GROUP BY ALL""").fetchall():
        if m in index:
            a, i = areas[BIOMES[code][0]], index[m]
            a["observed"][sats[sat]][i] = (a["observed"][sats[sat]][i] or 0) + int(n)
            if sat >= 2:
                a["viirs_k"][i] += int(k)
    for a in areas.values():
        for key in ("value", "lo", "hi"):
            a[key] = [round(x, 1) for x in a[key]]
    write_json("biome_series.json", {"months": months, "source": doc["source"], "satellites": sats, "areas": areas})

    # check: the biomes add up to Brazil (every cell belongs to exactly one biome)
    total = sum(sum(a["value"]) for a in areas.values())
    brazil = sum(doc["areas"]["BR"]["value"])
    log(f"biomes: sum {total:,.0f} vs Brazil {brazil:,.0f} ({100 * (total / brazil - 1):+.3f}%)")


OUTLINE_DECIMALS = 3      # ~110 m, well below the SIMPLIFY_BIOMES tolerance; 4 decimals cost 20% more on the first screen


def round_geometry(g: dict, nd: int = OUTLINE_DECIMALS) -> dict:
    """A Polygon or MultiPolygon with coordinates rounded to `nd` decimals. A point that rounds onto the previous one
    is dropped, and so is a hole (or a part) that rounds to fewer than four points. Neighbouring biomes share their
    border vertices, and equal inputs round to equal outputs, so the shared borders stay shared (the map draws them
    dashed, see web/src/geo/edges.ts)."""
    def ring(r):
        out = []
        for x, y in r:
            q = [round(x, nd), round(y, nd)]
            if not out or out[-1] != q:
                out.append(q)
        return out

    def polygon(rings):
        rs = [ring(r) for r in rings]
        if len(rs[0]) < 4:
            return None
        return [rs[0]] + [r for r in rs[1:] if len(r) >= 4]

    if g["type"] == "Polygon":
        p = polygon(g["coordinates"])
        return {"type": "Polygon", "coordinates": p} if p else g
    parts = [p for p in (polygon(q) for q in g["coordinates"]) if p]
    return {"type": "MultiPolygon", "coordinates": parts} if parts else g


# ---------------------------------------------------------------- recurrence

def recurrence(con) -> None:
    last_month, days, _ = manifest_dates()
    year = int(last_month[:4])
    last = year - 1 if not (last_month.endswith("-12") and days >= 31) else year
    first = 2001
    rows = con.execute(f"""
        WITH y AS (SELECT cell_lat, cell_lon, year(month) AS y, sum(value) AS v FROM '{HARMONIZED}'
                   WHERE year(month) BETWEEN {first} AND {last} GROUP BY ALL HAVING sum(value) >= {FIRE_MIN})
        SELECT cell_lat, cell_lon, sum(1::BIGINT << (y - {first}))::BIGINT AS mask
        FROM y GROUP BY ALL ORDER BY cell_lat, cell_lon""").fetchall()
    write_json("recurrence.json", {"grid_deg": 0.1, "first": first, "last": last, "threshold": FIRE_MIN,
                                   "encoding": "rows[cell_lat] = 'dlon.mask,...': dlon = cell_lon minus the previous "
                                               "cell's (the first is absolute), mask in base 36, bit 0 = first year",
                                   "rows": encode_rows(rows)})
    log(f"recurrence: {len(rows):,} cells with fire in at least one year {first}-{last}")


def _b36(n: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while True:
        n, r = divmod(n, 36)
        out = digits[r] + out
        if not n:
            return out


def encode_rows(rows) -> dict[str, str]:
    """[(cell_lat, cell_lon, mask)] sorted by lat, lon -> {cell_lat: "dlon.mask36,..."} (about a third of plain JSON)."""
    out: dict[str, list[str]] = {}
    prev: dict[int, int] = {}
    for la, lo, m in rows:
        d = lo - prev[la] if la in prev else lo
        prev[la] = lo
        out.setdefault(str(la), []).append(f"{d}.{_b36(int(m))}")
    return {k: ",".join(v) for k, v in out.items()}


# ---------------------------------------------------------------- municipalities

def municipalities(con) -> None:
    spatial(con)
    folder = WEB_DATA / "municipalities"
    need(folder / "index.json", "run `uv run jangada-municipalities` first")
    rows = []
    for f in sorted(folder.glob("*.geojson")):
        for feat in json.loads(f.read_text(encoding="utf-8"))["features"]:
            p = feat["properties"]
            rows.append((p["id"], p["name"], p["uf"], json.dumps(feat["geometry"])))
    con.execute("CREATE OR REPLACE TEMP TABLE mun_raw AS SELECT unnest(?) AS id, unnest(?) AS name, unnest(?) AS uf, unnest(?) AS g",
                [[r[0] for r in rows], [r[1] for r in rows], [r[2] for r in rows], [r[3] for r in rows]])
    con.execute("""CREATE OR REPLACE TEMP TABLE mun AS
                   SELECT row_number() OVER (ORDER BY id) AS code, id, name, uf, ST_GeomFromGeoJSON(g) AS geom FROM mun_raw""")
    # municipalities use only cells whose centre is inside them (no nearest fallback: tiny ones may have none)
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE cell_mun AS
        WITH cells AS (SELECT DISTINCT cell_lat, cell_lon, ST_Point((cell_lon + 0.5) / 10, (cell_lat + 0.5) / 10) AS pt
                       FROM '{HARMONIZED}')
        SELECT c.cell_lat, c.cell_lon, min(m.code) AS code FROM cells c JOIN mun m ON ST_Contains(m.geom, c.pt) GROUP BY ALL""")
    last_month, days, _ = manifest_dates()
    monthly: dict[int, dict[str, float]] = {}
    for code, m, v in con.execute(f"""SELECT cm.code, strftime(h.month, '%Y-%m'), sum(h.value)
                                       FROM '{HARMONIZED}' h JOIN cell_mun cm USING (cell_lat, cell_lon) GROUP BY ALL""").fetchall():
        monthly.setdefault(code, {})[m] = v
    info = con.execute("SELECT code, id, name, uf, ST_Area_Spheroid(geom) / 1e6 FROM mun").fetchall()
    out = []
    for code, mid, name, uf, km2 in info:
        s = ytd_standing(monthly.get(code, {}), last_month, days) if code in monthly else None
        if s is None:
            continue
        out.append([mid, name, uf, s["ytd"], round(km2, 1), s["percentile"]])
    out.sort(key=lambda r: -r[3])
    write_json("municipalities/ranking.json", {"last_month": last_month, "days": days,
                                               "columns": ["id", "name", "uf", "ytd", "area_km2", "percentile"], "rows": out})
    log(f"municipalities: {len(out):,} of {len(info):,} with cells and history")


# ---------------------------------------------------------------- validation

def validation(con) -> None:
    from jangada import harmonize
    spatial(con)
    states = states_for_clip()
    con.execute("CREATE OR REPLACE TEMP TABLE st AS SELECT unnest(?) AS code, ST_GeomFromGeoJSON(unnest(?)) AS geom",
                [list(states), list(states.values())])
    assign_cells(con, "st", "cell_uf")
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE sm AS
        SELECT u.code AS uf, o.month,
               coalesce(sum(o.n) FILTER (WHERE o.satellite = 1), 0)::DOUBLE AS aqua_n,
               coalesce(sum(o.n_1km) FILTER (WHERE o.satellite = 2), 0)::DOUBLE AS snpp_k
        FROM '{OBSERVED}' o JOIN cell_uf u USING (cell_lat, cell_lon) GROUP BY ALL""")
    metrics = harmonize.validate(con)  # fits f_test on 2012-2020, as the production pipeline does
    h0, h1 = harmonize.HELDOUT
    pred = f"""SELECT sm.uf, sm.month, sm.aqua_n AS ref, f.factor * sm.snpp_k AS est
               FROM sm JOIN f_test f ON f.uf = sm.uf AND f.month_of_year = month(sm.month)
               WHERE year(sm.month) BETWEEN {h0} AND {h1}"""
    national = con.execute(f"""SELECT strftime(month, '%Y-%m'), sum(ref), sum(est) FROM ({pred}) GROUP BY 1 ORDER BY 1""").fetchall()
    state_year = con.execute(f"""SELECT uf, year(month), sum(ref), sum(est) FROM ({pred}) GROUP BY ALL
                                 HAVING sum(ref) >= {harmonize.MIN_REF} ORDER BY 1, 2""").fetchall()
    write_json("validation.json", {
        "fit_years": f"{harmonize.FIT_TEST[0]}-{harmonize.FIT_TEST[1]}", "heldout_years": f"{h0}-{h1}",
        "metrics": metrics,
        "national_month": [[m, round(r), round(e)] for m, r, e in national],
        "state_year": [[u, y, round(r), round(e)] for u, y, r, e in state_year],
    })
    log(f"validation: national MAPE {metrics['mape_national_month']:.3f}, state-year within 20% "
        f"{metrics['share_within_20pct_state_year']:.2f}, bias {metrics['total_bias']:+.3f}")


# ---------------------------------------------------------------- ONI

def oni(con) -> None:
    path = cached(ONI_URL, "oni.ascii.txt")
    seasons = []  # (year of the season's centre month, centre month, anomaly)
    centre = {"DJF": 1, "JFM": 2, "FMA": 3, "MAM": 4, "AMJ": 5, "MJJ": 6, "JJA": 7, "JAS": 8, "ASO": 9, "SON": 10, "OND": 11, "NDJ": 12}
    for line in path.read_text(encoding="utf-8").splitlines()[1:]:
        parts = line.split()
        if len(parts) == 4 and parts[0] in centre:
            seasons.append((int(parts[1]), centre[parts[0]], float(parts[3])))
    write_json("oni.json", {"source": "NOAA CPC Oceanic Nino Index (ERSSTv5), oni.ascii.txt", "rule":
                            "El Nino / La Nina: at least 5 consecutive overlapping 3-month seasons at or beyond +/-0.5 C; "
                            "a year takes each phase that covers at least 3 of its seasons, in the order they happened "
                            "(EN, LN, EN-LN or LN-EN)", "years": oni_phases(seasons)})


def oni_phases(seasons: list[tuple[int, int, float]]) -> dict[str, dict]:
    """{year: {phase, peak, seasons}} from (year, centre month, anomaly) in time order, from 2000. A year in which both
    phases cover at least 3 seasons is a transition ("LN-EN" for La Nina, then El Nino), not the larger one alone:
    2010 had El Nino in its first months, linked to that year's Amazon drought, and La Nina from mid-year."""
    # NOAA rule: El Nino (La Nina) when ONI >= +0.5 (<= -0.5) for at least 5 consecutive overlapping seasons
    phase = [None] * len(seasons)
    for sign, label in ((1, "EN"), (-1, "LN")):
        run = 0
        for i, (_, _, a) in enumerate(seasons + [(0, 0, 0.0)]):
            if i < len(seasons) and sign * a >= 0.5:
                run += 1
                continue
            if run >= 5:
                for j in range(i - run, i):
                    phase[j] = label
            run = 0
    years: dict[int, dict] = {}
    for (y, m, a), p in zip(seasons, phase):
        if y < 2000:
            continue
        d = years.setdefault(y, {"EN": 0, "LN": 0, "order": [], "peak": 0.0, "months": []})
        d["months"].append(round(a, 2))
        if p:
            d[p] += 1
            if p not in d["order"]:
                d["order"].append(p)
        if abs(a) > abs(d["peak"]):
            d["peak"] = round(a, 2)
    return {str(y): {"phase": "-".join(p for p in d["order"] if d[p] >= 3) or None, "peak": d["peak"],
                     "seasons": d["months"]}
            for y, d in sorted(years.items())}


# ---------------------------------------------------------------- recent (last 7 days)

def usual_p90_sql(source: str, month_of_year: int) -> str:
    """SQL for (cell_lat, cell_lon, p90): the 90th percentile of the cell's harmonized value in this month of the year
    over USUAL_YEARS. A year with no row for the cell had no fire there that month and counts as zero, as in the
    calendar; leaving it out raises the percentile of places that seldom burn, and "more than usual" flags too few."""
    y0, y1 = USUAL_YEARS
    return f"""
        WITH m AS (SELECT cell_lat, cell_lon, year(month) AS y, sum(value) AS v FROM {source}
                   WHERE month(month) = {month_of_year} AND year(month) BETWEEN {y0} AND {y1} GROUP BY ALL)
        SELECT c.cell_lat, c.cell_lon, quantile_cont(coalesce(m.v, 0), 0.9) AS p90
        FROM (SELECT DISTINCT cell_lat, cell_lon FROM m) c CROSS JOIN range({y0}, {y1 + 1}) AS yr(y)
        LEFT JOIN m ON m.cell_lat = c.cell_lat AND m.cell_lon = c.cell_lon AND m.y = yr.y
        GROUP BY ALL"""


def states_for_clip() -> dict[str, str]:
    """{uf: GeoJSON geometry} of the states: the full IBGE outlines when they are cached in data/, else the published
    ones (web/public/data/states.geojson, simplified to ~1 km). The IBGE API times out from GitHub's runners, so the
    daily refresh (.github/workflows/refresh-recent.yml) clips with the published outlines."""
    if STATES.exists():
        return load_states()
    doc = json.loads((WEB_DATA / "states.geojson").read_text(encoding="utf-8"))
    return {f["properties"]["uf"]: json.dumps(f["geometry"]) for f in doc["features"]}


def recent(con) -> None:
    spatial(con)
    EXTRAS.mkdir(parents=True, exist_ok=True)  # a fresh checkout (the daily refresh) has no data/ folder
    paths = {}
    for sat, url in RECENT_URLS.items():
        p = EXTRAS / f"recent_{sat}.csv"
        if p.exists():
            p.unlink()  # always fresh: these files change every few hours
        download_file(url, p)
        paths[sat] = p
    parts = []
    for sat, p in paths.items():
        source = read_csv_expr([str(p)])
        cols = {r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {source}").fetchall()}
        if "instrument" not in cols:  # the 7-day files leave it out
            source = f"(SELECT *, '{'MODIS' if sat == 'MODIS' else 'VIIRS'}' AS instrument FROM {source})"
        parts.append(f"({select_for(con, source, 'NRT')})")
    con.execute(f"CREATE OR REPLACE TEMP TABLE r AS {' UNION ALL BY NAME '.join(parts)}")
    # clip to Brazil and drop low confidence and known static sources (gas flares, industry) seen in the archive
    states = states_for_clip()
    con.execute("CREATE OR REPLACE TEMP TABLE st AS SELECT unnest(?) AS code, ST_GeomFromGeoJSON(unnest(?)) AS geom",
                [list(states), list(states.values())])
    con.execute("CREATE OR REPLACE TEMP TABLE static (a INT, b INT)")
    if list(config.POINTS.glob("*.parquet")):
        con.execute(f"""INSERT INTO static SELECT DISTINCT floor(lat * 100)::INT, floor(lon * 100)::INT
                        FROM read_parquet('{config.POINTS.as_posix()}/*.parquet', union_by_name = true) WHERE type IN (2, 3)""")
        # kept with the code, so the daily refresh (.github/workflows/refresh-recent.yml) filters the same sources
        # without the raw archive
        con.execute(f"COPY (SELECT * FROM static ORDER BY a, b) TO '{STATIC_SOURCES.as_posix()}' (FORMAT parquet, COMPRESSION zstd)")
    elif STATIC_SOURCES.exists():
        con.execute(f"INSERT INTO static SELECT a, b FROM read_parquet('{STATIC_SOURCES.as_posix()}')")
    else:
        log("recent: no static-source list; industrial heat sources are not filtered")
    con.execute("""
        CREATE OR REPLACE TEMP TABLE rb AS
        SELECT r.*, s.code AS uf, floor(r.lat * 10)::INT AS cell_lat, floor(r.lon * 10)::INT AS cell_lon
        FROM r JOIN st s ON ST_Contains(s.geom, ST_Point(r.lon, r.lat))
        LEFT JOIN static x ON x.a = floor(r.lat * 100)::INT AND x.b = floor(r.lon * 100)::INT
        WHERE r.confidence <> 'low' AND x.a IS NULL""")
    # VIIRS to Aqua units per state: harmonized value / mean(NOAA-20, NOAA-21 ~1 km positions) over the last 12 months
    last_month, days, data_date = manifest_dates()
    assign_cells(con, "st", "cell_uf")
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE ratio AS
        WITH h AS (SELECT u.code AS uf, sum(h.value) AS v FROM '{HARMONIZED}' h JOIN cell_uf u USING (cell_lat, cell_lon)
                   WHERE h.month >= DATE '{last_month}-01' - INTERVAL 12 MONTH AND h.month < DATE '{last_month}-01' GROUP BY 1),
             k AS (SELECT u.code AS uf, sum(o.n_1km) FILTER (WHERE o.satellite IN (3, 4)) / 2.0 AS k
                   FROM '{OBSERVED}' o JOIN cell_uf u USING (cell_lat, cell_lon)
                   WHERE o.month >= DATE '{last_month}-01' - INTERVAL 12 MONTH AND o.month < DATE '{last_month}-01' GROUP BY 1)
        SELECT h.uf, h.v / nullif(k.k, 0) AS f FROM h JOIN k USING (uf)""")
    # usual 7 days for the cell in this month of the year: p90 of the cell's month over the complete Aqua years
    moy = int(last_month[5:7])
    rows = con.execute(f"""
        WITH viirs_k AS (  -- ~1 km positions per overpass, as in jangada-aggregate
            SELECT cell_lat, cell_lon, uf, satellite, count(DISTINCT (acq_date, acq_time, floor(lat * 100), floor(lon * 100))) AS k
            FROM rb WHERE instrument = 'VIIRS' AND satellite IN ('NOAA-20', 'NOAA-21') GROUP BY ALL),
        eq AS (
            SELECT cell_lat, cell_lon, sum(k) / 2.0 * any_value(f) AS aqua_eq FROM viirs_k v JOIN ratio USING (uf) GROUP BY ALL),
        hist AS ({usual_p90_sql(f"'{HARMONIZED}'", moy)}),
        agg AS (
            SELECT cell_lat, cell_lon, count(*) AS n, max(frp) AS frp_max, max(acq_date) AS last_date, min(acq_date) AS first_date,
                   list(DISTINCT satellite ORDER BY satellite) AS sats
            FROM rb GROUP BY ALL)
        SELECT a.cell_lat, a.cell_lon, a.n, round(coalesce(e.aqua_eq, 0), 2), round(a.frp_max, 1),
               strftime(a.first_date, '%Y-%m-%d'), strftime(a.last_date, '%Y-%m-%d'), a.sats,
               coalesce(e.aqua_eq, 0) > greatest(coalesce(h.p90, 0) * 7 / 30, 2) AS above
        FROM agg a LEFT JOIN eq e USING (cell_lat, cell_lon) LEFT JOIN hist h USING (cell_lat, cell_lon)
        ORDER BY a.n DESC""").fetchall()
    span = con.execute("SELECT strftime(min(acq_date), '%Y-%m-%d'), strftime(max(acq_date), '%Y-%m-%d'), count(*) FROM rb").fetchone()
    start = date.fromisoformat(span[0])
    day = lambda d: (date.fromisoformat(d) - start).days  # noqa: E731
    bits = lambda sats: sum(1 << SAT_CODE[x] for x in sats if x in SAT_CODE)  # noqa: E731
    write_json("recent.json", {
        "from": span[0], "to": span[1], "detections": span[2], "downloaded": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
        "note": "FIRMS near-real-time, last 7 days; Aqua-MODIS equivalent from NOAA-20/21 with each state's ratio of the last 12 months",
        "satellites": list(SAT_CODE),
        "columns": ["cell_lat", "cell_lon", "n", "aqua_eq", "frp_max", "first_day", "last_day", "satellite_bits", "above_usual"],
        "cells": [[la, lo, n, round(eq, 1), round(frp or 0), day(f), day(l), bits(s), 1 if ab else 0]
                  for la, lo, n, eq, frp, f, l, s, ab in rows]})
    log(f"recent: {span[2]:,} detections in Brazil, {span[0]} to {span[1]}, {len(rows):,} cells")


# ---------------------------------------------------------------- intensity and overpass (need the FIRMS points)

def _points(con) -> None:
    files = sorted(config.POINTS.glob("*_yearly.parquet"))
    if not files:
        sys.exit("no FIRMS points: run `uv run jangada-download yearly` first")
    con.execute(f"""CREATE OR REPLACE TEMP VIEW pts AS
                    SELECT * FROM read_parquet({[f.as_posix() for f in files]}, union_by_name = true)
                    WHERE (type = 0 OR type IS NULL) AND confidence <> 'low'""")


def intensity(con) -> None:
    spatial(con)
    _points(con)
    states = states_for_clip()
    con.execute("CREATE OR REPLACE TEMP TABLE st AS SELECT unnest(?) AS code, ST_GeomFromGeoJSON(unnest(?)) AS geom",
                [list(states), list(states.values())])
    assign_cells(con, "st", "cell_uf")
    if not (WEB_DATA / "biome_series.json").exists():
        biomes(con)
    else:
        shp = cached(BIOMES_URL, "Biomas_250mil.zip")
        name = next(n for n in zipfile.ZipFile(shp).namelist() if n.endswith(".shp"))
        con.execute(f"CREATE OR REPLACE TEMP TABLE bio AS SELECT CD_Bioma::INT AS code, geom FROM ST_Read('/vsizip/{shp.as_posix()}/{name}')")
        assign_cells(con, "bio", "cell_biome")
    # one sensor per family, the same satellite in every year: Aqua (MODIS, 1 km) and S-NPP (VIIRS, 375 m)
    rows = con.execute("""
        WITH p AS (SELECT satellite, year(acq_date) AS y, frp, daynight,
                          floor(lat * 10)::INT AS cell_lat, floor(lon * 10)::INT AS cell_lon
                   FROM pts WHERE satellite IN ('Aqua', 'S-NPP')),
        tagged AS (SELECT p.*, u.code AS uf, b.code AS bio FROM p
                   LEFT JOIN cell_uf u USING (cell_lat, cell_lon) LEFT JOIN cell_biome b USING (cell_lat, cell_lon))
        SELECT satellite, y, grouping(uf), grouping(bio), uf, bio, count(*), count(*) FILTER (WHERE daynight = 'N'),
               quantile_cont(frp, 0.5)
        FROM tagged GROUP BY GROUPING SETS ((satellite, y), (satellite, y, uf), (satellite, y, bio))""").fetchall()
    out: dict[str, dict] = {}
    for sat, y, g_uf, g_bio, uf, bio, n, night, med in rows:
        if g_uf and g_bio:
            key = "BR"
        elif not g_uf:
            if uf is None:
                continue  # detections in cells outside the published grid
            key = uf
        else:
            if bio is None:
                continue
            key = BIOMES[bio][0]
        fam = "aqua" if sat == "Aqua" else "snpp"
        out.setdefault(key, {}).setdefault(fam, {})[str(y)] = [int(n), int(night), round(med or 0, 1)]
    write_json("intensity.json", {
        "note": "Per detection, as delivered (never harmonized): Aqua MODIS and S-NPP VIIRS, vegetation fires, "
                "low confidence removed. FRP is not comparable between sensors (1 km vs 375 m pixels).",
        "columns": ["detections", "night_detections", "median_frp_mw"], "small_sample": SMALL_SAMPLE, "areas": out})


def overpass(con) -> None:
    _points(con)
    # local solar time = UTC + longitude / 15 h; daytime detections only (the afternoon or morning pass)
    rows = con.execute("""
        WITH p AS (SELECT satellite, year(acq_date) AS y,
                          ((acq_time // 100) * 60 + acq_time % 100 + lon * 4 + 1440) % 1440 AS local_min
                   FROM pts WHERE daynight = 'D' AND acq_time IS NOT NULL)
        SELECT satellite, y, count(*), quantile_cont(local_min, 0.5), quantile_cont(local_min, 0.25), quantile_cont(local_min, 0.75)
        FROM p GROUP BY ALL ORDER BY 1, 2""").fetchall()
    out: dict[str, dict] = {}
    for sat, y, n, med, q25, q75 in rows:
        if n >= 1000:
            out.setdefault(sat, {})[str(y)] = [round(med / 60, 3), round(q25 / 60, 3), round(q75 / 60, 3), int(n)]
    aqua2012 = out.get("Aqua", {}).get("2012", [0])[0]
    log(f"overpass: Aqua median local time in 2012 = {int(aqua2012)}:{int(aqua2012 % 1 * 60):02d} (SC-014: 13:00-14:00)")
    write_json("overpass.json", {"note": "Median local solar time (UTC + longitude/15) of daytime detections over Brazil",
                                 "columns": ["median_h", "p25_h", "p75_h", "detections"], "satellites": out})


STEPS = {"biomes": biomes, "recurrence": recurrence, "municipalities": municipalities, "validation": validation,
         "oni": oni, "recent": recent, "intensity": intensity, "overpass": overpass}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("step", choices=[*STEPS, "all"])
    args = parser.parse_args()
    for f, hint in ((HARMONIZED, "run `uv run jangada-export-web` first"), (SERIES, "run `uv run jangada-export-web` first")):
        need(f, hint)
    con = connect()
    for name, step in STEPS.items():
        if args.step in (name, "all"):
            t0 = time.monotonic()
            log(f"-- {name}")
            step(con)
            log(f"   {name} done in {time.monotonic() - t0:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
