"""Write the web app's data files (contract: specs/001-harmonized-fire-calendar/contracts/web-data-files.md).

  uv run jangada-export-web   -> web/public/data/{manifest.json, observed.parquet, harmonized.parquet}

Files are sorted by (cell_lat, cell_lon, month) with ~100k-row groups, so the browser fetches only the row groups
an area needs (HTTP range requests). Each file must stay at or under 50 MB.
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

WEB_DATA = config.ROOT / "web" / "public" / "data"
SCHEMA = 1
MAX_BYTES = 50 * 1024 * 1024
ROW_GROUP = 100_000
SATELLITES = ["Terra", "Aqua", "S-NPP", "NOAA-20", "NOAA-21"]  # index = code in observed.parquet


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
        con.execute(f"COPY ({query}) TO '{part}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE {ROW_GROUP})")
        part.rename(out)
        size = out.stat().st_size
        rows = con.execute(f"SELECT count(*) FROM '{out}'").fetchone()[0]
        if size > MAX_BYTES:
            sys.exit(f"{out.name} is {size / 1e6:.1f} MB, over the 50 MB limit")
        entries[name] = {"path": out.name, "bytes": size, "rows": rows, "sha256": sha256(out)}
        log(f"{out.name}: {rows:,} rows, {size / 1e6:.1f} MB")

    data_date = con.execute(
        f"SELECT max(acq_date) FROM read_parquet('{config.POINTS}/*.parquet', union_by_name = true)").fetchone()[0]
    first_month, last_month = con.execute(f"SELECT min(month), max(month) FROM '{harmonized}'").fetchone()
    report = json.loads(report_file.read_text(encoding="utf-8"))
    validation = report["validation"]
    days_in_month = calendar.monthrange(last_month.year, last_month.month)[1]
    manifest = {
        "schema": SCHEMA,
        "data_version": date.today().isoformat(),
        "data_date": data_date.isoformat(),
        "model_version": report["model_version"],
        "unit": report["unit"],
        "grid_deg": 0.1,
        "first_month": first_month.isoformat(),
        "last_month": last_month.isoformat(),
        "last_month_days": data_date.day if (data_date.year, data_date.month) == (last_month.year, last_month.month)
        else days_in_month,
        "files": entries,
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
