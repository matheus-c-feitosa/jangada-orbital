import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { classBreaks, classOf, compareMonth, daysIn } from './stats'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SOURCE_LABEL = ['Aqua MODIS, observed', 'Terra MODIS, scaled to Aqua (estimate)', 'VIIRS, calibrated to Aqua (estimate)']
const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

interface Props {
  months: string[]
  values: (number | null)[]
  /** source per month (harmonized view only) */
  source: number[] | null
  fromYear: number
  toYear: number
  /** "YYYY-MM" of the partial last month and how many days it covers */
  partialMonth: string
  partialDays: number
  caption: string
}

interface Cell {
  month: string
  value: number | null
  cls: number
  unusual: boolean
  source: number | null
}

/** Year × month table. One tab stop; arrow keys move between cells (roving tabindex). */
export function CalendarTable({ months, values, source, fromYear, toYear, partialMonth, partialDays, caption }: Props) {
  const [active, setActive] = useState<string>(partialMonth)
  const buttons = useRef(new Map<string, HTMLButtonElement>())

  const { grid, breaks } = useMemo(() => {
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
  }, [months, values, source, fromYear, toYear, partialMonth, partialDays])

  const flat = grid.flat()
  const activeCell = flat.find((c) => c.month === active) ?? flat[flat.length - 1]

  const move = (e: KeyboardEvent, month: string) => {
    const [y, m] = month.split('-').map(Number)
    let ny = y
    let nm = m
    if (e.key === 'ArrowLeft') nm -= 1
    else if (e.key === 'ArrowRight') nm += 1
    else if (e.key === 'ArrowUp') ny -= 1
    else if (e.key === 'ArrowDown') ny += 1
    else if (e.key === 'Home') nm = 1
    else if (e.key === 'End') nm = 12
    else return
    e.preventDefault()
    nm = Math.min(12, Math.max(1, nm))
    ny = Math.min(toYear, Math.max(fromYear, ny))
    const key = `${ny}-${String(nm).padStart(2, '0')}`
    setActive(key)
    buttons.current.get(key)?.focus()
  }

  const label = (c: Cell) => {
    const [y, m] = c.month.split('-').map(Number)
    const when = `${MONTHS[m - 1]} ${y}`
    if (c.value === null) return `${when}: no data`
    const parts = [`${when}: ${fmt.format(c.value)} detections`]
    if (c.month === partialMonth) parts.push(`partial, ${partialDays} days`)
    if (c.unusual) parts.push('unusual for this month')
    if (c.source !== null) parts.push(SOURCE_LABEL[c.source])
    return parts.join(', ')
  }

  const rangeText = (k: number) => {
    if (!breaks.length) return ''
    const lo = k === 1 ? 1 : breaks[k - 2]
    const hi = k === breaks.length + 1 ? null : breaks[k - 1]
    return hi === null ? `> ${fmt.format(lo)}` : `${fmt.format(lo)}–${fmt.format(hi)}`
  }

  return (
    <div>
      <div className="calendar-wrap">
        <table className="cal num">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <td />
              {MONTHS.map((m) => (
                <th key={m} scope="col" abbr={m}>{m[0]}<span className="visually-hidden">{m.slice(1)}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row) => {
              const year = row[0].month.slice(0, 4)
              const estimated = row.some((c) => c.source !== null && c.source > 0)
              return (
                <tr key={year}>
                  <th scope="row">{year}{estimated && <small>est.</small>}</th>
                  {row.map((c) => (
                    <td key={c.month}>
                      <button
                        type="button"
                        ref={(el) => { if (el) buttons.current.set(c.month, el); else buttons.current.delete(c.month) }}
                        className={`cell ${c.cls < 0 ? 'na' : `c${c.cls}`}${c.month === partialMonth ? ' partial' : ''}${c.unusual ? ' unusual' : ''}`}
                        tabIndex={c.month === activeCell.month ? 0 : -1}
                        aria-label={label(c)}
                        data-active={c.month === activeCell.month}
                        onFocus={() => setActive(c.month)}
                        onMouseEnter={() => setActive(c.month)}
                        onKeyDown={(e) => move(e, c.month)}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="detail" aria-live="polite">{activeCell && <><strong>{label(activeCell).split(':')[0]}</strong>{label(activeCell).slice(label(activeCell).indexOf(':'))}</>}</p>
      <div className="legend">
        <span className="item"><span className="sw c0" /> No detections</span>
        <span className="ramp" aria-label="Detections per month, 7 classes from low to high">
          {[1, 2, 3, 4, 5, 6, 7].map((k) => <span key={k} className={`sw c${k}`} title={rangeText(k)} />)}
        </span>
        <span className="item">{breaks.length ? `${rangeText(1)} … ${rangeText(7)} detections / month` : ''}</span>
        {source && <span className="item"><span className="dot" /> Unusual: above the 90th percentile of past years</span>}
        <span className="item"><span className="sw c3 cell partial" style={{ width: 22, height: 12 }} /> Partial month</span>
        {source && <span className="item">est. = year includes estimates (Terra 2000–02, VIIRS from 2024)</span>}
      </div>
    </div>
  )
}
