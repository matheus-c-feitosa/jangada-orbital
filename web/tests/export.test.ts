import { describe, expect, test } from 'vitest'
import { answerLines, answerParts, det } from '../src/calendar/answerParts'
import { buildGrid } from '../src/calendar/grid'
import { calendarSvg, imageFileName, wrap, type ImageColors } from '../src/calendar/exportImage'
import { compareMonth } from '../src/calendar/stats'

// Novembers 2001..2010 = 100, 200, ..., 1000; November 2011 is partial (15 of 30 days) with 600 so far.
const months: string[] = []
const values: number[] = []
for (let y = 2001; y <= 2011; y++) {
  months.push(`${y}-11`)
  values.push(y === 2011 ? 600 : (y - 2000) * 100)
}
const t = months.length - 1

describe('answer wording', () => {
  test('pluralises by the rounded number', () => {
    expect(det(1)).toBe('1 detection')
    expect(det(0.6)).toBe('1 detection')
    expect(det(2)).toBe('2 detections')
    expect(det(1234)).toBe('1,234 detections')
  })

  test('a partial month above the usual pace is unusual and says so in plain sentences', () => {
    const p = answerParts(compareMonth(months, values, t, 15), true)
    expect(p.status).toBe('unusual')
    expect(p.ratio).toBe('2.2') // 600 / (median 550 * 15/30)
    const [headline, rank, verdict] = answerLines(p)
    expect(headline).toBe('November 2011 so far (15 of 30 days plus today, still arriving): 600 detections — 2.2× the usual pace for these days.')
    expect(rank).toBe('On pace for #1 of 11 Novembers since 2001 · usual November: 550 detections')
    expect(verdict).toBe('November so far: unusual, above the 90th percentile of past Novembers')
  })

  test('a high ratio on a handful of detections is "too few", not "within the usual range"', () => {
    const ms = Array.from({ length: 8 }, (_, i) => `${2001 + i}-11`)
    const p = answerParts(compareMonth(ms, [1, 1, 1, 1, 1, 1, 1, 4], 7, 30))
    expect(p.status).toBe('tooFew') // 4x the usual, but 4 detections is under the noise floor
  })

  test('the lowest month on record is "unusually quiet", not "within the usual range"', () => {
    const ms = Array.from({ length: 10 }, (_, i) => `${2001 + i}-11`)
    const vs = [500, 520, 480, 510, 530, 490, 505, 515, 495, 100] // last November far under every earlier one
    const c = compareMonth(ms, vs, 9, 30)
    expect(c.quiet).toBe(true)
    expect(c.unusual).toBe(false)
    const p = answerParts(c)
    expect(p.status).toBe('quiet')
    expect(p.statusText).toBe('November: unusually quiet, below the 10th percentile of past Novembers')
  })

  test('a month that usually has almost no fires is never "quiet"', () => {
    const ms = Array.from({ length: 10 }, (_, i) => `${2001 + i}-11`)
    expect(compareMonth(ms, [3, 4, 3, 5, 4, 3, 4, 5, 4, 0], 9, 30).quiet).toBe(false) // usual month is under 10 detections
  })

  test('no fires at all reads as such, without a meaningless rank', () => {
    const ms = Array.from({ length: 8 }, (_, i) => `${2001 + i}-11`)
    const [headline, rank, verdict] = answerLines(answerParts(compareMonth(ms, Array(8).fill(0), 7, 30)))
    expect(headline).toBe('November 2008: no fires detected, as usual for November.')
    expect(rank).toBe('No fires detected in any November since 2001')
    expect(verdict).toBe('November: within the usual range')
  })
})

describe('calendar grid and image', () => {
  const grid = buildGrid(months, values, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], 2009, 2011, '2011-11', 15)
  const colors: ImageColors = {
    surface: '#ffffff', ink: '#111111', ink2: '#333333', ink3: '#555555', line: '#dddddd', unusual: '#cc0000',
    classes: ['#eeeeee', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#ea580c', '#c2410c', '#7c2d12'],
  }

  test('one row per year and twelve columns; months without data are marked -1', () => {
    expect(grid.grid).toHaveLength(3)
    expect(grid.grid.every((row) => row.length === 12)).toBe(true)
    expect(grid.grid[0][0].cls).toBe(-1) // January 2009 is not in this toy series
    expect(grid.grid[2][10].month).toBe('2011-11')
    expect(grid.grid[2][10].unusual).toBe(true) // same rule as the on-screen table
  })

  test('the svg has one rect per cell, a dot per unusual month and escapes the title', () => {
    const { svg, width, height } = calendarSvg({
      title: 'Rio & <Grande>', lines: ['A sentence.'], caption: 'Caption', grid: grid.grid, breaks: grid.breaks,
      partialMonth: '2011-11', harmonized: true, footer: ['Source line.'], colors,
    })
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('Rio &amp; &lt;Grande&gt;')
    expect(svg).not.toContain('Rio & <Grande>')
    expect(width).toBe(880)
    expect(svg).toContain(`height="${height}"`)
    // 36 grid cells, 8 legend swatches (no-fire + 7 classes) and a dashed outline for the partial month
    expect((svg.match(/<rect /g) ?? []).length).toBeGreaterThanOrEqual(36 + 8)
    expect(svg).toContain('2011 est.') // the year holds a month with source 2 (estimated)
    const unusual = grid.grid.flat().filter((c) => c.unusual).length
    expect(unusual).toBeGreaterThan(0)
    expect((svg.match(/<circle /g) ?? []).length).toBe(unusual + 1 /* the legend dot */)
  })

  test('long sentences wrap and file names are safe', () => {
    expect(wrap('one two three four five six', 11)).toEqual(['one two', 'three four', 'five six'])
    expect(imageFileName('Ceará, Brazil', 2001, 2026)).toBe('jangada-orbital-calendar_ceara-brazil_2001-2026.png')
    expect(imageFileName('30 km around -7.23°, -39.31°', 2001, 2026)).toBe('jangada-orbital-calendar_30-km-around-7-23-39-31_2001-2026.png')
    expect(imageFileName('???', 2020, 2021)).toBe('jangada-orbital-calendar_area_2020-2021.png')
  })
})
