import { useMemo } from 'react'
import { SNPP_END, type AreaSeries } from '../data/load'
import { G_VIIRS, medianRatio, viirsRatios } from './viirs'
import { useI18n } from '../i18n'

/** Decimal year of "YYYY-MM-DD" (or "YYYY-MM"). */
const dec = (d: string) => {
  const [y, m = 1, day = 1] = d.split('-').map(Number)
  return y + (m - 1) / 12 + (day - 1) / 365
}

interface Lane {
  name: string
  flying: [string, string | null]
  /** part of the flight used in the harmonized series, and how */
  role?: { from: string; to: string | null; kind: 'observed' | 'converted' }
}

// docs/METHOD.md, "Series": Terra scaled until July 2002, Aqua observed until December 2023, NOAA-20/21 mean from 2024.
const LANES: Lane[] = [
  { name: 'Terra', flying: ['2000-02-24', null], role: { from: '2000-11-01', to: '2002-08-01', kind: 'converted' } },
  { name: 'Aqua', flying: ['2002-07-04', null], role: { from: '2002-08-01', to: '2024-01-01', kind: 'observed' } },
  { name: 'S-NPP', flying: ['2012-01-19', SNPP_END] },
  { name: 'NOAA-20', flying: ['2018-01-05', null], role: { from: '2024-01-01', to: null, kind: 'converted' } },
  { name: 'NOAA-21', flying: ['2023-01-01', null], role: { from: '2024-01-01', to: null, kind: 'converted' } },
]

/** Spec 002, story 5 (FR-027): which satellite each part of the series comes from. */
export function SensorTimeline({ dataDate }: { dataDate: string }) {
  const start = 2000
  const end = Math.max(dec(dataDate), 2026)
  const pos = (d: string | null) => (((d ? dec(d) : end) - start) / (end - start)) * 100
  const i = useI18n()
  return (
    <section aria-labelledby="lanes-title" className="me-card">
      <h2 id="lanes-title">{i.t('lanesTitle')}</h2>
      <p>{i.t('lanesText')}</p>
      <div className="flex flex-col gap-2">
        {LANES.map((l) => (
          <div key={l.name} className="grid grid-cols-[72px_1fr] items-center gap-3">
            <span className="text-sm">{l.name}</span>
            <div className="relative h-[22px] rounded bg-panel">
              <span className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-handle" style={{ left: `${pos(l.flying[0])}%`, width: `${pos(l.flying[1]) - pos(l.flying[0])}%` }} aria-hidden="true" />
              {l.role && (
                <span className={`absolute inset-y-1 rounded ${l.role.kind === 'observed' ? 'bg-c5' : 'lane-conv box-border border-[1.5px] border-conv-edge'}`}
                  style={{ left: `${pos(l.role.from)}%`, width: `${pos(l.role.to) - pos(l.role.from)}%` }} aria-hidden="true" />
              )}
              <span className="sr-only">
                {i.t('laneFlying', { a: l.flying[0].slice(0, 7), b: l.flying[1] ? l.flying[1] : i.t('today') })}
                {l.role ? i.t('laneIn', { how: i.t(l.role.kind === 'observed' ? 'asObserved' : 'convertedToAqua'), a: l.role.from.slice(0, 7), to: l.role.to ? i.t('laneTo', { b: l.role.to.slice(0, 7) }) : '' }) : i.t('notInSeries')}
              </span>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[72px_1fr] gap-3 text-[11px] text-ink-3 tabular-nums" aria-hidden="true">
          <span />
          <div className="flex justify-between"><span>2000</span><span>2006</span><span>2012</span><span>2018</span><span>{Math.floor(end)}</span></div>
        </div>
      </div>
      <ul className="!mt-3 flex !list-none flex-wrap gap-x-5 gap-y-2 !p-0 text-xs" aria-label={i.t('legend')}>
        <li className="inline-flex items-center gap-2"><span className="inline-block h-2.5 w-4 rounded-sm bg-c5" />{i.t('legReference')}</li>
        <li className="inline-flex items-center gap-2"><span className="lane-conv inline-block box-border h-2.5 w-4 rounded-sm border-[1.5px] border-conv-edge" />{i.t('legToAqua')}</li>
        <li className="inline-flex items-center gap-2"><span className="inline-block h-1 w-4 rounded-full bg-handle" />{i.t('legInOrbit')}</li>
      </ul>
    </section>
  )
}

const W = 560
const H = 220
const PAD = { left: 48, right: 14, top: 12, bottom: 28 }

/** Spec 002, story 5 (FR-027): NOAA-20 and NOAA-21 against S-NPP, month by month, next to g. */
export function ViirsAgreement({ brazil }: { brazil: AreaSeries | null }) {
  const i = useI18n()
  const two = new Intl.NumberFormat(i.locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  const points = useMemo(() => (brazil ? viirsRatios(brazil) : []), [brazil])
  if (!points.length) return null
  const lo = 0.8
  const hi = 1.2
  const first = dec(points[0].month)
  const last = dec(points[points.length - 1].month)
  const x = (m: string) => PAD.left + ((dec(m) - first) / Math.max(0.1, last - first)) * (W - PAD.left - PAD.right)
  const y = (r: number) => PAD.top + (1 - (Math.min(hi, Math.max(lo, r)) - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)
  const line = (key: 'noaa20' | 'noaa21') => {
    let d = ''
    let pen = false
    for (const p of points) {
      const v = p[key]
      if (v === null) { pen = false; continue }
      d += `${pen ? 'L' : 'M'} ${x(p.month).toFixed(1)} ${y(v).toFixed(1)} `
      pen = true
    }
    return d.trim()
  }
  const m20 = medianRatio(points, 'noaa20')
  const m21 = medianRatio(points, 'noaa21')
  // ratios outside the axis are drawn at its edge; name them so the chart does not hide them
  const clipped = points.filter((p) => [p.noaa20, p.noaa21].some((v) => v !== null && (v < lo || v > hi))).map((p) => p.month)
  const years = Array.from({ length: Math.floor(last) - Math.ceil(first) + 1 }, (_, k) => Math.ceil(first) + k).filter((yr) => yr % 2 === 0)

  return (
    <section aria-labelledby="viirs-title" className="me-card">
      <h2 id="viirs-title">{i.t('viirsTitle')}</h2>
      <p>
        {i.t('viirsText', { a: m20 !== null ? i.t('medianRatio', { r: two.format(m20) }) : '', b: m21 !== null ? ` (${two.format(m21)})` : '', g: G_VIIRS })}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={i.t('viirsAria', { a: points[0].month, b: points[points.length - 1].month, g: G_VIIRS })}>
        {[0.8, 0.9, 1, 1.1, 1.2].map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-3 text-[12px] tabular-nums max-sm:text-[18px]">{t.toFixed(1)}</text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(G_VIIRS)} y2={y(G_VIIRS)} className="stroke-ink" strokeWidth={1.5} strokeDasharray="6 4" />
        <path d={line('noaa20')} fill="none" className="stroke-brand" strokeWidth={2} strokeLinejoin="round" />
        <path d={line('noaa21')} fill="none" className="stroke-ink-2" strokeWidth={2} strokeDasharray="5 3" strokeLinejoin="round" />
        {years.map((yr) => <text key={yr} x={x(`${yr}-01`)} y={H - 8} textAnchor="middle" className="fill-ink-3 text-[12px] tabular-nums max-sm:text-[18px]">{yr}</text>)}
      </svg>
      <ul className="!m-0 flex !list-none flex-wrap gap-x-5 gap-y-2 !p-0 text-xs" aria-label={i.t('legend')}>
        <li className="inline-flex items-center gap-2"><svg width="24" height="8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" className="stroke-brand" strokeWidth={2} /></svg>NOAA-20 ÷ S-NPP</li>
        <li className="inline-flex items-center gap-2"><svg width="24" height="8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" className="stroke-ink-2" strokeWidth={2} strokeDasharray="5 3" /></svg>NOAA-21 ÷ S-NPP</li>
        <li className="inline-flex items-center gap-2"><svg width="24" height="8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" className="stroke-ink" strokeWidth={1.5} strokeDasharray="6 4" /></svg>g = {G_VIIRS}</li>
      </ul>
      <p className="text-sm">
        {i.t('viirsNote')}
        {clipped.length ? i.t('viirsClipped', { list: clipped.join(', '), lo, hi }) : ''}
      </p>
    </section>
  )
}
