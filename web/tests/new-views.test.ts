import { describe, expect, test } from 'vitest'
import { annualRows, familyRows, medianOfComplete } from '../src/calendar/annual'
import { cumulativeDensity, ordinal, percentileClass, rankAreas, ytdStanding } from '../src/rank/ranking'
import { medianRatio, viirsRatios } from '../src/pages/viirs'
import { SATELLITES, type AreaSeries, type Satellite } from '../src/data/load'

/** Monthly series Jan `from`..`toMonth`, `perMonth(y, m)` detections; source by the real rules. */
function area(name: string, perMonth: (y: number, m: number) => number, from = 2001, toMonth = '2011-04', km2 = 1000): AreaSeries {
  const months: string[] = []
  const value: number[] = []
  const source: number[] = []
  for (let y = from; ; y++) {
    for (let m = 1; m <= 12; m++) {
      const k = `${y}-${String(m).padStart(2, '0')}`
      months.push(k)
      value.push(perMonth(y, m))
      source.push(k < '2002-08' ? 1 : y >= 2010 ? 2 : 0)
      if (k === toMonth) {
        const observed = Object.fromEntries(SATELLITES.map((s) => [s, months.map(() => null)])) as Record<Satellite, (number | null)[]>
        return { name, months, value, lo: value.map((v) => v * 0.9), hi: value.map((v) => v * 1.1), source, observed, viirs_k: value.map(() => 0), area_km2: km2 }
      }
    }
  }
}

describe('yearly totals with uncertainty', () => {
  const a = area('A', () => 10)
  const rows = annualRows(a, '2011-04')

  test('one row per year, summing the months', () => {
    expect(rows.map((r) => r.year)).toEqual([2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011])
    expect(rows[2].value).toBe(120)
  })

  test('converted years carry their source; observed Aqua years do not', () => {
    expect(rows[0]).toMatchObject({ source: 'terra', converted: true })
    expect(rows[1]).toMatchObject({ source: 'terra+aqua', converted: true })
    expect(rows[2]).toMatchObject({ source: 'aqua', converted: false })
    expect(rows[9]).toMatchObject({ source: 'viirs', converted: true })
    expect(rows[9].lo).toBeCloseTo(108)
    expect(rows[9].hi).toBeCloseTo(132)
  })

  test('the current year is partial and left out of the median', () => {
    expect(rows[10].partial).toBe(true)
    expect(rows[9].partial).toBe(false)
    expect(medianOfComplete(rows)).toBe(120)
  })

  test('the sum of the bars equals the sum of the calendar (SC-010)', () => {
    const total = a.value.reduce((s, v) => s + v, 0)
    expect(rows.reduce((s, r) => s + r.value, 0)).toBeCloseTo(total)
  })

  test('observed families never mix MODIS and VIIRS', () => {
    const b = area('B', () => 10)
    b.observed.Aqua = b.months.map((m) => (m >= '2002-07' ? 5 : null))
    b.observed.Terra = b.months.map(() => 7)
    b.observed['S-NPP'] = b.months.map((m) => (m >= '2009-01' ? 20 : null))
    const f = familyRows(b, '2011-04')
    expect(f[0]).toMatchObject({ year: 2001, modis: 84, viirs: null })
    expect(f[5]).toMatchObject({ year: 2006, modis: 60, viirs: null })
    expect(f[8]).toMatchObject({ year: 2009, viirs: 240 })
  })

  test('from the month S-NPP ended, the VIIRS family counts NOAA-20 (S-NPP flew only a few days)', () => {
    const b = area('B', () => 10, 2026, '2026-11')
    b.observed['S-NPP'] = b.months.map((m) => (m < '2026-11' ? 100 : 6))
    b.observed['NOAA-20'] = b.months.map(() => 90)
    expect(familyRows(b, '2026-11')[0].viirs).toBe(10 * 100 + 90)
  })
})

describe('this year against previous years at the same date', () => {
  test('a year that doubles is at the top', () => {
    const a = area('A', (y) => (y === 2011 ? 30 : 10 + (y % 3)))
    const s = ytdStanding(a.months, a.value, '2011-04', 30)!
    expect(s.years).toBe(10)
    expect(s.percentile).toBe(100)
    expect(s.first).toBe(2001)
    expect(s.last).toBe(2010)
  })

  test('the partial month is compared pro rata', () => {
    // 15 of 30 April days at the usual pace (10 a month) gives 35, the same as the usual 3.5 months
    const a = area('A', (y, m) => (y === 2011 && m === 4 ? 5 : 10))
    const s = ytdStanding(a.months, a.value, '2011-04', 15)!
    expect(s.current).toBe(35)
    expect(s.percentile).toBe(50)
  })

  test('ranking sorts by the chosen metric', () => {
    const areas = {
      A: area('Big', (y) => (y === 2011 ? 40 : 30), 2001, '2011-04', 10_000),
      B: area('Dense', (y) => (y === 2011 ? 20 : 10), 2001, '2011-04', 100),
    }
    expect(rankAreas(areas, ['A', 'B'], '2011-04', 30, 'total').map((r) => r.code)).toEqual(['A', 'B'])
    expect(rankAreas(areas, ['A', 'B'], '2011-04', 30, 'density').map((r) => r.code)).toEqual(['B', 'A'])
    const byPct = rankAreas(areas, ['A', 'B'], '2011-04', 30, 'percentile')
    expect(byPct.every((r) => r.percentile === 100)).toBe(true)
  })

  test('percentile classes are centred on the median', () => {
    expect([5, 10, 30, 50, 70, 80, 95].map(percentileClass)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect([1, 2, 3, 11, 12, 13, 22, 88].map(ordinal)).toEqual(['1st', '2nd', '3rd', '11th', '12th', '13th', '22nd', '88th'])
  })

  test('cumulative density per 1,000 km²', () => {
    const a = area('A', () => 10, 2001, '2011-04', 500)
    const c = cumulativeDensity(a.months, a.value, 500, '2011-04', 15)
    expect(c).toHaveLength(4)
    expect(c[3]).toMatchObject({ month: 4, fraction: 0.5, value: 80 })
  })
})

describe('VIIRS agreement', () => {
  test('ratios skip small months and keep each satellite apart', () => {
    const a = area('BR', () => 0, 2018, '2018-04')
    a.observed['S-NPP'] = [1000, 100, 2000, 1000]
    a.observed['NOAA-20'] = [1000, 100, 2000, null]
    a.observed['NOAA-21'] = [null, null, null, 1000]
    const r = viirsRatios(a)
    expect(r.map((p) => p.month)).toEqual(['2018-01', '2018-03', '2018-04'])
    expect(r[2]).toMatchObject({ noaa20: null, noaa21: 1 })
    expect(medianRatio(r, 'noaa20')).toBe(1)
  })

  test('the month S-NPP ended is left out, so its few days do not inflate the ratio', () => {
    const a = area('BR', () => 0, 2026, '2026-11')
    a.observed['S-NPP'] = a.months.map((m) => (m < '2026-11' ? 1000 : 600))
    a.observed['NOAA-20'] = a.months.map(() => 1000)
    const r = viirsRatios(a)
    expect(r.map((p) => p.month)).not.toContain('2026-11')
    expect(r).toHaveLength(10)
  })
})
