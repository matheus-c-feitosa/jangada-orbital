import { describe, expect, test } from 'vitest'
import { calendarSvg, imageFileName, wrap, type ImageCell } from '../src/calendar/exportImage'

const cell = (month: string, value: number | null, cls: number, extra: Partial<ImageCell> = {}): ImageCell =>
  ({ month, value, cls, unusual: false, source: 0, ...extra })

describe('calendar image', () => {
  test('long sentences wrap at word boundaries', () => {
    expect(wrap('one two three four', 9)).toEqual(['one two', 'three', 'four'])
  })

  test('file names are plain ASCII slugs of the area', () => {
    expect(imageFileName('São Félix do Xingu, PA', 2001, 2026)).toBe('jangada-orbital-calendar_sao-felix-do-xingu-pa_2001-2026.png')
    expect(imageFileName('', 2010, 2012)).toBe('jangada-orbital-calendar_area_2010-2012.png')
  })

  test('the picture holds the title, one rect per month, the unusual dot and escaped text', () => {
    const grid = [Array.from({ length: 12 }, (_, k) => cell(`2024-${String(k + 1).padStart(2, '0')}`, k, k % 8, { source: 2, unusual: k === 8 }))]
    const { svg, width, height } = calendarSvg({
      title: 'Pará & <test>', lines: ['A line'], caption: 'Caption', grid, breaks: [10, 100], partialMonth: '2024-12', harmonized: true,
      footer: ['Source'], colors: { surface: '#fff', ink: '#000', ink2: '#111', ink3: '#222', line: '#333', unusual: '#f00', classes: Array(8).fill('#abc') },
      words: { months: 'JFMAMJJASOND', estimated: 'est.', noDetections: 'None', scale: (a, b) => `${a}-${b}`, unusual: 'Unusual', partial: 'Partial', format: String },
    })
    expect(width).toBe(880)
    expect(height).toBeGreaterThan(200)
    expect(svg).toContain('Pará &amp; &lt;test&gt;')
    expect(svg).toContain('2024 est.')
    expect(svg.match(/<circle/g)?.length).toBe(2) // the unusual month and the legend dot
  })
})
