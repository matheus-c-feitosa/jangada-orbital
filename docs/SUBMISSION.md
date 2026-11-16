# Project page drafts (Space Apps site)

Draft v3, 2026-11-15 22:10. It replaces v2 (21:00) and v1 (2026-11-14) for T029 (#19). Everything stays in English. Copy each
section into the matching field of the project page.

## Project name

Jangada Orbital: Harmonized Fire Calendar

## High-level summary

Satellites have counted active fires since 2000, but the record is split between MODIS (1 km, since 2000) and VIIRS
(375 m, since 2012), and their counts cannot be compared directly: over Brazil, VIIRS reports about six times more
hotspots than Aqua MODIS.

Jangada Orbital harmonizes both records into one monthly series in Aqua-MODIS-equivalent detections, from November
2000 to today, and turns it into a burning activity calendar. A fire brigade, a civil defence office or a researcher
chooses an area: a state, a biome, a municipality, a shape drawn on the map, or a point and radius. In seconds they
see:
- which months and years burned most;
- whether this month and this year are above or below the usual range;
- which months are unusual.

Estimated months show their likely range, and the method states its measured error. The calendar downloads as CSV
or as an image. The app runs in any browser, in English or Portuguese, with no login. It is built on NASA FIRMS data
for Brazil.

## Project details

**What it does.** A web app for emergency responders, land managers and scientists, at
https://matheus-c-feitosa.github.io/jangada-orbital/.

Areas:
- Brazil, the 27 states or the 6 IBGE biomes;
- any of the 5,570 municipalities, searched by name;
- a rectangle or polygon drawn on the map;
- a point and radius.

For the area, the app shows:
- **Calendar.** A month × year fire calendar from 2001 to today. Months above the 90th percentile of past years are
  flagged. The current, partial month is compared pro rata. Converted months show their likely range.
- **Busiest periods.** The busiest year, the highest month and the months that usually burn most.
- **Yearly totals.** The yearly totals with their conversion range, and this year so far against the normal band
  of past years.
- **Fire season.** When the season usually starts, peaks and ends, whether it is shifting, and how intense the fires
  are (fire radiative power and the share of night detections).
- **Ranking.** A ranking of states, biomes and municipalities by detections, by density per 1,000 km² or against
  their own normal, with a side-by-side comparison.
- **Climate context.** Optional El Niño and La Niña years (NOAA ONI).
- **Maps.** How many years each 0.1° cell burned; this year against normal by state or biome; and the near-real-time
  detections of the last 7 days.
- **Downloads.** The monthly series as CSV, and the calendar as a PNG image.
- **Satellites.** A switch between the harmonized series and the counts each satellite observed.

**How it works.**
1. A Python + DuckDB pipeline downloads the NASA FIRMS hotspots for Brazil: MODIS Terra and Aqua; VIIRS S-NPP,
   NOAA-20 and NOAA-21. That is about 46 million hotspots in the yearly country files. It clips them to the official
   IBGE border. A cross-check against the FIRMS country files differs by −0.02%.
2. It keeps vegetation fires and collapses the VIIRS pixels of the same fire into ~1 km positions per overpass.
3. It counts hotspots per 0.1° cell and month.
4. VIIRS is calibrated to Aqua-MODIS-equivalent detections, with one factor per state and month of the year. The fit
   uses the years both sensors flew (2012–2020). Terra fills the first months before Aqua. From 2024 the series uses
   NOAA-20 and NOAA-21, put on the S-NPP scale.
5. Validation on held-out years (2021–2022) that the model never saw:
   - 92% of national months and 96% of state-years land within ±20%, with a total bias of −2.2%;
   - for state-months the error depends on the size of the month: 78% within ±20% when Aqua saw 500 or more
     detections, 62% over all state-months.

   The first target (80% of all state-months) was not met. The Method page says so and shows the error by size.
6. The pipeline also builds the IBGE biome and municipality views, the recurrence grid, the ranking and the climate
   context.
7. The web app (React, TypeScript, MapLibre) is a static site on GitHub Pages:
   - it reads pre-aggregated files, and the Parquet tiles of the 0.1° grid for drawn areas, directly in the browser;
   - it has no server and needs no login;
   - the first screen shows the answer in about 3 seconds on a 4G phone.

**Benefits.**
- A consistent 25-year fire history for any area of Brazil, where the sensor of origin no longer matters.
- It answers "is this month worse than usual?" and "when does the fire season come here?" in seconds.
- It is honest about what is estimated and how well.

**Tools.**
- Languages and libraries: Python, DuckDB, TypeScript, React, Vite, MapLibre GL, terra-draw, hyparquet, Tailwind CSS.
- Hosting: GitHub Pages.
- The code is under the Apache-2.0 license.

## NASA data

NASA FIRMS (Fire Information for Resource Management System) active fire / hotspot data:
- MODIS Collection 6.1 (Terra, Aqua), 2000–today;
- VIIRS 375 m Collection 2 (Suomi NPP, NOAA-20, NOAA-21), 2012–today;
- yearly country archives, the FIRMS area API, and the near-real-time 7-day files.

Link: https://www.earthdata.nasa.gov/data/tools/firms

## Space Agency Partner data and other references

- IBGE, the Brazilian Institute of Geography and Statistics:
  - official border and state outlines (malhas API);
  - biomes at 1:250,000;
  - municipality outlines.
- NOAA Climate Prediction Center: Oceanic Niño Index (ONI), for El Niño and La Niña years.
- Giglio, L., Schroeder, W., Justice, C. O. (2016). The collection 6 MODIS active fire detection algorithm and fire
  products. Remote Sensing of Environment, 178, 31–41.
- Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. A. (2014). The New VIIRS 375 m active fire detection data
  product. Remote Sensing of Environment, 143, 85–96.
- Software:
  - DuckDB (MIT);
  - MapLibre GL (BSD-3);
  - terra-draw (MIT);
  - hyparquet (MIT);
  - React (MIT);
  - OpenFreeMap / OpenStreetMap contributors (ODbL), for the optional basemap.
- Repository: https://github.com/matheus-c-feitosa/jangada-orbital

## Use of Super Intelligence (SI)

We used Claude Code (Anthropic) as a coding assistant. It helped:
- research the challenge;
- plan the solution;
- write the data pipeline, the web app and the documentation.

Every SI-generated change was reviewed and tested by the team. Commits with SI-generated code carry a
"Co-Authored-By: Claude" line, and docs/SI_USAGE.md logs what was generated and how we checked it.

The demo video is rendered by a script written with Claude Code: its title and end cards are drawn by code, and the
app footage is screenshots of the live app. It carries a visible label, "Edited with SI-assisted code", for its whole
length. The narration is a human voice, not SI-generated. The music bed is synthesized by a script written with
Claude Code (SI-assisted audio, no samples). No SI-generated content uses NASA logos, flags or mission
insignia.

## Final project link

- App: https://matheus-c-feitosa.github.io/jangada-orbital/
- Code: https://github.com/matheus-c-feitosa/jangada-orbital

## Demo link

DEMO_URL (T028, #18): a 28-second video, 1080p, unlisted, no login. The script, subtitles and how it was made are in
`docs/demo/script.md`.

Video: the live app (Brazil, Pará, a drawn area, the Season and "2026 so far" views, the Method page) between a title
card and an end card, with a cursor and highlights showing each click. Narration in English by a team member, with
burned-in English subtitles. Music: an excerpt of our own synthesized soundtrack.
