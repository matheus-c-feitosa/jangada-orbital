// CSV download (contract: specs/001-harmonized-fire-calendar/contracts/csv-export.md).
import { SATELLITES, type AreaSeries, type Manifest } from './load'

const SOURCES = ['aqua_observed', 'terra_scaled', 'viirs_calibrated']

export interface CsvOptions {
  manifest: Manifest
  areaLabel: string
  bbox?: [number, number, number, number]
  from: string
  to: string
}

const num = (v: number) => (Math.round(v * 10) / 10).toString()
const cell = (v: number | null) => (v === null ? '' : String(v))
const quote = (s: string) => s.replace(/[\r\n;]+/g, ' ')

export function buildCsv(series: AreaSeries, opts: CsvOptions): string {
  const { manifest } = opts
  const lines = [
    '# Jangada Orbital harmonized fire calendar',
    `# data_version=${manifest.data_version}; model_version=${manifest.model_version}; unit=${manifest.unit}`,
    `# area=${quote(opts.areaLabel)}; grid=${manifest.grid_deg}deg; source=NASA FIRMS (MODIS C6.1, VIIRS 375 m)`,
    '# raw hotspots: https://firms.modaps.eosdis.nasa.gov/download/ (use the area bbox below)',
    `# bbox=${opts.bbox ? opts.bbox.map((v) => v.toFixed(3)).join(',') : 'n/a'}`,
    `# area_km2=${series.area_km2 ? Math.round(series.area_km2) : 'n/a'}`,
    'month,harmonized,harmonized_lo,harmonized_hi,source,terra_n,aqua_n,snpp_n,noaa20_n,noaa21_n,viirs_n_1km',
  ]
  series.months.forEach((m, i) => {
    if (m < opts.from || m > opts.to) return
    const observed = SATELLITES.map((s) => cell(series.observed[s][i]))
    lines.push(
      [m, num(series.value[i]), num(series.lo[i]), num(series.hi[i]), SOURCES[series.source[i]], ...observed, series.viirs_k[i]].join(','),
    )
  })
  return lines.join('\n') + '\n'
}

export function csvFileName(manifest: Manifest, areaLabel: string): string {
  let h = 0
  for (const ch of areaLabel) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `jangada-orbital_${manifest.data_version.replaceAll('-', '')}_${h.toString(16).padStart(8, '0').slice(0, 8)}.csv`
}

export function downloadText(text: string, fileName: string) {
  downloadBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), fileName)
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
