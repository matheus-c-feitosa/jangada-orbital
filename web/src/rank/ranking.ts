// Ranking of states (spec 002, story 3, FR-024) and the "this year vs normal" map layer (story 2, FR-023).
// Both use the same number: this year's cumulative detections to date, ranked against previous complete years at the
// same point of the year (the logic of T047, so the map, the ranking and the "so far" tab always agree).
import type { AreaSeries } from '../data/load'
import { daysIn } from '../calendar/stats'

export interface YtdStanding {
  current: number
  /** 0–100: share of previous years below this year at the same date (ties count half) */
  percentile: number
  /** previous complete years compared */
  years: number
  first: number
  last: number
}

const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

/** `lastMonth` is "YYYY-MM" of the newest month and `days` how many of its days have data. */
export function ytdStanding(months: string[], values: number[], lastMonth: string, days: number): YtdStanding | null {
  const byMonth = new Map(months.map((m, i) => [m.slice(0, 7), values[i]]))
  const year = Number(lastMonth.slice(0, 4))
  const upTo = Number(lastMonth.slice(5, 7))
  const fraction = Math.min(1, days / daysIn(lastMonth))
  const toDate = (y: number): number | null => {
    let sum = 0
    for (let m = 1; m <= upTo; m++) {
      const v = byMonth.get(key(y, m))
      if (v === undefined) return null
      sum += m === upTo ? v * (y === year ? 1 : fraction) : v
    }
    return sum
  }
  const current = toDate(year)
  if (current === null) return null
  const history: number[] = []
  const used: number[] = []
  for (let y = year - 1; y >= 1900; y--) {
    // a previous year counts only when it is complete, as in the "so far" chart
    let complete = true
    for (let m = 1; m <= 12; m++) if (!byMonth.has(key(y, m))) complete = false
    if (!complete) {
      if (history.length) break
      continue
    }
    history.push(toDate(y) as number)
    used.push(y)
  }
  if (history.length < 5) return null
  const below = history.filter((h) => h < current).length
  const ties = history.filter((h) => h === current).length
  return {
    current,
    percentile: Math.round((100 * (below + ties / 2)) / history.length),
    years: history.length,
    first: Math.min(...used),
    last: Math.max(...used),
  }
}

export interface RankRow {
  code: string
  name: string
  ytd: number
  km2: number
  /** detections so far per 1,000 km² */
  density: number
  percentile: number
}

export type RankSort = 'total' | 'density' | 'percentile'

export function rankAreas(
  areas: Record<string, AreaSeries>,
  codes: string[],
  lastMonth: string,
  days: number,
  sort: RankSort,
): RankRow[] {
  const rows: RankRow[] = []
  for (const code of codes) {
    const a = areas[code]
    if (!a) continue
    const s = ytdStanding(a.months, a.value, lastMonth, days)
    if (!s) continue
    const km2 = a.area_km2 ?? 0
    rows.push({ code, name: a.name, ytd: s.current, km2, density: km2 > 0 ? (s.current / km2) * 1000 : 0, percentile: s.percentile })
  }
  const metric = (r: RankRow) => (sort === 'total' ? r.ytd : sort === 'density' ? r.density : r.percentile)
  return rows.sort((a, b) => metric(b) - metric(a) || b.ytd - a.ytd)
}

/** Seven classes for the diverging map scale, centred on the median (class 3 = 40th to 60th percentile). */
export const PERCENTILE_BREAKS = [10, 25, 40, 60, 75, 90]
export function percentileClass(p: number): number {
  let c = 0
  for (const b of PERCENTILE_BREAKS) if (p >= b) c++
  return c
}
export const PERCENTILE_LABEL = ['Far below normal', 'Below normal', 'Slightly below', 'Normal', 'Slightly above', 'Above normal', 'Far above normal']

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** Cumulative detections per 1,000 km² this year, month by month (for the comparison chart). */
export function cumulativeDensity(months: string[], values: number[], km2: number, lastMonth: string, days: number) {
  const byMonth = new Map(months.map((m, i) => [m.slice(0, 7), values[i]]))
  const year = Number(lastMonth.slice(0, 4))
  const upTo = Number(lastMonth.slice(5, 7))
  const out: { month: number; fraction: number; value: number }[] = []
  let cum = 0
  for (let m = 1; m <= upTo; m++) {
    cum += byMonth.get(key(year, m)) ?? 0
    out.push({ month: m, fraction: m === upTo ? Math.min(1, days / daysIn(lastMonth)) : 1, value: km2 > 0 ? (cum / km2) * 1000 : 0 })
  }
  return out
}
