# Data sources

All fire data comes from NASA FIRMS. Checked on 2026-11-14; `uv run jangada-check` re-checks it.

## Yearly country files (no key needed)

`https://firms.modaps.eosdis.nasa.gov/data/country/<sensor>/<year>/<sensor>_<year>_Brazil.csv`

| Sensor (`<sensor>`) | Satellite | Resolution | Years available | Size per year (Brazil) |
|---|---|---|---|---|
| `modis` | Terra + Aqua, Collection 6.1 | 1 km | 2000–2025 | 1.2 MB (2000) to 42.6 MB (2024) |
| `viirs-snpp` | Suomi NPP | 375 m | 2012–2025 | 69–130 MB |
| `viirs-jpss1` | NOAA-20 | 375 m | 2018–2025 | about 70 MB |

NOAA-21 has no yearly country files.

## Area API (needs a FIRMS MAP_KEY)

`/api/area/csv/<MAP_KEY>/<SOURCE>/<west,south,east,north>/<DAY_RANGE>/<DATE>`, with `DAY_RANGE` from 1 to 5 days.
Sources: `MODIS_SP`, `MODIS_NRT`, `VIIRS_SNPP_SP`, `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA20_NRT`,
`VIIRS_NOAA21_SP`, `VIIRS_NOAA21_NRT`.

We use it for:
- 2026 to date, for all sensors;
- NOAA-21 from 2023.

Limit: 5000 transactions per 10 minutes per key, and a multi-day request can count as several transactions.

## Verified on 2026-11-14 (`uv run jangada-probe`)

Date ranges per source (from `/api/data_availability`):

| Source | SP (standard processing) | NRT (near real time) |
|---|---|---|
| MODIS | 2000-11-01 .. 2026-08-31 | 2026-09-01 .. today |
| VIIRS S-NPP | 2012-01-20 .. 2026-07-31 | 2026-08-01 .. 2026-11-02 (end of S-NPP data) |
| VIIRS NOAA-20 | 2018-04-01 .. 2026-07-31 | 2026-08-01 .. today |
| VIIRS NOAA-21 | 2023-03-01 .. 2026-07-31 | 2024-01-17 .. today |

Results:
- All 8 sources answered HTTP 200, for recent dates and for old dates (MODIS 2001, S-NPP 2012, NOAA-20 2018, NOAA-21 2023).
- **Cost: 2 transactions per day requested.** The size of the area does not change it: 5 days over all of Brazil costs 10, the same as 5 days over Ceará. The largest test answered 38,945 hotspots in 2.4 s.
- Full API plan (NOAA-21 since 2023-03 plus every sensor for 2026, in 5-day requests over Brazil): about 461 requests, about 4,600 transactions. The downloader must pace itself under 4,000 per 10 minutes, so it takes about 12 minutes.
- Yearly country files: every year exists, and the 2025 files end on 2025-12-31.
  - MODIS 2000–2025: 0.79 GB.
  - S-NPP 2012–2025: 1.53 GB.
  - NOAA-20 2018–2025: 0.89 GB.
  - Total: 3.2 GB.
- Basemap for the web app: the OpenFreeMap style (`https://tiles.openfreemap.org/styles/liberty`) answers without a key.

Notes:
- Standard Processing (SP) data replaces Near Real-Time (NRT) data with about a 5-month lag.
- FIRMS lists VIIRS S-NPP 375 m coverage until 2026-11-02, so the recent series relies on NOAA-20 and NOAA-21.

## Disk plan

Brazil, all years and sensors, is about 3 GB of CSV. The pipeline handles one file at a time:
1. download it;
2. keep only the columns we use, as Parquet;
3. delete the CSV.

## Citations

TODO: copy the exact citation and DOI for each product from the FIRMS "citing FIRMS data" guidance before submission.
