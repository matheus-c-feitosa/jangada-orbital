import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { classBreaks, classOf, compareMonth, daysIn, type MonthComparison } from './stats'
import type { OniPhase } from '../data/extras'
import { useI18n, type I18n, type Key } from '../i18n'

const SOURCE_KEY: Key[] = ['srcAqua', 'srcTerra', 'srcViirs']
// Literal class names so Tailwind generates them.
const BG = ['bg-c0', 'bg-c1', 'bg-c2', 'bg-c3', 'bg-c4', 'bg-c5', 'bg-c6', 'bg-c7']

/** "El Niño year", "La Niña, then El Niño year" / "ano de El Niño", … */
export const ensoLabel = (phase: OniPhase, i: I18n) =>
  i.t('ensoYear', { phases: phase.split('-').map((p) => (p === 'EN' ? 'El Niño' : 'La Niña')).join(i.t('ensoThen')) })

interface Props {
  months: string[]
  values: (number | null)[]
  /** harmonized values: unusual marks and the source of each month apply */
  harmonized: boolean
  /** source per month: 0 Aqua observed, 1 Terra converted, 2 VIIRS converted */
  source: number[]
  fromYear: number
  toYear: number
  /** "YYYY-MM" of the partial last month and how many days it covers */
  partialMonth: string
  partialDays: number
  caption: string
  /** El Niño / La Niña phase per year (NOAA ONI), shown when climate context is on */
  oni?: Record<string, { phase: OniPhase | null }> | null
  climateAvailable?: boolean
  climate?: boolean
  onClimate?: (on: boolean) => void
  /** phone: taller cells */
  compact?: boolean
}

interface Cell {
  month: string
  index: number | undefined
  value: number | null
  cls: number
  unusual: boolean
  source: number | null
  future: boolean
}

/** Year × month table of the design's "Calendar" tab. One tab stop; arrow keys move between cells (roving tabindex). */
export function CalendarTable({ months, values, harmonized, source, fromYear, toYear, partialMonth, partialDays, caption, oni, climateAvailable, climate, onClimate, compact }: Props) {
  const i = useI18n()
  const [active, setActive] = useState<string>(partialMonth)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const numeric = useMemo(() => values.map((v) => v ?? 0), [values])

  const { grid, breaks } = useMemo(() => {
    const index = new Map(months.map((m, k) => [m, k]))
    const visible: number[] = []
    for (let k = 0; k < months.length; k++) {
      const y = Number(months[k].slice(0, 4))
      if (y >= fromYear && y <= toYear && values[k] !== null) visible.push(values[k] as number)
    }
    const breaks = classBreaks(visible)
    const grid: Cell[][] = []
    for (let y = fromYear; y <= toYear; y++) {
      const row: Cell[] = []
      for (let m = 1; m <= 12; m++) {
        const key = `${y}-${String(m).padStart(2, '0')}`
        const k = index.get(key)
        const value = k === undefined ? null : values[k]
        let unusual = false
        if (harmonized && k !== undefined && value !== null) {
          unusual = compareMonth(months, numeric, k, key === partialMonth ? partialDays : daysIn(key)).unusual
        }
        row.push({ month: key, index: k, value, cls: value === null ? -1 : classOf(value, breaks), unusual, source: k !== undefined ? source[k] : null, future: key > partialMonth })
      }
      grid.push(row)
    }
    return { grid, breaks }
  }, [months, values, numeric, harmonized, source, fromYear, toYear, partialMonth, partialDays])

  const flat = grid.flat()
  const activeCell = flat.find((c) => c.month === active && c.value !== null) ?? flat.filter((c) => c.value !== null).pop() ?? flat[0]

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
    const when = `${i.monthShort(m - 1)} ${y}`
    if (c.value === null) return `${when}: ${c.future ? i.t('noDataYet') : i.t('noData')}`
    const parts = [`${when}: ${i.t('nDetections', { n: i.int(c.value) })}`]
    if (c.month === partialMonth) parts.push(i.t('partialDays', { d: partialDays }))
    if (c.unusual) parts.push(i.t('unusualMonth'))
    if (harmonized && c.source !== null) parts.push(i.t(SOURCE_KEY[c.source]))
    return parts.join(', ')
  }

  // The readout of the design: the selected month in a sentence, with how it compares with the usual month.
  const readout = (c: Cell) => {
    const [y, m] = c.month.split('-').map(Number)
    if (c.value === null || c.index === undefined) return <><strong>{i.monthShort(m - 1)} {y}</strong>: {i.t('noDataYet')}.</>
    const partial = c.month === partialMonth
    let cmp: MonthComparison | null = null
    if (harmonized) cmp = compareMonth(months, numeric, c.index, partial ? partialDays : daysIn(c.month))
    const ratio = cmp && cmp.ratio !== null ? i.one(cmp.ratio) : null
    return (
      <>
        <strong>{i.monthShort(m - 1)} {y}</strong>: {i.t('nDetections', { n: i.int(c.value) })}{partial ? i.t('firstDays', { d: partialDays }) : ''}
        {harmonized && c.source !== null ? `, ${i.t(SOURCE_KEY[c.source])}` : ''}.
        {cmp && ratio !== null && <> {cmp.partial ? i.t('ratioPace', { r: ratio }) : i.t('ratioMonth', { r: ratio, month: i.monthLong(m - 1) })}</>}
        {cmp && ratio === null && cmp.value > 0 && <> {i.t('noneUsually', { month: i.monthLong(m - 1) })}</>}
        {c.unusual && <> {i.t('above90Long')}</>}
      </>
    )
  }

  const top = breaks.length ? breaks[breaks.length - 1] : 0
  const cellH = compact ? 'h-[18px]' : 'h-3'

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] leading-snug text-ink-3" aria-hidden="true">{caption}</span>
        {climateAvailable && onClimate && (
          <label className="flex min-h-11 flex-none cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" className="m-0 size-5 accent-[var(--brand)]" checked={!!climate} onChange={(e) => onClimate(e.target.checked)} />
            {i.t('climate')} <span className="sr-only">(El Niño / La Niña)</span>
          </label>
        )}
      </div>
      <p className="m-0 rounded-[10px] bg-panel px-3 py-2.5 text-sm leading-snug [&_strong]:font-semibold" aria-live="polite">
        {activeCell && readout(activeCell)}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-x-[3px] border-spacing-y-[2px] text-[11px] tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {/* the design's 66 px fits one ENSO mark; years with both phases ("LN EN") need 84 */}
              <td className={oni ? 'w-[84px] max-sm:w-[52px]' : 'w-11'} />
              {Array.from({ length: 12 }, (_, k) => i.monthShort(k)).map((m) => (
                <th key={m} scope="col" abbr={m} className="h-5 px-0 text-center font-normal text-ink-3">{m[0]}<span className="sr-only">{m.slice(1)}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row) => {
              const year = row[0].month.slice(0, 4)
              const converted = harmonized && row.some((c) => c.source !== null && c.source > 0 && c.value !== null)
              const enso = oni?.[year]?.phase ?? null
              return (
                <tr key={year}>
                  <th scope="row" className={`whitespace-nowrap pr-1 text-left font-normal ${converted ? 'text-ink-3' : 'text-ink'}`}>
                    <span className="inline-flex items-center gap-1 max-sm:flex-col max-sm:items-start max-sm:gap-0">
                      {year}
                      {converted && <span className="sr-only">{i.t('includesConverted')}</span>}
                      {enso && (
                        // one mark per phase, in the order they happened: "LN EN" is La Niña, then El Niño
                        <span className="inline-flex gap-0.5" title={ensoLabel(enso, i)}>
                          {enso.split('-').map((ph) => (
                            <span key={ph} className={`inline-block rounded px-1 text-[10px] font-semibold leading-[14px] max-sm:px-0.5 ${ph === 'EN' ? 'bg-[#FDBA74] text-[#1A0C02]' : 'bg-[#9CC5FF] text-[#0C1424]'}`}>{ph}</span>
                          ))}
                          <span className="sr-only">, {ensoLabel(enso, i)}</span>
                        </span>
                      )}
                    </span>
                  </th>
                  {row.map((c) => (
                    <td key={c.month} className="p-0">
                      <button
                        type="button"
                        ref={(el) => { if (el) buttons.current.set(c.month, el); else buttons.current.delete(c.month) }}
                        className={`cell relative block w-full cursor-pointer rounded-[3px] border-0 p-0 ${cellH} hover:shadow-[0_0_0_2px_var(--ink-3)] data-[active=true]:outline-2 data-[active=true]:outline-offset-1 data-[active=true]:outline-ink ${c.cls < 0 ? 'cursor-default bg-transparent shadow-[inset_0_0_0_1px_var(--line)]' : BG[c.cls]}${c.month === partialMonth ? ' cell-partial' : ''}${c.unusual ? ' cell-unusual' : ''}`}
                        tabIndex={c.month === activeCell.month ? 0 : -1}
                        aria-label={label(c)}
                        data-active={c.month === activeCell.month}
                        onFocus={() => setActive(c.month)}
                        onMouseEnter={() => c.value !== null && setActive(c.month)}
                        onClick={() => setActive(c.month)}
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
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">{i.t('legendNone')}
          <span className="inline-flex gap-0.5" aria-hidden="true">{BG.map((b) => <span key={b} className={`inline-block h-2.5 w-3 rounded-[2px] ${b}`} />)}</span>
          {top > 0 ? i.t('perMonth', { n: i.k(top) }) : i.t('detPerMonth')}
        </span>
        {harmonized && <span className="inline-flex items-center gap-1.5"><span className="inline-block size-[7px] rounded-full bg-unusual" />{i.t('above90')}</span>}
        <span className="inline-flex items-center gap-1.5"><span className="cell-partial inline-block h-2.5 w-3 rounded-[2px]" />{i.t('partialPeriod')}</span>
        {harmonized && <span>{i.t('greyYears')}</span>}
        {oni && <span>{i.t('oniNote')}</span>}
      </div>
    </div>
  )
}
