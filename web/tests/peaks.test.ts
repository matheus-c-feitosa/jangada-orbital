import { describe, expect, test } from 'vitest'
import { peaks } from '../src/calendar/peaks'
import { anyCellInBrazil, outlinesOf } from '../src/geo/coverage'
import { cellKey } from '../src/geo/aoi'

// Three full years (2001-2003) and a partial 2004 (Jan-Mar).
const months: string[] = []
const values: (number | null)[] = []
const shape = [0, 0, 1, 2, 3, 10, 40, 60, 30, 8, 1, 0] // September-ish peak: August highest
for (const [y, scale] of [[2001, 1], [2002, 3], [2003, 2]] as const) {
  shape.forEach((s, k) => { months.push(`${y}-${String(k + 1).padStart(2, '0')}`); values.push(s * scale) })
}
for (const k of [1, 2, 3]) { months.push(`2004-0${k}`); values.push(k === 3 ? 500 : 0) }

describe('peaks', () => {
  test('busiest complete year, highest month and typical busiest months', () => {
    const p = peaks(months, values, 2001, 2004, '2004-03')
    expect(p.year).toEqual({ year: 2002, total: 155 * 3 }) // 155 = sum(shape)
    expect(p.month).toEqual({ month: '2002-08', value: 180 })
    expect(p.typical).toEqual([8, 7, 9]) // August, July, September
    expect(p.span).toEqual([2001, 2004])
  })

  test('the partial month never wins, even when it is the highest', () => {
    const p = peaks(months, values, 2001, 2004, '2004-03')
    expect(p.month?.month).not.toBe('2004-03')
  })

  test('an incomplete year cannot be the busiest year', () => {
    const p = peaks(months, values, 2004, 2004, '2004-03')
    expect(p.year).toBeNull()
  })

  test('the range limits the comparison', () => {
    const p = peaks(months, values, 2001, 2001, '2004-03')
    expect(p.year).toEqual({ year: 2001, total: 155 })
    expect(p.span).toEqual([2001, 2001])
  })

  test('months without data (null) are skipped, and no fires gives no peak', () => {
    expect(peaks(['2001-01', '2001-02'], [null, null], 2001, 2001, '2099-01').span).toBeNull()
    const none = peaks(['2001-01', '2001-02'], [0, 0], 2001, 2001, '2099-01')
    expect(none.month).toBeNull()
    expect(none.typical).toEqual([])
  })
})

describe('inside Brazil?', () => {
  // A square standing in for a state: lon -40..-38, lat -5..-3.
  const states = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-40, -5], [-38, -5], [-38, -3], [-40, -3], [-40, -5]]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[[[-30, -10], [-29, -10], [-29, -9], [-30, -9], [-30, -10]]]] } },
    ],
  } as GeoJSON.FeatureCollection
  const outlines = outlinesOf(states)

  test('collects polygons and multipolygons', () => {
    expect(outlines).toHaveLength(2)
  })

  test('a cell centred inside a state is in Brazil, one at sea is not', () => {
    expect(anyCellInBrazil([cellKey(-40, -390)], outlines)).toBe(true) // centre (-38.95, -3.95)
    expect(anyCellInBrazil([cellKey(-250, -300)], outlines)).toBe(false) // centre (-29.95, -24.95): open sea
    expect(anyCellInBrazil([cellKey(-250, -300), cellKey(-95, -295)], outlines)).toBe(true) // second one is on the island polygon
  })
})
