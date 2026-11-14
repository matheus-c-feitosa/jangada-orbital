import { describe, expect, test } from 'vitest'
import { describeOffset, seasonRhythm } from '../src/calendar/season'

/** Monthly series from Jan of `from` to Dec of `to`, with `profile(year, month)` detections. */
function series(from: number, to: number, profile: (y: number, m: number) => number) {
  const months: string[] = []
  const values: number[] = []
  for (let y = from; y <= to; y++) for (let m = 1; m <= 12; m++) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    values.push(profile(y, m))
  }
  return { months, values }
}

describe('fire-season rhythm', () => {
  test('a dry-season pattern (Aug–Oct) starts in a calm month and has the right timing', () => {
    const { months, values } = series(2001, 2020, (_, m) => ({ 8: 100, 9: 100, 10: 100 } as Record<number, number>)[m] ?? 0)
    const r = seasonRhythm(months, values)
    expect(r.firstMonth).toBe(1) // all calm months tie; the first one wins
    const s = r.seasons[0]
    expect(s.total).toBe(300)
    expect(s.start).toBeCloseTo(7.3) // 10% of 300 = 30, i.e. 30% into August (offset 7)
    expect(s.middle).toBeCloseTo(8.5)
    expect(s.end).toBeCloseTo(9.7)
    expect(s.peak).toBe(7)
    expect(r.startShiftWeeks).toBeNull()
  })

  test('a season that crosses New Year is not cut in half', () => {
    // Fires in Dec, Jan, Feb only: the calmest month is March, so seasons run Mar–Feb.
    const { months, values } = series(2001, 2020, (_, m) => ({ 12: 50, 1: 100, 2: 50 } as Record<number, number>)[m] ?? (m === 3 ? 0 : 1))
    const r = seasonRhythm(months, values)
    expect(r.firstMonth).toBe(3)
    expect(r.seasons[0].label).toBe('2001/02')
    expect(describeOffset(r.seasons[0].middle, r.firstMonth)).toBe('mid January')
  })

  test('a season starting one month earlier in the last decade is reported in weeks', () => {
    const { months, values } = series(2001, 2020, (y, m) => {
      const start = y <= 2010 ? 8 : 7
      return m >= start && m < start + 3 ? 100 : 0
    })
    const r = seasonRhythm(months, values)
    expect(r.seasons).toHaveLength(20)
    expect(r.startShiftWeeks).toBe(-4)
    expect(r.compared).toEqual(['2001–2010', '2011–2020'])
  })

  test('seasons with too few fires and incomplete seasons are left out', () => {
    const { months, values } = series(2001, 2003, (y, m) => (y === 2002 && m === 9 ? 5 : m === 9 ? 100 : 0))
    const r = seasonRhythm(months.slice(0, -1), values.slice(0, -1)) // last month missing: 2003 incomplete
    expect(r.seasons.map((s) => s.year)).toEqual([2001])
  })
})
