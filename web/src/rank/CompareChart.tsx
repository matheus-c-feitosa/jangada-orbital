import { useMemo } from 'react'
import { X } from 'lucide-react'
import type { AppData, AreaSeries } from '../data/load'
import { cumulativeDensity } from './ranking'
import { useI18n } from '../i18n'

const W = 420
const H = 180
const PAD = { left: 44, right: 12, top: 12, bottom: 24 }

/** Line styles differ in lightness and dash, never only in hue (spec 002, story 3, scenario 2). */
const STYLES = [
  { className: 'stroke-[var(--cmp0)]', dash: undefined, width: 2.5 },
  { className: 'stroke-[var(--cmp1)]', dash: '7 4', width: 2.5 },
  { className: 'stroke-[var(--cmp2)]', dash: '2 3', width: 2.5 },
  { className: 'stroke-[var(--cmp3)]', dash: '10 3 2 3', width: 2.5 },
]

interface Props {
  data: AppData
  /** the selected area and its name */
  series: AreaSeries
  areaName: string
  compare: string[]
  onRemove: (key: string) => void
  /** series of a compared key (state code or "bio:<id>") */
  seriesFor: (key: string) => AreaSeries | null
}

/** Cumulative detections per 1,000 km² this year for the selected area and up to three compared states. */
export function CompareChart({ data, series, areaName, compare, onRemove, seriesFor }: Props) {
  const i = useI18n()
  const { manifest } = data
  const lastMonth = manifest.last_month.slice(0, 7)
  const lines = useMemo(() => {
    // a compared state that is also the selected area is drawn once, as the selected area
    const others = compare.map((c) => ({ code: c, s: seriesFor(c) })).filter((o) => o.s && o.s !== series) as { code: string; s: AreaSeries }[]
    const list = [{ code: '', name: areaName, s: series }, ...others.map((o) => ({ code: o.code, name: o.s.name, s: o.s }))]
    return list
      .filter((l) => l.s.area_km2)
      .map((l) => ({ ...l, points: cumulativeDensity(l.s.months, l.s.value, l.s.area_km2 as number, lastMonth, manifest.last_month_days) }))
  }, [series, areaName, compare, seriesFor, lastMonth, manifest.last_month_days])
  if (!compare.length || lines.length < 2) return null

  const last = (l: (typeof lines)[number]) => l.points[l.points.length - 1]?.value ?? 0
  const max = Math.max(...lines.map(last), 0.1) * 1.1
  const x = (m: number, f = 1) => PAD.left + ((m - 1 + f) / 12) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
  const path = (l: (typeof lines)[number]) => [`M ${x(0)} ${y(0)}`, ...l.points.map((p) => `L ${x(p.month, p.fraction).toFixed(1)} ${y(p.value).toFixed(1)}`)].join(' ')
  const lead = lines.reduce((a, b) => (last(b) > last(a) ? b : a))
  const base = last(lines[0])
  const sentence = lead === lines[0] ? i.t('cmpSelf', { name: areaName })
    : base > 0 ? i.t('cmpTimes', { lead: lead.name, x: i.one(last(lead) / base), name: areaName })
    : i.t('cmpMore', { lead: lead.name, name: areaName })

  return (
    <section className="mt-2 flex flex-col gap-2.5 border-t border-line pt-4" aria-labelledby="compare-title">
      <h2 id="compare-title" className="m-0 text-base font-semibold">{i.t('compared')}</h2>
      <p className="m-0 max-w-[70ch] text-sm text-ink-2">{sentence}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={i.t('cmpChart', { list: lines.map((l) => `${l.name} ${i.one(last(l))}`).join(', ') })}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="stroke-line" />
        <text x={PAD.left - 6} y={y(max) + 4} textAnchor="end" className="fill-ink-3 text-[11px] tabular-nums">{i.one(max)}</text>
        <text x={PAD.left - 6} y={y(0) + 4} textAnchor="end" className="fill-ink-3 text-[11px]">0</text>
        {lines.map((l, k) => (
          <path key={l.code || 'area'} d={path(l)} fill="none" className={STYLES[k].className} strokeWidth={STYLES[k].width}
            strokeDasharray={STYLES[k].dash} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {Array.from({ length: 12 }, (_, k) => <text key={k} x={x(k + 1, 0.5)} y={H - 6} textAnchor="middle" className="fill-ink-3 text-[11px]">{i.monthShort(k)[0]}</text>)}
      </svg>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm" aria-label={i.t('comparedAreas')}>
        {lines.map((l, k) => (
          <li key={l.code || 'area'} className="flex min-h-11 items-center gap-2">
            <svg width="24" height="8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" className={STYLES[k].className} strokeWidth={STYLES[k].width} strokeDasharray={STYLES[k].dash} /></svg>
            <span className="flex-1">{l.name}{!l.code && <span className="text-ink-3">{i.t('selectedParen')}</span>}</span>
            <span className="text-ink-2 tabular-nums">{i.t('perKm2', { d: i.one(last(l)) })}</span>
            {l.code && (
              <button type="button" className="inline-flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2" onClick={() => onRemove(l.code)} aria-label={i.t('stopComparing', { name: l.name })}>
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
