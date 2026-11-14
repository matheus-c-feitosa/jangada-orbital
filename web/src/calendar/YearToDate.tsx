import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, TrendingDown } from 'lucide-react'
import { yearToDate } from './ytd'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const W = 640
const H = 220
const PAD = { left: 52, right: 12, top: 12, bottom: 26 }

interface Props {
  months: string[]
  values: number[]
  lastMonth: string
  days: number
}

/** T047: cumulative detections this year against the median and the p10–p90 range of previous years. */
export function YearToDate({ months, values, lastMonth, days }: Props) {
  const ytd = useMemo(() => yearToDate(months, values, lastMonth, days), [months, values, lastMonth, days])
  if (!ytd) return null

  const max = Math.max(...ytd.band.map((b) => b.p90), ...ytd.points.map((p) => p.current), 1)
  // x of the END of month m (fraction f of month m): months are evenly spaced, the year starts at the left edge.
  const x = (m: number, f = 1) => PAD.left + ((m - 1 + f) / 12) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
  const bandPath = [
    `M ${x(0)} ${y(0)}`,
    ...ytd.band.map((b) => `L ${x(b.month)} ${y(b.p90)}`),
    ...[...ytd.band].reverse().map((b) => `L ${x(b.month)} ${y(b.p10)}`),
    `L ${x(0)} ${y(0)} Z`,
  ].join(' ')
  const median = [`M ${x(0)} ${y(0)}`, ...ytd.band.map((b) => `L ${x(b.month)} ${y(b.median)}`)].join(' ')
  const current = [`M ${x(0)} ${y(0)}`, ...ytd.points.map((p) => `L ${x(p.month, p.fraction)} ${y(p.current)}`)].join(' ')
  const last = ytd.points[ytd.points.length - 1]
  const sinceName = MONTHS[ytd.since - 1]
  const range = `${ytd.range[0]}–${ytd.range[1]}`

  const sentence =
    ytd.status === 'above' ? <>Above the normal range{ytd.since < last.month ? ` since ${sinceName}` : ''}.</>
    : ytd.status === 'below' ? <>Below the normal range{ytd.since < last.month ? ` since ${sinceName}` : ''}.</>
    : <>Within the normal range.</>
  const Icon = ytd.status === 'above' ? AlertTriangle : ytd.status === 'below' ? TrendingDown : CheckCircle2
  const tone = ytd.status === 'above' ? 'text-unusual' : 'text-ink'

  return (
    <section className="mt-8 flex flex-col gap-3" aria-labelledby="ytd-title">
      <h2 id="ytd-title" className="m-0 text-lg font-semibold">{ytd.year} so far</h2>
      <p className={`m-0 flex items-center gap-1.5 text-sm font-semibold ${tone}`}>
        <Icon size={16} aria-hidden="true" /> {sentence}
      </p>
      <p className="m-0 max-w-[70ch] text-sm text-ink-2 tabular-nums">
        {fmt.format(last.current)} detections since January, against a usual {fmt.format(last.median)} at this point of the
        year (normal range {fmt.format(last.p10)}–{fmt.format(last.p90)}, years {range}).
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[720px]" role="img"
        aria-label={`Cumulative detections in ${ytd.year} against the normal range of ${range}`}>
        <path d={bandPath} className="fill-c3/25" />
        <path d={median} fill="none" className="stroke-ink-3" strokeWidth={1.5} strokeDasharray="4 4" />
        <path d={current} fill="none" className="stroke-brand" strokeWidth={2.5} strokeLinejoin="round" />
        <circle cx={x(last.month, last.fraction)} cy={y(last.current)} r={4} className="fill-brand stroke-surface" strokeWidth={2} />
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="stroke-line" />
        <text x={PAD.left - 6} y={y(max) + 4} textAnchor="end" className="fill-ink-3 text-[11px] tabular-nums">{fmt.format(max)}</text>
        <text x={PAD.left - 6} y={y(0) + 4} textAnchor="end" className="fill-ink-3 text-[11px]">0</text>
        {MONTHS.map((m, i) => (
          <text key={m} x={x(i + 1, 0.5)} y={H - 8} textAnchor="middle" className="fill-ink-3 text-[11px]">{m[0]}</text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 bg-brand" /> {ytd.year}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed border-ink-3" /> Usual (median)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded-sm bg-c3/25" /> Normal range (10th–90th percentile)</span>
      </div>
      {/* sr-only on a <table> does not clip it (tables ignore width: 1px), so the wrapper is the hidden box */}
      <div className="sr-only"><table>
        <caption>Cumulative detections in {ytd.year} and in previous years ({range})</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">{ytd.year}</th><th scope="col">Usual</th><th scope="col">Normal range</th></tr></thead>
        <tbody>
          {ytd.points.map((p) => (
            <tr key={p.month}>
              <th scope="row">{MONTHS[p.month - 1]}{p.fraction < 1 ? ' (partial)' : ''}</th>
              <td>{fmt.format(p.current)}</td><td>{fmt.format(p.median)}</td><td>{fmt.format(p.p10)}–{fmt.format(p.p90)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  )
}
