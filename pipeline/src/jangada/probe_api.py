"""Deeper test of every data service the project relies on, and of the FIRMS transaction limit.

Run: uv run jangada-probe   (from pipeline/)

Uses about 40 FIRMS transactions (of 5000 per 10 minutes). The MAP_KEY is never printed.
"""

from __future__ import annotations

import csv
import io
import json
import math
import sys
import time
from datetime import date, timedelta

from jangada import config
from jangada.check_access import fetch

BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty"  # free vector basemap, no key


def bbox(b: tuple[float, float, float, float]) -> str:
    return ",".join(str(v) for v in b)


def used(key: str) -> int | None:
    status, body, _ = fetch(f"{config.FIRMS}/mapserver/mapkey_status/?MAP_KEY={key}")
    if status != 200:
        return None
    try:
        return int(json.loads(body)["current_transactions"])
    except (ValueError, KeyError):
        return None


def area(key: str, source: str, box: str, days: int, day: str) -> tuple[int, int, float, int | None]:
    """Return (http status, rows, seconds, transactions spent) for one area request."""
    before = used(key)
    t0 = time.monotonic()
    status, body, _ = fetch(f"{config.FIRMS}/api/area/csv/{key}/{source}/{box}/{days}/{day}", timeout=180)
    seconds = time.monotonic() - t0
    text = body.decode("utf-8", "replace")
    rows = max(0, text.count("\n") - 1) if text.startswith("latitude") else -1
    time.sleep(1.0)  # let the counter update
    after = used(key)
    cost = after - before if before is not None and after is not None else None
    return status, rows, seconds, cost


def availability(key: str) -> dict[str, tuple[str, str]]:
    _, body, _ = fetch(f"{config.FIRMS}/api/data_availability/csv/{key}/ALL")
    rows = csv.DictReader(io.StringIO(body.decode("utf-8", "replace")))
    return {r["data_id"]: (r["min_date"], r["max_date"]) for r in rows if r.get("data_id")}


def last_date_in_yearly(sensor: str, year: int) -> str:
    """Read only the last bytes of a yearly file to find its last acquisition date."""
    url = config.yearly_url(sensor, year)
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT, "Range": "bytes=-4000"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        tail = resp.read().decode("utf-8", "replace").strip().splitlines()[-1]
    for field in tail.split(","):
        if len(field) == 10 and field[4] == "-" and field[7] == "-":
            return field
    return "?"


def main() -> int:
    key = config.map_key()
    if not key:
        print("FIRMS_MAP_KEY not found: copy .env.example to .env")
        return 1
    problems: list[str] = []
    ceara, brazil = bbox(config.BBOX_CEARA), bbox(config.BBOX_BRAZIL)

    start = used(key)
    again = used(key)
    print(f"transactions in use at start: {start} (status check itself costs {(again or 0) - (start or 0)})\n")

    print("1) every area-API source, 1 day over Ceará, on its most recent date")
    avail = availability(key)
    print(f"   {'source':18} {'last date':11} {'http':>4} {'rows':>6} {'sec':>5} {'cost':>4}")
    for source in config.API_SOURCES:
        last = avail.get(source, ("", ""))[1]
        if not last:
            problems.append(f"{source}: not in data_availability")
            continue
        status, rows, sec, cost = area(key, source, ceara, 1, last)
        print(f"   {source:18} {last:11} {status:>4} {rows:>6} {sec:>5.1f} {cost if cost is not None else '?':>4}")
        if status != 200 or rows < 0:
            problems.append(f"{source}: HTTP {status}")

    print("\n2) old dates (Standard Processing), 5 days over Ceará in the fire season")
    for source, day in (("MODIS_SP", "2001-10-15"), ("VIIRS_SNPP_SP", "2012-10-15"),
                        ("VIIRS_NOAA20_SP", "2018-10-15"), ("VIIRS_NOAA21_SP", "2023-10-15")):
        status, rows, sec, cost = area(key, source, ceara, 5, day)
        print(f"   {source:18} {day:11} {status:>4} {rows:>6} {sec:>5.1f} {cost if cost is not None else '?':>4}")
        if status != 200 or rows < 0:
            problems.append(f"{source} {day}: HTTP {status}")

    print("\n3) cost of the largest request we plan: 5 days over all of Brazil")
    costs = []
    for source, day in (("VIIRS_NOAA21_SP", "2025-09-01"), ("MODIS_SP", "2025-09-01")):
        status, rows, sec, cost = area(key, source, brazil, 5, day)
        costs.append(cost or 0)
        print(f"   {source:18} {day:11} {status:>4} {rows:>6} {sec:>5.1f} {cost if cost is not None else '?':>4}")
        if status != 200 or rows < 0:
            problems.append(f"{source} Brazil 5 days: HTTP {status}")

    # Plan: NOAA-21 from 2023-03-01 plus every sensor for 2026, in 5-day requests over Brazil.
    today = date.today()
    days = (today - date(2023, 3, 1)).days + 3 * (today - date(2026, 1, 1)).days
    requests = math.ceil(days / config.API_MAX_DAYS)
    per = max(costs) if costs else 1
    windows = requests * per / 5000
    print(f"   plan: about {requests} requests x {per} transactions = {requests * per} transactions,"
          f" i.e. {max(1, math.ceil(windows))} window(s) of 10 minutes")

    print("\n4) yearly country files (HEAD on every year) and the last date inside each latest file")
    for sensor, (first, last) in config.YEARLY.items():
        sizes, missing = 0, []
        for year in range(first, last + 1):
            status, _, headers = fetch(config.yearly_url(sensor, year), method="HEAD")
            if status == 200:
                sizes += int(headers.get("Content-Length", 0) or 0)
            else:
                missing.append(year)
        end = last_date_in_yearly(sensor, last)
        flag = "ok" if not missing else f"missing {missing}"
        print(f"   {sensor:12} {first}-{last}: {sizes / 1e9:.2f} GB, {flag}; {last} file ends on {end}")
        if missing:
            problems.append(f"yearly {sensor} missing {missing}")

    print("\n5) basemap for the web app (no key)")
    status, body, _ = fetch(BASEMAP_STYLE)
    ok = status == 200 and body.lstrip().startswith(b"{")
    print(f"   OpenFreeMap style: HTTP {status}, {'valid JSON style' if ok else 'unexpected answer'}")
    if not ok:
        problems.append("basemap style")

    end_used = used(key)
    print(f"\ntransactions in use at the end: {end_used} of 5000 per 10 minutes")
    print("\nall services OK" if not problems else "\nproblems:\n  - " + "\n  - ".join(problems))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
