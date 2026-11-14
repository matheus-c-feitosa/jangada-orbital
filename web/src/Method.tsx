import type { Manifest } from './data/load'

const pct = (v: number) => `${Math.round(v * 100)}%`

/** Method page (FR-012): sources, unit, calibration, measured error and limitations. Source: docs/METHOD.md. */
export function Method({ manifest, repo }: { manifest: Manifest | null; repo: string }) {
  const v = manifest?.validation
  return (
    <main className="method">
      <h1>How the harmonized calendar is made</h1>
      <p>
        NASA's MODIS (1 km, since 2000) and VIIRS (375 m, since 2012) sensors detect active fires, but VIIRS sees about six
        times more hotspots over Brazil, so their raw counts cannot be compared across years. We convert every month to one
        unit: <strong>Aqua-MODIS-equivalent detections</strong>, the count the Aqua satellite would have reported.
      </p>
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
      <table className="num">
        <thead><tr><th scope="col">Level</th><th scope="col">Within ±20%</th></tr></thead>
        <tbody>
          <tr><td>Brazil, per month</td><td>{v ? `mean error ${pct(v.mape_national_month)}` : '…'}</td></tr>
          <tr><td>State, per year</td><td>{v ? pct(v.share_within_20pct_state_year) : '…'} of state-years</td></tr>
          <tr><td>State, per month</td><td>{v ? pct(v.share_within_20pct) : '…'} of state-months (mean error {v ? pct(v.mape_state) : '…'})</td></tr>
        </tbody>
      </table>
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
