// Monthly series for a drawn area: reads only the Parquet row groups that can hold its cells (HTTP range requests).
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects, type AsyncBuffer, type FileMetaData } from 'hyparquet'
import { SATELLITES, dataUrl, type AreaSeries, type Satellite } from './load'
import { cellKey, cellsInRing, type Ring } from '../geo/aoi'

interface Opened {
  file: AsyncBuffer
  metadata: FileMetaData
}
const opened = new Map<string, Promise<Opened>>()

function open(name: string): Promise<Opened> {
  let p = opened.get(name)
  if (!p) {
    p = (async () => {
      const file = await asyncBufferFromUrl({ url: dataUrl(name) })
      return { file, metadata: await parquetMetadataAsync(file) }
    })()
    p.catch(() => opened.delete(name))
    opened.set(name, p)
  }
  return p
}

const monthKey = (d: unknown) => {
  const date = d instanceof Date ? d : new Date(String(d))
  return date.toISOString().slice(0, 7)
}

/**
 * Builds the series for the cells inside `ring`, aligned to Brazil's months (`template`).
 * Observed values stay null where the satellite was not flying anywhere in Brazil that month.
 */
export async function seriesForRing(ring: Ring, name: string, template: AreaSeries): Promise<AreaSeries & { cells: number }> {
  const { cells, box } = cellsInRing(ring)
  const months = template.months
  const index = new Map(months.map((m, i) => [m, i]))
  const zeros = () => months.map(() => 0)
  const out: AreaSeries & { cells: number } = {
    name,
    months,
    source: template.source,
    value: zeros(),
    lo: zeros(),
    hi: zeros(),
    viirs_k: zeros(),
    observed: Object.fromEntries(
      SATELLITES.map((s) => [s, template.observed[s].map((v) => (v === null ? null : 0))]),
    ) as Record<Satellite, (number | null)[]>,
    cells: cells.size,
  }
  if (!box) return out
  const filter = {
    cell_lat: { $gte: box.latMin, $lte: box.latMax },
    cell_lon: { $gte: box.lonMin, $lte: box.lonMax },
  }
  const [harmonized, observed] = await Promise.all([open('harmonized.parquet'), open('observed.parquet')])
  const [hRows, oRows] = await Promise.all([
    parquetReadObjects({ ...harmonized, columns: ['cell_lat', 'cell_lon', 'month', 'value', 'lo', 'hi'], filter }),
    parquetReadObjects({ ...observed, columns: ['cell_lat', 'cell_lon', 'month', 'satellite', 'n', 'n_1km'], filter }),
  ])
  for (const r of hRows) {
    if (!cells.has(cellKey(Number(r.cell_lat), Number(r.cell_lon)))) continue
    const i = index.get(monthKey(r.month))
    if (i === undefined) continue
    out.value[i] += Number(r.value)
    out.lo[i] += Number(r.lo)
    out.hi[i] += Number(r.hi)
  }
  for (const r of oRows) {
    if (!cells.has(cellKey(Number(r.cell_lat), Number(r.cell_lon)))) continue
    const i = index.get(monthKey(r.month))
    if (i === undefined) continue
    const sat = SATELLITES[Number(r.satellite)]
    const series = out.observed[sat]
    series[i] = (series[i] ?? 0) + Number(r.n)
    if (Number(r.satellite) >= 2) out.viirs_k[i] += Number(r.n_1km)
  }
  return out
}
