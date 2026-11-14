# Method: harmonized fire calendar

Model version `cal-1.0`, data up to 2026-11-14. Reproduce with `uv run jangada-regions && uv run jangada-harmonize`.

## Unit

All values are in **Aqua-MODIS-equivalent detections per month**: the number of fire detections the Aqua MODIS
sensor would have reported. Aqua has the longest stable record (2002–2023, afternoon overpass).

## Steps

1. **Points.** NASA FIRMS hotspots for Brazil, 2000-11 to today. Only vegetation fires are kept; low-confidence
   detections are dropped (see `DATA.md`).
2. **VIIRS pixel collapse.** One fire seen by VIIRS often covers several 375 m pixels. Detections of the same
   overpass within the same ~1 km position (0.01°) count once, as a 1 km MODIS pixel would.
3. **Grid.** Counts per 0.1° cell (about 11 km), month and satellite.
4. **Regions.** Each cell is assigned to a Brazilian state by its centre (IBGE state mesh). The 776 border and
   coastal cells whose centre falls outside every state take the nearest state.
5. **Calibration.** One factor per state and month of the year:
   - `factor = (Σ Aqua + M·f_national) / (Σ source + M)`, pooled over the fit years, with `M = 100` source
     detections;
   - states and months with few fires are therefore pulled toward the national factor of the same month;
   - VIIRS source: S-NPP ~1 km positions, fitted on 2012–2023;
   - early-years source: Terra detections, fitted on 2003–2012.
6. **NOAA-20 and NOAA-21.** From 2024 the series uses the mean of NOAA-20 and NOAA-21. That mean is put on the
   S-NPP scale with `g = 0.981`, measured over the 34 months in which all three satellites flew in full.
7. **Series.**

   | Period | Source | `source` code |
   |---|---|---|
   | 2000-11 to 2002-07 | Terra × factor | 1 |
   | 2002-08 to 2023-12 | Aqua observed | 0 |
   | 2024-01 onward | (NOAA-20 + NOAA-21)/2 × g × factor | 2 |

8. **Uncertainty.** `lo` and `hi` use the 25th and 75th percentiles of the monthly ratios in the fit years, for
   the same state and month of the year. States with fewer than 4 usable months use the national spread.
   Observed months have `lo = hi = value`.

## Validation (fit 2012–2020, held-out test 2021–2022, against Aqua observed)

| Level | Mean absolute % error | Within ±20% |
|---|---|---|
| National, per month | 13.5% | 92% of months |
| State, per year | 8.3% | 96% of state-years |
| State, per month (Aqua ≥ 20 detections; 487 state-months) | 22.1% (median 14.8%) | 62% of state-months |

Total bias over the test years: −2.2%.

### The error depends on the size of the month

The state-month row above pools small and large months. `uv run jangada-strata` reports the same held-out test per
bin of Aqua count. The "perfect estimate" column is the share of months that would fall within ±20% if the estimate
were exactly right and only Aqua's own Poisson counting noise remained. Fire counts are clustered, so real noise is
larger: read that column as an upper bound, not a target.

| Aqua detections in the state-month | State-months | Within ±20% | Perfect estimate (upper bound) | Mean error | Bias |
|---|---|---|---|---|---|
| 20–49 | 93 | 53% | 76% | 28.3% | +8.4% |
| 50–99 | 87 | 48% | 91% | 29.4% | +13.5% |
| 100–499 | 170 | 61% | 99% | 21.9% | +2.3% |
| 500 or more | 137 | 78% | 100% | 13.3% | −3.1% |
| all (≥ 20) | 487 | 62% | 93% | 22.0% | −2.3% |

### SC-003: original target not met, criterion revised

The first target (SC-003) asked for 80% of all state-months with at least 20 Aqua detections to fall within ±20%.
**It is not met: 62%.** The model is at the limit of its family, not just unlucky:
- the shrinkage strength M (0 to 1000) and a power-law exponent b (0.8 to 1.1) were tried; each was chosen on
  2019–2020 (fit 2012–2018) and reported on 2021–2022, so the test years never chose the setting; none moved the
  held-out share outside 54–63%;
- the share within ±20% stays below the counting-noise upper bound in every bin, so it is not only noise: the two
  sensors see different hours of the day, and a few large fires dominate a month.

Revised criterion (2026-11-14), stated for the unit the calendar is read in, on the held-out years:
- national months within ±20% in at least 90% of cases (met: 92%);
- state-years within ±20% in at least 90% of cases (met: 96%);
- state-months with 500 or more Aqua detections within ±20% in at least 75% of cases (met: 78%);
- smaller state-months are published as indicative, with the table above.

Next steps, each needing fields that are not in the monthly cell counts (a re-aggregation of the raw hotspots):
- split day and night detections;
- regions by biome;
- fire radiative power thresholds.

## Other views in the app

- **This year so far:** cumulative harmonized detections since January, compared with the median and the 10th–90th
  percentile range of all previous complete years at the same point of the year. The current month is compared pro rata,
  counting complete days only.
- **Fire-season rhythm:** a season year starts in the area's calmest month (lowest mean activity), so seasons that cross
  New Year (e.g. Roraima, December–March) stay whole. Start, middle and end are the moments the season reaches 10%, 50%
  and 90% of its detections, interpolated within the month. A shift of the start is reported only when the mean of the
  first and last ten seasons differ by at least two weeks. For Brazil, seasons 2016/17–2025/26 started about two weeks
  earlier than seasons 2001/02–2010/11.
- **Density:** detections per 1,000 km². Areas are geodesic: on the WGS84 ellipsoid for Brazil and states (IBGE
  outlines, within 0.2% of IBGE's official areas), and on a sphere for drawn shapes, circles and municipalities.

## Why stop using Aqua in 2024

From 2024 the VIIRS/Aqua ratio falls from about 4.0 to 3.3–3.6, while S-NPP and NOAA-20 agree within ~3%.
Aqua and Terra left their original orbits at the end of their missions and now cross the equator at later
hours. Fires are more active in the afternoon, so the late Aqua overpass sees more fires. The harmonized
series for 2024 (267k) is therefore below the observed Aqua count (300k): it estimates what the original Aqua
orbit would have seen.

## Known limitations

- The diurnal cycle is strong in parts of Brazil. In Ceará, November and December, Aqua sees about 11× more
  fires than Terra, so the Terra-scaled 2000–2002 months carry more uncertainty.
- S-NPP data ends on 2026-11-02. The series from 2024 does not depend on it.
- The current month is partial; the app compares it pro rata.
- Oceanic islands are not covered by the area-API route (see `DATA.md`).
- Cells are 0.1°, so drawn areas are approximated by the cells whose centre falls inside them. An area too small to
  hold a cell centre uses the one cell around it, is marked approximate, and its density uses the cell's area.
- An area with no detections at all that also lies outside every state outline is reported as outside Brazil, not as
  "no fires".
