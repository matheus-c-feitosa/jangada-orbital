import { useRef, useState, type KeyboardEvent } from 'react'
import type { AppData, AreaSeries, Satellite } from './data/load'
import type { BiomeData, Intensity, MuniRanking, Oni } from './data/extras'
import { IntensityChart } from './calendar/IntensityChart'
import { CalendarTable } from './calendar/CalendarTable'
import { AnnualChart } from './calendar/AnnualChart'
import { YearToDate } from './calendar/YearToDate'
import { SeasonRhythm } from './calendar/SeasonRhythm'
import { RankingTable } from './rank/RankingTable'
import { CompareChart } from './rank/CompareChart'
import { SAT_LABEL, type View } from './AreaPanel'

export type Tab = 'calendar' | 'year' | 'season' | 'ranking'
export const TABS: Tab[] = ['calendar', 'year', 'season', 'ranking']

interface Props {
  data: AppData
  series: AreaSeries | null
  loading: boolean
  areaName: string
  /** selected state code, for the ranking highlight */
  selectedUf: string | null
  view: View
  sat: Satellite
  fromYear: number
  toYear: number
  partialMonth: string
  partialDays: number
  tab: Tab
  onTab: (tab: Tab) => void
  compare: string[]
  onToggleCompare: (uf: string) => void
  onSelectState: (uf: string) => void
  /** phone: shorter tab labels */
  narrow?: boolean
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
}

/** The data column: four views of the selected area as tabs (new UI, spec 002). */
export function DataPanel(p: Props) {
  const year = Number(p.data.manifest.last_month.slice(0, 4))
  const label: Record<Tab, string> = {
    calendar: 'Calendar',
    year: p.narrow ? String(year) : `${year} so far`,
    season: 'Season',
    ranking: 'Ranking',
  }
  const refs = useRef(new Map<Tab, HTMLButtonElement>())
  const onKey = (e: KeyboardEvent) => {
    const i = TABS.indexOf(p.tab)
    const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length]
      : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : null
    if (!next) return
    e.preventDefault()
    p.onTab(next)
    refs.current.get(next)?.focus()
  }
  const [climate, setClimate] = useState(false)
  const s = p.series
  const values = !s ? [] : p.view === 'harmonized' ? s.value : s.observed[p.sat]

  return (
    <div className="flex min-w-0 flex-col">
      <div role="tablist" aria-label="Data views" className="flex gap-1 rounded-xl bg-surface-2 p-1" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" id={`tab-${t}`} aria-controls={`panel-${t}`} aria-selected={p.tab === t}
            tabIndex={p.tab === t ? 0 : -1} ref={(el) => { if (el) refs.current.set(t, el) }} onClick={() => p.onTab(t)}
            className="min-h-11 flex-1 rounded-lg px-1 text-[13px] font-semibold text-ink-3 aria-selected:bg-line aria-selected:text-ink">
            {label[t]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${p.tab}`} aria-labelledby={`tab-${p.tab}`} className="min-w-0 pt-4 [&>section:first-child]:mt-0">
        {p.tab === 'ranking' ? (
          <RankingTable data={p.data} biomes={p.biomes} munis={p.munis} selected={p.selectedKey} compare={p.compare} onSelect={p.onSelectState}
            onSelectBiome={p.onSelectBiome} onSelectMuni={p.onSelectMuni} onToggleCompare={p.onToggleCompare} />
        ) : !s || p.loading ? (
          <p className="py-6 text-sm text-ink-2" aria-busy="true">Loading fire history…</p>
        ) : p.tab === 'calendar' ? (
          <>
            {p.oni && (
              <label className="mb-2 flex min-h-11 w-fit cursor-pointer items-center gap-2.5 text-sm text-ink-2">
                <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={climate} onChange={(e) => setClimate(e.target.checked)} />
                Climate context (El Niño / La Niña)
              </label>
            )}
            <CalendarTable
              oni={climate ? p.oni?.years ?? null : null}
              months={s.months}
              values={values}
              source={p.view === 'harmonized' ? s.source : null}
              fromYear={p.fromYear}
              toYear={p.toYear}
              partialMonth={p.partialMonth}
              partialDays={p.partialDays}
              caption={p.view === 'harmonized'
                ? 'Fire detections per month, harmonized (Aqua-MODIS equivalent)'
                : `Fire detections per month as delivered by ${SAT_LABEL[p.sat]} (not comparable across sensors)`}
            />
            <AnnualChart series={s} areaName={p.areaName} view={p.view} partialMonth={p.partialMonth} dataDate={p.data.manifest.data_date}
              fromYear={p.fromYear} toYear={p.toYear} />
          </>
        ) : p.tab === 'year' ? (
          <>
            <YearToDate months={s.months} values={s.value} lastMonth={p.partialMonth} days={p.partialDays} />
            <CompareChart data={p.data} series={s} areaName={p.areaName} compare={p.compare} onRemove={p.onToggleCompare} seriesFor={p.seriesFor} />
            {!p.compare.length && (
              <p className="mt-4 text-sm text-ink-2">
                To compare with states or biomes, tick them in the <button type="button" className="font-semibold text-ink underline underline-offset-[3px]" onClick={() => p.onTab('ranking')}>Ranking</button> tab.
              </p>
            )}
          </>
        ) : (
          <>
            <SeasonRhythm months={s.months} values={s.value} fromYear={p.fromYear} toYear={p.toYear} />
            {p.intensity && p.areaKey && <IntensityChart intensity={p.intensity} areaKey={p.areaKey} areaName={p.areaName} />}
          </>
        )}
      </div>
    </div>
  )
}
