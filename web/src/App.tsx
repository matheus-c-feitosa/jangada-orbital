import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, ExternalLink, Moon, SlidersHorizontal, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { loadAppData, type AppData, type AreaSeries, type Satellite } from './data/load'
import { seriesForRing } from './data/queries'
import { buildCsv, csvFileName, downloadText } from './data/csv'
import { ringBounds, type Ring } from './geo/aoi'
import { compareMonth } from './calendar/stats'
import { AnswerLine } from './calendar/AnswerLine'
import { MapView, type DrawMode, type MapLayer, type StateStanding, type Theme } from './map/MapView'
import { AreaPanel, type Area, type View } from './AreaPanel'
import { DataPanel, type Tab } from './DataPanel'
import { MAX_COMPARE } from './rank/RankingTable'
import { ytdStanding } from './rank/ranking'
import { Method } from './Method'

const REPO = 'https://github.com/matheus-c-feitosa/jangada-orbital'
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') return saved
  } catch { /* storage blocked: fall back to the device preference */ }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function usePage(): ['calendar' | 'method', (p: 'calendar' | 'method') => void] {
  // #why is the harmonization explainer inside the Method page (linked from the answer line)
  const read = () => (['#method', '#why'].includes(window.location.hash) ? 'method' : 'calendar')
  const [page, setPage] = useState<'calendar' | 'method'>(read)
  useEffect(() => {
    const onHash = () => setPage(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return [page, (p) => { window.location.hash = p === 'method' ? 'method' : '' }]
}

const navLink = 'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink aria-[current=page]:bg-surface-2 aria-[current=page]:text-ink max-lg:px-2'
const floating = 'shadow-[0_4px_12px_rgb(0_0_0/0.35)]'

export function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [page, setPage] = usePage()
  // Layouts of the new UI: three columns from 1024 px, map over data on tablets, map with a data drawer on phones.
  const desktop = useMediaQuery('(min-width: 1024px)')
  const phone = useMediaQuery('(max-width: 599px)')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('calendar')
  const [layer, setLayer] = useState<MapLayer>('normal')
  const [compare, setCompare] = useState<string[]>([])
  const [area, setArea] = useState<Area>({ kind: 'country' })
  const [ringSeries, setRingSeries] = useState<(AreaSeries & { cells: number }) | null>(null)
  const [areaLoading, setAreaLoading] = useState(false)
  const [areaError, setAreaError] = useState<string | null>(null)
  const [view, setView] = useState<View>('harmonized')
  const [sat, setSat] = useState<Satellite>('Aqua')
  const [fromYear, setFromYear] = useState(2001)
  const [toYear, setToYear] = useState<number | null>(null)
  const [drawMode, setDrawMode] = useState<DrawMode>('none')

  const load = useCallback(() => {
    setLoadError(null)
    loadAppData().then(setData).catch((e: Error) => setLoadError(e.message))
  }, [])
  useEffect(load, [load])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('theme', theme) } catch { /* not persisted; still applied */ }
  }, [theme])

  // Drawn or typed areas are read from the tile files; Brazil and states come from series.json.
  useEffect(() => {
    if (!data || area.kind !== 'ring') { setRingSeries(null); return }
    let cancelled = false
    setAreaLoading(true)
    setAreaError(null)
    seriesForRing(area.ring, area.label, data.areas.BR, data.manifest)
      .then((s) => { if (!cancelled) setRingSeries(s) })
      .catch((e: Error) => { if (!cancelled) setAreaError(`Could not load this area (${e.message}).`) })
      .finally(() => { if (!cancelled) setAreaLoading(false) })
    return () => { cancelled = true }
  }, [data, area])

  const series: AreaSeries | null = !data ? null
    : area.kind === 'country' ? data.areas.BR
    : area.kind === 'state' ? data.areas[area.uf]
    : ringSeries

  const lastYear = data ? Number(data.manifest.last_month.slice(0, 4)) : 2026
  const endYear = toYear ?? lastYear
  const partialMonth = data ? data.manifest.last_month.slice(0, 7) : ''
  const partialDays = data?.manifest.last_month_days ?? 0
  const dateLabel = data ? `${Number(data.manifest.data_date.slice(8, 10))} ${MONTH_ABBR[Number(data.manifest.data_date.slice(5, 7)) - 1]}` : ''

  const comparison = useMemo(() => {
    if (!series) return null
    const t = series.months.indexOf(partialMonth)
    return t < 0 ? null : compareMonth(series.months, series.value, t, partialDays)
  }, [series, partialMonth, partialDays])

  // This year against previous years for every state: the map layer and its popover (spec 002, story 2).
  const standings = useMemo(() => {
    const out: Record<string, StateStanding> = {}
    if (!data) return out
    for (const s of data.stateList) {
      const a = data.areas[s.uf]
      const st = a && ytdStanding(a.months, a.value, partialMonth, partialDays)
      if (st) out[s.uf] = { name: a.name, ytd: st.current, percentile: st.percentile, first: st.first, last: st.last }
    }
    return out
  }, [data, partialMonth, partialDays])

  const areaName = !data ? 'Brazil'
    : area.kind === 'country' ? 'Brazil'
    : area.kind === 'state' ? `${data.areas[area.uf].name}, Brazil`
    : area.label

  const areaBounds = useMemo((): [number, number, number, number] | null => {
    if (!data) return null
    if (area.kind === 'state') return data.stateList.find((s) => s.uf === area.uf)?.bbox ?? null
    if (area.kind === 'ring') return ringBounds(area.ring)
    return null
  }, [data, area])

  // Choosing an area closes the filters on tablets and phones, so the answer comes straight into view.
  const chooseArea = useCallback((next: Area) => {
    setArea(next)
    setFiltersOpen(false)
  }, [])
  const pickState = useCallback((uf: string) => {
    setArea({ kind: 'state', uf })
    setFiltersOpen(false)
    setDrawerOpen(false)
  }, [])
  const toggleCompare = useCallback((uf: string) => {
    setCompare((c) => (c.includes(uf) ? c.filter((x) => x !== uf) : c.length < MAX_COMPARE ? [...c, uf] : c))
  }, [])

  const onDrawn = useCallback((ring: Ring) => {
    setDrawMode('none')
    const [w, s, e, n] = ringBounds(ring)
    setArea({ kind: 'ring', ring, label: `Drawn area (${s.toFixed(2)}°, ${w.toFixed(2)}° to ${n.toFixed(2)}°, ${e.toFixed(2)}°)` })
  }, [])
  // On tablets and phones the filters cover the map; close them while the user draws.
  const startDraw = useCallback((mode: DrawMode) => {
    setDrawMode(mode)
    if (mode !== 'none') { setFiltersOpen(false); setDrawerOpen(false) }
  }, [])

  const download = () => {
    if (!data || !series) return
    const csv = buildCsv(series, {
      manifest: data.manifest,
      areaLabel: areaName,
      bbox: areaBounds ?? [-74, -34, -34.7, 5.4],
      from: `${fromYear}-01`,
      to: `${endYear}-12`,
    })
    downloadText(csv, csvFileName(data.manifest, areaName))
  }

  const years = Array.from({ length: lastYear - 2001 + 1 }, (_, i) => 2001 + i)
  const empty = area.kind === 'ring' && ringSeries?.cells === 0

  const filters = data && (
    <AreaPanel data={data} area={area} onArea={chooseArea} drawMode={drawMode} onDrawMode={startDraw} layer={layer} onLayer={setLayer}
      view={view} onView={setView} sat={sat} onSat={setSat}
      years={years} fromYear={fromYear} toYear={endYear} onRange={(f, t) => { setFromYear(f); setToYear(t) }}
      canDownload={!!series && !areaLoading} onDownload={download} />
  )

  const map = data && (
    <MapView key={theme} theme={theme} states={data.states} stateCode={area.kind === 'state' ? area.uf : null}
      ring={area.kind === 'ring' ? area.ring : null} bounds={areaBounds} drawMode={drawMode} onDrawn={onDrawn}
      layer={layer} standings={standings} dateLabel={dateLabel} onPickState={pickState} compact={phone} className="h-full" />
  )

  const answer = data && (
    <>
      <AnswerLine areaName={areaName} comparison={comparison} loading={areaLoading || !series}
        cells={area.kind === 'ring' ? ringSeries?.cells : undefined} lastDayPartial={data.manifest.last_day_partial} areaKm2={series?.area_km2} />
      {areaError && <p className="text-[13px] text-unusual" role="alert">{areaError}</p>}
      {empty && <p className="text-[13px] text-ink-3" role="status">This area has no grid cells inside Brazil. Draw inside Brazil or pick a state.</p>}
    </>
  )

  const dataPanel = data && (
    <DataPanel data={data} series={series} loading={areaLoading} areaName={series?.name ?? areaName} selectedUf={area.kind === 'state' ? area.uf : null}
      view={view} sat={sat} fromYear={fromYear} toYear={endYear} partialMonth={partialMonth} partialDays={partialDays}
      tab={tab} onTab={setTab} compare={compare} onToggleCompare={toggleCompare} onSelectState={pickState} narrow={phone} />
  )

  const filtersSheet = (
    <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
      <SheetContent side={phone ? 'bottom' : 'left'}
        className={phone ? 'h-[100dvh] max-h-[100dvh] overflow-y-auto rounded-none px-4 pb-6' : 'w-[380px] max-w-[90vw] overflow-y-auto px-4 pb-6 sm:max-w-[380px]'}>
        <SheetHeader className="px-0">
          <SheetTitle>Area and layers</SheetTitle>
          <SheetDescription>Pick a state, draw an area or type a point and radius.</SheetDescription>
        </SheetHeader>
        {filters}
      </SheetContent>
    </Sheet>
  )
  const filtersButton = (
    <Button variant="outline" className={`h-11 gap-2 bg-surface text-sm ${floating}`} onClick={() => setFiltersOpen(true)}>
      <SlidersHorizontal aria-hidden="true" /> Area and layers
    </Button>
  )

  let body
  if (page === 'method') {
    body = <Method manifest={data?.manifest ?? null} repo={REPO} brazil={data?.areas.BR ?? null} />
  } else if (loadError) {
    body = (
      <main className="p-6" role="alert">
        <p className="text-ink-2">The fire data could not be loaded ({loadError}).</p>
        <Button variant="outline" className="h-10" onClick={load}>Try again</Button>
      </main>
    )
  } else if (!data) {
    body = <main className="p-6"><p className="py-12 text-ink-2" aria-busy="true">Loading 26 years of fire data…</p></main>
  } else if (desktop) {
    body = (
      <div className="grid h-[calc(100dvh-56px)] grid-cols-[300px_minmax(0,1fr)_minmax(420px,460px)] overflow-hidden">
        <aside className="relative overflow-y-auto border-r border-line bg-surface/40 p-4" aria-label="Area and layers">{filters}</aside>
        <section className="relative min-w-0" aria-label="Map">{map}</section>
        <main className="relative min-w-0 overflow-y-auto border-l border-line p-5">
          {answer}
          {dataPanel}
        </main>
      </div>
    )
  } else if (!phone) {
    body = (
      <>
        <section className="relative h-[48vh] min-h-[320px]" aria-label="Map">
          {map}
          <div className="absolute left-3 top-3 z-10">{filtersButton}</div>
        </section>
        <main className="min-w-0 p-5">
          {answer}
          {dataPanel}
        </main>
        {filtersSheet}
      </>
    )
  } else {
    body = (
      <>
        <section className="relative h-[calc(100dvh-56px-260px)] min-h-[280px]" aria-label="Map">
          {map}
          {drawMode !== 'none' && (
            <p role="status" className={`absolute inset-x-3 top-3 z-10 m-0 rounded-xl border border-brand bg-surface px-4 py-3 text-sm ${floating}`}>
              {drawMode === 'rectangle' ? 'Tap two opposite corners on the map.' : 'Tap each corner; tap the first point to close.'}{' '}
              <button type="button" className="font-semibold text-ink underline" onClick={() => setDrawMode('none')}>Cancel</button>
            </p>
          )}
        </section>
        <main
          className={drawerOpen
            ? 'fixed inset-x-0 bottom-0 z-30 flex h-[calc(100dvh-104px)] flex-col rounded-t-2xl border-t border-line bg-surface shadow-[0_-8px_24px_rgb(0_0_0/0.4)]'
            : 'flex h-[260px] flex-col rounded-t-2xl border-t border-line bg-surface'}
          aria-label="Fire data for the selected area">
          <button type="button" className="flex h-7 w-full shrink-0 items-center justify-center" onClick={() => setDrawerOpen(!drawerOpen)}
            aria-expanded={drawerOpen} aria-label={drawerOpen ? 'Collapse to the map' : 'Expand the fire data'}>
            <span className="h-1 w-10 rounded-full bg-line" />
          </button>
          {drawerOpen ? (
            <>
              <div className="flex shrink-0 items-center gap-3 px-4 pb-3">
                <h1 className="m-0 min-w-0 flex-1 truncate text-base font-semibold">{areaName}</h1>
                <button type="button" className="inline-flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2"
                  onClick={() => setDrawerOpen(false)} aria-label="Back to the map"><ChevronDown size={20} aria-hidden="true" /></button>
              </div>
              <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6">{dataPanel}</div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
              <div className="min-h-0 flex-1 overflow-hidden">
                <AnswerLine areaName={areaName} comparison={comparison} loading={areaLoading || !series} lastDayPartial={data.manifest.last_day_partial} brief />
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2">
                <Button variant="outline" className="h-11 gap-2 text-sm" onClick={() => setFiltersOpen(true)}><SlidersHorizontal aria-hidden="true" /> Area and layers</Button>
                <Button className="h-11 gap-2 text-sm" onClick={() => setDrawerOpen(true)}><CalendarDays aria-hidden="true" /> Fire calendar</Button>
              </div>
            </div>
          )}
        </main>
        {filtersSheet}
      </>
    )
  }

  return (
    <>
      <header className="flex h-14 items-center gap-4 border-b border-line bg-surface px-6 max-lg:gap-1 max-lg:px-3">
        <a className="flex items-baseline gap-2.5 whitespace-nowrap text-base font-semibold no-underline" href="#" onClick={() => setPage('calendar')}>
          Jangada Orbital <span className="text-sm font-normal text-ink-2 max-lg:hidden">Harmonized fire calendar · Brazil</span>
        </a>
        <nav aria-label="Main" className="ml-auto flex items-center gap-1 max-lg:gap-0">
          {data && <span className="mr-2 text-[13px] text-ink-3 tabular-nums max-lg:hidden">Data through {data.manifest.data_date}</span>}
          <button className={navLink} aria-current={page === 'calendar' ? 'page' : undefined} onClick={() => setPage('calendar')}>Calendar</button>
          <button className={navLink} aria-current={page === 'method' ? 'page' : undefined} onClick={() => setPage('method')}>Method</button>
          <button className={navLink} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
          <a className={navLink} href={REPO} target="_blank" rel="noreferrer">
            <span className="max-lg:hidden">Code</span><ExternalLink size={14} aria-label="Source code on GitHub" />
          </a>
        </nav>
      </header>
      {body}
    </>
  )
}
