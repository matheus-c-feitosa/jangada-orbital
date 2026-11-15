import type { AreaSeries, Satellite } from './data/load'
import type { View } from './AreaPanel'
import { CalendarTable } from './calendar/CalendarTable'
import { Highlights } from './calendar/Highlights'
import { SeasonRhythm } from './calendar/SeasonRhythm'
import { useI18n } from './i18n'

const SITE = 'https://matheus-c-feitosa.github.io/jangada-orbital/'

interface Props {
  series: AreaSeries
  areaName: string
  kindLabel: string
  /** "2026 so far: …" */
  summary: string | null
  /** "34th percentile of 2001–2025" */
  standing: string | null
  /** "14 Nov 2026" */
  dataDate: string
  view: View
  sat: Satellite
  fromYear: number
  toYear: number
  partialMonth: string
  partialDays: number
}

/** "Print report" (T049, #16): one or two A4 pages with the area, its answer, the calendar, the season rhythm, the
 * legend, the data date, the method link and the sources. Mounted only while the page prints (App, beforeprint), in
 * the light theme; the rest of the app is hidden by the print rules in styles.css. */
export function PrintReport(p: Props) {
  const i = useI18n()
  const values = p.view === 'harmonized' ? p.series.value : p.series.observed[p.sat]
  return (
    <article className="print-report hidden flex-col gap-4 bg-white p-0 text-[12px] text-[#0f172a] print:flex" aria-label={i.t('printTitle', { area: p.areaName })}>
      <header className="flex items-start justify-between gap-6 border-b border-[#d8dee7] pb-2">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-2xl font-bold">{p.areaName}</h1>
          <span className="text-[11px] text-[#5c6a80]">{p.kindLabel}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right text-[11px] text-[#3f4c61]">
          <strong className="text-[13px] text-[#0f172a]">Jangada Orbital</strong>
          <span>{i.t('tagline')}</span>
          <span>{i.t('dataThrough', { date: p.dataDate })}</span>
        </div>
      </header>
      {p.summary && <p className="m-0 text-[14px] leading-snug">{p.summary}{p.standing ? ` (${p.standing})` : ''}</p>}
      <CalendarTable months={p.series.months} values={values} harmonized={p.view === 'harmonized'} source={p.series.source}
        lo={p.series.lo} hi={p.series.hi} fromYear={p.fromYear} toYear={p.toYear} partialMonth={p.partialMonth} partialDays={p.partialDays}
        caption={p.view === 'harmonized' ? i.t('captionHarm') : i.t('captionObs', { sat: p.sat })} />
      <Highlights months={p.series.months} values={values} fromYear={p.fromYear} toYear={p.toYear} partialMonth={p.partialMonth} />
      <div className="break-inside-avoid">
        <SeasonRhythm months={p.series.months} values={p.series.value} fromYear={p.fromYear} toYear={p.toYear} areaName={p.areaName}
          partialMonth={p.partialMonth} partialDays={p.partialDays} />
      </div>
      <footer className="break-inside-avoid border-t border-[#d8dee7] pt-2 text-[10px] leading-snug text-[#3f4c61]">
        <p className="m-0">{i.t('imageSource')}</p>
        <p className="m-0">{i.t('printMethod')} {SITE}#method · {i.t('printApp')} {SITE}</p>
      </footer>
    </article>
  )
}
