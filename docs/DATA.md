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

## How the pipeline uses them

| Period | Terra + Aqua (MODIS) | S-NPP | NOAA-20 | NOAA-21 |
|---|---|---|---|---|
| up to 2025 | yearly file | yearly file | yearly file | area API (from 2023-03) |
| 2026 | area API | area API (until 2026-11-02) | area API | area API |

- **Choice of product.** In the area API we use standard processing (SP) while it exists, and near real time (NRT) after it.
- **Clipping.** The area API takes a rectangle, and the FIRMS country API no longer works ("Invalid API call", 2026-11-14). So API points are clipped with the official IBGE border of Brazil, the same area as the yearly country files. `jangada-download crosscheck` measures the difference between the two routes.
- **One schema for all files.** `pipeline/src/jangada/normalize.py` maps every file to the same columns:
  - satellite names: Terra, Aqua, S-NPP, NOAA-20, NOAA-21;
  - confidence classes: low, nominal, high (MODIS < 30, 30–79, ≥ 80);
  - `type`, which only standard processing has.

## Aggregation (`jangada-aggregate`)

1. Keep vegetation fires only (`type` 0).
   - NRT rows have no `type`. We drop them where standard processing ever marked the same ~1 km position as a static land source or offshore (`type` 2 or 3).
   - Drop low-confidence detections. `--keep-low` keeps them.
2. Collapse detections into distinct ~1 km positions (0.01°) per overpass. Several 375 m VIIRS pixels of one fire count once, as a 1 km MODIS pixel would. This is the first harmonization step.
3. Count per 0.1° cell (about 11 km), month and satellite into `data/processed/cell_month.parquet`:
   - `n`: detections as delivered;
   - `n_1km`: distinct ~1 km positions per overpass;
   - `n_day`: daytime detections;
   - `frp_sum`: total fire radiative power.
4. National monthly totals go to `brazil_month.csv`, and yearly totals per satellite to `overlap_annual.csv`. These yearly totals feed the VIIRS / MODIS calibration.

## First full run (2026-11-14)

- **Points.** 2000-11-01 to 2026-11-14, Brazil. About 40 million hotspots, stored as 602 MB of Parquet in `data/interim/points/`.
- **Cross-check of the two routes** (NOAA-20, September 2025):
  - yearly country file: 207,898 hotspots;
  - area API clipped with the IBGE border: 207,864 hotspots;
  - difference: **-0.02%**, so both routes cover the same area.
- **Aggregation** took 0.7 min. `cell_month.parquet` has 6.4 million rows and takes 29 MB, small enough to serve as a static file.
- **VIIRS against Aqua MODIS**, yearly hotspots in Brazil:

  | Period | Ratio as delivered | Ratio after the ~1 km collapse |
  |---|---|---|
  | 2012–2023 | 5.9–6.8 | 3.9–4.3 |
  | 2024–2026 | 5.1–6.0 | 3.3–3.6 |

  - The ~1 km collapse removes about a third of the gap. The rest is the higher sensitivity of VIIRS to small fires, which the calibration has to model.
  - The ratio is very stable from 2012 to 2023, which makes it a good calibration period.
  - The ratio falls from 2024. To check: the end-of-life orbit drift of Aqua and Terra, whose overpass times changed.
  - S-NPP and NOAA-20 agree within about 3% in every year they share, so the three VIIRS satellites can be treated as one family.

## Known limitation: oceanic islands

- The yearly country files include 3 detections on Fernando de Noronha, all on 2014-03-09, out of 46.4
  million hotspots.
- The area-API route never includes such points:
  - the API rectangle stops at 34.7° W;
  - the IBGE border does not include Trindade;
  - the simplified IBGE polygon of Noronha does not contain those 3 points.
- The effect on any statistic is below 0.0001%. It is accepted and listed here for transparency.

## Disk plan

Brazil, all years and sensors, is about 3 GB of CSV. The pipeline handles one file at a time:
1. download it;
2. keep only the columns we use, as Parquet;
3. delete the CSV.

## Spec 002 sources (no key needed, cached in `data/raw/extras/`)

- IBGE biomes 1:250,000: `https://geoftp.ibge.gov.br/informacoes_ambientais/estudos_ambientais/biomas/vetores/Biomas_250mil.zip`
- NOAA CPC Oceanic Niño Index: `https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt`
- FIRMS last 7 days, South America (MODIS C6.1, VIIRS S-NPP, NOAA-20, NOAA-21):
  `https://firms.modaps.eosdis.nasa.gov/data/active_fire/<product>/csv/<file>_South_America_7d.csv`

## Citations

TODO: copy the exact citation and DOI for each product from the FIRMS "citing FIRMS data" guidance before submission.
