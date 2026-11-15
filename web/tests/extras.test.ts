import { describe, expect, test } from 'vitest'
import { decodeRecent, decodeRows, mercatorRow, oniLabel, recurrenceClass, yearsWithFire } from '../src/data/extras'

describe('climate context (FR-031)', () => {
  test('a year with both phases names them in the order they happened', () => {
    expect(oniLabel('EN')).toBe('El Niño year')
    expect(oniLabel('LN')).toBe('La Niña year')
    expect(oniLabel('EN-LN')).toBe('El Niño, then La Niña year')
    expect(oniLabel('LN-EN')).toBe('La Niña, then El Niño year')
  })
})

describe('recurrence (FR-022)', () => {
  test('rows decode to cells with absolute longitudes', () => {
    // cells -100,-400 (2001 and 2003), -100,-399 (every year 2001-2005), -100,-395 (none in range), -99,-500
    const rows = { '-100': `-400.${(0b101).toString(36)},1.${(0b11111).toString(36)},4.0`, '-99': '-500.1' }
    expect(decodeRows(rows)).toEqual([[-100, -400, 5], [-100, -399, 31], [-100, -395, 0], [-99, -500, 1]])
  })

  test('years with fire count only the chosen period', () => {
    expect(yearsWithFire(0b101, 2001, 2001, 2005)).toBe(2)
    expect(yearsWithFire(0b101, 2001, 2002, 2005)).toBe(1)
    expect(yearsWithFire(0b11111, 2001, 2003, 2004)).toBe(2)
  })

  test('image rows follow Web Mercator, where MapLibre places an image source', () => {
    expect(mercatorRow(5, 5, -34, 1000)).toBe(0)
    expect(mercatorRow(-34, 5, -34, 1000)).toBe(1000)
    // linear in latitude, -15 would sit at row 513 (20 of 39 degrees down); in Mercator it is at row 490,
    // 23 rows (0.9 degree) higher, which is where the basemap draws -15
    expect(mercatorRow(-15, 5, -34, 1000)).toBe(490)
  })

  test('classes fill the ramp from 1 year to the whole period', () => {
    expect([0, 1, 5, 9, 10].map((n) => recurrenceClass(n, 10))).toEqual([0, 1, 4, 7, 7])
    expect(recurrenceClass(1, 1)).toBe(7)
  })
})

describe('last 7 days (FR-029)', () => {
  test('day offsets and satellite bits expand to dates and names', () => {
    const r = decodeRecent({
      from: '2026-11-07', to: '2026-11-14', detections: 3, downloaded: 'x',
      satellites: ['Terra', 'Aqua', 'S-NPP', 'NOAA-20', 'NOAA-21'],
      cells: [[-100, -400, 3, 1.5, 42, 0, 7, 0b11010, 1]],
    })
    expect(r.cells[0]).toEqual([-100, -400, 3, 1.5, 42, '2026-11-07', '2026-11-14', 'Aqua,NOAA-20,NOAA-21', true])
  })
})
