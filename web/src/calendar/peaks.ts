// "Which months and years had the highest fire activity?" (challenge statement, FR-007).
// Works on the series that is on screen, so the numbers match the calendar and the CSV.

export interface Peaks {
  /** busiest complete year in the range */
  year: { year: number; total: number } | null
  /** highest single month in the range */
  month: { month: string; value: number } | null
  /** calendar months (1-12) with the highest median, busiest first; only months with a median above zero */
  typical: number[]
  /** first and last year that went into the comparison */
  span: [number, number] | null
}

/**
 * `values[i]` belongs to `months[i]`; null means the satellite was not flying. The partial month is left out because
 * a half-counted month would never win and would pull its calendar month's median down.
 * A year counts only when all twelve months have data.
 */
export function peaks(
  months: string[],
  values: (number | null)[],
  fromYear: number,
  toYear: number,
  partialMonth: string,
): Peaks {
  const perYear = new Map<number, { total: number; n: number }>()
  const byMonth: number[][] = Array.from({ length: 12 }, () => [])
  let month: Peaks['month'] = null
  let first = Infinity
  let last = -Infinity
  for (let i = 0; i < months.length; i++) {
    const v = values[i]
    const y = Number(months[i].slice(0, 4))
    if (v === null || y < fromYear || y > toYear || months[i] === partialMonth) continue
    const acc = perYear.get(y) ?? { total: 0, n: 0 }
    acc.total += v
    acc.n += 1
    perYear.set(y, acc)
    byMonth[Number(months[i].slice(5, 7)) - 1].push(v)
    if (!month || v > month.value) month = { month: months[i], value: v }
    first = Math.min(first, y)
    last = Math.max(last, y)
  }
  let year: Peaks['year'] = null
  for (const [y, a] of perYear) if (a.n === 12 && (!year || a.total > year.total)) year = { year: y, total: a.total }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    const mid = s.length >> 1
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  }
  const typical = byMonth
    .map((xs, k) => ({ m: k + 1, med: xs.length ? median(xs) : 0 }))
    .filter((x) => x.med > 0)
    .sort((a, b) => b.med - a.med || a.m - b.m)
    .slice(0, 3)
    .map((x) => x.m)
  return { year, month: month && month.value > 0 ? month : null, typical, span: Number.isFinite(first) ? [first, last] : null }
}
