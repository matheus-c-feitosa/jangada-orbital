// Agreement between the VIIRS satellites (spec 002, story 5, FR-027): monthly ratio of NOAA-20 and of NOAA-21 to
// S-NPP for Brazil, next to g = 0.981, the factor measured between the mean of NOAA-20/21 and S-NPP
// (docs/METHOD.md, source 2). Months with few detections are skipped, since a ratio of small counts is noise, and so
// are months from the end of S-NPP on, since S-NPP did not fly the whole month.
import { SNPP_END, type AreaSeries } from '../data/load'

export const G_VIIRS = 0.981
export const MIN_COUNT = 500

export interface RatioPoint {
  month: string
  /** NOAA-20 ÷ S-NPP */
  noaa20: number | null
  /** NOAA-21 ÷ S-NPP */
  noaa21: number | null
}

export function viirsRatios(series: Pick<AreaSeries, 'months' | 'observed'>, minCount = MIN_COUNT): RatioPoint[] {
  const o = series.observed
  const out: RatioPoint[] = []
  const ratio = (snpp: number, other: number | null) => (other === null || other < minCount ? null : other / snpp)
  series.months.forEach((m, i) => {
    const snpp = o['S-NPP'][i]
    if (snpp === null || snpp < minCount || m.slice(0, 7) >= SNPP_END.slice(0, 7)) return
    const p = { month: m.slice(0, 7), noaa20: ratio(snpp, o['NOAA-20'][i]), noaa21: ratio(snpp, o['NOAA-21'][i]) }
    if (p.noaa20 !== null || p.noaa21 !== null) out.push(p)
  })
  return out
}

/** Median of the non-null ratios of one satellite. */
export function medianRatio(points: RatioPoint[], key: 'noaa20' | 'noaa21'): number | null {
  const v = points.map((p) => p[key]).filter((x): x is number => x !== null).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}
