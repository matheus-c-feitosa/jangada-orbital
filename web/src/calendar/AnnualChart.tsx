import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AreaSeries } from '../data/load'
import { annualRows, familyRows, medianOfComplete, sourceText } from './annual'

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const H = 160

interface Props {
  series: AreaSeries
  areaName: string
  view: 'harmonized' | 'observed'
  partialMonth: string
  /** last data day, e.g. "2026-11-14" */
  dataDate: string
  fromYear: number
  toYear: number
}

/** Rounds the axis top up to a 1/2/2.5/5 step. */
function niceTop(v: number) {
  if (!(v > 0)) return 1
  const mag = 10 ** Math.floor(Math.log10(v / 2))
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s * 2 >= v) ?? 10 * mag
  return Math.ceil(v / step) * step
}

/** Spec 002, story 1: one bar per year, with the P25–P75 conversion range on converted years (FR-020, FR-021). */
export function AnnualChart({ series, areaName, view, partialMonth, dataDate, fromYear, toYear }: Props) {
  const observed = view === 'observed'
  const rows = useMemo(() => annualRows(series, partialMonth).filter((r) => r.year >= fromYear && r.year <= toYear), [series, partialMonth, fromYear, toYear])
  const families = useMemo(() => familyRows(series, partialMonth).filter((r) => r.year >= fromYear && r.year <= toYear), [series, partialMonth, fromYear, toYear])
  const [picked, setPicked] = useState<number | null>(null)
  if (!rows.length) return null

  const med = medianOfComplete(rows)
  const top = niceTop(observed
    ? Math.max(...families.map((f) => Math.max(f.modis ?? 0, f.viirs ?? 0)))
    : Math.max(...rows.map((r) => (r.converted ? r.hi : r.value))))
  const px = (v: number) => (v / top) * H
  const year = picked ?? rows[rows.length - 1].year
  const at = rows.findIndex((r) => r.year === year)

  const describe = (y: number) => {
    if (observed) {
      const f = families.find((x) => x.year === y)
      if (!f) return ''
      return `${y}: MODIS ${f.modis === null ? 'not flying' : fmt.format(f.modis)}, VIIRS ${f.viirs === null ? 'not flying yet' : fmt.format(f.viirs)}, as delivered${f.partial ? ' (year not complete)' : ''}`
    }
    const r = rows.find((x) => x.year === y)
    if (!r) return ''
    const range = r.converted ? ` (range ${compact.format(r.lo)}–${compact.format(r.hi)})` : ''
    return `${y}: ${compact.format(r.value)}${range}, ${sourceText(r.source)}${r.partial ? `, through ${dataDate}` : ''}`
  }

  // a range can hold only the current, partial year: then there is no peak and no median to state
  const complete = rows.filter((r) => !r.partial)
  const peak = complete.length ? complete.reduce((a, b) => (b.value > a.value ? b : a)) : null
  const current = rows[rows.length - 1]
  const sentence = observed
    ? 'As delivered, VIIRS counts several times more hotspots than MODIS, so the two families cannot be added or compared directly.'
    : [
        peak && `${areaName} peaked in ${peak.year} with ${fmt.format(peak.value)} detections.`,
        current.partial && `${current.year} has ${fmt.format(current.value)} so far.`,
        Number.isFinite(med) && `The median complete year has ${fmt.format(med)}.`,
      ].filter(Boolean).join(' ')

  return (
    <section className="mt-6 flex flex-col gap-3 border-t border-line pt-5" aria-labelledby="annual-title">
      <h2 id="annual-title" className="m-0 text-base font-semibold">Total per year</h2>
      <p className="m-0 max-w-[70ch] text-sm text-ink-2">{sentence}</p>
      <div className="flex items-center gap-2">
        <button type="button" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink disabled:opacity-40"
          aria-label="Previous year" disabled={at <= 0} onClick={() => setPicked(rows[Math.max(0, at - 1)].year)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <p className="m-0 min-h-11 flex-1 content-center text-sm tabular-nums" aria-live="polite">{describe(year)}</p>
        <button type="button" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink disabled:opacity-40"
          aria-label="Next year" disabled={at >= rows.length - 1} onClick={() => setPicked(rows[Math.min(rows.length - 1, at + 1)].year)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>

      <div className="flex gap-1.5" aria-hidden="true">
        <div className="relative w-10 shrink-0 text-right text-[11px] text-ink-3 tabular-nums" style={{ height: H }}>
          <span className="absolute right-0 -top-2">{compact.format(top)}</span>
          <span className="absolute right-0" style={{ top: H / 2 - 8 }}>{compact.format(top / 2)}</span>
          <span className="absolute right-0 -bottom-2">0</span>
        </div>
        <div className="relative flex-1 border-b border-line" style={{ height: H }}>
          <span className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <span className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: H / 2 }} />
          <div className="absolute inset-0 flex items-stretch gap-[2px]">
            {rows.map((r, i) => {
              const f = families[i]
              const sel = r.year === year
              const ring = sel ? 'shadow-[0_0_0_2px_var(--ink)]' : ''
              return (
                <button key={r.year} type="button" tabIndex={-1} className="relative h-full flex-1 cursor-pointer border-0 bg-transparent p-0"
                  onClick={() => setPicked(r.year)} onMouseEnter={() => setPicked(r.year)}>
                  {observed ? (
                    <>
                      {f?.modis != null && <span className={`absolute bottom-0 left-0 w-[46%] rounded-t-[2px] bg-c5 ${f.partial ? 'cell-partial' : ''} ${ring}`} style={{ height: px(f.modis) }} />}
                      {f?.viirs != null && <span className={`absolute bottom-0 right-0 w-[46%] rounded-t-[2px] bg-ink-2 ${f.partial ? 'cell-partial' : ''} ${ring}`} style={{ height: px(f.viirs) }} />}
                    </>
                  ) : (
                    <>
                      <span className={`absolute inset-x-0 bottom-0 box-border rounded-t-[2px] ${r.partial ? 'cell-partial border border-c6 bg-c4' : r.converted ? 'border-[1.5px] border-c6 bg-c1' : 'bg-c5'} ${ring}`}
                        style={{ height: px(r.value) }} />
                      {r.converted && (
                        <>
                          <span className="absolute left-1/2 w-[1.5px] -translate-x-1/2 bg-ink" style={{ bottom: px(r.lo), height: Math.max(1, px(r.hi) - px(r.lo)) }} />
                          <span className="absolute left-1/2 h-[1.5px] w-1.5 -translate-x-1/2 bg-ink" style={{ bottom: px(r.hi) }} />
                          <span className="absolute left-1/2 h-[1.5px] w-1.5 -translate-x-1/2 bg-ink" style={{ bottom: px(r.lo) }} />
                        </>
                      )}
                    </>
                  )}
                </button>
              )
            })}
          </div>
          {!observed && Number.isFinite(med) && <span className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-ink" style={{ bottom: px(med) }} />}
        </div>
      </div>
      <div className="flex justify-between pl-[46px] text-[11px] text-ink-3 tabular-nums" aria-hidden="true">
        <span>{rows[0].year}</span><span>{rows[Math.floor(rows.length / 2)].year}</span><span>{rows[rows.length - 1].year}</span>
      </div>

      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-xs text-ink-2" aria-label="Legend">
        {observed ? (
          <>
            <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-sm bg-c5" />MODIS (Aqua; Terra before it)</li>
            <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-sm bg-ink-2" />VIIRS (S-NPP; NOAA-20/21 where S-NPP is missing)</li>
          </>
        ) : (
          <>
            <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-sm bg-c5" />Observed by Aqua</li>
            <li className="inline-flex items-center gap-1.5"><span className="inline-block box-border h-2.5 w-3.5 rounded-sm border-[1.5px] border-c6 bg-c1" />Converted (Terra, VIIRS)</li>
            <li className="inline-flex items-center gap-1.5"><span className="mx-1.5 inline-block h-3 w-[1.5px] bg-ink" />Conversion range, P25 to P75</li>
            <li className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-ink" />Median of complete years</li>
          </>
        )}
        <li className="inline-flex items-center gap-1.5"><span className="cell-partial inline-block h-2.5 w-3.5 rounded-sm bg-c4" />Year not complete</li>
      </ul>

      <div className="sr-only"><table>
        <caption>Total detections per year, {areaName}</caption>
        <thead><tr><th scope="col">Year</th>{observed ? <><th scope="col">MODIS</th><th scope="col">VIIRS</th></> : <><th scope="col">Total</th><th scope="col">Range</th><th scope="col">Source</th></>}</tr></thead>
        <tbody>
          {observed
            ? families.map((f) => <tr key={f.year}><th scope="row">{f.year}{f.partial ? ' (partial)' : ''}</th><td>{f.modis === null ? '–' : fmt.format(f.modis)}</td><td>{f.viirs === null ? '–' : fmt.format(f.viirs)}</td></tr>)
            : rows.map((r) => <tr key={r.year}><th scope="row">{r.year}{r.partial ? ' (partial)' : ''}</th><td>{fmt.format(r.value)}</td><td>{r.converted ? `${fmt.format(r.lo)}–${fmt.format(r.hi)}` : 'none'}</td><td>{sourceText(r.source)}</td></tr>)}
        </tbody>
      </table></div>
    </section>
  )
}
