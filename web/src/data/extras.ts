// Extra data files of spec 002, written by `uv run jangada-extras` (pipeline/src/jangada/extras.py).
// Each loads the first time a view needs it and is cached; a missing file (an older export) resolves to null, so the
// views that need it simply do not show.
import { dataUrl, type AreaSeries, type Satellite } from './load'

const cache = new Map<string, Promise<unknown>>()

/** A 404 (file not published) is remembered; a network or server error is not, so the next call tries again. */
function optional<T>(file: string): Promise<T | null> {
  let p = cache.get(file) as Promise<T | null> | undefined
  if (!p) {
    p = fetch(dataUrl(file))
      .then((r) => {
        if (r.ok) return r.json() as Promise<T>
        if (r.status !== 404) cache.delete(file)
        return null
      })
      .catch(() => {
        cache.delete(file)
        return null
      })
    cache.set(file, p)
  }
  return p
}

export interface BiomeInfo {
  id: string
  name: string
  area_km2?: number
}

export interface BiomeData {
  list: BiomeInfo[]
  areas: Record<string, AreaSeries>
}

/** Biome names and monthly series (biome_series.json, small). The outlines are a separate, larger file. */
export async function loadBiomes(): Promise<BiomeData | null> {
  const doc = await optional<{ months: string[]; source: number[]; areas: Record<string, Omit<AreaSeries, 'months' | 'source'>> }>('biome_series.json')
  if (!doc) return null
  const areas: Record<string, AreaSeries> = {}
  for (const [id, a] of Object.entries(doc.areas)) areas[id] = { ...a, months: doc.months, source: doc.source }
  const list = Object.entries(areas).map(([id, a]) => ({ id, name: a.name, area_km2: a.area_km2 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return { list, areas }
}

/** Biome outlines (biomes.geojson); each feature carries {id, name, bbox, area_km2}. Only for the map. */
export const loadBiomeOutlines = () => optional<GeoJSON.FeatureCollection>('biomes.geojson')

/** [west, south, east, north] of one biome, from its outline's properties. */
export function biomeBbox(outlines: GeoJSON.FeatureCollection | null | undefined, id: string): [number, number, number, number] | null {
  const f = outlines?.features.find((x) => (x.properties as { id?: string } | null)?.id === id)
  return (f?.properties as { bbox?: [number, number, number, number] } | undefined)?.bbox ?? null
}

export interface Recurrence {
  grid_deg: number
  first: number
  last: number
  threshold: number
  /** [cell_lat, cell_lon, bit mask of years with fire, bit 0 = `first`] */
  cells: [number, number, number][]
}

/** Decodes the rows of recurrence.json: {cell_lat: "dlon.mask36,..."}, dlon relative to the previous cell. */
export function decodeRows(rows: Record<string, string>): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const [lat, line] of Object.entries(rows)) {
    const la = Number(lat)
    let lo = 0
    line.split(',').forEach((item, i) => {
      const [d, m] = item.split('.')
      lo = i === 0 ? Number(d) : lo + Number(d)
      out.push([la, lo, parseInt(m, 36)])
    })
  }
  return out
}

export async function loadRecurrence(): Promise<Recurrence | null> {
  const doc = await optional<Omit<Recurrence, 'cells'> & { rows: Record<string, string> }>('recurrence.json')
  if (!doc) return null
  const { rows, ...rest } = doc
  return { ...rest, cells: decodeRows(rows) }
}

/** class 1..7 of the orange ramp for `n` of `span` years with fire (0 = none) */
export const recurrenceClass = (n: number, span: number) => (n <= 0 ? 0 : Math.max(1, Math.min(7, Math.ceil((n / span) * 7))))

/** Years with fire in `from`..`to` for one cell mask. */
export function yearsWithFire(mask: number, first: number, from: number, to: number): number {
  let n = 0
  for (let y = from; y <= to; y++) {
    const bit = y - first
    if (bit >= 0 && bit < 31 && (mask >> bit) & 1) n++
  }
  return n
}

export interface MuniRanking {
  last_month: string
  days: number
  /** [IBGE id, name, uf, detections so far, area km², percentile] */
  rows: [string, string, string, number, number, number][]
}
export const loadMuniRanking = () => optional<MuniRanking>('municipalities/ranking.json')

/** Outline of one municipality (largest polygon's outer ring), from the state file published by T041. */
export async function muniRing(id: string, uf: string): Promise<[number, number][] | null> {
  const fc = await optional<GeoJSON.FeatureCollection>(`municipalities/${uf}.geojson`)
  const f = fc?.features.find((x) => (x.properties as { id: string }).id === id)
  if (!f) return null
  const g = f.geometry
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  let best: number[][] | null = null
  let bestLen = -1
  for (const p of polys) if (p[0].length > bestLen) { best = p[0]; bestLen = p[0].length }
  return best ? (best.map((c) => [c[0], c[1]]) as [number, number][]) : null
}

export interface Oni {
  years: Record<string, { phase: 'EN' | 'LN' | null; peak: number }>
}
export const loadOni = () => optional<Oni>('oni.json')

export interface Recent {
  from: string
  to: string
  detections: number
  downloaded: string
  /** [cell_lat, cell_lon, n, aqua_eq, frp_max, first, last, satellites, above_usual] */
  cells: [number, number, number, number, number, string, string, string, boolean][]
}

type RawRecent = Omit<Recent, 'cells'> & { satellites: string[]; cells: [number, number, number, number, number, number, number, number, number][] }

/** Expands day offsets and satellite bits of recent.json. */
export function decodeRecent(doc: RawRecent): Recent {
  const start = Date.parse(`${doc.from}T00:00:00Z`)
  const day = (d: number) => new Date(start + d * 86_400_000).toISOString().slice(0, 10)
  const { satellites, cells, ...rest } = doc
  return {
    ...rest,
    cells: cells.map(([la, lo, n, eq, frp, f, l, bits, above]) => [
      la, lo, n, eq, frp, day(f), day(l), satellites.filter((_, i) => (bits >> i) & 1).join(','), above === 1,
    ]),
  }
}

export async function loadRecent(): Promise<Recent | null> {
  const doc = await optional<RawRecent>('recent.json')
  return doc ? decodeRecent(doc) : null
}

export interface Intensity {
  small_sample: number
  /** area -> family (aqua | snpp) -> year -> [detections, night detections, median FRP MW] */
  areas: Record<string, Partial<Record<'aqua' | 'snpp', Record<string, [number, number, number]>>>>
}
export const loadIntensity = () => optional<Intensity>('intensity.json')

export interface Overpass {
  /** satellite -> year -> [median local hour, p25, p75, detections] */
  satellites: Partial<Record<Satellite, Record<string, [number, number, number, number]>>>
}
export const loadOverpass = () => optional<Overpass>('overpass.json')

export interface Validation {
  heldout_years: string
  fit_years: string
  metrics: Record<string, number>
  /** [YYYY-MM, observed Aqua, predicted] */
  national_month: [string, number, number][]
  /** [uf, year, observed, predicted] */
  state_year: [string, number, number, number][]
}
export const loadValidation = () => optional<Validation>('validation.json')
