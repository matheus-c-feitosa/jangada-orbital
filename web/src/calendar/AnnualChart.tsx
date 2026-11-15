import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AreaSeries } from '../data/load'
import { annualRows, familyRows, medianOfComplete, type YearSource } from './annual'
import { useI18n, type Key } from '../i18n'

const SRC: Record<YearSource, Key> = { aqua: 'srcAqua', terra: 'srcTerra', viirs: 'srcViirs', 'terra+aqua': 'srcTerraAqua' }
const H = 160

interface Props {
  series: AreaSeries
  areaName: string
  view: 'harmonized' | 'observed'
  partialMonth: string
  /** last data day, e.g. "14 Nov" */
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
  const i = useI18n()
  const sourceText = (s: YearSource) => i.t(SRC[s])
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
      return i.t('famRow', { y, a: f.modis === null ? i.t('notFlying') : i.int(f.modis), b: f.viirs === null ? i.t('notFlyingYet') : i.int(f.viirs), p: f.partial ? i.t('yearIncomplete') : '' })
    }
    const r = rows.find((x) => x.year === y)
    if (!r) return ''
    const range = r.converted ? i.t('rangeOf', { a: i.compact(r.lo), b: i.compact(r.hi) }) : ''
    return i.t('yearRow', { y, v: i.compact(r.value), range, src: sourceText(r.source), through: r.partial ? i.t('throughDate', { date: dataDate }) : '' })
  }

  // a range can hold only the current, partial year: then there is no peak and no median to state
  const complete = rows.filter((r) => !r.partial)
  const peak = complete.length ? complete.reduce((a, b) => (b.value > a.value ? b : a)) : null
  const current = rows[rows.length - 1]
  const sentence = observed
    ? i.t('obsSentence')
    : [
        peak && i.t('peaked', { name: areaName, year: peak.year, v: i.compact(peak.value) }),
        current.partial && (Number.isFinite(med)
          ? i.t('soFarMedian', { year: current.year, v: i.compact(current.value), m: i.compact(med) })
          : i.t('soFarOnly', { year: current.year, v: i.compact(current.value) })),
        !current.partial && Number.isFinite(med) && i.t('medianComplete', { m: i.compact(med) }),
      ].filter(Boolean).join(' ')
  const step = 'inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-line-2 bg-surface-2 text-ink disabled:opacity-40'
  const ticks = rows.length > 3 ? [0, Math.round((rows.length - 1) / 3), Math.round(((rows.length - 1) * 2) / 3), rows.length - 1] : rows.map((_, k) => k)

  return (
    <section className="mt-2 flex flex-col gap-2.5 border-t border-line pt-4" aria-labelledby="annual-title">
      <h2 id="annual-title" className="m-0 text-base font-semibold">{i.t('totalPerYear')}</h2>
      <p className="m-0 max-w-[70ch] text-sm leading-normal text-ink-2">{sentence}</p>
      <div className="flex items-center gap-2">
        <button type="button" className={step}
          aria-label={i.t('prevYear')} disabled={at <= 0} onClick={() => setPicked(rows[Math.max(0, at - 1)].year)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <p className="m-0 min-h-11 flex-1 content-center text-sm leading-snug tabular-nums" aria-live="polite">{describe(year)}</p>
        <button type="button" className={step}
          aria-label={i.t('nextYear')} disabled={at >= rows.length - 1} onClick={() => setPicked(rows[Math.min(rows.length - 1, at + 1)].year)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>

      <div className="flex gap-1.5" aria-hidden="true">
        <div className="relative w-10 shrink-0 text-right text-[11px] text-ink-3 tabular-nums" style={{ height: H }}>
          <span className="absolute right-0 -top-2">{i.compact(top)}</span>
          <span className="absolute right-0" style={{ top: H / 2 - 8 }}>{i.compact(top / 2)}</span>
          <span className="absolute right-0 -bottom-2">0</span>
        </div>
        <div className="relative flex-1 border-b border-line" style={{ height: H }}>
          <span className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <span className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: H / 2 }} />
          <div className="absolute inset-0 flex items-stretch gap-[2px]">
            {rows.map((r, k) => {
              const f = families[k]
              const sel = r.year === year
              const ring = sel ? 'shadow-[0_0_0_2px_var(--ink)]' : ''
              return (
                <button key={r.year} type="button" tabIndex={-1} className="relative h-full flex-1 cursor-pointer border-0 bg-transparent p-0"
                  onClick={() => setPicked(r.year)} onMouseEnter={() => setPicked(r.year)}>
                  {observed ? (
                    <>
                      {f?.modis != null && <span className={`absolute bottom-0 left-0 w-[48%] rounded-t-[2px] bg-c5 ${f.partial ? 'bar-partial' : ''} ${ring}`} style={{ height: px(f.modis) }} />}
                      {f?.viirs != null && <span className={`absolute bottom-0 right-0 w-[48%] rounded-t-[2px] bg-ink-2 ${ring}`} style={{ height: px(f.viirs), ...(f.partial ? { background: 'repeating-linear-gradient(135deg, var(--ink-2) 0 3px, var(--line-2) 3px 6px)' } : {}) }} />}
                    </>
                  ) : (
                    <>
                      <span className={`absolute inset-x-0 bottom-0 box-border rounded-t-[2px] ${r.partial ? 'bar-partial border border-conv-edge' : r.converted ? 'border-[1.5px] border-conv-edge bg-conv' : 'bg-c5'} ${ring}`}
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
      <div className="flex justify-between pl-10 text-[11px] text-ink-3 tabular-nums" aria-hidden="true">
        {ticks.map((k) => <span key={k}>{rows[k].year}</span>)}
      </div>

      <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1.5 p-0 text-xs text-ink-2" aria-label={i.t('legend')}>
        {observed ? (
          <>
            <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-[2px] bg-c5" />{i.t('legModis')}</li>
            <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-[2px] bg-ink-2" />{i.t('legViirs')}</li>
          </>
        ) : (
          <>
            <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-[2px] bg-c5" />{i.t('legObsAqua')}</li>
            <li className="inline-flex items-center gap-1.5"><span className="inline-block box-border h-2.5 w-3.5 rounded-[2px] border-[1.5px] border-conv-edge bg-conv" />{i.t('legConverted')}</li>
            <li className="inline-flex items-center gap-1.5"><span className="mx-1.5 inline-block h-3 w-[2px] bg-ink" />{i.t('legRange')}</li>
            <li className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-ink" />{i.t('legMedian')}</li>
          </>
        )}
        {current.partial && <li className="inline-flex items-center gap-1.5"><span className="bar-partial inline-block h-2.5 w-3.5 rounded-[2px]" />{i.t('legPartialYear', { year: current.year })}</li>}
      </ul>

      <div className="sr-only"><table>
        <caption>{i.t('totalCaption', { name: areaName })}</caption>
        <thead><tr><th scope="col">{i.t('thYear')}</th>{observed ? <><th scope="col">MODIS</th><th scope="col">VIIRS</th></> : <><th scope="col">{i.t('thTotal')}</th><th scope="col">{i.t('thRange')}</th><th scope="col">{i.t('thSource')}</th></>}</tr></thead>
        <tbody>
          {observed
            ? families.map((f) => <tr key={f.year}><th scope="row">{f.year}{f.partial ? i.t('partialParen') : ''}</th><td>{f.modis === null ? '–' : i.int(f.modis)}</td><td>{f.viirs === null ? '–' : i.int(f.viirs)}</td></tr>)
            : rows.map((r) => <tr key={r.year}><th scope="row">{r.year}{r.partial ? i.t('partialParen') : ''}</th><td>{i.int(r.value)}</td><td>{r.converted ? `${i.int(r.lo)}–${i.int(r.hi)}` : i.t('none')}</td><td>{sourceText(r.source)}</td></tr>)}
        </tbody>
      </table></div>
    </section>
  )
}
