import { useRef, useState, type KeyboardEvent } from 'react'
import type { AppData, AreaSeries, Satellite } from './data/load'
import type { BiomeData, Intensity, MuniRanking, Oni } from './data/extras'
import { IntensityChart } from './calendar/IntensityChart'
import { CalendarTable } from './calendar/CalendarTable'
import { Highlights } from './calendar/Highlights'
import { AnnualChart } from './calendar/AnnualChart'
import { YearToDate } from './calendar/YearToDate'
import { SeasonRhythm } from './calendar/SeasonRhythm'
import { RankingTable } from './rank/RankingTable'
import { CompareChart } from './rank/CompareChart'
import type { View } from './AreaPanel'
import { useI18n, type I18n } from './i18n'

export type Tab = 'calendar' | 'year' | 'season' | 'ranking'
export const TABS: Tab[] = ['calendar', 'year', 'season', 'ranking']

interface Props {
  data: AppData
  series: AreaSeries | null
  loading: boolean
  areaName: string
  view: View
  sat: Satellite
  fromYear: number
  toYear: number
  partialMonth: string
  partialDays: number
  /** "14 Nov" */
  dateLabel: string
  tab: Tab
  onTab: (tab: Tab) => void
  compare: string[]
  onToggleCompare: (key: string) => void
  onSelectState: (uf: string) => void
  /** phone: "2026" instead of "2026 so far", taller calendar cells */
  narrow?: boolean
  /** desktop: tabs underlined under the area header; tablet and phone: a segmented control */
  tabStyle: 'underline' | 'segment'
  biomes: BiomeData | null
  munis: MuniRanking | null
  onSelectBiome: (id: string) => void
  onSelectMuni: (id: string, uf: string, name: string) => void
  seriesFor: (key: string) => AreaSeries | null
  /** ranking key of the selected area (state code or "bio:<id>") */
  selectedKey: string | null
  oni: Oni | null
  intensity: Intensity | null
  /** key of the area in intensity.json (null for drawn areas and municipalities) */
  areaKey: string | null
  /** the tab list stays put while the panel below it scrolls (desktop and phone drawer) */
  stickyTabs?: boolean
}

export function TabList({ tab, onTab, labels, tabStyle, className = '' }: { tab: Tab; onTab: (t: Tab) => void; labels: Record<Tab, string>; tabStyle: 'underline' | 'segment'; className?: string }) {
  const { t: tr } = useI18n()
  const refs = useRef(new Map<Tab, HTMLButtonElement>())
  const onKey = (e: KeyboardEvent) => {
    const i = TABS.indexOf(tab)
    const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length]
      : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : null
    if (!next) return
    e.preventDefault()
    onTab(next)
    refs.current.get(next)?.focus()
  }
  const underline = tabStyle === 'underline'
  return (
    <div role="tablist" aria-label={tr('dataViews')} onKeyDown={onKey}
      className={`flex gap-1 ${underline ? 'border-b border-line' : 'rounded-[14px] bg-surface-2 p-1'} ${className}`}>
      {TABS.map((t) => (
        <button key={t} type="button" role="tab" id={`tab-${t}`} aria-controls={`panel-${t}`} aria-selected={tab === t}
          tabIndex={tab === t ? 0 : -1} ref={(el) => { if (el) refs.current.set(t, el) }} onClick={() => onTab(t)}
          className={underline
            ? 'h-11 flex-1 rounded-t-lg px-1 text-[13px] font-semibold text-ink-3 aria-selected:bg-surface-2 aria-selected:text-ink aria-selected:shadow-[inset_0_-2px_0_var(--brand)]'
            : 'min-h-11 flex-1 rounded-[10px] px-1 text-[13px] font-semibold text-ink-3 aria-selected:bg-seg-on aria-selected:text-ink'}>
          {labels[t]}
        </button>
      ))}
    </div>
  )
}

export function tabLabels(year: number, i: I18n, narrow?: boolean): Record<Tab, string> {
  return { calendar: i.t('tabCalendar'), year: narrow ? String(year) : i.t('tabYear', { year }), season: i.t('tabSeason'), ranking: i.t('tabRanking') }
}

/** The four views of the selected area. The tab list can be rendered apart (TabList) where a layout needs it. */
export function DataPanel(p: Props & { hideTabs?: boolean }) {
  const i = useI18n()
  const year = Number(p.data.manifest.last_month.slice(0, 4))
  const [climate, setClimate] = useState(false)
  const s = p.series
  const values = !s ? [] : p.view === 'harmonized' ? s.value : s.observed[p.sat]

  return (
    <div className="flex min-w-0 flex-col">
      {!p.hideTabs && <TabList tab={p.tab} onTab={p.onTab} labels={tabLabels(year, i, p.narrow)} tabStyle={p.tabStyle}
        className={p.stickyTabs ? 'sticky top-0 z-10 bg-surface' : ''} />}
      <div role="tabpanel" id={`panel-${p.tab}`} aria-labelledby={`tab-${p.tab}`} className="min-w-0 pt-3.5">
        {p.tab === 'ranking' ? (
          <RankingTable data={p.data} biomes={p.biomes} munis={p.munis} selected={p.selectedKey} compare={p.compare} onSelect={p.onSelectState}
            onSelectBiome={p.onSelectBiome} onSelectMuni={p.onSelectMuni} onToggleCompare={p.onToggleCompare} />
        ) : !s || p.loading ? (
          <p className="py-6 text-sm text-ink-2" aria-busy="true">{i.t('loadingHistory')}</p>
        ) : p.tab === 'calendar' ? (
          <>
            <CalendarTable
              oni={climate ? p.oni?.years ?? null : null}
              climateAvailable={!!p.oni}
              climate={climate}
              onClimate={setClimate}
              months={s.months}
              values={values}
              harmonized={p.view === 'harmonized'}
              source={s.source}
              lo={s.lo}
              hi={s.hi}
              image={{
                title: p.areaName,
                lines: [i.t('imageLine', { a: p.fromYear, b: p.toYear, date: i.day(p.data.manifest.data_date) })],
                footer: [i.t('imageSource'), 'https://matheus-c-feitosa.github.io/jangada-orbital/'],
              }}
              fromYear={p.fromYear}
              toYear={p.toYear}
              partialMonth={p.partialMonth}
              partialDays={p.partialDays}
              compact={p.narrow}
              caption={p.view === 'harmonized' ? i.t('captionHarm') : i.t('captionObs', { sat: p.sat })}
            />
            <Highlights months={s.months} values={values} fromYear={p.fromYear} toYear={p.toYear} partialMonth={p.partialMonth} />
            <AnnualChart series={s} areaName={p.areaName} view={p.view} partialMonth={p.partialMonth} dataDate={p.dateLabel}
              fromYear={p.fromYear} toYear={p.toYear} />
          </>
        ) : p.tab === 'year' ? (
          <>
            <YearToDate months={s.months} values={s.value} lastMonth={p.partialMonth} days={p.partialDays} dateLabel={p.dateLabel} areaName={p.areaName} />
            <CompareChart data={p.data} series={s} areaName={p.areaName} compare={p.compare} onRemove={p.onToggleCompare} seriesFor={p.seriesFor} />
            {!p.compare.length && (
              <p className="mt-5 border-t border-line pt-4 text-sm text-ink-2">
                {i.t('compareHint')} <button type="button" className="font-semibold text-link underline underline-offset-[3px]" onClick={() => p.onTab('ranking')}>{i.t('tabRanking')}</button>{i.lang === 'pt' ? '' : ' '}{i.t('compareHintEnd')}
              </p>
            )}
          </>
        ) : (
          <>
            <SeasonRhythm months={s.months} values={s.value} fromYear={p.fromYear} toYear={p.toYear} areaName={p.areaName} partialMonth={p.partialMonth} partialDays={p.partialDays} />
            {p.intensity && p.areaKey && <IntensityChart intensity={p.intensity} areaKey={p.areaKey} areaName={p.areaName} />}
          </>
        )}
      </div>
    </div>
  )
}
