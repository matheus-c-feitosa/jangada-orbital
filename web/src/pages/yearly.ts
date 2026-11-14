// Harmonization explainer (task T038): yearly totals of the raw Aqua and S-NPP counts next to the harmonized series,
// so the gap between the sensors and what harmonization does are visible in one picture.

export interface YearRow {
  year: number
  aqua: number | null
  snpp: number | null
  harmonized: number | null
}

/**
 * The newest year whose 12 months all have complete data. `lastMonth` is the newest month ("YYYY-MM", longer
 * strings are cut) and `days` how many of its days have data.
 */
export function lastCompleteYear(lastMonth: string, days: number): number {
  const year = Number(lastMonth.slice(0, 4))
  const month = Number(lastMonth.slice(5, 7))
  return month === 12 && days >= 31 ? year : year - 1
}

/**
 * Sum of a monthly series per calendar year, for `from`..`to` inclusive. A year is null when any of its 12 months
 * is missing from `months` or null in `values` (satellite not flying), so partial years never look like low years.
 */
export function yearlyTotals(months: string[], values: (number | null)[], from: number, to: number): (number | null)[] {
  const byMonth = new Map(months.map((m, i) => [m.slice(0, 7), values[i]]))
  const out: (number | null)[] = []
  for (let y = from; y <= to; y++) {
    let sum = 0
    for (let m = 1; m <= 12; m++) {
      const v = byMonth.get(`${y}-${String(m).padStart(2, '0')}`)
      if (v === undefined || v === null) { sum = NaN; break }
      sum += v
    }
    out.push(Number.isNaN(sum) ? null : sum)
  }
  return out
}

/** One row per year with the three series side by side. */
export function explainerRows(
  months: string[],
  series: { aqua: (number | null)[]; snpp: (number | null)[]; harmonized: number[] },
  from: number,
  to: number,
): YearRow[] {
  const aqua = yearlyTotals(months, series.aqua, from, to)
  const snpp = yearlyTotals(months, series.snpp, from, to)
  const harmonized = yearlyTotals(months, series.harmonized, from, to)
  return aqua.map((_, i) => ({ year: from + i, aqua: aqua[i], snpp: snpp[i], harmonized: harmonized[i] }))
}

/** Median of S-NPP / Aqua over the years where both are present and Aqua is positive; null if there are none. */
export function viirsToAquaRatio(rows: YearRow[]): number | null {
  const ratios = rows
    .filter((r) => r.aqua !== null && r.snpp !== null && r.aqua > 0)
    .map((r) => (r.snpp as number) / (r.aqua as number))
    .sort((a, b) => a - b)
  if (!ratios.length) return null
  const mid = Math.floor(ratios.length / 2)
  return ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2
}
