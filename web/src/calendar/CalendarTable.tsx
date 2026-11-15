import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { classBreaks, classOf, compareMonth, daysIn } from './stats'
import { oniLabel, type OniPhase } from '../data/extras'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SOURCE_LABEL = ['Aqua MODIS, observed', 'Terra MODIS, scaled to Aqua (estimate)', 'VIIRS, calibrated to Aqua (estimate)']
const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
// Literal class names so Tailwind generates them.
const BG = ['bg-c0', 'bg-c1', 'bg-c2', 'bg-c3', 'bg-c4', 'bg-c5', 'bg-c6', 'bg-c7']

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
  /** El Niño / La Niña phase per year (NOAA ONI), shown when climate context is on */
  oni?: Record<string, { phase: OniPhase | null }> | null
}

interface Cell {
  month: string
  value: number | null
  cls: number
  unusual: boolean
  source: number | null
}

/** Year × month table. One tab stop; arrow keys move between cells (roving tabindex). */
export function CalendarTable({ months, values, source, fromYear, toYear, partialMonth, partialDays, caption, oni }: Props) {
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
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-[3px] text-xs tabular-nums max-sm:border-spacing-[2px] max-sm:text-[11px]">
          <caption className="pb-1.5 text-left text-[13px] text-ink-2">{caption}</caption>
          <thead>
            <tr>
              {/* the El Niño / La Niña marks need room: beside the year on wide screens, under it on phones */}
              <td className={oni ? 'w-[5.5rem] max-sm:w-[3.25rem]' : 'w-14 max-sm:w-10'} />
              {MONTHS.map((m) => (
                <th key={m} scope="col" abbr={m} className="h-[22px] px-0 text-center font-medium text-ink-3">{m[0]}<span className="sr-only">{m.slice(1)}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row) => {
              const year = row[0].month.slice(0, 4)
              const estimated = row.some((c) => c.source !== null && c.source > 0)
              const enso = oni?.[year]?.phase ?? null
              return (
                <tr key={year}>
                  <th scope="row" className="whitespace-nowrap px-1.5 text-right font-medium text-ink-3">{year}{estimated && <small className="ml-1 font-normal max-sm:ml-0 max-sm:block max-sm:leading-none">est.</small>}
                    {enso && (
                      // one mark per phase, in the order they happened: "LN EN" is La Niña, then El Niño
                      <span className="ml-1 inline-flex gap-0.5 max-sm:ml-0 max-sm:flex max-sm:justify-end" title={oniLabel(enso)}>
                        {enso.split('-').map((ph) => (
                          <span key={ph} className={`inline-block rounded px-1 text-[10px] font-semibold leading-[14px] max-sm:px-0.5 ${ph === 'EN' ? 'bg-[var(--div6)] text-[#1a0d03]' : 'bg-[var(--div0)] text-[#0b1220]'}`}>{ph}</span>
                        ))}
                        <span className="sr-only">, {oniLabel(enso)}</span>
                      </span>
                    )}</th>
                  {row.map((c) => (
                    <td key={c.month} className="p-0">
                      <button
                        type="button"
                        ref={(el) => { if (el) buttons.current.set(c.month, el); else buttons.current.delete(c.month) }}
                        className={`cell relative block h-5 w-full cursor-pointer rounded border-0 p-0 hover:shadow-[0_0_0_2px_var(--ink-3)] data-[active=true]:shadow-[0_0_0_2px_var(--ink)] ${c.cls < 0 ? 'cursor-default border border-dashed border-line bg-transparent' : BG[c.cls]}${c.month === partialMonth ? ' cell-partial' : ''}${c.unusual ? ' cell-unusual' : ''}`}
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
      <p className="mt-3 min-h-11 text-sm text-ink-2 [&_strong]:text-ink" aria-live="polite">{activeCell && <><strong>{label(activeCell).split(':')[0]}</strong>{label(activeCell).slice(label(activeCell).indexOf(':'))}</>}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-[22px] rounded-sm bg-c0" /> No detections</span>
        <span className="flex items-center gap-0.5" aria-label="Detections per month, 7 classes from low to high">
          {[1, 2, 3, 4, 5, 6, 7].map((k) => <span key={k} className={`inline-block h-3 w-[22px] rounded-sm ${BG[k]}`} title={rangeText(k)} />)}
        </span>
        <span className="inline-flex items-center gap-1.5">{breaks.length ? `${rangeText(1)} … ${rangeText(7)} detections / month` : ''}</span>
        {source && <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-unusual" /> Unusual: above the 90th percentile of past years</span>}
        <span className="inline-flex items-center gap-1.5"><span className="cell-partial inline-block h-3 w-[22px] rounded-sm bg-c3" /> Partial month</span>
        {source && <span className="inline-flex items-center gap-1.5">est. = year includes estimates (Terra 2000–02, VIIRS from 2024)</span>}
        {oni && <span className="inline-flex items-center gap-1.5">EN El Niño, LN La Niña year; two marks: one phase, then the other (NOAA Oceanic Niño Index)</span>}
      </div>
    </div>
  )
}
