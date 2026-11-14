// The year × month grid behind the calendar: value, colour class and "unusual" flag per cell.
// Shared by the on-screen table and the PNG export, so the two can never disagree.
import { classBreaks, classOf, compareMonth, daysIn } from './stats'

export interface Cell {
  month: string
  value: number | null
  /** -1 no data, 0 no fire, 1..7 colour class */
  cls: number
  unusual: boolean
  /** 0 Aqua observed, 1 Terra scaled, 2 VIIRS calibrated; null in the observed view */
  source: number | null
}

export function buildGrid(
  months: string[],
  values: (number | null)[],
  source: number[] | null,
  fromYear: number,
  toYear: number,
  partialMonth: string,
  partialDays: number,
): { grid: Cell[][]; breaks: number[] } {
  const index = new Map(months.map((m, i) => [m, i]))
  const visible: number[] = []
  for (let i = 0; i < months.length; i++) {
    const y = Number(months[i].slice(0, 4))
    if (y >= fromYear && y <= toYear && values[i] !== null) visible.push(values[i] as number)
  }
  const breaks = classBreaks(visible)
  const numeric = values.map((v) => v ?? 0)
  const grid: Cell[][] = []
  for (let y = fromYear; y <= toYear; y++) {
    const row: Cell[] = []
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      const i = index.get(key)
      const value = i === undefined ? null : values[i]
      let unusual = false
      if (i !== undefined && value !== null && source) {
        unusual = compareMonth(months, numeric, i, key === partialMonth ? partialDays : daysIn(key)).unusual
      }
      row.push({ month: key, value, cls: value === null ? -1 : classOf(value, breaks), unusual, source: i !== undefined && source ? source[i] : null })
    }
    grid.push(row)
  }
  return { grid, breaks }
}
