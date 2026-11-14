import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { MonthComparison } from './stats'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const ratioFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

interface Props {
  areaName: string
  comparison: MonthComparison | null
  loading: boolean
  cells?: number
  lastDayPartial?: boolean
}

/** The one job of the screen: is this month unusual for this area? (FR-006, SC-001) */
export function AnswerLine({ areaName, comparison: c, loading, cells, lastDayPartial }: Props) {
  if (loading || !c) {
    return (
      <section className="answer" aria-busy="true">
        <h1>{areaName}</h1>
        <p className="lead">Loading fire history…</p>
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
    <section className="answer" aria-live="polite">
      <h1>{areaName}</h1>
      {c.median === 0 && c.value === 0 ? (
        <p className="lead">{period}: no fires detected, as usual for {monthName}.</p>
      ) : (
        <p className="lead">
          {period}: <strong className="num">{fmt.format(c.value)} detections</strong>
          {c.ratio !== null ? (
            <> — <strong className="num ratio">{ratioFmt.format(c.ratio)}×</strong> {usual}.</>
          ) : (
            <>, where none are usually detected in {monthName}.</>
          )}
        </p>
      )}
      <p className="meta num">
        {c.partial ? 'On pace for' : 'Ranks'} #{c.rank} of {c.of} {monthName}s since {y - c.of + 1} · usual {monthName}:{' '}
        {fmt.format(c.median)} detections{cells !== undefined ? ` · ${fmt.format(cells)} grid cells` : ''}
      </p>
      {c.unusual ? (
        <span className="badge unusual"><AlertTriangle size={16} aria-hidden="true" /> Unusual: above the 90th percentile of past {monthName}s</span>
      ) : (
        <span className="badge usual"><CheckCircle2 size={16} aria-hidden="true" /> Within the usual range</span>
      )}
    </section>
  )
}
