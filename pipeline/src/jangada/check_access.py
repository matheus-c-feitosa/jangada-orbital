"""Check everything the pipeline needs before we download data.

Run: uv run jangada-check   (from pipeline/)

It checks the FIRMS MAP_KEY, which products and dates FIRMS has, the yearly country files,
one small area-API request (about 1 transaction) and free disk space. The key is never printed.
"""

from __future__ import annotations

import csv
import io
import json
import shutil
import sys
import urllib.error
import urllib.request
from datetime import date

from jangada import config

OK, WARN, FAIL = "ok  ", "warn", "FAIL"
results: list[tuple[str, str, str]] = []


def report(status: str, name: str, detail: str) -> None:
    results.append((status, name, detail))
    print(f"[{status}] {name}: {detail}", flush=True)


def fetch(url: str, *, method: str = "GET", timeout: int = 60) -> tuple[int, bytes, dict[str, str]]:
    req = urllib.request.Request(url, method=method, headers={"User-Agent": config.USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read() if method == "GET" else b"", dict(resp.headers)
    except urllib.error.HTTPError as err:
        return err.code, err.read() if method == "GET" else b"", dict(err.headers or {})
    except (urllib.error.URLError, TimeoutError) as err:  # network down, DNS, timeout
        return 0, str(getattr(err, "reason", err)).encode(), {}


def check_key(key: str | None) -> bool:
    if not key:
        report(FAIL, "MAP_KEY", "not found: copy .env.example to .env and set FIRMS_MAP_KEY")
        return False
    status, body, _ = fetch(f"{config.FIRMS}/mapserver/mapkey_status/?MAP_KEY={key}")
    text = config.redact(body.decode("utf-8", "replace"), key)
    if status != 200:
        report(FAIL, "MAP_KEY", f"rejected (HTTP {status}): {text.strip()[:160]}")
        return False
    try:
        info = json.loads(text)
        report(OK, "MAP_KEY", f"valid ({len(key)} chars); used {info.get('current_transactions')} of "
                              f"{info.get('transaction_limit')} per {info.get('transaction_interval')}")
    except json.JSONDecodeError:
        report(OK, "MAP_KEY", f"accepted (HTTP 200): {text.strip()[:160]}")
    return True


def check_availability(key: str) -> None:
    status, body, _ = fetch(f"{config.FIRMS}/api/data_availability/csv/{key}/ALL")
    if status != 200:
        report(FAIL, "data availability", f"HTTP {status}")
        return
    rows = list(csv.DictReader(io.StringIO(body.decode("utf-8", "replace"))))
    for row in rows:
        source = row.get("data_id", "?")
        if source in config.API_SOURCES:
            report(OK, f"API {source}", f"{row.get('min_date')} .. {row.get('max_date')}")
    missing = set(config.API_SOURCES) - {r.get("data_id") for r in rows}
    if missing:
        report(WARN, "API sources", "not listed: " + ", ".join(sorted(missing)))


def check_area_api(key: str) -> None:
    w, s, e, n = config.BBOX_CEARA
    url = f"{config.FIRMS}/api/area/csv/{key}/VIIRS_NOAA20_NRT/{w},{s},{e},{n}/1"
    status, body, _ = fetch(url)
    text = config.redact(body.decode("utf-8", "replace"), key)
    if status != 200 or not text.startswith("latitude"):
        report(FAIL, "area API", f"HTTP {status}: {text.strip()[:160]}")
        return
    rows = max(0, text.count("\n") - 1)
    report(OK, "area API", f"VIIRS NOAA-20, Ceará, last 24 h: {rows} hotspots")


def check_yearly_files() -> int:
    total = 0
    for sensor, (first, last) in config.YEARLY.items():
        for year in (first, last):
            status, _, headers = fetch(config.yearly_url(sensor, year), method="HEAD")
            size = int(headers.get("Content-Length", 0) or 0)
            if status == 200:
                report(OK, f"yearly {sensor} {year}", f"{size / 1e6:.1f} MB")
                total += size
            else:
                report(FAIL, f"yearly {sensor} {year}", f"HTTP {status}")
        status, _, _ = fetch(config.yearly_url(sensor, last + 1), method="HEAD")
        if status == 200:
            report(WARN, f"yearly {sensor} {last + 1}", "now exists: update config.YEARLY")
    return total


def check_disk() -> None:
    config.DATA.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(config.DATA).free
    # Brazil, all years and sensors: about 3 GB of CSV. We download one file at a time, convert it
    # to Parquet and delete the CSV, so the peak is the largest file plus the Parquet output.
    status = OK if free > 3e9 else WARN if free > 1.5e9 else FAIL
    report(status, "disk", f"{free / 1e9:.1f} GB free in {config.DATA}")


def main() -> int:
    print(f"FIRMS access check — {date.today().isoformat()}\n")
    key = config.map_key()
    if check_key(key):
        check_availability(key)
        check_area_api(key)
    check_yearly_files()
    check_disk()
    failed = [name for status, name, _ in results if status == FAIL]
    print("\nall required checks passed" if not failed else f"\nfailed: {', '.join(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
