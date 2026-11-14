"""Municipality outlines for the web picker (task T041), from the official IBGE APIs.

  uv run jangada-municipalities

Writes web/public/data/municipalities/:
  index.json     [[id, name, uf, west, south, east, north], ...] for all municipalities, for search;
  <UF>.geojson   outlines of one state's municipalities (properties: id, name, uf), loaded on demand.

IBGE's "minima" mesh keeps every file small on phones (Minas Gerais has 853 municipalities).
Downloads are cached in data/raw/border/, so reruns work offline. Outlines are simplified with a 0.002° (~200 m)
tolerance and rounded to 4 decimals (~11 m), far below the 0.1° grid the app aggregates on.
"""

from __future__ import annotations

import gzip
import json
import sys
import time

from jangada import config
from jangada.download import download_file
from jangada.normalize import connect
from jangada.export_web import UF_NAMES, WEB_DATA
from jangada.regions import UF_CODES

MESH_URL = ("https://servicodados.ibge.gov.br/api/v3/malhas/estados/{code}"
            "?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio")
NAMES_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/{code}/municipios"
OUT = WEB_DATA / "municipalities"
MAX_BYTES = 1_000_000
TOLERANCE = 0.002


def log(message: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {message}", flush=True)


def fetch_json(url: str, cache_name: str):
    path = config.RAW / "border" / cache_name
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        download_file(url, path)
    raw = path.read_bytes()
    if raw[:2] == b"\x1f\x8b":  # IBGE answers gzip even when we do not ask for it
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def rounded(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 4), round(coords[1], 4)]
    return [rounded(c) for c in coords]


def points(coords):
    if isinstance(coords[0], (int, float)):
        yield coords
        return
    for c in coords:
        yield from points(c)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.monotonic()
    con = connect()
    con.execute("INSTALL spatial")
    con.execute("LOAD spatial")
    index = []
    for code, uf in sorted(UF_CODES.items(), key=lambda kv: kv[1]):
        mesh = fetch_json(MESH_URL.format(code=code), f"mun_mesh_minima_{code}.json")
        names = {str(m["id"]): m["nome"] for m in fetch_json(NAMES_URL.format(code=code), f"mun_names_{code}.json")}
        rows = [(f["properties"]["codarea"], json.dumps(f["geometry"])) for f in mesh["features"]]
        simplified = dict(con.execute(f"""
            SELECT id, ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON(g), {TOLERANCE}))
            FROM (SELECT unnest(?) AS id, unnest(?) AS g)""", [[r[0] for r in rows], [r[1] for r in rows]]).fetchall())
        features = []
        for f in mesh["features"]:
            mid = f["properties"]["codarea"]
            if mid not in names:
                sys.exit(f"{uf}: municipality {mid} has an outline but no name")
            g = json.loads(simplified[mid])
            geometry = {"type": g["type"], "coordinates": rounded(g["coordinates"])}
            xs, ys = zip(*points(geometry["coordinates"]))
            bbox = [min(xs), min(ys), max(xs), max(ys)]
            features.append({"type": "Feature", "properties": {"id": mid, "name": names[mid], "uf": uf},
                             "geometry": geometry})
            index.append([mid, names[mid], uf, *bbox])
        missing = sorted(set(names) - {f["properties"]["id"] for f in features})
        if missing:  # e.g. a municipality created after IBGE's current mesh; it cannot be drawn, so it is left out
            log(f"warning {uf}: no outline for {', '.join(f'{m} {names[m]}' for m in missing)}; left out of the picker")
        out = OUT / f"{uf}.geojson"
        out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"),
                                  ensure_ascii=False), encoding="utf-8")
        size = out.stat().st_size
        if size > MAX_BYTES:
            sys.exit(f"{out.name} is {size / 1e6:.2f} MB, over the 1 MB limit")
        log(f"{uf} ({UF_NAMES[uf]}): {len(features)} municipalities, {size / 1e3:.0f} KB")
    index.sort(key=lambda r: (r[1], r[2]))
    (OUT / "index.json").write_text(json.dumps(index, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    total = sum(f.stat().st_size for f in OUT.iterdir())
    log(f"index.json: {len(index)} municipalities; {total / 1e6:.1f} MB in total; {time.monotonic() - t0:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
