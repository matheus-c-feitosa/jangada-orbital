Update the "Jangada Orbital — new UI" canvas (https://claude.ai/artifact/4PMKjGnA39Dj4yGpnKmXef) with the new data and charts below. Work on the boards that already exist, keep the same look, and change only what this request describes.

## Context

Jangada Orbital is a static web app for NASA Space Apps 2026 (challenge "Harmonization of MODIS and VIIRS Hot Spots"). It shows a calendar of fire hotspots in Brazil (month × year, 2000 to today), with every satellite converted to "Aqua-MODIS-equivalent detections". It has no server and no login. The sample data on the boards is made up; keep using plausible sample values. The only real numbers are those of the validation on the Method page (section 5).

## What to keep

- The current dark palette: background #0C1424 and #0F1A2E, surfaces #16233C and #13203A, borders #2A3A5A, text #E7ECF5, #C9D3E3 and #9AA8C0, orange accent #F97316 and #FB923C, focus #FDBA74.
- The calendar ramp: #1B2843 → #4A2617 → #773113 → #A9420F → #DD5E0E → #F58634 → #FAB16F → #FDDDB3.
- The Archivo font.
- On desktop, the three columns (filters 300 px, map 680 px, data 460 px) and the tabs of the data column.
- On phones, the map first and the data in a drawer.
- On tablets, the map on top and the data below.
- The diagonal hatching of "month in progress", reused for any partial period.
- The interface text stays in English, as on the current boards.

## What leaves the design

The app will not have recent hotspot data. Remove:

- the "Detections, last 7 days" layer and the flame markers on the map;
- the "Fire cluster near Iguatu" card and the "Phone: tap a flame" board (Phone-Cluster). Replace that board with a tap on a state of the anomaly layer (section 3);
- the "More than usual for this place and month" mark and the sentence "Select a flame to see its detections".

Fire radiative power (FRP) and the share of night-time hotspots do not go in either.

Note: `canvas.json` lists Phone-Draw, Tablet and Tablet-Filters, but those three files do not exist in the canvas. Create all three with the changes below.

## What goes in, by priority

### 1. Biomes as an area (highest priority)

- In the "Area" field, offer a scope selector: Brazil, Biome, State, Municipality or drawn area.
- The biomes are Amazônia, Cerrado, Caatinga, Mata Atlântica, Pantanal and Pampa. Show the names as IBGE writes them.
- New "Biome borders" layer in "Map layers". When a biome is chosen, the map frames the biome and highlights its outline.
- The "About this area" box shows the area in km², the states covered and the density per 1,000 km².
- Calendar, "2026 so far" and "Season rhythm" work the same for biomes.
- Show this on desktop (Main board), on the phone (filters drawer) and on the tablet.

### 2. Yearly total with uncertainty (Calendar tab, below the grid)

- Bar chart with one total per year, 2001 to 2026, about 160 px tall in the 460 px column.
- Uncertainty whiskers (P25–P75 range of the conversion) only on converted years: Terra until 2002 and VIIRS from 2024. The observed Aqua years (2003–2023) have no whisker.
- Dashed line with the median of the complete years.
- 2026 is hatched as partial.
- Converted years stand out by pattern or outline, not only by colour.
- On hover or tap on a bar, a text such as "2024: 267k (range 241k–290k), converted from VIIRS" appears.
- In "Observed" mode, the bars are grouped by sensor family (MODIS and VIIRS) and have no whisker.
- Provide an equivalent table for screen readers.
- On the phone, the chart sits right below the calendar, inside the drawer.

### 3. Two data layers on the map ("Map layers" panel)

Only one data layer is active at a time (radio selection). Borders stay as checkboxes.

- **Fire recurrence**: in how many of the last 10 complete years (2016–2025) each grid cell of about 11 km had fire. Use the orange calendar ramp and a legend from 0 to 10 years. Keep the period visible and editable, because the number of years may still change.
- **This year vs normal**: states or biomes painted by the percentile of the 2026 total so far, compared with 2001–2025 at the same date. Use a diverging blue ↔ orange scale, centred on the median.
- Tapping a state opens a popover with the text "Pará: 41k detections by 14 Nov, 88th percentile of 2001–2025" and a "Select this area" button.
- The legend sits in the bottom-left corner. On the phone, it takes at most 20% of the map.

### 4. Ranking and comparison (new "Ranking" tab)

- The fourth tab goes next to Calendar, 2026 so far and Season rhythm. If the labels do not fit in 460 px, shorten "Season rhythm" to "Season".
- Scope selector: States, Biomes or Municipalities.
- Table sortable by the year total, per 1,000 km² and by position against normal (percentile). Each row has a mini bar.
- Show the top 10 and a "Show all" button, with the list scrolling inside its box.
- Clicking a row selects the area.
- A "Compare" checkbox per row accepts up to 3 areas. The ticked areas appear overlaid on the "2026 so far" tab, as cumulative curves per 1,000 km².
- The colours of the compared areas differ in lightness, not only in hue.
- The tab has a "Download CSV" button and works on the phone.

### 5. Method page with charts (new desktop board 1440 wide, plus a phone version)

Today the header has a "Method" link, but the canvas has no such page. It should have four blocks, each with a short reading sentence:

- **Sensor timeline**: one lane per satellite (Terra since 2000, Aqua since 2002, S-NPP from 2012 to 2 Nov 2026, NOAA-20 since 2018, NOAA-21 since 2023). The lane is coloured by the satellite's role in the harmonized series: Terra converted from 2000-11 to 2002-07, Aqua observed from 2002-08 to 2023-12, and the NOAA-20/NOAA-21 mean converted from 2024.
- **Local overpass time of Aqua and Terra per year**: shows the orbit drift at the end of the mission, which is the reason to leave Aqua in 2024. Include a reference line at the original time (Aqua around 13:30).
- **Agreement between the VIIRS satellites**: monthly NOAA-20/S-NPP and NOAA-21/S-NPP ratio, with a reference line at g = 0.981.
- **Validation**: scatter of predicted × observed Aqua values over the 2021–2022 test months, with the ±20% band. Use these real numbers:

  | Level | Mean absolute error | Within ±20% |
  |---|---|---|
  | National per month | 13.5% | 92% of months |
  | State per year | 8.3% | 96% |
  | State per month | 22.1% | 62% |

  The total bias is −2.2%.

Also keep the chart the site already has: yearly totals of Aqua, S-NPP and harmonized, from 2012 on.

### 6. Climate context (conditional)

It goes in only if it fits without cluttering the screen or weighing on the app. Design it so it can be cut without redoing anything.

- A "Climate context" control, off by default.
- When on, each calendar year gets a small El Niño or La Niña mark (NOAA ONI index) next to the year label.
- Optional: a thin rainfall anomaly line (NASA GPM IMERG) over the yearly total chart.
- If only one of the two fits, keep the ONI mark.

## General rules

- 4.5:1 contrast for text, small labels included.
- Nothing that depends on colour alone.
- Touch targets of at least 44 px.
- On the phone (390 px), no horizontal page scroll. Wide tables scroll inside their own box.
- Real buttons, links and inputs.
- Each new chart has a short title, a legend and a sentence that answers the user's question in plain language.

## Expected boards

- **Update:** Main (Calendar), Tab-Year, Tab-Rhythm, Phone, Phone-Calendar, Phone-Year, Phone-Rhythm and Phone-Filters.
- **Create:**
  - Desktop: Ranking tab.
  - Desktop: Method page.
  - Phone: Ranking.
  - Phone: Method.
  - Phone: tap on a state (replaces Phone-Cluster).
  - Phone: choose a biome.
  - Phone-Draw, Tablet and Tablet-Filters.
