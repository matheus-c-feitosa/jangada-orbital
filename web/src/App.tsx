import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { ExternalLink, MapPinned, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { loadAppData, type AppData, type AreaSeries, type Satellite } from './data/load'
import { seriesForRing, type RingSeries } from './data/queries'
import { buildCsv, csvFileName, downloadText } from './data/csv'
import { cellsInRing, ringBounds, type Ring } from './geo/aoi'
import { anyCellInBrazil, outlinesOf } from './geo/coverage'
import { compareMonth } from './calendar/stats'
import { peaks } from './calendar/peaks'
import { AnswerLine } from './calendar/AnswerLine'
import { Highlights } from './calendar/Highlights'
import { ViewControls } from './calendar/ViewControls'
import { buildGrid } from './calendar/grid'
import { answerLines, answerParts } from './calendar/answerParts'
import { calendarSvg, downloadPng, imageFileName, readColors } from './calendar/exportImage'
import { CalendarTable } from './calendar/CalendarTable'
import { SeasonRhythm } from './calendar/SeasonRhythm'
import { YearToDate } from './calendar/YearToDate'
import type { DrawMode, Theme } from './map/MapView'
import { AreaPanel, SAT_LABEL, type Area, type View } from './AreaPanel'
import { Method } from './Method'

const REPO = 'https://github.com/matheus-c-feitosa/jangada-orbital'
/** west, south, east, north of Brazil, for the CSV header and the FIRMS request */
const BRAZIL_BBOX: [number, number, number, number] = [-74, -34, -34.7, 5.4]

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
  const read = () => (window.location.hash === '#method' ? 'method' : 'calendar')
  const [page, setPage] = useState<'calendar' | 'method'>(read)
  useEffect(() => {
    const onHash = () => setPage(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return [page, (p) => { window.location.hash = p === 'method' ? 'method' : '' }]
}

const navLink = 'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink aria-[current=page]:bg-surface-2 aria-[current=page]:text-ink max-lg:px-2'

export function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [page, setPage] = usePage()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [area, setArea] = useState<Area>({ kind: 'country' })
  const [ringSeries, setRingSeries] = useState<RingSeries | null>(null)
  const [areaLoading, setAreaLoading] = useState(false)
  const [areaError, setAreaError] = useState<string | null>(null)
  const [view, setView] = useState<View>('harmonized')
  const [sat, setSat] = useState<Satellite>('Aqua')
  const [fromYear, setFromYear] = useState(2001)
  const [toYear, setToYear] = useState<number | null>(null)
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

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

  const comparison = useMemo(() => {
    if (!series) return null
    const t = series.months.indexOf(partialMonth)
    return t < 0 ? null : compareMonth(series.months, series.value, t, partialDays)
  }, [series, partialMonth, partialDays])

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

  // On phones the sheet closes once an area is chosen, so the answer and calendar come straight into view.
  const chooseArea = useCallback((next: Area) => {
    setArea(next)
    setSheetOpen(false)
  }, [])

  const onDrawn = useCallback((ring: Ring) => {
    setDrawMode('none')
    const [w, s, e, n] = ringBounds(ring)
    setArea({ kind: 'ring', ring, label: `Drawn area (${s.toFixed(2)}°, ${w.toFixed(2)}° to ${n.toFixed(2)}°, ${e.toFixed(2)}°)` })
    setSheetOpen(false)
  }, [])

  const download = () => {
    if (!data || !series) return
    const csv = buildCsv(series, {
      manifest: data.manifest,
      areaLabel: areaName,
      bbox: areaBounds ?? BRAZIL_BBOX,
      from: `${fromYear}-01`,
      to: `${endYear}-12`,
    })
    downloadText(csv, csvFileName(data.manifest, areaName))
  }

  const values = !series ? [] : view === 'harmonized' ? series.value : series.observed[sat]
  const years = Array.from({ length: lastYear - 2001 + 1 }, (_, i) => 2001 + i)
  const highlights = useMemo(
    () => (series ? peaks(series.months, values, fromYear, endYear, partialMonth) : null),
    [series, values, fromYear, endYear, partialMonth],
  )
  // No detections at all can mean "nothing burned here" or "there is no data here" (open sea, another country);
  // only the second one is a coverage problem, so it is checked against the state outlines.
  const outlines = useMemo(() => (data ? outlinesOf(data.states) : []), [data])
  const outside = useMemo(() => {
    if (area.kind !== 'ring' || !ringSeries || ringSeries.value.some((v) => v > 0)) return false
    return !anyCellInBrazil(cellsInRing(area.ring).cells, outlines)
  }, [area, ringSeries, outlines])
  const skipToMain = (e: MouseEvent) => {
    e.preventDefault() // a plain #main link would change the hash, which also selects the page
    document.getElementById('main')?.focus()
  }

  const caption = view === 'harmonized'
    ? 'Fire detections per month, harmonized (Aqua-MODIS equivalent)'
    : `Fire detections per month as delivered by ${SAT_LABEL[sat]} (not comparable across sensors)`

  const exportImage = async () => {
    if (!data || !series) return
    setImageBusy(true)
    setImageError(null)
    try {
      const { grid, breaks } = buildGrid(series.months, values, view === 'harmonized' ? series.source : null, fromYear, endYear, partialMonth, partialDays)
      const { svg, width, height } = calendarSvg({
        title: areaName,
        lines: comparison ? answerLines(answerParts(comparison, data.manifest.last_day_partial)) : [],
        caption,
        grid, breaks, partialMonth,
        harmonized: view === 'harmonized',
        footer: [
          `Source: NASA FIRMS active fire data (MODIS C6.1, VIIRS 375 m), harmonized by Jangada Orbital to Aqua-MODIS-equivalent detections (model ${data.manifest.model_version}). Data through ${data.manifest.data_date}.`,
          'est. = the year includes estimated months (Terra 2000–02, VIIRS from 2024). Not an official NASA product.',
        ],
        colors: readColors(),
      })
      await downloadPng(svg, width, height, imageFileName(areaName, fromYear, endYear))
    } catch (e) {
      setImageError(`Could not make the image (${(e as Error).message}).`)
    } finally {
      setImageBusy(false)
    }
  }

  const panel = data && (
    <AreaPanel data={data} theme={theme} area={area} onArea={chooseArea} areaBounds={areaBounds}
      drawMode={drawMode} onDrawMode={setDrawMode} onDrawn={onDrawn} />
  )

  return (
    <>
      <a href="#main" onClick={skipToMain}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground">
        Skip to main content
      </a>
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

      {page === 'method' ? (
        <Method manifest={data?.manifest ?? null} repo={REPO} />
      ) : loadError ? (
        <main id="main" tabIndex={-1} className="p-6 outline-none" role="alert">
          <p className="text-ink-2">The fire data could not be loaded ({loadError}).</p>
          <Button variant="outline" className="h-10" onClick={load}>Try again</Button>
        </main>
      ) : !data ? (
        <main id="main" tabIndex={-1} className="p-6 outline-none"><p className="py-12 text-ink-2" aria-busy="true">Loading 26 years of fire data…</p></main>
      ) : (
        <div className="grid items-start gap-6 p-6 lg:grid-cols-[380px_minmax(0,1fr)] max-lg:gap-4 max-lg:p-4">
          {desktop ? (
            <aside className="sticky top-6" aria-label="Area and view">{panel}</aside>
          ) : (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="h-11 w-full gap-2 text-sm"><MapPinned aria-hidden="true" /> Choose area</Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto px-4 pb-6">
                <SheetHeader className="px-0">
                  <SheetTitle>Area and view</SheetTitle>
                  <SheetDescription>Pick a state, draw an area or type a point and radius.</SheetDescription>
                </SheetHeader>
                {panel}
              </SheetContent>
            </Sheet>
          )}

          {/* A flex column so the order can differ by screen: on a phone the busiest-periods summary moves below the
              calendar, which then starts higher on the screen. Reading order and tab order follow the DOM. */}
          <main id="main" tabIndex={-1} className="flex min-w-0 flex-col outline-none">
            <AnswerLine areaName={areaName} comparison={comparison} loading={areaLoading || !series} outside={outside}
              cells={area.kind === 'ring' ? ringSeries?.cells : undefined} approximate={area.kind === 'ring' && ringSeries?.approximate}
              lastDayPartial={data.manifest.last_day_partial} areaKm2={series?.area_km2} />
            {areaError && <p className="text-[13px] text-unusual" role="alert">{areaError}</p>}
            {highlights && !areaLoading && !outside && <div className="lg:order-1 max-lg:order-4 max-lg:mt-6"><Highlights peaks={highlights} /></div>}
            {!outside && (
              <div className="order-2">
                <ViewControls view={view} onView={setView} sat={sat} onSat={setSat}
                  years={years} fromYear={fromYear} toYear={endYear} onRange={(f, t) => { setFromYear(f); setToYear(t) }}
                  canExport={!!series && !areaLoading} onCsv={download} onImage={exportImage} imageBusy={imageBusy} imageError={imageError}
                  firms={{ bbox: areaBounds ?? BRAZIL_BBOX, from: `${fromYear}-01-01`, to: endYear === lastYear ? data.manifest.data_date : `${endYear}-12-31` }} />
              </div>
            )}
            {series && !areaLoading && !outside && (
              <div className="order-3">
                <CalendarTable
                  months={series.months}
                  values={values}
                  source={view === 'harmonized' ? series.source : null}
                  fromYear={fromYear}
                  toYear={endYear}
                  partialMonth={partialMonth}
                  partialDays={partialDays}
                  caption={caption}
                />
              </div>
            )}
            {series && !areaLoading && !outside && <div className="order-5"><YearToDate months={series.months} values={series.value} lastMonth={partialMonth} days={partialDays} /></div>}
            {series && !areaLoading && !outside && <div className="order-6"><SeasonRhythm months={series.months} values={series.value} fromYear={fromYear} toYear={endYear} /></div>}
          </main>
        </div>
      )}
    </>
  )
}
