// Loads the static data published by the pipeline (see specs/.../contracts/web-data-files.md).

export const SATELLITES = ['Terra', 'Aqua', 'S-NPP', 'NOAA-20', 'NOAA-21'] as const
export type Satellite = (typeof SATELLITES)[number]

export interface Manifest {
  schema: number
  data_version: string
  data_date: string
  model_version: string
  unit: string
  grid_deg: number
  first_month: string
  last_month: string
  last_month_days: number
  /** the last data day is still arriving (not counted in last_month_days) */
  last_day_partial?: boolean
  /** browser tiles: 2° x 2° Parquet files fetched whole (GitHub Pages gzip breaks range requests) */
  tiles: { path: string; deg: number; cells: number; ids: string[] }
  files: Record<string, { path: string; bytes: number; sha256: string; rows?: number }>
  validation: {
    heldout_years: string
    mape_state: number
    share_within_20pct: number
    mape_national_month: number
    share_within_20pct_state_year: number
  }
}

/** One monthly series for an area. Arrays are aligned to `months` ("YYYY-MM"). */
export interface AreaSeries {
  name: string
  months: string[]
  value: number[]
  lo: number[]
  hi: number[]
  /** 0 Aqua observed, 1 Terra scaled, 2 VIIRS calibrated */
  source: number[]
  /** detections as delivered; null = satellite not flying that month */
  observed: Record<Satellite, (number | null)[]>
  /** VIIRS ~1 km positions per overpass, summed over the VIIRS satellites */
  viirs_k: number[]
  /** geodesic area of the selection, km² (T048) */
  area_km2?: number
}

interface SeriesDoc {
  months: string[]
  source: number[]
  areas: Record<string, Omit<AreaSeries, 'months' | 'source'>>
}

export interface StateInfo {
  uf: string
  name: string
  bbox: [number, number, number, number]
}

export interface AppData {
  manifest: Manifest
  areas: Record<string, AreaSeries>
  states: GeoJSON.FeatureCollection
  stateList: StateInfo[]
}

// GitHub Pages caches every file for 10 minutes. The manifest is always revalidated; every other data file carries
// the data version in its URL, so a new export can never be mixed with a stale cached file.
let dataVersion = ''
export const dataUrl = (file: string) => {
  const url = new URL(`data/${file}`, document.baseURI)
  if (dataVersion) url.searchParams.set('v', dataVersion)
  return url.href
}

async function getJson<T>(file: string, init?: RequestInit): Promise<T> {
  const response = await fetch(dataUrl(file), init)
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`)
  return (await response.json()) as T
}

export async function loadAppData(): Promise<AppData> {
  dataVersion = ''
  const manifest = await getJson<Manifest>('manifest.json', { cache: 'no-cache' })
  if (manifest.schema !== 1 || !manifest.tiles) throw new Error(`Unsupported data schema ${manifest.schema}`)
  dataVersion = manifest.files.harmonized.sha256.slice(0, 12)
  const [doc, states] = await Promise.all([
    getJson<SeriesDoc>('series.json'),
    getJson<GeoJSON.FeatureCollection>('states.geojson'),
  ])
  const areas: Record<string, AreaSeries> = {}
  for (const [code, area] of Object.entries(doc.areas)) {
    areas[code] = { ...area, months: doc.months, source: doc.source }
  }
  const stateList = states.features
    .map((f) => f.properties as StateInfo)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return { manifest, areas, states, stateList }
}
