import { describe, expect, test } from 'vitest'
import { splitEdges } from '../src/geo/edges'

const square = (x: number, y: number): GeoJSON.Feature => ({
  type: 'Feature', properties: {},
  geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] },
})

describe('inner and outer borders', () => {
  test('two squares side by side share one edge, drawn once, and the rest is the outline', () => {
    const { inner, outer, shared } = splitEdges({ type: 'FeatureCollection', features: [square(0, 0), square(1, 0)] })
    expect(shared).toBe(2) // seen once per square
    expect(inner.geometry.coordinates).toEqual([[[1, 0], [1, 1]]])
    const outerLength = outer.geometry.coordinates.reduce((n, line) => n + line.length - 1, 0)
    expect(outerLength).toBe(6) // 8 sides minus the 2 shared ones
  })

  test('a lone polygon is all outline', () => {
    const { inner, outer } = splitEdges({ type: 'FeatureCollection', features: [square(0, 0)] })
    expect(inner.geometry.coordinates).toHaveLength(0)
    expect(outer.geometry.coordinates.flat()).toHaveLength(5)
  })
})
