import { useEffect, useState } from 'react'
import { loadOverpass, loadValidation, type Overpass, type Validation } from '../data/extras'

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const pct = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })
const hhmm = (h: number) => {
  const m = Math.round(h * 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

const W = 560
const H = 230
const PAD = { left: 52, right: 14, top: 14, bottom: 28 }

/** Spec 002, story 5 (FR-027, SC-014): median local overpass time of Aqua and Terra per year, from the FIRMS points. */
export function OverpassChart() {
  const [data, setData] = useState<Overpass | null>(null)
  useEffect(() => { loadOverpass().then(setData) }, [])
  const aqua = data?.satellites.Aqua
  const terra = data?.satellites.Terra
  if (!aqua || !terra) return null
  const series = [
    { key: 'Aqua', rows: aqua, design: 13.5, className: 'stroke-brand', dash: undefined, label: 'Aqua, afternoon pass' },
    { key: 'Terra', rows: terra, design: 10.5, className: 'stroke-ink-2', dash: '6 4', label: 'Terra, morning pass' },
  ]
  const years = [...new Set([...Object.keys(aqua), ...Object.keys(terra)])].map(Number).sort((a, b) => a - b)
  const all = series.flatMap((s) => Object.values(s.rows).map((r) => r[0]))
  const lo = Math.floor(Math.min(...all, 10) * 2) / 2 - 0.5
  const hi = Math.ceil(Math.max(...all, 14) * 2) / 2 + 0.5
  const x = (y: number) => PAD.left + ((y - years[0]) / Math.max(1, years[years.length - 1] - years[0])) * (W - PAD.left - PAD.right)
  const y = (h: number) => PAD.top + (1 - (h - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)
  const ticks = Array.from({ length: Math.round((hi - lo) / 1) + 1 }, (_, i) => Math.ceil(lo) + i).filter((t) => t <= hi)
  const a2012 = aqua['2012']?.[0]
  const aLast = years.filter((yr) => aqua[String(yr)]).pop()!
  const drift = aqua[String(aLast)][0] - (a2012 ?? 13.5)

  return (
    <section aria-labelledby="overpass-title" className="mt-8">
      <h2 id="overpass-title">Aqua and Terra drifted off their usual hour</h2>
      <p>
        Median local time of each satellite's daytime fire detections over Brazil. Aqua passed at {a2012 ? hhmm(a2012) : 'about 13:30'} in
        2012 and at {hhmm(aqua[String(aLast)][0])} in {aLast}, {drift > 0 ? `${fmt.format(drift * 60)} minutes later` : 'about the same'}.
        Fires burn more in the late afternoon, so a later pass sees more of them: this is why the series stops using Aqua in 2024.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={`Median local overpass time of Aqua and Terra over Brazil, ${years[0]}–${years[years.length - 1]}, with their design times`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-3 text-[12px] tabular-nums max-sm:text-[18px]">{t}:00</text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(s.design)} y2={y(s.design)} className="stroke-ink" strokeWidth={1.2} strokeDasharray="2 4" />
            <path d={years.filter((yr) => s.rows[String(yr)]).map((yr, i) => `${i ? 'L' : 'M'} ${x(yr).toFixed(1)} ${y(s.rows[String(yr)][0]).toFixed(1)}`).join(' ')}
              fill="none" className={s.className} strokeWidth={2.5} strokeDasharray={s.dash} strokeLinejoin="round" />
          </g>
        ))}
        {[years[0], 2012, 2024, years[years.length - 1]].filter((v, i, arr) => arr.indexOf(v) === i).map((yr) => (
          <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" className="fill-ink-3 text-[12px] tabular-nums max-sm:text-[18px]">{yr}</text>
        ))}
      </svg>
      <ul className="!m-0 flex !list-none flex-wrap gap-x-5 gap-y-2 !p-0 text-xs" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-2">
            <svg width="24" height="8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" className={s.className} strokeWidth={2.5} strokeDasharray={s.dash} /></svg>{s.label}
          </li>
        ))}
        <li className="inline-flex items-center gap-2"><svg width="24" height="8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" className="stroke-ink" strokeWidth={1.2} strokeDasharray="2 4" /></svg>Design time, 13:30 and 10:30</li>
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-2">Show the numbers</summary>
        <div className="overflow-x-auto">
          <table className="my-2 w-full border-collapse tabular-nums [&_td]:border-b [&_td]:border-line [&_td]:py-1 [&_td]:pl-3 [&_td]:text-right [&_th]:border-b [&_th]:border-line [&_th]:py-1 [&_th]:text-left [&_th]:font-medium">
            <caption className="sr-only">Median local overpass time by year</caption>
            <thead><tr><th scope="col">Year</th><th scope="col">Aqua</th><th scope="col">Terra</th></tr></thead>
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
    <section aria-labelledby="valid-title" className="mt-8">
      <h2 id="valid-title">How close the conversion gets</h2>
      <p>
        We hid Aqua's real counts for {v.heldout_years.replace('-', ' and ')}, fitted the conversion on {v.fit_years.replace('-', '–')} only, and
        predicted those months from S-NPP. For Brazil, {pct.format(m.share_within_20pct_national_month)} of the months land within 20% of the real
        value; overall the prediction is {pct.format(Math.abs(m.total_bias))} {m.total_bias < 0 ? 'low' : 'high'}.
      </p>
      <svg viewBox={`0 0 ${SW} ${SW}`} className="h-auto w-full max-w-[460px]" role="img"
        aria-label={`Predicted against observed Aqua detections for Brazil, ${pts.length} test months, with a band of plus or minus 20 percent`}>
        <polygon points={band} className="fill-c3/25" />
        <line x1={X(0)} y1={Y(0)} x2={X(max)} y2={Y(max)} className="stroke-ink" strokeWidth={1.2} strokeDasharray="5 4" />
        <line x1={X(0)} y1={Y(0)} x2={X(max)} y2={Y(0)} className="stroke-line" />
        <line x1={X(0)} y1={Y(0)} x2={X(0)} y2={Y(max)} className="stroke-line" />
        <text x={X(max)} y={Y(0) + 18} textAnchor="end" className="fill-ink-3 text-[12px] max-sm:text-[16px]">Observed by Aqua ({fmt.format(max)})</text>
        <text x={X(0) + 6} y={Y(max) + 12} className="fill-ink-3 text-[12px] max-sm:text-[16px]">Predicted from S-NPP</text>
        {pts.map((p) => within(p)
          ? <circle key={p[0]} cx={X(p[1])} cy={Y(p[2])} r={5} className="fill-brand stroke-surface" strokeWidth={1.5} />
          : <circle key={p[0]} cx={X(p[1])} cy={Y(p[2])} r={5} className="fill-none stroke-ink" strokeWidth={2} />)}
      </svg>
      <ul className="!m-0 flex !list-none flex-wrap gap-x-5 gap-y-2 !p-0 text-xs" aria-label="Legend">
        <li className="inline-flex items-center gap-2"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" className="fill-brand" /></svg>Month within ±20%</li>
        <li className="inline-flex items-center gap-2"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" className="fill-none stroke-ink" strokeWidth={2} /></svg>Month outside ±20%</li>
        <li className="inline-flex items-center gap-2"><span className="inline-block h-2.5 w-4 rounded-sm bg-c3/25" />±20% of the real value</li>
      </ul>
      <table className="my-3 border-collapse tabular-nums [&_td]:border-b [&_td]:border-line [&_td]:py-1.5 [&_td]:pr-6 [&_th]:border-b [&_th]:border-line [&_th]:py-1.5 [&_th]:pr-6 [&_th]:text-left [&_th]:font-medium">
        <caption className="text-left text-sm text-ink-2">Test months {v.heldout_years}. Total bias {pct.format(m.total_bias)}.</caption>
        <thead><tr><th scope="col">Level</th><th scope="col">Mean absolute error</th><th scope="col">Within ±20%</th></tr></thead>
        <tbody>
          <tr><td>Brazil, per month</td><td>{pct.format(m.mape_national_month)}</td><td>{pct.format(m.share_within_20pct_national_month)} of months</td></tr>
          <tr><td>State, per year</td><td>{pct.format(m.mape_state_year)}</td><td>{pct.format(m.share_within_20pct_state_year)}</td></tr>
          <tr><td>State, per month</td><td>{pct.format(m.mape_state_month)}</td><td>{pct.format(m.share_within_20pct_state_month)}</td></tr>
        </tbody>
      </table>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-2">Show the test months</summary>
        <div className="overflow-x-auto">
          <table className="my-2 w-full border-collapse tabular-nums [&_td]:border-b [&_td]:border-line [&_td]:py-1 [&_td]:pl-3 [&_td]:text-right [&_th]:border-b [&_th]:border-line [&_th]:py-1 [&_th]:text-left [&_th]:font-medium">
            <caption className="sr-only">Observed and predicted Aqua detections for Brazil, test months</caption>
            <thead><tr><th scope="col">Month</th><th scope="col">Observed</th><th scope="col">Predicted</th></tr></thead>
            <tbody>{pts.map((p) => <tr key={p[0]}><th scope="row">{p[0]}</th><td>{fmt.format(p[1])}</td><td>{fmt.format(p[2])}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
