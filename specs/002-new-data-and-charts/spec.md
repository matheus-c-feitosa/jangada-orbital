# Feature specification: new data and charts

**Feature branch**: `002-new-data-and-charts`
**Created**: 2026-11-14
**Status**: Draft (`/speckit.specify` phase; `/speckit.clarify` and `/speckit.plan` still to do)
**Input**: "Check, on the current site and on the planned new UI (artifact *Jangada Orbital — new UI*), whether there is
other data we can track and present, whether a chart is missing, and suggest new data and ways to show it that fit the
project."

> GitHub spec-kit format (`spec-template.md`): prioritized user stories that can be tested independently, functional
> requirements (FR), measurable success criteria (SC), entities, edge cases and at most three `[NEEDS CLARIFICATION]`
> markers. Numbering continues from spec 001 (last criterion cited: SC-003; last task: T048).

---

## Diagnosis: what exists, what the new UI promises, what the pipeline already has and does not show

### Screens today (site in `web/`) and in the new UI (artifact)

| View | Current site | New UI (desktop and phone) |
|---|---|---|
| Month × year calendar | yes | yes, with an anomaly mark (> p90) and the month in progress hatched |
| 2026 so far (cumulative against the median and the p10–p90 band) | yes (T047) | yes |
| Season rhythm (10%, 50%, 90%) | yes (T040) | yes |
| Density per 1,000 km² | yes (T048) | yes, in the "About this area" box |
| Harmonization explainer (Aqua × S-NPP × harmonized) | yes, Method page (T038) | not on the boards |
| "Detections, last 7 days" layer + tap on a flame | **no** | yes (boards *Phone-Cluster* and *Main*) |
| "More than usual for this place and month" mark on the map | **no** | yes (map legend) |
| Value of one hotspot, "As Aqua-MODIS 1.4 detections" | **no** | yes (hotspot card) |

### Data the pipeline already computes and the app does not show

| Data | Where it is | Status |
|---|---|---|
| `lo` / `hi` (P25–P75 uncertainty of the conversion) | `harmonized.parquet`, `series.json` | only in the CSV; **no chart shows the uncertainty** |
| `n_day` (daytime detections) | `cell_month.parquet` | not exported to the web |
| `frp_sum` (fire radiative power, MW) | `cell_month.parquet`, `brazil_month.csv` | not exported to the web |
| `acq_time` (overpass time) | `data/interim/points/` | used only implicitly; it is the evidence of the Aqua/Terra orbit drift cited in METHOD |
| Confidence class (low/nominal/high) | normalized points | `low` dropped; the share is never shown |
| Observed per satellite (Terra, Aqua, S-NPP, NOAA-20, NOAA-21) | `series.json` | only in the explainer and the CSV |

### Chart gaps

1. **Time series with uncertainty.** The calendar shows colour, not magnitude or error. A chart of yearly (or monthly)
   totals with the `lo`–`hi` range is missing, and it is the first thing a judge of the harmonization challenge will
   look for.
2. **Analytical map.** The map only serves to pick an area. A layer answering "where does it burn most, or more than
   normal" is missing, and that is the natural use of a hotspot map.
3. **Comparison between regions.** There is no ranking of states or municipalities, and no way to compare two areas.
4. **Fire intensity and time of day.** The app counts hotspots but ignores how strong (FRP) and when (day/night) they
   burn.
5. **Visual proof of the method.** The Aqua/Terra orbit drift and the agreement between the three VIIRS satellites are
   only text and a table in METHOD.

---

## User scenarios and testing *(mandatory)*

### Story 1: see each year's total with its uncertainty (Priority: P1)

Someone studying an area wants to know whether 2024 really was higher than 2010, and by how much, without reading the
CSV. A bar chart of the area's yearly totals, with the `lo`–`hi` range on the converted years (Terra 2000–2002, VIIRS
from 2024) and no range on the observed Aqua years, shows magnitude, trend and the effect of harmonization together.

**Why this priority**: it uses data already exported (`series.json` and tiles), it is front-end only, and it answers
the core of the challenge: the series is comparable, and how far it can be trusted.

**Independent test**: pick Brazil and then Ceará; the chart shows 26 bars, those from 2024 on with whiskers, and each
bar's value matches the calendar's sum for that year.

**Acceptance scenarios**:

1. **Given** a selected area, **when** the user opens the calendar tab, **then** they see below the grid the yearly
   totals as bars, the median of the complete years as a reference line, and the current year marked as partial.
2. **Given** a converted year, **when** the user hovers or taps the bar, **then** they read "2024: 267k
   (range 241k–290k), converted from VIIRS".
3. **Given** the "Observed" mode, **then** the bars show the total per satellite (bars grouped or stacked by family) and
   there is no uncertainty range.

---

### Story 2: map of where fire returns every year and where it is above normal (Priority: P1)

Someone opening the app wants to see on the map, before drawing any area, where the critical regions are.
Two new layers, switched on in the "Map layers" panel the new UI already has:

- **Recurrence**: in how many of the last N complete years each 0.1° cell had fire (sequential orange scale, the same
  ramp as the calendar).
- **Year anomaly**: each state's (choropleth) or cell's year-to-date total, as a percentile against previous years at
  the same point of the year (same logic as T047). Diverging blue–orange scale, centred on the median.

**Why this priority**: the map is the central element of the new UI and today shows no historical data; the anomaly
layer by state comes entirely from `series.json` (27 states), with no new pipeline.

**Independent test**: switch on "Year anomaly"; the 27 states appear coloured and the darkest state matches the first
of the Story 3 ranking.

**Acceptance scenarios**:

1. **Given** the map of Brazil, **when** the user switches on "Recurrence", **then** each cell shows 0–N years with
   fire, with a legend and the period written out ("2016–2025").
2. **Given** the "Year anomaly" layer, **when** the user taps a state, **then** they read "Pará: 41k detections by
   14 Nov, 88th percentile of 2001–2025" and can select the state as the area.
3. **Given** a phone, **then** the layers sit in the filters drawer and the legend covers no more than 20% of the map.

---

### Story 3: ranking and comparison of states and municipalities (Priority: P2)

Journalists and managers want the list: which states or municipalities burned the most this year, and which grew the
most. A sortable table (year total, per 1,000 km², change against the median) with a mini bar per row, and a "compare"
mode that overlays the cumulative curves (T047) of up to three areas.

**Why this priority**: states come from `series.json`; municipalities need a per-municipality aggregation in the
pipeline (cells are already assigned to states in `jangada-regions`; the same is missing for municipalities).

**Independent test**: sort by density; the first state has the highest number of hotspots per 1,000 km² and the
table's CSV reproduces the order.

**Acceptance scenarios**:

1. **Given** the "Ranking" tab, **when** the user sorts by "above normal", **then** the order follows the percentile of
   the year-to-date total.
2. **Given** two chosen areas, **when** the user turns on "compare", **then** they see both cumulative curves
   normalized by area (per 1,000 km²), with colours that differ in lightness and not only in hue.

---

### Story 4: fire intensity and time of day (FRP and day/night) (Priority: P2)

Counting hotspots does not say whether the fire was stronger. Fire radiative power (FRP) and the share of night-time
hotspots point to more intense or drier fire (fire that stays active at night is usually drought fire, not management
burning).

- **Chart of median FRP per hotspot**, per year, split by sensor family (Aqua MODIS 2002–2023; VIIRS from 2012), with
  the 2012–2023 overlap visible. FRP is never mixed between sensors (1 km and 375 m pixels give different FRP).
- **Night-time share** per month or year, as a thin line under the calendar or as a band in the season rhythm.

**Why this priority**: the data exists in the pipeline (`frp_sum`, `n_day`), but it has to enter the export
(`series.json` and tiles), and it needs a method sentence so it is not read as "harmonized".

**Independent test**: for Brazil, the night-time share and the median FRP per year appear with a sensor label; the
values match a DuckDB query on `cell_month.parquet`.

**Acceptance scenarios**:

1. **Given** an area, **when** the user opens "Intensity", **then** they see two FRP series labelled "Aqua MODIS" and
   "VIIRS (S-NPP/NOAA-20/21)", never a single series.
2. **Given** a month with few hotspots (< 20), **then** the point is drawn hollow and the text warns that the sample
   is small.

---

### Story 5: the method in charts (orbit drift and agreement between satellites) (Priority: P2)

The Method page explains in text why Aqua stops being the reference in 2024. Charts make it visible to the judges:

- **Sensor timeline** (swimlane): one lane per satellite (Terra, Aqua, S-NPP, NOAA-20, NOAA-21) from 2000 to today,
  coloured by the part used in the harmonized series (sources 1, 0, 2 in METHOD).
- **Median local overpass time** of Aqua and Terra per year, from `acq_time`: the post-2020 drift explains the drop of
  the VIIRS/Aqua ratio in 2024.
- **Monthly NOAA-20/S-NPP and NOAA-21/S-NPP ratio** with the `g = 0.981` line.
- **Validation**: predicted × observed (Aqua) scatter of the 2021–2022 test months, with the ±20% band of SC-003.

**Why this priority**: it strengthens the credibility of the harmonization, which is the theme of the challenge; low
cost (small DuckDB queries exported as JSON).

**Independent test**: the Method page shows the four charts; Aqua's median overpass time in 2012 is close to 13:30.

---

### Story 6: biomes as an area (Priority: P2)

Fire in Brazil is discussed by biome (Amazônia, Cerrado, Caatinga, Mata Atlântica, Pantanal, Pampa). Add the IBGE
biomes as a selectable area, next to Brazil, states and municipalities. METHOD already lists "regions by biome" as a
calibration improvement, so the same boundaries serve both.

**Independent test**: pick "Pantanal"; the calendar shows 2020 as the highest year of the series.

---

### Story 7: climate context (Priority: P3)

Years of extreme fire coincide with drought and El Niño (2015/16, 2023/24). Suggestions, cheapest first:

- **ENSO (NOAA ONI index)**: a thin band above the calendar, coloured by El Niño / La Niña. One small CSV.
- **Rainfall anomaly (NASA GPM IMERG, monthly)** per state: a secondary line on the yearly chart or shading on the
  calendar.
- **Burned area (MODIS MCD64A1)**: a "hotspots × burned area" comparison per year, as an independent check.

**Why this priority**: very aligned with NASA, but it adds new sources, downloads and citations; after the submission.

---

### Story 8: data the new UI already draws and the pipeline does not deliver yet (Priority: P1, prerequisite)

The *Main* and *Phone-Cluster* boards show three things that have no data source today:

1. **Hotspots of the last 7 days** as points on the map (the export only has monthly counts per cell).
2. **"More than usual for this place and month"**: needs the historical median per cell and month of the year.
3. **"As Aqua-MODIS 1.4 detections"** on a hotspot: needs the conversion factor per state and month (it already exists
   in `harmonize.py`) available in the front end.

**Independent test**: the file `recent.geojson` (or equivalent) is in the manifest, holds only hotspots of the last 7
complete days, and each hotspot carries satellite, date, time, FRP and converted value.

---

### Edge cases

- Partial current month: rankings and anomalies use the same pro rata rule of complete days already used in T047.
- Small areas (few cells): anomaly and FRP with fewer than 20 hotspots appear as "small sample", not as a colour.
- S-NPP ends on 2026-11-02: per-satellite charts show the end of the lane, not a drop to zero.
- NRT without `type`: hotspots of the last 7 days follow the same static-source filter as `jangada-aggregate`.
- FRP across sensors: never summed or compared as a single series.
- Phone: every new chart fits 390 px without horizontal page scroll; wide tables scroll inside their box.

---

## Requirements *(mandatory)*

### Functional requirements

- **FR-020**: The app MUST show the selected area's yearly totals with the `lo`–`hi` range on converted years.
- **FR-021**: The yearly chart MUST tell complete years, the partial year and converted years (Terra, VIIRS) apart
  without relying on colour alone.
- **FR-022**: The map MUST offer a recurrence layer (years with fire per cell) for the last N complete years.
  `[NEEDS CLARIFICATION: N = 10 years (2016–2025) or the whole series?]`
- **FR-023**: The map MUST offer a year-to-date anomaly layer per state, as a percentile against the previous complete
  years.
- **FR-024**: The app MUST offer a sortable ranking of states by total, density and percentile; municipalities join
  once the pipeline aggregates by municipality.
- **FR-025**: The pipeline MUST export `n_day` and `frp_sum` per area and month, per sensor family, without
  harmonizing them.
- **FR-026**: The app MUST label every FRP series with its source sensor.
- **FR-027**: The Method page MUST show the sensor timeline, the median overpass time of Aqua/Terra, the ratio between
  the VIIRS satellites and the validation scatter.
- **FR-028**: The pipeline MUST assign cells to IBGE biomes and export series per biome.
- **FR-029**: The pipeline MUST export the hotspots of the last 7 complete days with satellite, date, time, FRP and
  Aqua-MODIS-equivalent value, and the historical median per cell and month of the year.
  `[NEEDS CLARIFICATION: the site is static and updated by hand; are the "last 7 days" frozen at the export date, or
  will a scheduled Action run the NRT pipeline?]`
- **FR-030**: Every new chart MUST have an equivalent table for screen readers and be in the CSV or in a CSV of its own.
- **FR-031**: Climate context (ONI, GPM IMERG, MCD64A1) MAY be added as an optional layer.
  `[NEEDS CLARIFICATION: does it go in before the hackathon submission (15 Nov) or after?]`

### Entities

- **AnnualTotal**: area, year, value, lo, hi, source (0, 1, 2), complete/partial.
- **CellRecurrence**: cell, period, years with fire, total in the period.
- **AreaAnomaly**: area, cut-off date, year-to-date total, median, percentile, reference years.
- **IntensitySeries**: area, month, sensor family, hotspots, daytime hotspots, total FRP, median FRP per hotspot.
- **RecentDetection**: lat, lon, satellite, date, time, FRP, conversion factor, cell, above normal (yes/no).
- **SensorTimeline**: satellite, start, end, role in the harmonized series, median overpass time per year.

---

## Success criteria *(mandatory)*

- **SC-010**: For Brazil and the 27 states, the sum of the yearly bars differs from the sum of the calendar by less than
  0.1%.
- **SC-011**: A new user finds, in less than 30 seconds and without drawing an area, the state furthest above normal
  this year (hallway test with 3 people).
- **SC-012**: All new charts load for Brazil in less than 2 s on a 4G connection and add less than 1 MB to the data
  downloaded on the first visit.
- **SC-013**: No chart shows FRP or the night-time share as a single harmonized series (manual review + a vitest test
  on the labels).
- **SC-014**: The exported median overpass time for Aqua in 2012 is between 13:00 and 14:00 local time (sanity check
  of `acq_time`).
- **SC-015**: All new charts pass Playwright at 390 px with no horizontal page scroll.

---

## Fit in the new UI

| Story | Where it goes in the new UI | Form |
|---|---|---|
| 1. Yearly total with uncertainty | Calendar tab, below the grid (desktop); drawer scroll (phone) | bars + whiskers, median line |
| 2. Recurrence and anomaly | "Map layers" panel (already on the *Main* board) and filters drawer | choropleth by state; cell grid |
| 3. Ranking and comparison | new "Ranking" tab next to Calendar / 2026 / Rhythm | table with mini bars; overlaid curves |
| 4. Intensity | new "Intensity" tab or a section of Rhythm | two lines per sensor; night-time share band |
| 5. Method in charts | Method page, next to the T038 explainer | swimlane, overpass-time line, scatter |
| 6. Biomes | "Area" field (list next to Brazil / State) | same calendar |
| 7. Climate | band above the calendar | ONI band; rainfall line |
| 8. Last 7 days | map and hotspot card (already drawn) | points clustered into flames |

## Suggested order (input for `/speckit.tasks`)

1. Story 1 and the per-state anomaly layer of Story 2: front-end only, the data already exists.
2. Story 8: without it, the new UI promises data that does not exist.
3. Story 5: Method charts, small queries.
4. Stories 3, 4 and 6.
5. Story 7, after the submission.
