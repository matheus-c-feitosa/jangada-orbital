import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { MonthComparison } from './stats'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const density = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const ratioFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

interface Props {
  areaName: string
  comparison: MonthComparison | null
  loading: boolean
  cells?: number
  lastDayPartial?: boolean
  areaKm2?: number
}

/** The one job of the screen: is this month unusual for this area? (FR-006, SC-001) */
export function AnswerLine({ areaName, comparison: c, loading, cells, lastDayPartial, areaKm2 }: Props) {
  if (loading || !c) {
    return (
      <section className="flex flex-col gap-2 mb-5" aria-busy="true">
        <h1 className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-balance max-lg:text-[22px]">{areaName}</h1>
        <p className="m-0 text-lg text-ink-2">Loading fire history…</p>
      </section>
    )
  }
  const [y, m] = c.month.split('-').map(Number)
  const monthName = MONTHS[m - 1]
  const period = c.partial
    ? `${monthName} ${y} so far (${c.days} of ${c.daysInMonth} days${lastDayPartial ? ' plus today, still arriving' : ''})`
    : `${monthName} ${y}`
  const usual = c.partial ? 'the usual pace for these days' : `the usual ${monthName}`
  return (
    <section className="flex flex-col gap-2 mb-5" aria-live="polite">
      <h1 className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-balance max-lg:text-[22px]">{areaName}</h1>
      {c.median === 0 && c.value === 0 ? (
        <p className="m-0 max-w-[70ch] text-lg leading-relaxed text-pretty max-lg:text-base">{period}: no fires detected, as usual for {monthName}.</p>
      ) : (
        <p className="m-0 max-w-[70ch] text-lg leading-relaxed text-pretty max-lg:text-base">
          {period}: <strong className="font-semibold tabular-nums">{fmt.format(c.value)} detections</strong>
          {c.ratio !== null ? (
            <> — <strong className="text-[22px] font-semibold tabular-nums">{ratioFmt.format(c.ratio)}×</strong> {usual}.</>
          ) : (
            <>, where none are usually detected in {monthName}.</>
          )}
        </p>
      )}
      <p className="m-0 text-sm text-ink-2 tabular-nums">
        {c.partial ? 'On pace for' : 'Ranks'} #{c.rank} of {c.of} {monthName}s since {y - c.of + 1} · usual {monthName}:{' '}
        {fmt.format(c.median)} detections{cells !== undefined ? ` · ${fmt.format(cells)} grid cells` : ''}
      </p>
      {areaKm2 ? (
        <p className="m-0 text-sm text-ink-2 tabular-nums">
          Area {fmt.format(areaKm2)} km² · usual {monthName}: {density.format((c.median / areaKm2) * 1000)} detections per 1,000 km²
          {c.partial ? '' : ` · ${monthName} ${y}: ${density.format((c.value / areaKm2) * 1000)}`}
        </p>
      ) : null}
      <a href="#why" className="w-fit text-sm text-ink-2 underline underline-offset-[3px] hover:text-ink">Why these numbers?</a>
      {c.unusual ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-current px-2.5 py-1 text-sm font-semibold text-unusual"><AlertTriangle size={16} aria-hidden="true" /> Unusual: above the 90th percentile of past {monthName}s</span>
      ) : (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-current px-2.5 py-1 text-sm font-semibold text-ok"><CheckCircle2 size={16} aria-hidden="true" /> Within the usual range</span>
      )}
    </section>
  )
}
