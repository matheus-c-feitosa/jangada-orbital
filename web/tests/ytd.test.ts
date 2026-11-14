import { describe, expect, test } from 'vitest'
import { yearToDate } from '../src/calendar/ytd'

/** Jan 2001 .. Dec 2010 with `perMonth` detections per month, plus the given months of 2011. */
function series(perMonth: number, current: number[]) {
  const months: string[] = []
  const values: number[] = []
  for (let y = 2001; y <= 2010; y++) for (let m = 1; m <= 12; m++) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    values.push(perMonth + (y - 2005)) // a little spread between years: 6..15 per month
  }
  current.forEach((v, i) => { months.push(`2011-${String(i + 1).padStart(2, '0')}`); values.push(v) })
  return { months, values }
}

describe('year to date against the normal band', () => {
  test('a normal year is within the band', () => {
    const { months, values } = series(10, [10, 10, 10, 10])
    const r = yearToDate(months, values, '2011-04', 30)!
    expect(r.years).toBe(10)
    expect(r.points).toHaveLength(4)
    expect(r.points[3].median).toBeCloseTo(4 * 10.5)
    expect(r.status).toBe('within')
  })

  test('a year that jumps in March is above since March', () => {
    const { months, values } = series(10, [10, 10, 60, 60])
    const r = yearToDate(months, values, '2011-04', 30)!
    expect(r.status).toBe('above')
    expect(r.since).toBe(3)
  })

  test('a partial last month is compared at the same point of the month', () => {
    const { months, values } = series(10, [10, 10, 5])
    const r = yearToDate(months, values, '2011-03', 15) // half of March: history counts half of March too
    expect(r!.points[2].fraction).toBeCloseTo(15 / 31)
    expect(r!.points[2].median).toBeCloseTo(2 * 10.5 + 10.5 * (15 / 31))
    expect(r!.status).toBe('within')
  })

  test('too little history gives no band', () => {
    const months = ['2010-01', '2011-01']
    expect(yearToDate(months, [1, 2], '2011-01', 31)).toBeNull()
  })
})
