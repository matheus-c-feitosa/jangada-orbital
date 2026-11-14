import { describe, expect, test } from 'vitest'
import { explainerRows, lastCompleteYear, viirsToAquaRatio, yearlyTotals } from '../src/pages/yearly'

/** Jan 2011 .. `endMonth` of `endYear`, every value produced by `f(year, month)`. */
function months(endYear: number, endMonth = 12) {
  const out: string[] = []
  for (let y = 2011; y <= endYear; y++) for (let m = 1; m <= (y === endYear ? endMonth : 12); m++) out.push(`${y}-${String(m).padStart(2, '0')}`)
  return out
}

describe('yearly aggregation for the harmonization explainer', () => {
  test('sums the 12 months of each year', () => {
    const ms = months(2013)
    const values = ms.map((m) => Number(m.slice(0, 4)) - 2010) // 1 per month in 2011, 2 in 2012, 3 in 2013
    expect(yearlyTotals(ms, values, 2011, 2013)).toEqual([12, 24, 36])
  })

  test('a year with a missing or null month is null, not a low total', () => {
    const ms = months(2013, 6) // 2013 has only January..June
    const values: (number | null)[] = ms.map(() => 1)
    values[ms.indexOf('2012-03')] = null // satellite not flying that month
    expect(yearlyTotals(ms, values, 2011, 2013)).toEqual([12, null, null])
  })

  test('years outside the data are null', () => {
    const ms = months(2012)
    expect(yearlyTotals(ms, ms.map(() => 1), 2010, 2012)).toEqual([null, 12, 12])
  })

  test('accepts month keys with a day suffix', () => {
    expect(yearlyTotals(Array.from({ length: 12 }, (_, i) => `2020-${String(i + 1).padStart(2, '0')}-01`), Array(12).fill(2), 2020, 2020)).toEqual([24])
  })

  test('rows line up the three series by year', () => {
    const ms = months(2012)
    const rows = explainerRows(ms, { aqua: ms.map(() => 1), snpp: ms.map((m) => (m < '2012-01' ? null : 6)), harmonized: ms.map(() => 1) }, 2011, 2012)
    expect(rows).toEqual([
      { year: 2011, aqua: 12, snpp: null, harmonized: 12 },
      { year: 2012, aqua: 12, snpp: 72, harmonized: 12 },
    ])
  })
})

describe('last complete year', () => {
  test('a year with a partial last month is not complete', () => {
    expect(lastCompleteYear('2026-11', 13)).toBe(2025)
    expect(lastCompleteYear('2026-12-01', 30)).toBe(2025)
  })
  test('a full December completes its year', () => {
    expect(lastCompleteYear('2025-12', 31)).toBe(2025)
  })
})

describe('VIIRS to Aqua ratio', () => {
  test('is the median of the yearly ratios, skipping years without both sensors', () => {
    const rows = [
      { year: 2011, aqua: 100, snpp: null, harmonized: 100 },
      { year: 2012, aqua: 100, snpp: 500, harmonized: 100 },
      { year: 2013, aqua: 100, snpp: 600, harmonized: 100 },
      { year: 2014, aqua: 100, snpp: 800, harmonized: 100 },
      { year: 2015, aqua: 0, snpp: 50, harmonized: 0 },
    ]
    expect(viirsToAquaRatio(rows)).toBe(6)
  })
  test('is null without overlapping years', () => {
    expect(viirsToAquaRatio([{ year: 2011, aqua: 1, snpp: null, harmonized: 1 }])).toBeNull()
  })
})
