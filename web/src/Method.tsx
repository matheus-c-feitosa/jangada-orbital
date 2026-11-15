import type { AreaSeries, Manifest } from './data/load'
import { Explainer } from './pages/Explainer'
import { SensorTimeline, ViirsAgreement } from './pages/MethodCharts'

const pct = (v: number) => `${Math.round(v * 100)}%`

/** Method page (FR-012): sources, unit, calibration, measured error and limitations. Source: docs/METHOD.md. */
export function Method({ manifest, repo, brazil }: { manifest: Manifest | null; repo: string; brazil: AreaSeries | null }) {
  const v = manifest?.validation
  return (
    <main className="mx-auto max-w-[72ch] px-6 pt-8 pb-16 [&_a]:text-ink [&_a]:underline [&_h1]:mb-3 [&_h1]:text-[30px] [&_h1]:font-semibold [&_h1]:tracking-[-0.02em] [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-[19px] [&_h2]:font-semibold [&_li]:text-ink-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_p]:my-3 [&_p]:text-ink-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
      <h1>How the harmonized calendar is made</h1>
      <p>
        NASA's MODIS (1 km, since 2000) and VIIRS (375 m, since 2012) sensors detect active fires, but VIIRS sees about six
        times more hotspots over Brazil, so their raw counts cannot be compared across years. We convert every month to one
        unit: <strong>Aqua-MODIS-equivalent detections</strong>, the count the Aqua satellite would have reported.
      </p>
      <Explainer brazil={brazil} manifest={manifest} />
      <SensorTimeline dataDate={manifest?.data_date ?? '2026-11-14'} />
      <ViirsAgreement brazil={brazil} />
      <h2>Steps</h2>
      <ol>
        <li>NASA FIRMS hotspots for Brazil, November 2000 to {manifest?.data_date ?? 'today'}: vegetation fires only, low-confidence detections removed.</li>
        <li>VIIRS pixels of the same fire and overpass within ~1 km count once, as a 1 km MODIS pixel would.</li>
        <li>Counts per 0.1° grid cell (about 11 km) and month; each cell belongs to one state.</li>
        <li>One calibration factor per state and month of the year, fitted on 2012–2023, when Aqua and VIIRS flew together. States with few fires lean on the national factor.</li>
        <li>Series: Terra scaled to Aqua until July 2002, Aqua observed until December 2023, VIIRS calibrated from January 2024.</li>
      </ol>
      <h2>Measured error</h2>
      <p>Fitted on 2012–2020 and tested on {v?.heldout_years ?? '2021–2022'}, years the model never saw:</p>
      <table className="my-2 border-collapse tabular-nums [&_td]:border-b [&_td]:border-line [&_td]:py-1.5 [&_td]:pr-6 [&_th]:border-b [&_th]:border-line [&_th]:py-1.5 [&_th]:pr-6 [&_th]:text-left [&_th]:font-medium">
        <thead><tr><th scope="col">Level</th><th scope="col">Within ±20%</th></tr></thead>
        <tbody>
          <tr><td>Brazil, per month</td><td>{v ? `mean error ${pct(v.mape_national_month)}` : '…'}</td></tr>
          <tr><td>State, per year</td><td>{v ? pct(v.share_within_20pct_state_year) : '…'} of state-years</td></tr>
          <tr><td>State, per month</td><td>{v ? pct(v.share_within_20pct) : '…'} of state-months (mean error {v ? pct(v.mape_state) : '…'})</td></tr>
        </tbody>
      </table>
      <h2>Other views</h2>
      <ul>
        <li><strong>This year so far:</strong> cumulative harmonized detections since January against the median and the
          10th–90th percentile range of all previous complete years at the same point of the year. The current month is
          compared pro rata (complete days only).</li>
        <li><strong>Fire-season rhythm:</strong> a season year starts in the area's calmest month, so seasons that cross New
          Year stay whole. Start, middle and end are the moments the season reaches 10%, 50% and 90% of its detections. A
          change of the start is stated only when the first and last ten seasons differ by at least two weeks.</li>
        <li><strong>Total per year:</strong> the sum of the twelve months; on converted years (Terra, VIIRS) the whisker is
          the P25–P75 range of the conversion. The line is the median of the complete years.</li>
        <li><strong>This year vs normal (map) and ranking:</strong> each state's detections since January, ranked against
          the same date in every previous complete year (the same comparison as “so far”). The colour is that percentile.</li>
        <li><strong>Density:</strong> detections per 1,000 km², using the geodesic area of the selection (IBGE outlines for
          Brazil and states, the drawn shape otherwise), so areas of different sizes can be compared.</li>
      </ul>
      <h2>Limitations</h2>
      <ul>
        <li>Values from 2024 and before August 2002 are estimates; the calendar marks those years with “est.” and the CSV includes the observed counts of every satellite.</li>
        <li>From 2024 the Aqua and Terra orbits drifted to later hours, when more fires burn, so their raw counts are no longer comparable with earlier years.</li>
        <li>The last month is partial and compared pro rata; the last days use near-real-time data that may still change.</li>
        <li>Drawn areas are approximated by the 0.1° cells whose centre falls inside them.</li>
      </ul>
      <h2>Sources</h2>
      <ul>
        <li>NASA FIRMS, Fire Information for Resource Management System: MODIS Collection 6.1 and VIIRS 375 m active fire data.</li>
        <li>IBGE: official borders of Brazil and its states.</li>
        <li>Basemap: © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap.</li>
      </ul>
      <p>Full method, code and data pipeline: <a href={`${repo}/blob/main/docs/METHOD.md`} target="_blank" rel="noreferrer">docs/METHOD.md on GitHub</a>.</p>
    </main>
  )
}
