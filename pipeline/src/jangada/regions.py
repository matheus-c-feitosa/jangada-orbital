"""Assign every 0.1° cell that has data to a Brazilian state (UF), using the official IBGE state mesh.

  uv run jangada-regions      -> data/processed/cell_region.parquet (cell_lat, cell_lon, uf)

A cell belongs to the state that contains its centre. Coastal and border cells whose centre falls outside
every state (sea, neighbouring country) take the nearest state.
"""

from __future__ import annotations

import gzip
import json
import sys
import time

from jangada import config
from jangada.download import download_file
from jangada.normalize import connect

STATES_URL = ("https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR"
              "?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=UF")
STATES = config.RAW / "border" / "states_ibge.geojson"

# IBGE state codes (codarea) -> two-letter abbreviation. Stable official codes.
UF_CODES = {
    "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
    "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
    "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
    "41": "PR", "42": "SC", "43": "RS",
    "50": "MS", "51": "MT", "52": "GO", "53": "DF",
}


def log(message: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {message}", flush=True)


def load_states() -> dict[str, str]:
    """Return {uf: GeoJSON geometry string}."""
    if not STATES.exists():
        STATES.parent.mkdir(parents=True, exist_ok=True)
        download_file(STATES_URL, STATES)
    raw = STATES.read_bytes()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    features = json.loads(raw.decode("utf-8"))["features"]
    states = {UF_CODES[f["properties"]["codarea"]]: json.dumps(f["geometry"]) for f in features}
    if len(states) != 27:
        sys.exit(f"expected 27 states, got {len(states)}")
    return states


def main() -> int:
    cells_file = config.PROCESSED / "cell_month.parquet"
    if not cells_file.exists():
        sys.exit("run `uv run jangada-aggregate` first")
    t0 = time.monotonic()
    con = connect()
    con.execute("INSTALL spatial")
    con.execute("LOAD spatial")
    con.execute(f"""CREATE TEMP TABLE cells AS
                    SELECT DISTINCT cell_lat, cell_lon,
                           (cell_lat + 0.5) / 10 AS y, (cell_lon + 0.5) / 10 AS x
                    FROM '{cells_file}'""")
    total = con.execute("SELECT count(*) FROM cells").fetchone()[0]
    con.execute("CREATE TEMP TABLE assigned (cell_lat INT, cell_lon INT, uf VARCHAR, how VARCHAR)")

    states = load_states()
    # One query per state with the polygon as a constant (fast; see download.load_border).
    for uf, geometry in states.items():
        con.execute(f"""INSERT INTO assigned
                        SELECT cell_lat, cell_lon, '{uf}', 'inside' FROM cells
                        WHERE ST_Contains(ST_GeomFromGeoJSON('{geometry}'), ST_Point(x, y))""")
    dup = con.execute("""SELECT count(*) FROM (SELECT cell_lat, cell_lon FROM assigned
                         GROUP BY ALL HAVING count(*) > 1)""").fetchone()[0]
    if dup:
        sys.exit(f"{dup} cells fell inside two states")

    con.execute("""CREATE TEMP TABLE orphans AS
                   SELECT c.* FROM cells c ANTI JOIN assigned a USING (cell_lat, cell_lon)""")
    orphans = con.execute("SELECT count(*) FROM orphans").fetchone()[0]
    if orphans:
        con.execute("CREATE TEMP TABLE dist (cell_lat INT, cell_lon INT, uf VARCHAR, d DOUBLE)")
        for uf, geometry in states.items():
            con.execute(f"""INSERT INTO dist
                            SELECT cell_lat, cell_lon, '{uf}',
                                   ST_Distance(ST_GeomFromGeoJSON('{geometry}'), ST_Point(x, y))
                            FROM orphans""")
        con.execute("""INSERT INTO assigned
                       SELECT cell_lat, cell_lon, arg_min(uf, d), 'nearest' FROM dist GROUP BY ALL""")

    out = config.PROCESSED / "cell_region.parquet"
    con.execute(f"""COPY (SELECT cell_lat, cell_lon, uf FROM assigned ORDER BY cell_lat, cell_lon)
                    TO '{out}' (FORMAT parquet, COMPRESSION zstd)""")
    rows, states_used = con.execute(f"SELECT count(*), count(DISTINCT uf) FROM '{out}'").fetchone()
    if rows != total:
        sys.exit(f"assigned {rows} of {total} cells")
    log(f"{out.name}: {rows:,} cells in {states_used} states "
        f"({total - orphans:,} inside, {orphans:,} by nearest state) in {time.monotonic() - t0:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
