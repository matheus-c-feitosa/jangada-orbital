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

export const dataUrl = (file: string) => new URL(`data/${file}`, document.baseURI).href

async function getJson<T>(file: string): Promise<T> {
  const response = await fetch(dataUrl(file))
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`)
  return (await response.json()) as T
}

export async function loadAppData(): Promise<AppData> {
  const [manifest, doc, states] = await Promise.all([
    getJson<Manifest>('manifest.json'),
    getJson<SeriesDoc>('series.json'),
    getJson<GeoJSON.FeatureCollection>('states.geojson'),
  ])
  if (manifest.schema !== 1) throw new Error(`Unsupported data schema ${manifest.schema}`)
  const areas: Record<string, AreaSeries> = {}
  for (const [code, area] of Object.entries(doc.areas)) {
    areas[code] = { ...area, months: doc.months, source: doc.source }
  }
  const stateList = states.features
    .map((f) => f.properties as StateInfo)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return { manifest, areas, states, stateList }
}
