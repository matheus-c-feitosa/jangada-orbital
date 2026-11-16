import { describe, expect, test } from 'vitest'
import { cellAreaKm2, cellCentre, cellKey, cellOfKey, cellsInRing, cellsInRings, circleRing, pointInRing, type Ring } from '../src/geo/aoi'
import { classBreaks, classOf, compareMonth, daysIn } from '../src/calendar/stats'
import { buildCsv } from '../src/data/csv'
import type { AreaSeries, Manifest } from '../src/data/load'

const square: Ring = [[-38.5, -4.0], [-38.2, -4.0], [-38.2, -3.7], [-38.5, -3.7]]

describe('area of interest', () => {
  test('point in polygon', () => {
    expect(pointInRing(-38.3, -3.9, square)).toBe(true)
    expect(pointInRing(-38.6, -3.9, square)).toBe(false)
  })

  test('cells are counted by their centre', () => {
    const { cells, box } = cellsInRing(square)
    expect(cells.size).toBe(9) // centres -38.45..-38.25 x -3.95..-3.75
    expect(cells.has(cellKey(-40, -385))).toBe(true) // centre (-38.45, -3.95)
    expect(cells.has(cellKey(-37, -382))).toBe(false) // centre (-38.15, -3.65) is outside
    expect(box).toEqual({ latMin: -40, latMax: -37, lonMin: -385, lonMax: -382 })
  })

  test('tiny area with no cell centre inside falls back to the one cell around it, flagged approximate', () => {
    const tiny: Ring = [[-38.51, -3.99], [-38.505, -3.99], [-38.505, -3.985]]
    const { cells, box, approximate } = cellsInRing(tiny)
    expect(approximate).toBe(true)
    expect([...cells]).toEqual([cellKey(-40, -386)]) // the cell holding (-38.507, -3.988)
    expect(box).toEqual({ latMin: -40, latMax: -40, lonMin: -386, lonMax: -386 })
    expect(cellsInRing(square).approximate).toBe(false)
  })

  test('cell keys decode back, also for negative cells', () => {
    expect(cellOfKey(cellKey(-40, -386))).toEqual([-40, -386])
    expect(cellOfKey(cellKey(5, 12))).toEqual([5, 12])
    expect(cellCentre(-40, -386)).toEqual([-38.55, -3.95])
  })

  test('a cell is about 120 km² near the equator and shrinks toward the poles', () => {
    expect(cellAreaKm2(0)).toBeCloseTo(123.6, 0)
    expect(cellAreaKm2(-300)).toBeLessThan(cellAreaKm2(0))
  })

  test('circle radius is respected', () => {
    const ring = circleRing(-7.23, -39.31, 30)
    expect(ring).toHaveLength(65)
    const [lon, lat] = ring[0] // due north
    expect(lon).toBeCloseTo(-39.31, 6)
    expect((lat + 7.23) * 111.195).toBeCloseTo(30, 1)
  })
})

describe('month comparison', () => {
  // Novembers 2001..2010 = 10, 20, ..., 100; then Nov 2011 partial (15 of 30 days).
  const months: string[] = []
  const values: number[] = []
  for (let y = 2001; y <= 2011; y++) {
    months.push(`${y}-10`, `${y}-11`)
    values.push(999, y === 2011 ? 60 : (y - 2000) * 10)
  }
  const t = months.indexOf('2011-11')

  test('partial month is compared pro rata', () => {
    const c = compareMonth(months, values, t, 15)
    expect(c.partial).toBe(true)
    expect(c.median).toBe(55)
    expect(c.expected).toBeCloseTo(27.5)
    expect(c.ratio).toBeCloseTo(60 / 27.5)
    expect(c.rank).toBe(1) // pace 120 beats every past November
    expect(c.of).toBe(11)
    expect(c.unusual).toBe(true)
  })

  test('a full month at the median is not unusual', () => {
    const c = compareMonth(months, values.map((v, i) => (i === t ? 55 : v)), t, 30)
    expect(c.ratio).toBeCloseTo(1)
    expect(c.unusual).toBe(false)
  })

  test('days in month', () => {
    expect(daysIn('2024-02')).toBe(29)
    expect(daysIn('2026-11')).toBe(30)
  })

  test('class breaks', () => {
    const b = classBreaks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    expect(b).toHaveLength(6)
    expect(classOf(0, b)).toBe(0)
    expect(classOf(1, b)).toBe(1)
    expect(classOf(14, b)).toBe(7)
  })
})

describe('CSV export', () => {
  const series: AreaSeries = {
    name: 'Test',
    months: ['2023-12', '2024-01'],
    value: [12.34, 5],
    lo: [12.34, 4],
    hi: [12.34, 6],
    source: [0, 2],
    observed: { Terra: [3, 0], Aqua: [12, 9], 'S-NPP': [40, null], 'NOAA-20': [41, 20], 'NOAA-21': [0, 22] },
    viirs_k: [50, 30],
  }
  const manifest = { data_version: '2026-11-14', model_version: 'cal-1.0', unit: 'u', grid_deg: 0.1 } as Manifest

  test('header, columns, empty vs zero, totals', () => {
    const csv = buildCsv(series, { manifest, areaLabel: 'Test', from: '2023-12', to: '2024-01' })
    const rows = csv.trim().split('\n').filter((l) => !l.startsWith('#'))
    expect(rows[0]).toBe('month,harmonized,harmonized_lo,harmonized_hi,source,terra_n,aqua_n,snpp_n,noaa20_n,noaa21_n,viirs_n_1km')
    expect(rows[1]).toBe('2023-12,12.3,12.3,12.3,aqua_observed,3,12,40,41,0,50')
    expect(rows[2]).toBe('2024-01,5,4,6,viirs_calibrated,0,9,,20,22,30')
    expect(csv.split('\n').filter((l) => l.startsWith('#'))).toHaveLength(6)
    expect(csv).toContain('# area_km2=n/a') // no area on the test series
  })

  test('range filter', () => {
    const csv = buildCsv(series, { manifest, areaLabel: 'Test', from: '2024-01', to: '2024-01' })
    expect(csv.trim().split('\n').filter((l) => !l.startsWith('#'))).toHaveLength(2)
  })
})

describe('noise floor', () => {
  test('a tiny month above a near-zero history is not unusual', () => {
    const months = Array.from({ length: 12 }, (_, i) => `${2001 + i}-11`)
    const values = [0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 4]
    expect(compareMonth(months, values, 11, 30).unusual).toBe(false)
  })
})

describe('tiles', () => {
  test('a box inside one 2-degree tile needs one tile; a box across a corner needs four', async () => {
    const { tilesForBox } = await import('../src/geo/aoi')
    expect(tilesForBox({ latMin: -79, latMax: -61, lonMin: -399, lonMax: -381 }, 20)).toEqual(['-4_-20'])
    expect(tilesForBox({ latMin: -81, latMax: -79, lonMin: -401, lonMax: -399 }, 20).sort()).toEqual(['-4_-20', '-4_-21', '-5_-20', '-5_-21'].sort())
  })
})

describe('area (T048)', () => {
  test('a 1° x 1° box at the equator and a 30 km circle', async () => {
    const { ringAreaKm2, circleRing } = await import('../src/geo/aoi')
    expect(ringAreaKm2([[0, 0], [1, 0], [1, 1], [0, 1]])).toBeCloseTo(12364, -1) // sphere; ellipsoid gives ~12,309
    expect(ringAreaKm2(circleRing(-7.23, -39.31, 30))).toBeCloseTo(Math.PI * 30 * 30, -1)
  })
})

describe('areas made of several parts (#6)', () => {
  const box = (x: number, y: number, s: number): Ring => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]
  test('the cells of every part count, and a part too small for a cell centre adds no cell', () => {
    const main = box(-50, -10, 0.3) // 3 x 3 cells
    const island = box(-49, -10, 0.2) // 2 x 2 cells, apart from the main part
    const islet = box(-48.52, -9.98, 0.02) // inside one cell, holds no cell centre
    const { cells, box: b, approximate } = cellsInRings(main, [island, islet])
    expect(cells.size).toBe(9 + 4)
    expect(approximate).toBe(false)
    expect(b).toEqual({ latMin: -100, latMax: -97, lonMin: -500, lonMax: -488 })
    expect(cellsInRings(main).cells.size).toBe(9)
  })
})
