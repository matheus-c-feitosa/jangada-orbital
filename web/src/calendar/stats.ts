// "Is this month unusual?": compares a month with the same month in previous years (FR-006, research R7).

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export const median = (values: number[]) => quantile([...values].sort((a, b) => a - b), 0.5)

/** Below this pace (detections per month) a month is never flagged: a few scattered fires are noise, not an anomaly. */
export const MIN_UNUSUAL = 10

export interface MonthComparison {
  month: string
  value: number
  /** days of data in the month (pro-rata comparison when partial) */
  days: number
  daysInMonth: number
  partial: boolean
  median: number
  /** median scaled to the days covered */
  expected: number
  /** value / expected; null when the usual value is 0 */
  ratio: number | null
  /** 1 = highest; compares the month's pace with full past months */
  rank: number
  of: number
  unusual: boolean
  p90: number
}

export const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * Compare `months[t]` with the same calendar month in earlier years present in the series.
 * `days` is how many days of month t have data (equal to the month length when complete).
 */
export function compareMonth(months: string[], values: number[], t: number, days: number): MonthComparison {
  const month = months[t]
  const moy = month.slice(5, 7)
  const history: number[] = []
  for (let i = 0; i < t; i++) if (months[i].slice(5, 7) === moy) history.push(values[i])
  const sorted = [...history].sort((a, b) => a - b)
  const dim = daysIn(month)
  const value = values[t]
  const med = quantile(sorted, 0.5)
  const expected = (med * days) / dim
  const pace = (value * dim) / Math.max(days, 1)
  const p90 = quantile(sorted, 0.9)
  return {
    month,
    value,
    days,
    daysInMonth: dim,
    partial: days < dim,
    median: med,
    expected,
    ratio: expected > 0 ? value / expected : null,
    rank: 1 + history.filter((v) => v > pace).length,
    of: history.length + 1,
    unusual: history.length >= 5 && pace > p90 && pace >= MIN_UNUSUAL,
    p90,
  }
}

/** Seven class breaks from the area's own non-zero values (quantiles), so small areas still show their pattern. */
export function classBreaks(values: number[], steps = 7): number[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (!sorted.length) return []
  const breaks: number[] = []
  for (let i = 1; i < steps; i++) breaks.push(quantile(sorted, i / steps))
  return breaks
}

/** Class 0 = no fire; 1..steps by break. */
export function classOf(value: number, breaks: number[]): number {
  if (!(value > 0)) return 0
  let c = 1
  for (const b of breaks) if (value > b) c++
  return c
}
