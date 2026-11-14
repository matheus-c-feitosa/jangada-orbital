// Monthly series for a drawn area. The browser fetches whole 2° x 2° tile files (web/public/data/tiles/), not byte
// ranges: GitHub Pages gzips .parquet responses, and gzip breaks HTTP range requests on the original file.
import { parquetReadObjects } from 'hyparquet'
import { SATELLITES, dataUrl, type AreaSeries, type Manifest, type Satellite } from './load'
import { cellKey, cellsInRing, tilesForBox, type Ring } from '../geo/aoi'

const cache = new Map<string, Promise<Record<string, unknown>[]>>()

/** Rows of one tile file; a tile listed in the manifest always exists. */
function readTile(kind: 'h' | 'o', id: string): Promise<Record<string, unknown>[]> {
  const key = `${kind}_${id}`
  let p = cache.get(key)
  if (!p) {
    p = (async () => {
      const response = await fetch(dataUrl(`tiles/${key}.parquet`))
      if (!response.ok) throw new Error(`tile ${key}: HTTP ${response.status}`)
      return parquetReadObjects({ file: await response.arrayBuffer() })
    })()
    p.catch(() => cache.delete(key))
    cache.set(key, p)
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
export async function seriesForRing(
  ring: Ring,
  name: string,
  template: AreaSeries,
  manifest: Manifest,
): Promise<AreaSeries & { cells: number }> {
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
  const available = new Set(manifest.tiles.ids)
  const ids = tilesForBox(box, manifest.tiles.cells).filter((id) => available.has(id))
  const [hTiles, oTiles] = await Promise.all([
    Promise.all(ids.map((id) => readTile('h', id))),
    Promise.all(ids.map((id) => readTile('o', id))),
  ])
  for (const r of hTiles.flat()) {
    if (!cells.has(cellKey(Number(r.cell_lat), Number(r.cell_lon)))) continue
    const i = index.get(monthKey(r.month))
    if (i === undefined) continue
    out.value[i] += Number(r.value)
    out.lo[i] += Number(r.lo)
    out.hi[i] += Number(r.hi)
  }
  for (const r of oTiles.flat()) {
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
