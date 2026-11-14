"""Download NASA FIRMS hotspots for Brazil and store them as normalized Parquet (data/interim/points/).

  uv run jangada-download yearly      yearly country files, no key (MODIS 2000-2025, S-NPP 2012-2025, NOAA-20 2018-2025)
  uv run jangada-download api         area API with the MAP_KEY (NOAA-21 since 2023-03, every sensor in 2026),
                                      clipped to the IBGE border of Brazil
  uv run jangada-download crosscheck  compares API + clipping with the yearly file (NOAA-20, Sep 2025)
  uv run jangada-download all         yearly, then api

Resumable: finished files are skipped, so it can be stopped and restarted at any time.
The MAP_KEY is never printed. Long runs: setsid nohup uv run jangada-download all > ../data/download.log 2>&1 &
"""

from __future__ import annotations

import argparse
import collections
import csv
import gzip
import io
import json
import shutil
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from jangada import config
from jangada.check_access import fetch
from jangada.normalize import connect, read_csv_expr, select_for


def log(message: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {message}", flush=True)


def download_file(url: str, dest: Path, attempts: int = 5) -> None:
    part = dest.with_name(dest.name + ".part")
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as resp, open(part, "wb") as out:
                shutil.copyfileobj(resp, out, 1 << 20)
            part.rename(dest)
            return
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            log(f"  retry {attempt}/{attempts}: {err}")
            time.sleep(5 * attempt)
    raise RuntimeError(f"could not download {url}")


# ---------------------------------------------------------------- yearly country files

def yearly() -> None:
    con = connect()
    raw = config.RAW / "yearly"
    raw.mkdir(parents=True, exist_ok=True)
    config.POINTS.mkdir(parents=True, exist_ok=True)
    for sensor, (first, last) in config.YEARLY.items():
        for year in range(first, last + 1):
            out = config.POINTS / f"{sensor}_{year}_yearly.parquet"
            if out.exists():
                continue
            csv_path = raw / f"{sensor}_{year}_{config.COUNTRY}.csv"
            if not csv_path.exists():
                t0 = time.monotonic()
                download_file(config.yearly_url(sensor, year), csv_path)
                log(f"{sensor} {year}: downloaded {csv_path.stat().st_size / 1e6:.0f} MB "
                    f"in {time.monotonic() - t0:.0f} s")
            source = read_csv_expr([str(csv_path)])
            part = out.with_name(out.name + ".part")
            con.execute(f"COPY ({select_for(con, source, 'yearly')}) TO '{part}' (FORMAT parquet, COMPRESSION zstd)")
            part.rename(out)
            rows = con.execute(f"SELECT count(*) FROM '{out}'").fetchone()[0]
            log(f"{sensor} {year}: {rows:,} hotspots -> {out.name} ({out.stat().st_size / 1e6:.1f} MB)")
            csv_path.unlink()  # disk is tight: keep only the Parquet


# ---------------------------------------------------------------- area API

class RateLimiter:
    """Keeps our own spending under config.API_BUDGET transactions per rolling 10 minutes."""

    def __init__(self, budget: int, window_s: int, already_used: int = 0) -> None:
        self.budget, self.window_s = budget, window_s
        self.spent: collections.deque[tuple[float, int]] = collections.deque()
        if already_used:
            self.spent.append((time.monotonic(), already_used))

    def wait(self, cost: int) -> None:
        while True:
            now = time.monotonic()
            while self.spent and now - self.spent[0][0] > self.window_s:
                self.spent.popleft()
            if sum(c for _, c in self.spent) + cost <= self.budget:
                self.spent.append((now, cost))
                return
            pause = max(2.0, self.window_s - (now - self.spent[0][0]) + 1)
            log(f"  pacing: waiting {pause:.0f} s to stay under {self.budget} transactions / 10 min")
            time.sleep(pause)


def transactions_in_use(key: str) -> int:
    status, body, _ = fetch(f"{config.FIRMS}/mapserver/mapkey_status/?MAP_KEY={key}")
    try:
        return int(json.loads(body)["current_transactions"]) if status == 200 else 0
    except (ValueError, KeyError):
        return 0


def availability(key: str) -> dict[str, tuple[date, date]]:
    status, body, _ = fetch(f"{config.FIRMS}/api/data_availability/csv/{key}/ALL")
    if status != 200:
        raise RuntimeError(f"data_availability failed: HTTP {status}")
    rows = csv.DictReader(io.StringIO(body.decode("utf-8", "replace")))
    return {r["data_id"]: (date.fromisoformat(r["min_date"]), date.fromisoformat(r["max_date"]))
            for r in rows if r.get("data_id")}


def windows(start: date, end: date, size: int = config.API_MAX_DAYS):
    day = start
    while day <= end:
        n = min(size, (end - day).days + 1)
        yield day, n
        day += timedelta(days=n)


def plan(avail: dict[str, tuple[date, date]], today: date) -> list[tuple[str, date, int]]:
    """Requests to make: standard processing (SP) while it exists, near real time (NRT) after it."""
    jobs = []
    for prefix, first_iso in config.API_PLAN.values():
        first = date.fromisoformat(first_iso)
        sp_min, sp_max = avail[f"{prefix}_SP"]
        nrt_min, nrt_max = avail[f"{prefix}_NRT"]
        if first <= sp_max:
            jobs += [(f"{prefix}_SP", d, n) for d, n in windows(max(first, sp_min), sp_max)]
        nrt_start = max(first, sp_max + timedelta(days=1), nrt_min)
        if nrt_start <= min(nrt_max, today):
            jobs += [(f"{prefix}_NRT", d, n) for d, n in windows(nrt_start, min(nrt_max, today))]
    return jobs


def get_area(key: str, source: str, box: str, days: int, day: date, attempts: int = 6) -> str:
    url = f"{config.FIRMS}/api/area/csv/{key}/{source}/{box}/{days}/{day.isoformat()}"
    for attempt in range(1, attempts + 1):
        status, body, _ = fetch(url, timeout=180)
        text = body.decode("utf-8", "replace")
        if status == 200 and (text.startswith("latitude") or not text.strip()):
            return text
        log(f"  {source} {day}: HTTP {status} {config.redact(text.strip(), key)[:100]!r}; retry {attempt}/{attempts}")
        time.sleep(min(120, 15 * attempt))
    raise RuntimeError(f"{source} {day}: area API kept failing")


def fetch_api(key: str, jobs: list[tuple[str, date, int]], box: str, raw: Path) -> None:
    today = date.today()
    limiter = RateLimiter(config.API_BUDGET, config.API_WINDOW_S, transactions_in_use(key))
    todo = []
    for source, day, n in jobs:
        dest = raw / source / f"{day.isoformat()}_{n}d.csv"
        final = day + timedelta(days=n - 1) < today - timedelta(days=1)  # recent windows are refreshed
        if not (dest.exists() and final):
            todo.append((source, day, n, dest))
    cost = sum(n for _, _, n, _ in todo) * config.API_COST_PER_DAY
    log(f"area API: {len(todo)} of {len(jobs)} requests to make, about {cost} transactions")
    for i, (source, day, n, dest) in enumerate(todo, 1):
        limiter.wait(n * config.API_COST_PER_DAY)
        text = get_area(key, source, box, n, day)
        dest.parent.mkdir(parents=True, exist_ok=True)
        part = dest.with_name(dest.name + ".part")
        part.write_text(text, encoding="utf-8")
        part.rename(dest)
        if i % 25 == 0 or i == len(todo):
            log(f"  {i}/{len(todo)} requests done (last: {source} {day})")


def load_border(con) -> str:
    """Load the spatial extension and return the border of Brazil as a constant SQL geometry.

    Keep it a constant inside the query: joined as a table column, the 66 KB polygon was copied into every
    row and DuckDB spilled more than 5 GB to disk. As a constant, 20,000 points are tested in 0.02 s.
    """
    if not config.BORDER.exists():
        config.BORDER.parent.mkdir(parents=True, exist_ok=True)
        download_file(config.BORDER_URL, config.BORDER)
    raw = config.BORDER.read_bytes()
    if raw[:2] == b"\x1f\x8b":  # IBGE answers gzip even when we do not ask for it
        raw = gzip.decompress(raw)
    geometry = json.loads(raw.decode("utf-8"))["features"][0]["geometry"]
    con.execute("INSTALL spatial")
    con.execute("LOAD spatial")
    return f"ST_GeomFromGeoJSON('{json.dumps(geometry)}')"


def clip_to_parquet(con, border: str, files_by_product: dict[str, list[Path]], out: Path) -> int:
    """Normalize the API CSVs, keep only points inside Brazil and write one Parquet file."""
    selects = []
    for product, files in files_by_product.items():
        usable = [str(f) for f in files if f.stat().st_size > 0 and f.read_text(encoding="utf-8").count("\n") > 1]
        if usable:
            selects.append(f"({select_for(con, read_csv_expr(usable), product)})")
    if not selects:
        return 0
    union = " UNION ALL BY NAME ".join(selects)
    query = f"SELECT * FROM ({union}) WHERE ST_Contains({border}, ST_Point(lon, lat))"
    part = out.with_name(out.name + ".part")
    con.execute(f"COPY ({query}) TO '{part}' (FORMAT parquet, COMPRESSION zstd)")
    part.rename(out)
    return con.execute(f"SELECT count(*) FROM '{out}'").fetchone()[0]


def api() -> None:
    key = config.map_key()
    if not key:
        sys.exit("FIRMS_MAP_KEY not found: copy .env.example to .env")
    raw = config.RAW / "api"
    jobs = plan(availability(key), date.today())
    fetch_api(key, jobs, ",".join(str(v) for v in config.BBOX_BRAZIL), raw)

    con = connect()
    border = load_border(con)
    config.POINTS.mkdir(parents=True, exist_ok=True)
    groups: dict[tuple[str, int], dict[str, list[Path]]] = collections.defaultdict(lambda: collections.defaultdict(list))
    for source, day, n in jobs:
        prefix, product = source.rsplit("_", 1)
        groups[(prefix, day.year)][product].append(raw / source / f"{day.isoformat()}_{n}d.csv")
    for (prefix, year), files in sorted(groups.items()):
        out = config.POINTS / f"{prefix.lower()}_{year}_api.parquet"
        t0 = time.monotonic()
        rows = clip_to_parquet(con, border, files, out)
        log(f"{prefix} {year}: {rows:,} hotspots inside Brazil -> {out.name} ({time.monotonic() - t0:.0f} s)")


# ---------------------------------------------------------------- cross-check

def crosscheck() -> None:
    """Same month from both routes: yearly country file vs area API clipped with the IBGE border."""
    key = config.map_key()
    if not key:
        sys.exit("FIRMS_MAP_KEY not found")
    yearly_file = config.POINTS / "viirs-jpss1_2025_yearly.parquet"
    if not yearly_file.exists():
        sys.exit("run `jangada-download yearly` first (needs NOAA-20 2025)")
    raw = config.RAW / "crosscheck"
    jobs = [("VIIRS_NOAA20_SP", d, n) for d, n in windows(date(2025, 9, 1), date(2025, 9, 30))]
    fetch_api(key, jobs, ",".join(str(v) for v in config.BBOX_BRAZIL), raw)
    con = connect()
    border = load_border(con)
    out = config.DATA / "tmp" / "crosscheck_noaa20_2025-09.parquet"
    api_rows = clip_to_parquet(con, border, {"SP": [raw / s / f"{d.isoformat()}_{n}d.csv" for s, d, n in jobs]}, out)
    yearly_rows = con.execute(f"""SELECT count(*) FROM '{yearly_file}'
                                  WHERE acq_date BETWEEN DATE '2025-09-01' AND DATE '2025-09-30'""").fetchone()[0]
    diff = (api_rows - yearly_rows) / yearly_rows * 100 if yearly_rows else float("nan")
    log(f"NOAA-20, September 2025: yearly file {yearly_rows:,} | API clipped to Brazil {api_rows:,} | {diff:+.2f}%")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("step", choices=["yearly", "api", "crosscheck", "all"])
    step = parser.parse_args().step
    t0 = time.monotonic()
    if step in ("yearly", "all"):
        yearly()
    if step in ("api", "all"):
        api()
    if step == "crosscheck":
        crosscheck()
    log(f"done: {step} in {(time.monotonic() - t0) / 60:.1f} min")
    return 0


if __name__ == "__main__":
    sys.exit(main())
