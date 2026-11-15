import { useMemo } from 'react'
import { yearToDate } from './ytd'
import { useI18n } from '../i18n'

const W = 420
const H = 200
const PAD = { left: 44, right: 10, top: 16, bottom: 26 }

interface Props {
  months: string[]
  values: number[]
  lastMonth: string
  days: number
  /** "14 Nov" */
  dateLabel: string
  areaName: string
}

/** T047, design "2026 so far": cumulative detections this year against the median and the p10–p90 range of previous years. */
export function YearToDate({ months, values, lastMonth, days, dateLabel, areaName }: Props) {
  const i = useI18n()
  const ytd = useMemo(() => yearToDate(months, values, lastMonth, days), [months, values, lastMonth, days])
  if (!ytd) return <p className="text-sm text-ink-2">{i.t('noHistory')}</p>

  const max = Math.max(...ytd.band.map((b) => b.p90), ...ytd.points.map((p) => p.current), 1) * 1.05
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
  const range = `${ytd.range[0]}–${ytd.range[1]}`

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="ytd-title">
      <h2 id="ytd-title" className="sr-only">{i.t('tabYear', { year: ytd.year })}</h2>
      <p className="m-0 text-[15px] leading-normal">
        <strong className="font-semibold">{i.t('ytdLead', { n: i.k(last.current) })}</strong>{' '}
        {i.t('ytdRest', { m: i.k(last.median), date: dateLabel, a: i.k(last.p10), b: i.k(last.p90) })}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={i.t('ytdChart', { year: ytd.year, name: areaName, range })}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="stroke-line" />
        <line x1={PAD.left} x2={W - PAD.right} y1={y(max / 2)} y2={y(max / 2)} className="stroke-line" strokeDasharray="3 4" />
        <line x1={PAD.left} x2={W - PAD.right} y1={y(max)} y2={y(max)} className="stroke-line" strokeDasharray="3 4" />
        <text x={PAD.left - 6} y={y(0) + 4} textAnchor="end" className="fill-ink-3 text-[11px]">0</text>
        <text x={PAD.left - 6} y={y(max / 2) + 4} textAnchor="end" className="fill-ink-3 text-[11px] tabular-nums">{i.k(max / 2)}</text>
        <text x={PAD.left - 6} y={y(max) + 4} textAnchor="end" className="fill-ink-3 text-[11px] tabular-nums">{i.k(max)}</text>
        <path d={bandPath} fill="var(--brand)" fillOpacity={0.18} />
        <path d={median} fill="none" className="stroke-ink-2" strokeWidth={1.5} strokeDasharray="5 4" />
        <path d={current} fill="none" className="stroke-brand" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last.month, last.fraction)} cy={y(last.current)} r={5} className="fill-brand stroke-surface" strokeWidth={2} />
        {Array.from({ length: 12 }, (_, k) => (
          <text key={k} x={x(k + 1, 0.5)} y={H - 6} textAnchor="middle" className="fill-ink-3 text-[11px]">{i.monthShort(k)[0]}</text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-[3px] w-[18px] rounded-sm bg-brand" />{ytd.year}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-[18px] border-t-2 border-dashed border-ink-2" />{i.t('usualYear')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-[18px] rounded-sm" style={{ background: 'color-mix(in srgb, var(--brand) 30%, transparent)' }} />{i.t('normalRange')}</span>
      </div>
      {/* sr-only on a <table> does not clip it (tables ignore width: 1px), so the wrapper is the hidden box */}
      <div className="sr-only"><table>
        <caption>{i.t('ytdCaption', { year: ytd.year, range })}</caption>
        <thead><tr><th scope="col">{i.t('thMonth')}</th><th scope="col">{ytd.year}</th><th scope="col">{i.t('thUsual')}</th><th scope="col">{i.t('thNormal')}</th></tr></thead>
        <tbody>
          {ytd.points.map((p) => (
            <tr key={p.month}>
              <th scope="row">{i.monthLong(p.month - 1)}{p.fraction < 1 ? i.t('partialParen') : ''}</th>
              <td>{i.int(p.current)}</td><td>{i.int(p.median)}</td><td>{i.int(p.p10)}–{i.int(p.p90)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  )
}
