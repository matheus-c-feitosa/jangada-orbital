import { useEffect, useState } from 'react'
import { loadOverpass, loadValidation, type Overpass, type Validation } from '../data/extras'
import { useI18n, type Key } from '../i18n'

const hhmm = (h: number) => {
  const m = Math.round(h * 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

const W = 560
const H = 230
const PAD = { left: 52, right: 14, top: 14, bottom: 28 }

/** Spec 002, story 5 (FR-027, SC-014): median local overpass time of Aqua and Terra per year, from the FIRMS points. */
export function OverpassChart() {
  const i = useI18n()
  const [data, setData] = useState<Overpass | null>(null)
  useEffect(() => { loadOverpass().then(setData) }, [])
  const aqua = data?.satellites.Aqua
  const terra = data?.satellites.Terra
  if (!aqua || !terra) return null
  const series: { key: string; rows: typeof aqua; design: number; className: string; dash: string | undefined; label: Key }[] = [
    { key: 'Aqua', rows: aqua, design: 13.5, className: 'stroke-brand', dash: undefined, label: 'aquaPass' },
    { key: 'Terra', rows: terra, design: 10.5, className: 'stroke-ink-2', dash: '6 4', label: 'terraPass' },
  ]
  const years = [...new Set([...Object.keys(aqua), ...Object.keys(terra)])].map(Number).sort((a, b) => a - b)
  const all = series.flatMap((s) => Object.values(s.rows).map((r) => r[0]))
  const lo = Math.floor(Math.min(...all, 10) * 2) / 2 - 0.5
  const hi = Math.ceil(Math.max(...all, 14) * 2) / 2 + 0.5
  const x = (y: number) => PAD.left + ((y - years[0]) / Math.max(1, years[years.length - 1] - years[0])) * (W - PAD.left - PAD.right)
  const y = (h: number) => PAD.top + (1 - (h - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)
  const ticks = Array.from({ length: Math.round((hi - lo) / 1) + 1 }, (_, k) => Math.ceil(lo) + k).filter((t) => t <= hi)
  const a2012 = aqua['2012']?.[0]
  const aLast = years.filter((yr) => aqua[String(yr)]).pop()!
  const drift = aqua[String(aLast)][0] - (a2012 ?? 13.5)

  return (
    <section aria-labelledby="overpass-title" className="me-card">
      <h2 id="overpass-title">{i.t('overTitle')}</h2>
      <p>
        {i.t('overText', {
          a: a2012 ? hhmm(a2012) : i.t('about1330'), b: hhmm(aqua[String(aLast)][0]), y: aLast,
          drift: drift > 0 ? i.t('minutesLater', { m: i.int(drift * 60) }) : i.t('aboutSame'),
        })}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={i.t('overAria', { a: years[0], b: years[years.length - 1] })}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-3 text-[12px] tabular-nums max-sm:text-[18px]">{t}:00</text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(s.design)} y2={y(s.design)} className="stroke-ink" strokeWidth={1.2} strokeDasharray="2 4" />
            <path d={years.filter((yr) => s.rows[String(yr)]).map((yr, k) => `${k ? 'L' : 'M'} ${x(yr).toFixed(1)} ${y(s.rows[String(yr)][0]).toFixed(1)}`).join(' ')}
              fill="none" className={s.className} strokeWidth={2.5} strokeDasharray={s.dash} strokeLinejoin="round" />
          </g>
        ))}
        {[years[0], 2012, 2024, years[years.length - 1]].filter((v, k, arr) => arr.indexOf(v) === k).map((yr) => (
          <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" className="fill-ink-3 text-[12px] tabular-nums max-sm:text-[18px]">{yr}</text>
        ))}
      </svg>
      <ul className="!m-0 flex !list-none flex-wrap gap-x-5 gap-y-2 !p-0 text-xs" aria-label={i.t('legend')}>
        {series.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-2">
            <svg width="24" height="8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" className={s.className} strokeWidth={2.5} strokeDasharray={s.dash} /></svg>{i.t(s.label)}
          </li>
        ))}
        <li className="inline-flex items-center gap-2"><svg width="24" height="8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" className="stroke-ink" strokeWidth={1.2} strokeDasharray="2 4" /></svg>{i.t('designTime')}</li>
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-2">{i.t('showNumbers')}</summary>
        <div className="overflow-x-auto">
          <table className="my-2 w-full border-collapse tabular-nums [&_td]:border-b [&_td]:border-line [&_td]:py-1 [&_td]:pl-3 [&_td]:text-right [&_th]:border-b [&_th]:border-line [&_th]:py-1 [&_th]:text-left [&_th]:font-medium">
            <caption className="sr-only">{i.t('overCaption')}</caption>
            <thead><tr><th scope="col">{i.t('thYear')}</th><th scope="col">Aqua</th><th scope="col">Terra</th></tr></thead>
            <tbody>{years.map((yr) => <tr key={yr}><th scope="row">{yr}</th><td>{aqua[String(yr)] ? hhmm(aqua[String(yr)][0]) : '–'}</td><td>{terra[String(yr)] ? hhmm(terra[String(yr)][0]) : '–'}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

const SW = 420
const SPAD = 46

/** Spec 002, story 5 (FR-027): predicted against observed Aqua for the held-out months, national and per state-year. */
export function ValidationChart() {
  const i = useI18n()
  const [v, setV] = useState<Validation | null>(null)
  useEffect(() => { loadValidation().then(setV) }, [])
  if (!v) return null
  const pts = v.national_month
  const max = Math.max(...pts.flatMap((p) => [p[1], p[2]])) * 1.08
  const s = (val: number) => (val / max) * (SW - SPAD - 10)
  const X = (val: number) => SPAD + s(val)
  const Y = (val: number) => SW - SPAD - s(val)
  const within = (p: [string, number, number]) => Math.abs(p[2] - p[1]) <= 0.2 * p[1]
  const m = v.metrics
  const band = `${X(0)},${Y(0)} ${X(max / 1.2)},${Y(max)} ${X(max)},${Y(max)} ${X(max)},${Y(max * 0.8)}`

  return (
    <section aria-labelledby="valid-title" className="me-card">
      <h2 id="valid-title">{i.t('validTitle')}</h2>
      <p>
        {i.t('validText', {
          years: v.heldout_years.replace('-', i.t('and')), fit: v.fit_years.replace('-', '–'), share: i.pct(m.share_within_20pct_national_month),
          bias: i.pct(Math.abs(m.total_bias)), dir: i.t(m.total_bias < 0 ? 'low' : 'high'),
        })}
      </p>
      <svg viewBox={`0 0 ${SW} ${SW}`} className="h-auto w-full max-w-[460px]" role="img" aria-label={i.t('validAria', { n: pts.length })}>
        <polygon points={band} fill="var(--brand)" fillOpacity={0.14} />
        <line x1={X(0)} y1={Y(0)} x2={X(max)} y2={Y(max)} className="stroke-ink" strokeWidth={1.2} strokeDasharray="5 4" />
        <line x1={X(0)} y1={Y(0)} x2={X(max)} y2={Y(0)} className="stroke-line" />
        <line x1={X(0)} y1={Y(0)} x2={X(0)} y2={Y(max)} className="stroke-line" />
        <text x={X(max)} y={Y(0) + 18} textAnchor="end" className="fill-ink-3 text-[12px] max-sm:text-[16px]">{i.t('observedByAqua', { max: i.int(max) })}</text>
        <text x={X(0) + 6} y={Y(max) + 12} className="fill-ink-3 text-[12px] max-sm:text-[16px]">{i.t('predictedSnpp')}</text>
        {pts.map((p) => within(p)
          ? <circle key={p[0]} cx={X(p[1])} cy={Y(p[2])} r={5} className="fill-brand stroke-surface" strokeWidth={1.5} />
          : <circle key={p[0]} cx={X(p[1])} cy={Y(p[2])} r={5} className="fill-none stroke-ink" strokeWidth={2} />)}
      </svg>
      <ul className="!m-0 flex !list-none flex-wrap gap-x-5 gap-y-2 !p-0 text-xs" aria-label={i.t('legend')}>
        <li className="inline-flex items-center gap-2"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" className="fill-brand" /></svg>{i.t('monthWithin')}</li>
        <li className="inline-flex items-center gap-2"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" className="fill-none stroke-ink" strokeWidth={2} /></svg>{i.t('monthOutside')}</li>
        <li className="inline-flex items-center gap-2"><span className="inline-block h-2.5 w-4 rounded-sm bg-brand/30" />{i.t('realValue')}</li>
      </ul>
      <table className="my-3 border-collapse tabular-nums [&_td]:border-b [&_td]:border-line [&_td]:py-1.5 [&_td]:pr-6 [&_th]:border-b [&_th]:border-line [&_th]:py-1.5 [&_th]:pr-6 [&_th]:text-left [&_th]:font-medium">
        <caption className="text-left text-sm text-ink-2">{i.t('validCaption', { y: v.heldout_years, b: i.pct(m.total_bias) })}</caption>
        <thead><tr><th scope="col">{i.t('thLevel')}</th><th scope="col">{i.t('thMae')}</th><th scope="col">{i.t('thWithin')}</th></tr></thead>
        <tbody>
          <tr><td>{i.t('brazilMonth')}</td><td>{i.pct(m.mape_national_month)}</td><td>{i.t('ofMonths', { p: i.pct(m.share_within_20pct_national_month) })}</td></tr>
          <tr><td>{i.t('stateYear')}</td><td>{i.pct(m.mape_state_year)}</td><td>{i.pct(m.share_within_20pct_state_year)}</td></tr>
          <tr><td>{i.t('stateMonth')}</td><td>{i.pct(m.mape_state_month)}</td><td>{i.pct(m.share_within_20pct_state_month)}</td></tr>
        </tbody>
      </table>
      {/* `uv run jangada-strata`, docs/METHOD.md "The error depends on the size of the month" */}
      <p className="text-sm">{i.t('bySize')}</p>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-2">{i.t('showTestMonths')}</summary>
        <div className="overflow-x-auto">
          <table className="my-2 w-full border-collapse tabular-nums [&_td]:border-b [&_td]:border-line [&_td]:py-1 [&_td]:pl-3 [&_td]:text-right [&_th]:border-b [&_th]:border-line [&_th]:py-1 [&_th]:text-left [&_th]:font-medium">
            <caption className="sr-only">{i.t('testCaption')}</caption>
            <thead><tr><th scope="col">{i.t('thMonth')}</th><th scope="col">{i.t('thObserved')}</th><th scope="col">{i.t('thPredicted')}</th></tr></thead>
            <tbody>{pts.map((p) => <tr key={p[0]}><th scope="row">{p[0]}</th><td>{i.int(p[1])}</td><td>{i.int(p[2])}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
