import type { Intensity } from '../data/extras'

const one = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const pct = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 })
const W = 640
const H = 170
const PAD = { left: 44, right: 12, top: 12, bottom: 24 }

const FAMILIES = [
  { key: 'aqua', label: 'Aqua MODIS (1 km pixels)', className: 'stroke-brand fill-brand', dash: undefined },
  { key: 'snpp', label: 'VIIRS S-NPP (375 m pixels)', className: 'stroke-ink-2 fill-ink-2', dash: '6 4' },
] as const

interface Props {
  intensity: Intensity
  /** BR, a state code or a biome id */
  areaKey: string
  areaName: string
}

/** Spec 002, story 4 (FR-025, FR-026, SC-013): fire radiative power and the night share, one line per sensor, never
 * merged or harmonized. */
export function IntensityChart({ intensity, areaKey, areaName }: Props) {
  const a = intensity.areas[areaKey]
  if (!a) return null
  const years = [...new Set(FAMILIES.flatMap((f) => Object.keys(a[f.key] ?? {})))].map(Number).sort((x, y) => x - y)
  if (years.length < 2) return null
  const small = intensity.small_sample
  const x = (y: number) => PAD.left + ((y - years[0]) / Math.max(1, years[years.length - 1] - years[0])) * (W - PAD.left - PAD.right)

  const chart = (title: string, read: (r: [number, number, number]) => number, format: (v: number) => string, label: string) => {
    const vals = FAMILIES.flatMap((f) => Object.values(a[f.key] ?? {}).map(read))
    const max = Math.max(...vals, 0.01) * 1.1
    const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
    return (
      <figure className="m-0 flex flex-col gap-1">
        <figcaption className="text-sm font-medium">{title}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}, ${areaName}, ${years[0]}–${years[years.length - 1]}, one line per sensor`}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="stroke-line" />
          <text x={PAD.left - 6} y={y(max / 1.1) + 4} textAnchor="end" className="fill-ink-3 text-[11px] tabular-nums">{format(max / 1.1)}</text>
          <text x={PAD.left - 6} y={y(0) + 4} textAnchor="end" className="fill-ink-3 text-[11px]">0</text>
          {FAMILIES.map((f) => {
            const rows = Object.entries(a[f.key] ?? {}).map(([yr, r]) => ({ yr: Number(yr), r })).sort((p, q) => p.yr - q.yr)
            const d = rows.map((p, i) => `${i ? 'L' : 'M'} ${x(p.yr).toFixed(1)} ${y(read(p.r)).toFixed(1)}`).join(' ')
            return (
              <g key={f.key}>
                <path d={d} fill="none" className={f.className.split(' ')[0]} strokeWidth={2} strokeDasharray={f.dash} strokeLinejoin="round" />
                {rows.map((p) => (
                  // hollow point: fewer detections than the small-sample limit
                  <circle key={p.yr} cx={x(p.yr)} cy={y(read(p.r))} r={3} className={p.r[0] < small ? `${f.className.split(' ')[0]} fill-surface` : f.className}
                    strokeWidth={1.5} />
                ))}
              </g>
            )
          })}
          {[years[0], years[Math.floor(years.length / 2)], years[years.length - 1]].map((yr) => (
            <text key={yr} x={x(yr)} y={H - 6} textAnchor="middle" className="fill-ink-3 text-[11px] tabular-nums">{yr}</text>
          ))}
        </svg>
        <span className="sr-only">{label}</span>
      </figure>
    )
  }

  const lastOf = (key: 'aqua' | 'snpp') => {
    const e = Object.entries(a[key] ?? {}).sort((p, q) => Number(p[0]) - Number(q[0]))
    return e[e.length - 1]
  }
  const la = lastOf('aqua')
  const ls = lastOf('snpp')
  const anySmall = FAMILIES.some((f) => Object.values(a[f.key] ?? {}).some((r) => r[0] < small))

  return (
    <section className="mt-6 flex flex-col gap-3 border-t border-line pt-5" aria-labelledby="intensity-title">
      <h2 id="intensity-title" className="m-0 text-base font-semibold">Fire intensity and night fires</h2>
      <p className="m-0 max-w-[70ch] text-sm text-ink-2">
        How strong the fires were (median fire radiative power per detection) and how many burned at night, a sign of
        drier fuel. Each sensor has its own line: their pixels differ in size, so their values cannot be mixed or harmonized.
        {la && ls ? ` In ${la[0]}, Aqua saw a median ${one.format(la[1][2])} MW and ${pct.format(la[1][1] / Math.max(1, la[1][0]))} at night.` : ''}
      </p>
      {chart('Median fire radiative power per detection (MW)', (r) => r[2], (v) => one.format(v), 'Median FRP per detection by year for each sensor')}
      {chart('Share of detections at night', (r) => (r[0] ? r[1] / r[0] : 0), (v) => pct.format(v), 'Night share by year for each sensor')}
      <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-xs text-ink-2" aria-label="Legend">
        {FAMILIES.map((f) => (
          <li key={f.key} className="inline-flex items-center gap-2">
            <svg width="24" height="8" aria-hidden="true"><line x1="1" x2="23" y1="4" y2="4" className={f.className.split(' ')[0]} strokeWidth={2} strokeDasharray={f.dash} /></svg>
            {f.label}
          </li>
        ))}
        {anySmall && <li className="inline-flex items-center gap-2"><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="3.5" className="fill-surface stroke-ink-2" strokeWidth={1.5} /></svg>Fewer than {small} detections: small sample</li>}
      </ul>
      <div className="sr-only"><table>
        <caption>Fire intensity per year, {areaName}</caption>
        <thead><tr><th scope="col">Year</th><th scope="col">Sensor</th><th scope="col">Detections</th><th scope="col">Night</th><th scope="col">Median FRP (MW)</th></tr></thead>
        <tbody>
          {FAMILIES.flatMap((f) => Object.entries(a[f.key] ?? {}).map(([yr, r]) => (
            <tr key={`${f.key}${yr}`}><th scope="row">{yr}</th><td>{f.label}</td><td>{r[0]}</td><td>{r[1]}</td><td>{one.format(r[2])}</td></tr>
          )))}
        </tbody>
      </table></div>
    </section>
  )
}
