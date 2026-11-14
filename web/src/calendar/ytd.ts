// Year to date against the normal band (task T047): cumulative detections of the current year, month by month,
// compared with the median and the p10–p90 range of previous years at the same point of the year.
import { daysIn, quantile } from './stats'

export interface YtdPoint {
  /** 1–12; the last point may be a partial month */
  month: number
  /** fraction of the month covered (1 = complete) */
  fraction: number
  current: number
  p10: number
  median: number
  p90: number
}

export type YtdStatus = 'above' | 'within' | 'below'

export interface YearToDate {
  year: number
  points: YtdPoint[]
  /** the normal band for all 12 complete months, to show what usually comes next */
  band: { month: number; p10: number; median: number; p90: number }[]
  /** first and last previous year used for the band */
  range: [number, number]
  /** previous complete years used for the band */
  years: number
  status: YtdStatus
  /** first month of the current run of the same status (only meaningful for above/below) */
  since: number
}

/** Fewer previous years than this give no meaningful band. */
export const MIN_YEARS = 5

const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

/**
 * `lastMonth` is "YYYY-MM" of the newest month and `days` how many of its days have data.
 * Returns null when the area has too little history.
 */
export function yearToDate(months: string[], values: number[], lastMonth: string, days: number): YearToDate | null {
  const byMonth = new Map(months.map((m, i) => [m, values[i]]))
  const year = Number(lastMonth.slice(0, 4))
  const upTo = Number(lastMonth.slice(5, 7))
  const fractionLast = Math.min(1, days / daysIn(lastMonth))

  const history: number[][] = [] // cumulative per month (index 0..11) of each complete previous year
  const used: number[] = []
  for (let y = year - 1; y >= 1900; y--) {
    const row = Array.from({ length: 12 }, (_, k) => byMonth.get(key(y, k + 1)))
    if (row.some((v) => v === undefined)) {
      if (history.length) break
      continue
    }
    let cum = 0
    history.push(row.map((v) => (cum += v as number)))
    used.push(y)
  }
  if (history.length < MIN_YEARS) return null

  const points: YtdPoint[] = []
  let current = 0
  for (let m = 1; m <= upTo; m++) {
    const fraction = m === upTo ? fractionLast : 1
    current += (byMonth.get(key(year, m)) ?? 0)
    // History at the same point of the year: complete months before, plus the same fraction of this month.
    const same = history.map((cum) => (m > 1 ? cum[m - 2] : 0) + ((m > 1 ? cum[m - 1] - cum[m - 2] : cum[0]) * fraction))
    const sorted = same.sort((a, b) => a - b)
    points.push({ month: m, fraction, current, p10: quantile(sorted, 0.1), median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9) })
  }

  const statusOf = (p: YtdPoint): YtdStatus => (p.current > p.p90 ? 'above' : p.current < p.p10 ? 'below' : 'within')
  const status = statusOf(points[points.length - 1])
  let since = points[points.length - 1].month
  for (let i = points.length - 2; i >= 0 && statusOf(points[i]) === status; i--) since = points[i].month
  const band = Array.from({ length: 12 }, (_, k) => {
    const sorted = history.map((cum) => cum[k]).sort((a, b) => a - b)
    return { month: k + 1, p10: quantile(sorted, 0.1), median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9) }
  })
  return { year, points, band, range: [Math.min(...used), Math.max(...used)], years: history.length, status, since }
}
