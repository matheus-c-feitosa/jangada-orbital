import { useEffect, useMemo, useRef } from 'react'
import type { AreaSeries, Manifest } from '../data/load'
import { explainerRows, lastCompleteYear, viirsToAquaRatio } from './yearly'
import { useI18n, type Key as TextKey } from '../i18n'

/** First year Aqua and S-NPP both flew a whole year. */
const FROM = 2012
const W = 560
const H = 260
const PAD = { left: 66, right: 26, top: 14, bottom: 36 }

/** Stroke styles shared by the chart and its legend, so the legend always matches the lines. */
const LINES: Record<'snpp' | 'harmonized' | 'aqua', { label: TextKey; className: string; width: number; dash: string | undefined }> = {
  snpp: { label: 'lineSnpp', className: 'stroke-ink-2', width: 2, dash: '6 4' },
  harmonized: { label: 'lineHarm', className: 'stroke-brand', width: 4, dash: undefined },
  aqua: { label: 'lineAqua', className: 'stroke-ink', width: 1.5, dash: undefined },
}
type Key = keyof typeof LINES

interface Props {
  brazil: AreaSeries | null
  manifest: Manifest | null
}

/** T038: why the numbers are harmonized — yearly totals for Brazil of Aqua, S-NPP and the harmonized series. */
export function Explainer({ brazil, manifest }: Props) {
  const i = useI18n()
  const ref = useRef<HTMLElement>(null)
  const to = manifest ? lastCompleteYear(manifest.last_month, manifest.last_month_days) : null
  const rows = useMemo(() => {
    if (!brazil || to === null) return []
    return explainerRows(brazil.months, { aqua: brazil.observed.Aqua, snpp: brazil.observed['S-NPP'], harmonized: brazil.value }, FROM, to)
  }, [brazil, to])

  // "#why" opens the Method page here: scroll to this chart once it has data.
  useEffect(() => {
    if (rows.length && window.location.hash === '#why') ref.current?.scrollIntoView({ block: 'start' })
  }, [rows.length])

  const ratio = viirsToAquaRatio(rows)
  const top = Math.max(1, ...rows.flatMap((r) => [r.aqua ?? 0, r.snpp ?? 0, r.harmonized ?? 0]))
  // round the axis up to a 1/2/2.5/5 step so the labels read 0.5M, 1M, 1.5M… instead of odd values
  const mag = 10 ** Math.floor(Math.log10(top / 4))
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s * 4 >= top) ?? 10 * mag
  const max = Math.ceil(top / step) * step
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, k) => k * step)
  const x = (year: number) => PAD.left + ((year - FROM) / Math.max(1, (to ?? FROM) - FROM)) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
  const path = (key: Key) => {
    let d = ''
    let pen = false // a null year breaks the line instead of joining across the gap
    for (const r of rows) {
      const v = key === 'snpp' ? r.snpp : key === 'aqua' ? r.aqua : r.harmonized
      if (v === null) { pen = false; continue }
      d += `${pen ? 'L' : 'M'} ${x(r.year).toFixed(1)} ${y(v).toFixed(1)} `
      pen = true
    }
    return d.trim()
  }
  // every 4th year from the first, plus the last; drop a tick that would collide with the last one
  const yearTicks = rows.map((r) => r.year).filter((yr) => yr === to || ((yr - FROM) % 4 === 0 && (to ?? yr) - yr >= 2))
  const range = `${FROM}–${to ?? ''}`

  return (
    <section id="why" ref={ref} aria-labelledby="why-title" className="me-card scroll-mt-4">
      <h2 id="why-title">{i.t('whyTitle')}</h2>
      <p>{i.t('whyText', { range })}</p>
      {!rows.length ? (
        <p aria-busy="true">{i.t('loadingTotals')}</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={i.t('whyAria', { range })}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" />
                <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-3 text-[12px] tabular-nums max-sm:text-[20px]">{i.compact(t)}</text>
              </g>
            ))}
            {yearTicks.map((yr) => (
              <text key={yr} x={x(yr)} y={H - 6} textAnchor="middle" className="fill-ink-3 text-[12px] tabular-nums max-sm:text-[20px]">{yr}</text>
            ))}
            {(Object.keys(LINES) as Key[]).map((k) => (
              <path key={k} d={path(k)} fill="none" className={LINES[k].className} strokeWidth={LINES[k].width}
                strokeDasharray={LINES[k].dash} strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </svg>
          <ul className="!m-0 flex !list-none flex-wrap gap-x-5 gap-y-2 !p-0 text-xs" aria-label={i.t('legend')}>
            {(['snpp', 'aqua', 'harmonized'] as Key[]).map((k) => (
              <li key={k} className="inline-flex items-center gap-2">
                <svg width="24" height="8" aria-hidden="true">
                  <line x1="1" x2="23" y1="4" y2="4" className={LINES[k].className} strokeWidth={LINES[k].width}
                    strokeDasharray={LINES[k].dash} strokeLinecap="round" />
                </svg>
                {i.t(LINES[k].label)}
              </li>
            ))}
          </ul>
          <p className="font-medium !text-ink">
            {ratio !== null ? i.t('whyRatio', { r: Math.round(ratio) }) : null}
            {i.t('whyFollows')}
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-2">{i.t('showNumbers')}</summary>
            <div className="overflow-x-auto">
              <table className="my-2 w-full border-collapse tabular-nums [&_td]:border-b [&_td]:border-line [&_td]:py-1.5 [&_td]:pl-3 [&_td]:text-right [&_th]:border-b [&_th]:border-line [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_thead_th:not(:first-child)]:pl-3 [&_thead_th:not(:first-child)]:text-right">
                <caption className="sr-only">{i.t('whyCaption', { range })}</caption>
                <thead><tr><th scope="col">{i.t('thYear')}</th><th scope="col">Aqua</th><th scope="col">S-NPP</th><th scope="col">{i.t('thHarmonized')}</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.year}>
                      <th scope="row">{r.year}</th>
                      <td>{r.aqua === null ? '–' : i.int(r.aqua)}</td>
                      <td>{r.snpp === null ? '–' : i.int(r.snpp)}</td>
                      <td>{r.harmonized === null ? '–' : i.int(r.harmonized)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  )
}
