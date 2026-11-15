// Fire-season rhythm (task T040): when the season starts, reaches its middle and ends, season by season.
//
// A "season year" starts in the area's calmest month (lowest mean activity), so seasons that cross New Year
// (e.g. Roraima, December–March) are not cut in half. Within a season, start / middle / end are the moments
// the cumulative detections reach 10% / 50% / 90%, interpolated linearly inside the month (fractional months).

export interface Season {
  /** label such as "2019" or "2019/20" */
  label: string
  /** first calendar year of the season */
  year: number
  total: number
  /** fractional month offsets from the season's first month (0 = its first day, 12 = its end) */
  start: number
  middle: number
  end: number
  /** offset of the month with the most detections */
  peak: number
}

export interface SeasonRhythm {
  /** calendar month (1–12) in which every season year starts */
  firstMonth: number
  seasons: Season[]
  /** shift of the season start, in weeks, between the first and the last decade; negative = earlier; null = no clear change */
  startShiftWeeks: number | null
  compared: [string, string] | null
}

/** Below this many detections a season is too small to have a meaningful timing. */
export const MIN_SEASON_TOTAL = 30

const WEEKS_PER_MONTH = 30.44 / 7

function crossing(values: number[], total: number, share: number): number {
  const target = total * share
  let cum = 0
  for (let i = 0; i < values.length; i++) {
    if (values[i] > 0 && cum + values[i] >= target) return i + (target - cum) / values[i]
    cum += values[i]
  }
  return values.length
}

export function seasonRhythm(months: string[], values: number[]): SeasonRhythm {
  const byMonth = new Map(months.map((m, i) => [m, values[i]]))
  const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))].sort((a, b) => a - b)

  // Calmest month of the mean profile, over complete calendar years.
  const sums = new Array(12).fill(0)
  let complete = 0
  for (const y of years) {
    const row = Array.from({ length: 12 }, (_, k) => byMonth.get(`${y}-${String(k + 1).padStart(2, '0')}`))
    if (row.every((v) => v !== undefined)) {
      row.forEach((v, k) => (sums[k] += v as number))
      complete++
    }
  }
  const firstMonth = complete ? sums.indexOf(Math.min(...sums)) + 1 : 1

  const seasons: Season[] = []
  for (const y of years) {
    const vals: number[] = []
    for (let k = 0; k < 12; k++) {
      const m = ((firstMonth - 1 + k) % 12) + 1
      const yy = y + (firstMonth - 1 + k >= 12 ? 1 : 0)
      const v = byMonth.get(`${yy}-${String(m).padStart(2, '0')}`)
      if (v === undefined) break
      vals.push(v)
    }
    if (vals.length < 12) continue // season not fully covered by the data (first or current)
    const total = vals.reduce((a, b) => a + b, 0)
    if (total < MIN_SEASON_TOTAL) continue
    seasons.push({
      label: firstMonth === 1 ? String(y) : `${y}/${String((y + 1) % 100).padStart(2, '0')}`,
      year: y,
      total,
      start: crossing(vals, total, 0.1),
      middle: crossing(vals, total, 0.5),
      end: crossing(vals, total, 0.9),
      peak: vals.indexOf(Math.max(...vals)),
    })
  }

  // Compare the mean start of the first and the last ten seasons; report only a clear, well-supported change.
  let startShiftWeeks: number | null = null
  let compared: [string, string] | null = null
  if (seasons.length >= 16) {
    const first = seasons.slice(0, 10)
    const last = seasons.slice(-10)
    const mean = (s: Season[]) => s.reduce((a, b) => a + b.start, 0) / s.length
    const shift = (mean(last) - mean(first)) * WEEKS_PER_MONTH
    if (Math.abs(shift) >= 2) {
      startShiftWeeks = Math.round(shift)
      compared = [`${first[0].label}–${first[first.length - 1].label}`, `${last[0].label}–${last[last.length - 1].label}`]
    }
  }
  return { firstMonth, seasons, startShiftWeeks, compared }
}

const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export interface OffsetWords {
  early: string
  mid: string
  late: string
  month: (k: number) => string
}
const ENGLISH: OffsetWords = { early: 'early', mid: 'mid', late: 'late', month: (k) => NAMES[k] }

/** "mid August" ("meados de agosto") for a fractional offset within a season that starts in `firstMonth`. */
export function describeOffset(offset: number, firstMonth: number, words: OffsetWords = ENGLISH): string {
  const k = Math.min(11, Math.floor(offset))
  const part = offset - k
  const name = words.month((firstMonth - 1 + k) % 12)
  return `${part < 1 / 3 ? words.early : part < 2 / 3 ? words.mid : words.late} ${name}`
}

export interface RunningSeason {
  label: string
  year: number
  /** offsets from the season's first month: when it reached 10% and 50% of a usual season (null = not yet), and today */
  start: number | null
  middle: number | null
  now: number
}

/**
 * The season that contains the newest month, still running. Its total is not known yet, so its start and middle are
 * the moments it reached 10% and 50% of the usual (median) season total.
 */
export function runningSeason(months: string[], values: number[], firstMonth: number, lastMonth: string, days: number, usualTotal: number): RunningSeason | null {
  if (!(usualTotal > 0)) return null
  const byMonth = new Map(months.map((m, i) => [m.slice(0, 7), values[i]]))
  const ly = Number(lastMonth.slice(0, 4))
  const lm = Number(lastMonth.slice(5, 7))
  const year = lm >= firstMonth ? ly : ly - 1
  const vals: number[] = []
  for (let k = 0; k < 12; k++) {
    const m = ((firstMonth - 1 + k) % 12) + 1
    const yy = year + (firstMonth - 1 + k >= 12 ? 1 : 0)
    const key = `${yy}-${String(m).padStart(2, '0')}`
    const v = byMonth.get(key)
    if (v === undefined) return null
    vals.push(v)
    if (key === lastMonth) break
  }
  const dim = new Date(Date.UTC(ly, lm, 0)).getUTCDate()
  const now = vals.length - 1 + Math.min(1, days / dim)
  // the last month is partial: spread its count over the days it covers
  const reach = (share: number) => {
    const target = usualTotal * share
    let cum = 0
    for (let k = 0; k < vals.length; k++) {
      const span = k === vals.length - 1 ? now - k : 1
      if (vals[k] > 0 && cum + vals[k] >= target) return k + ((target - cum) / vals[k]) * span
      cum += vals[k]
    }
    return null
  }
  return {
    label: firstMonth === 1 ? String(year) : `${year}/${String((year + 1) % 100).padStart(2, '0')}`,
    year,
    start: reach(0.1),
    middle: reach(0.5),
    now,
  }
}
