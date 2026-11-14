import { AlertTriangle, CheckCircle2, Info, TrendingDown } from 'lucide-react'
import type { MonthComparison } from './stats'
import { answerParts } from './answerParts'

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const density = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

interface Props {
  areaName: string
  comparison: MonthComparison | null
  loading: boolean
  cells?: number
  /** the area is smaller than one grid cell, so the cell around it stands in */
  approximate?: boolean
  /** the area has no data because it lies outside Brazil */
  outside?: boolean
  lastDayPartial?: boolean
  areaKm2?: number
}

const heading = 'm-0 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-balance max-lg:text-[22px]'
const sentence = 'm-0 max-w-[70ch] text-lg leading-relaxed text-pretty max-lg:text-base'
const badge = 'inline-flex w-fit items-center gap-1.5 rounded-full border border-current px-2.5 py-1 text-sm font-semibold'

/** The one job of the screen: is this month unusual for this area? (FR-006, SC-001) */
export function AnswerLine({ areaName, comparison: c, loading, cells, approximate, outside, lastDayPartial, areaKm2 }: Props) {
  if (outside && !loading) {
    return (
      <section className="mb-5 flex flex-col gap-2">
        <h1 className={heading}>{areaName}</h1>
        <p className={sentence} role="status">
          This area is outside Brazil, so there is no fire data for it. Draw inside Brazil or pick a state.
        </p>
      </section>
    )
  }
  if (loading || !c) {
    return (
      <section className="flex flex-col gap-2 mb-5" aria-busy="true">
        <h1 className={heading}>{areaName}</h1>
        <p className="m-0 text-lg text-ink-2">Loading fire history…</p>
      </section>
    )
  }
  const a = answerParts(c, lastDayPartial)
  const [y] = c.month.split('-').map(Number)
  const cellText = cells === undefined ? '' : ` · ${fmt.format(cells)} grid ${cells === 1 ? 'cell' : 'cells'}${approximate ? ' (area smaller than one cell: approximate)' : ''}`
  return (
    <section className="flex flex-col gap-2 mb-5" aria-live="polite">
      <h1 className={heading}>{areaName}</h1>
      {a.noFire ? (
        <p className={sentence}>{a.period}: no fires detected, as usual for {a.monthName}.</p>
      ) : (
        <p className={sentence}>
          {a.period}: <strong className="font-semibold tabular-nums">{a.valueText}</strong>
          {a.ratio !== null ? (
            <> — <strong className="text-[22px] font-semibold tabular-nums">{a.ratio}×</strong> {a.usual}.</>
          ) : (
            <>, where none are usually detected in {a.monthName}.</>
          )}
        </p>
      )}
      <p className="m-0 text-sm text-ink-2 tabular-nums">{a.rankText}{cellText}</p>
      {areaKm2 ? (
        <p className="m-0 text-sm text-ink-2 tabular-nums">
          Area {fmt.format(areaKm2)} km² · usual {a.monthName}: {density.format((c.median / areaKm2) * 1000)} detections per 1,000 km²
          {c.partial ? '' : ` · ${a.monthName} ${y}: ${density.format((c.value / areaKm2) * 1000)}`}
        </p>
      ) : null}
      {a.status === 'unusual' ? (
        <span className={`${badge} text-unusual`}><AlertTriangle size={16} aria-hidden="true" /> {a.statusText}</span>
      ) : a.status === 'quiet' ? (
        <span className={`${badge} text-ink`}><TrendingDown size={16} aria-hidden="true" /> {a.statusText}</span>
      ) : a.status === 'tooFew' ? (
        <span className={`${badge} text-ink-2`}><Info size={16} aria-hidden="true" /> {a.statusText}</span>
      ) : (
        <span className={`${badge} text-ok`}><CheckCircle2 size={16} aria-hidden="true" /> {a.statusText}</span>
      )}
    </section>
  )
}
