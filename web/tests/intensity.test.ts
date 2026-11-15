import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { IntensityChart } from '../src/calendar/IntensityChart'
import type { Intensity } from '../src/data/extras'

// [detections, night detections, median FRP MW] per year; S-NPP 2013 is a small sample (10 < 20)
const intensity: Intensity = {
  small_sample: 20,
  areas: {
    BR: {
      aqua: { '2012': [1000, 100, 20.5], '2013': [900, 90, 21] },
      snpp: { '2012': [5000, 1500, 5.1], '2013': [10, 2, 4.9] },
    },
  },
}

const render = () => renderToStaticMarkup(createElement(IntensityChart, { intensity, areaKey: 'BR', areaName: 'Brazil' }))
const count = (html: string, s: string) => html.split(s).length - 1

describe('fire intensity chart (FR-026, SC-013)', () => {
  test('each sensor has its own labelled line in both charts, never one merged series', () => {
    const html = render()
    // two charts (median FRP, night share), one line per sensor in each: Aqua solid, S-NPP dashed
    expect(count(html, '<path ')).toBe(4)
    expect(count(html, 'stroke-dasharray="6 4"')).toBeGreaterThanOrEqual(2)
    expect(html).toContain('Aqua MODIS (1 km pixels)')
    expect(html).toContain('VIIRS S-NPP (375 m pixels)')
    expect(html).toContain('one line per sensor')
  })

  test('the screen-reader table names the sensor on every row', () => {
    const html = render()
    expect(count(html, '<td>Aqua MODIS (1 km pixels)</td>')).toBe(2)
    expect(count(html, '<td>VIIRS S-NPP (375 m pixels)</td>')).toBe(2)
  })

  test('a year under the small-sample limit is drawn hollow and explained', () => {
    const html = render()
    expect(html).toContain('fill-surface')
    expect(html).toMatch(/Fewer than (<!-- -->)?20(<!-- -->)? detections: small sample/)
  })

  test('an area without intensity data draws nothing', () => {
    expect(renderToStaticMarkup(createElement(IntensityChart, { intensity, areaKey: 'XX', areaName: 'Nowhere' }))).toBe('')
  })
})
