import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, Globe, Moon, Printer, SlidersHorizontal, Sun, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { loadAppData, type AppData, type AreaSeries, type Satellite } from './data/load'
import { seriesForRing, type RingSeries } from './data/queries'
import { anyCellInBrazil, outlinesOf } from './geo/coverage'
import { loadBiomes, loadIntensity, loadMuniNames, loadMuniRanking, loadOni, loadRecent, loadRecurrence, muniOutline } from './data/extras'
import { buildCsv, csvFileName, downloadText } from './data/csv'
import { cellsInRings, ringBounds, type Ring } from './geo/aoi'
import { compareMonth } from './calendar/stats'
import type { DrawMode, MapLayer, StateStanding, Theme } from './map/MapView'
import { AreaPanel, type Area, type View } from './AreaPanel'
import { DataPanel, TabList, tabLabels, type Tab } from './DataPanel'
import { PhoneLayout, SHEET_HEIGHT, type SheetView } from './PhoneLayout'
import { BIOME_STATES, Logo, StatusPill, densityText, km2Text, percentileText, summaryText, yearStatus } from './AreaHeader'
import { MAX_COMPARE } from './rank/RankingTable'
import { ytdStanding } from './rank/ranking'
import { LangContext, initialLang, makeI18n, saveLang, type Lang } from './i18n'
import { LoadBoundary } from './LoadBoundary'
import { PrintReport } from './PrintReport'
import { SharePanel } from './app/SharePanel'
import { parseView, shareText, sharedCircleRing, viewUrl, type SharedView } from './app/urlState'

// The map (MapLibre, the largest part of the code) is its own chunk, requested once the data is in: the answer and
// the calendar show without waiting for the map's code. Measured with 4G and CPU 4x, fetching it next to the data
// instead put the answer 0.4 s later and the idle map no sooner (docs/performance/audit.md).
const mapChunk = () => import('./map/MapView')
const MapView = lazy(() => mapChunk().then((m) => ({ default: m.MapView })))
// The Method page is text and charts nobody needs on the first screen.
const Method = lazy(() => import('./Method').then((m) => ({ default: m.Method })))

const idle = (cb: () => void, timeout: number) => {
  if (window.requestIdleCallback) {
    const h = window.requestIdleCallback(cb, { timeout })
    return () => window.cancelIdleCallback(h)
  }
  const h = window.setTimeout(cb, 1500)
  return () => window.clearTimeout(h)
}

/** An optional extra file (data/extras.ts): loaded as soon as `now` is true, or, with `prefetch`, once `after` is true
 * and the page is idle. undefined until it has loaded; null when the file is not published (a failed download is tried
 * again the next time `now` turns true). */
function useExtra<T>(load: () => Promise<T | null>, after: boolean, now: boolean, prefetch = false): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined)
  const [due, setDue] = useState(false)
  useEffect(() => (after && prefetch && !due ? idle(() => setDue(true), 6000) : undefined), [after, prefetch, due])
  useEffect(() => {
    if (!after || value || !(now || due)) return
    let live = true
    load().then((v) => { if (live) setValue(v) })
    return () => { live = false }
  }, [after, now, due, value, load])
  return value
}

const REPO = 'https://github.com/matheus-c-feitosa/jangada-orbital'

/** The design is dark; a light theme chosen with the toggle is kept. A new key: the old "theme" key stored the
 * device preference on the first visit, not a choice. */
const THEME_KEY = 'jangada-theme'
function initialTheme(): Theme {
  try {
    if (localStorage.getItem(THEME_KEY) === 'light') return 'light'
  } catch { /* storage blocked: the design's dark theme */ }
  return 'dark'
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

function useViewportHeight(): number {
  const [h, setH] = useState(() => window.innerHeight)
  useEffect(() => {
    const onResize = () => setH(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return h
}

function usePage(): 'calendar' | 'method' {
  // #why is the yearly-totals chart inside the Method page
  const read = () => (['#method', '#why'].includes(window.location.hash) ? 'method' : 'calendar')
  const [page, setPage] = useState<'calendar' | 'method'>(read)
  useEffect(() => {
    const onHash = () => { setPage(read()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return page
}

/** standings of this year so far, per key of `areas` */
function standingsOf(areas: Record<string, AreaSeries>, keys: string[], lastMonth: string, days: number) {
  const out: Record<string, StateStanding> = {}
  for (const k of keys) {
    const a = areas[k]
    const st = a && ytdStanding(a.months, a.value, lastMonth, days)
    if (st) out[k] = { name: a.name, ytd: st.current, percentile: st.percentile, first: st.first, last: st.last }
  }
  return out
}

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang)
  useEffect(() => saveLang(lang), [lang])
  return (
    <LangContext.Provider value={lang}>
      <Shell lang={lang} onLang={setLang} />
    </LangContext.Provider>
  )
}

function Shell({ lang, onLang }: { lang: Lang; onLang: (l: Lang) => void }) {
  const i = useMemo(() => makeI18n(lang), [lang])
  const [data, setData] = useState<AppData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const page = usePage()
  // the calendar page mounts the first time it shows (a visit that opens on #method does not build a hidden map)
  const [calendarSeen, setCalendarSeen] = useState(page === 'calendar')
  if (page === 'calendar' && !calendarSeen) setCalendarSeen(true)
  // Layouts of the design: three columns from 1100 px, map over data on tablets (600–1099 px), map with a sheet on phones.
  const desktop = useMediaQuery('(min-width: 1100px)')
  const wide = useMediaQuery('(min-width: 1280px)')
  const phone = useMediaQuery('(max-width: 599px)')
  // narrow tablets: the language menu shows "EN" / "PT" so the header fits
  const shortLang = useMediaQuery('(max-width: 759px)')
  const viewportH = useViewportHeight()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sheet, setSheet] = useState<SheetView>('peek')
  const [dataCollapsed, setDataCollapsed] = useState(false)
  const [tab, setTab] = useState<Tab>('calendar')
  const [layer, setLayer] = useState<MapLayer>('recurrence')
  const [compare, setCompare] = useState<string[]>([])
  const [area, setArea] = useState<Area>({ kind: 'country' })
  const [ringSeries, setRingSeries] = useState<RingSeries | null>(null)
  const [areaLoading, setAreaLoading] = useState(false)
  const [areaError, setAreaError] = useState<string | null>(null)
  const [view, setView] = useState<View>('harmonized')
  const [sat, setSat] = useState<Satellite>('Aqua')
  const [fromYear, setFromYear] = useState(2001)
  const [toYear, setToYear] = useState<number | null>(null)
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [confirmBox, setConfirmBox] = useState(0)
  const [biomeBorders, setBiomeBorders] = useState(true)
  const [stateBorders, setStateBorders] = useState(false)
  const [places, setPlaces] = useState(false)
  const [period, setPeriod] = useState<[number, number]>([2016, 2025])

  const load = useCallback(() => {
    setLoadError(null)
    loadAppData().then(setData).catch((e: Error) => setLoadError(e.message))
  }, [])
  useEffect(load, [load])

  // spec 002 extras: optional files (a missing file just hides its view). The first screen needs the biomes (names,
  // series and borders) and, with its layer on, the recurrence grid; the rest loads when its view opens, and the
  // municipality ranking and intensity tables are also fetched once the first screen is idle.
  const biomes = useExtra(loadBiomes, !!data, true)
  const oni = useExtra(loadOni, !!data, true)
  const recurrence = useExtra(loadRecurrence, !!data, layer === 'recurrence', true)
  const recent = useExtra(loadRecent, !!data, layer === 'recent')
  const firstScreen = biomes !== undefined && (layer !== 'recurrence' || recurrence !== undefined)
  const munis = useExtra(loadMuniRanking, !!data && firstScreen, tab === 'ranking')
  // the names of all 5,570 municipalities, for the search (the ranking leaves out some of them)
  const muniNames = useExtra(loadMuniNames, !!data && firstScreen, false, true)
  const intensity = useExtra(loadIntensity, !!data && firstScreen, tab === 'season', true)
  useEffect(() => {
    if (recurrence) setPeriod([Math.max(recurrence.first, recurrence.last - 9), recurrence.last])
  }, [recurrence])

  // "Print report" (#16): the report mounts only while the page prints (Ctrl+P or the button), in the light theme
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    // beforeprint can fire twice before one afterprint (the button, then the browser): keep the first theme
    let saved: string | null = null
    const before = () => {
      if (saved === null) saved = document.documentElement.dataset.theme ?? 'dark'
      document.documentElement.dataset.theme = 'light'
      flushSync(() => setPrinting(true))
    }
    const after = () => {
      if (saved !== null) document.documentElement.dataset.theme = saved
      saved = null
      setPrinting(false)
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  // before the effects of the map run: it reads the theme's colours from the CSS variables
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* not persisted; still applied */ }
  }, [theme])

  // Drawn or typed areas are read from the tile files; Brazil, states and biomes come from the series files.
  useEffect(() => {
    if (!data || area.kind !== 'ring') { setRingSeries(null); return }
    let cancelled = false
    setAreaLoading(true)
    setAreaError(null)
    seriesForRing(area.ring, area.label, data.areas.BR, data.manifest, area.parts)
      .then((s) => { if (!cancelled) setRingSeries(s) })
      .catch((e: Error) => { if (!cancelled) setAreaError(e.message) })
      .finally(() => { if (!cancelled) setAreaLoading(false) })
    return () => { cancelled = true }
  }, [data, area])

  const series: AreaSeries | null = !data ? null
    : area.kind === 'country' ? data.areas.BR
    : area.kind === 'state' ? data.areas[area.uf]
    : area.kind === 'biome' ? biomes?.areas[area.id] ?? null
    : ringSeries

  const lastYear = data ? Number(data.manifest.last_month.slice(0, 4)) : 2026
  const endYear = toYear ?? lastYear
  const partialMonth = data ? data.manifest.last_month.slice(0, 7) : ''
  const partialDays = data?.manifest.last_month_days ?? 0
  const dateLabel = data ? i.day(data.manifest.data_date, false) : ''
  const dataDate = data ? i.day(data.manifest.data_date) : ''

  // This year against previous years for every state and biome: the map layer, its popover and the pickers.
  const standings = useMemo(() => (data ? standingsOf(data.areas, data.stateList.map((s) => s.uf), partialMonth, partialDays) : {}), [data, partialMonth, partialDays])
  const biomeStandings = useMemo(() => (biomes ? standingsOf(biomes.areas, Object.keys(biomes.areas), partialMonth, partialDays) : {}), [biomes, partialMonth, partialDays])
  const status = useMemo(() => (areaLoading ? null : yearStatus(series, partialMonth, partialDays)), [series, areaLoading, partialMonth, partialDays])

  const biomeInfo = area.kind === 'biome' ? biomes?.list.find((b) => b.id === area.id) : undefined
  const areaName = !data ? i.t('kindBrazil')
    : area.kind === 'country' ? i.t('kindBrazil')
    : area.kind === 'state' ? data.areas[area.uf].name
    : area.kind === 'biome' ? biomeInfo?.name ?? i.t('kindBiome')
    : area.origin === 'draw' ? i.t('kindDrawn')
    : area.origin === 'circle' && area.circle ? i.t('circleLabel', { km: area.circle.km, lat: area.circle.lat.toFixed(2), lon: area.circle.lon.toFixed(2) })
    : area.label
  const kindLabel = (() => {
    if (area.kind === 'country') return i.t('wholeCountry')
    if (area.kind === 'state') return i.t('kindState')
    if (area.kind === 'biome') return i.t('kindBiomeLimits')
    if (area.origin === 'muni') return i.t('kindMuni')
    if (area.origin === 'circle') return i.t('kindCircle')
    const [w, s, e, n] = ringBounds(area.ring)
    return i.t('coords', { s: s.toFixed(2), w: w.toFixed(2), n: n.toFixed(2), e: e.toFixed(2) })
  })()
  const km2 = series?.area_km2 ?? biomeInfo?.area_km2
  // "No data here" only for an area with no detections at all whose cells all lie outside Brazil (sea, other
  // countries); a quiet area inside Brazil reads as a quiet area
  const outlines = useMemo(() => (data ? outlinesOf(data.states) : []), [data])
  const empty = useMemo(() => {
    if (area.kind !== 'ring' || !ringSeries || ringSeries.value.some((v) => v > 0)) return false
    return !anyCellInBrazil(cellsInRings(area.ring, area.parts).cells, outlines)
  }, [area, ringSeries, outlines])

  const areaBounds = useMemo((): [number, number, number, number] | null => {
    if (!data) return null
    if (area.kind === 'state') return data.stateList.find((s) => s.uf === area.uf)?.bbox ?? null
    if (area.kind === 'ring') return ringBounds(area.parts ? [...area.ring, ...area.parts.flat()] : area.ring)
    if (area.kind === 'biome') return biomes?.list.find((b) => b.id === area.id)?.bbox ?? null
    return null
  }, [data, area, biomes])

  /** series for a ranking or comparison key: a state code, or "bio:<id>" for a biome */
  const seriesFor = useCallback((key: string): AreaSeries | null => {
    if (key.startsWith('bio:')) return biomes?.areas[key.slice(4)] ?? null
    return data?.areas[key] ?? null
  }, [data, biomes])
  // key of the selected area in intensity.json and in the ranking (null for drawn areas and municipalities)
  const areaKey = area.kind === 'country' ? 'BR' : area.kind === 'state' ? area.uf : area.kind === 'biome' ? area.id : null

  // Choosing an area closes the tablet drawer, so the answer comes straight into view; phones keep their sheet.
  const chooseArea = useCallback((next: Area) => {
    setArea(next)
    setAreaError(null)
    setFiltersOpen(false)
  }, [])
  const pickState = useCallback((uf: string) => {
    setArea({ kind: 'state', uf })
    setFiltersOpen(false)
    setSheet('peek')
  }, [])
  const pickBiome = useCallback((id: string) => {
    setArea({ kind: 'biome', id })
    setFiltersOpen(false)
    setSheet('peek')
  }, [])
  const pickMuni = useCallback((id: string, uf: string, name: string) => {
    muniOutline(id, uf).then((m) => {
      if (m) setArea({ kind: 'ring', ring: m.ring, parts: m.parts, label: `${name}, ${uf}`, origin: 'muni', muni: id })
      else setAreaError(`muni:${name}`)
    })
    setFiltersOpen(false)
    setSheet('peek')
  }, [])
  const toggleCompare = useCallback((key: string) => {
    setCompare((c) => (c.includes(key) ? c.filter((x) => x !== key) : c.length < MAX_COMPARE ? [...c, key] : c))
  }, [])

  const onDrawn = useCallback((ring: Ring) => {
    setDrawMode('none')
    setSheet('peek')
    // 3 decimals (~110 m, well inside a 0.1° cell), as the shared link carries it: a link reopens the same numbers
    const r3 = (v: number) => Math.round(v * 1000) / 1000
    setArea({ kind: 'ring', ring: ring.map(([lon, lat]) => [r3(lon), r3(lat)] as [number, number]), label: 'Drawn area', origin: 'draw' })
  }, [])
  // On tablets the drawer covers the map; close it while the user draws.
  const startDraw = useCallback((mode: DrawMode) => {
    setDrawMode(mode)
    if (mode !== 'none') setFiltersOpen(false)
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

  const years = Array.from({ length: lastYear - 2001 + 1 }, (_, k) => 2001 + k)

  // "About this area" (desktop sidebar, tablet data column)
  const km2s = km2 ? km2Text(km2, i) : ''
  const biomeStates = area.kind === 'biome' ? BIOME_STATES[area.id] : undefined
  const about: ReactNode = data && (
    <>
      <p className="m-0">
        {area.kind === 'country' ? i.t('aboutBrazil', { km2: km2s, states: data.stateList.length, biomes: biomes?.list.length ?? 6 })
          : area.kind === 'biome' && biomeStates ? (biomeStates.length > 1 ? i.t('aboutBiome', { km2: km2s, n: biomeStates.length, list: biomeStates.join(', ') }) : i.t('aboutBiome1', { km2: km2s, list: biomeStates[0] }))
          : area.kind === 'ring' && ringSeries ? i.t('aboutRing', { km2: km2s, cells: i.int(ringSeries.cells) })
          : km2 ? i.t('aboutPlain', { km2: km2s }) : ''}
      </p>
      {status && densityText(status, km2, i) && <p className="m-0">{densityText(status, km2, i)}</p>}
    </>
  )

  // shown in every layout: without them a failed or empty drawn area reads as "loading" or "no fires, as usual"
  const notices = (
    <>
      {areaError && <p className="m-0 text-[13px] text-unusual" role="alert">
        {areaError === 'shared-muni' ? i.t('sharedMuniError')
          : areaError.startsWith('muni:') ? i.t('muniLoadError', { name: areaError.slice(5) }) : i.t('areaLoadError', { msg: areaError })}</p>}
      {empty && <p className="m-0 text-[13px] text-ink-3" role="status">{i.t('emptyArea')}</p>}
      {area.kind === 'ring' && ringSeries?.approximate && !empty && <p className="m-0 text-[13px] text-ink-3" role="status">{i.t('approxArea')}</p>}
    </>
  )

  const filterProps = data && {
    data, area, onArea: chooseArea, drawMode, onDrawMode: startDraw, layer, onLayer: setLayer,
    biomes: biomes?.list ?? [], munis: muniNames ?? null, onPickMuni: pickMuni,
    biomeBorders, onBiomeBorders: setBiomeBorders, stateBorders, onStateBorders: setStateBorders, places, onPlaces: setPlaces,
    recurrenceYears: recurrence ? [recurrence.first, recurrence.last] as [number, number] : recurrence, period, onPeriod: setPeriod,
    recentSpan: recent ? i.t('dateRange', { a: recent.from, b: recent.to }) : recent,
    view, onView: setView, sat, onSat: setSat,
    years, fromYear, toYear: endYear, onRange: (f: number, t: number) => { setFromYear(f); setToYear(t) },
    canDownload: !!series && !areaLoading, onDownload: download, onPrint: () => window.print(),
  }

  const drawing = drawMode !== 'none'
  // the phone sheet peeks at 300 px, less on short screens so the map keeps some room
  const peekHeight = Math.max(236, Math.min(300, Math.round(viewportH * 0.46)))
  const phoneInset = !phone ? 0 : drawing ? parseInt(SHEET_HEIGHT.draw, 10) : sheet === 'peek' ? peekHeight : 96
  // the plain map follows the theme in place; the basemap has a style per theme, so it is rebuilt
  const partFailed = (
    <div role="alert" className="flex h-full flex-col items-start justify-center gap-3 bg-map-bg p-6 text-sm text-ink-2">
      <p className="m-0 max-w-[40ch]">{i.t('partFailed')}</p>
      <button type="button" className="btn" onClick={() => window.location.reload()}>{i.t('reload')}</button>
    </div>
  )
  const map = data && (
    <LoadBoundary fallback={partFailed}>
      <Suspense fallback={<div className="h-full bg-map-bg" />}>
        <MapView key={places ? `places-${theme}` : 'plain'} theme={theme} places={places} states={data.states} stateCode={area.kind === 'state' ? area.uf : null}
          ring={area.kind === 'ring' ? area.ring : null} parts={area.kind === 'ring' ? area.parts : undefined} bounds={areaBounds} drawMode={drawMode} onDrawn={onDrawn} confirmBox={confirmBox}
          layer={layer} standings={standings} biomeStandings={biomeStandings} normalUnit={area.kind === 'biome' && biomes ? 'biome' : 'state'}
          dateLabel={dateLabel} onPickState={pickState} onPickBiome={pickBiome} compact={phone} className="h-full"
          biomes={biomes?.outlines ?? null} biomeId={area.kind === 'biome' ? area.id : null} biomeBorders={biomeBorders} stateBorders={stateBorders}
          recurrence={recurrence ?? null} period={period} recent={recent ?? null} controls={!phone} touchControls={!desktop} onShowBrazil={() => chooseArea({ kind: 'country' })}
          bottomInset={phoneInset} />
      </Suspense>
    </LoadBoundary>
  )

  const panelProps = data && {
    // states and biomes keep their names from the data; Brazil and drawn areas follow the language
    data, series, loading: areaLoading, areaName: series?.name && (area.kind === 'state' || area.kind === 'biome') ? series.name : areaName,
    view, sat, fromYear, toYear: endYear, partialMonth, partialDays, dateLabel,
    tab, onTab: setTab, compare, onToggleCompare: toggleCompare, onSelectState: pickState, narrow: phone,
    biomes: biomes ?? null, munis: munis ?? null, onSelectBiome: pickBiome, onSelectMuni: pickMuni, seriesFor,
    selectedKey: area.kind === 'state' ? area.uf : area.kind === 'biome' ? `bio:${area.id}` : null,
    oni: oni ?? null, intensity: intensity ?? null, areaKey,
  }

  const summary = status ? summaryText(status, dateLabel, i) : null

  // The view in the URL (#5): a shared link reopens the same area, values and years. Read once the data is in (the
  // state codes and years come from it), then the URL follows every change without adding history entries.
  const [urlRead, setUrlRead] = useState(false)
  useEffect(() => {
    if (!data || urlRead) return
    const v = parseView(window.location.search, lastYear)
    if (v.sat) { setView('observed'); setSat(v.sat) }
    if (v.years) { setFromYear(v.years[0]); setToYear(v.years[1]) }
    const a = v.area
    if (a.kind === 'state') setArea({ kind: 'state', uf: a.uf })
    else if (a.kind === 'biome') setArea({ kind: 'biome', id: a.id })
    else if (a.kind === 'circle') {
      setArea({ kind: 'ring', ring: sharedCircleRing(a), label: `${a.km} km, ${a.lat.toFixed(2)}°, ${a.lon.toFixed(2)}°`, origin: 'circle', circle: { lat: a.lat, lon: a.lon, km: a.km } })
    } else if (a.kind === 'polygon') setArea({ kind: 'ring', ring: a.ring, label: 'Drawn area', origin: 'draw' })
    else if (a.kind === 'muni') {
      // the URL keeps "m:…" until the outline is in, so a reload meanwhile still opens the municipality
      muniOutline(a.id, a.uf).then((m) => {
        if (m) setArea({ kind: 'ring', ring: m.ring, parts: m.parts, label: `${m.name}, ${a.uf}`, origin: 'muni', muni: a.id })
        else setAreaError('shared-muni')
        setUrlRead(true)
      })
      return
    }
    setUrlRead(true)
  }, [data, urlRead, lastYear])
  const shared: SharedView = useMemo(() => ({
    area: area.kind === 'country' ? { kind: 'country' }
      : area.kind === 'state' ? { kind: 'state', uf: area.uf }
      : area.kind === 'biome' ? { kind: 'biome', id: area.id }
      : area.origin === 'muni' && area.muni ? { kind: 'muni', id: area.muni, uf: area.label.slice(-2) }
      : area.origin === 'circle' && area.circle ? { kind: 'circle', ...area.circle }
      : { kind: 'polygon', ring: area.ring },
    sat: view === 'observed' ? sat : null,
    years: [fromYear, endYear],
    lang,
  }), [area, view, sat, fromYear, endYear, lang])
  useEffect(() => {
    if (!urlRead) return
    const next = viewUrl(window.location.href, shared, lastYear)
    if (next !== window.location.href) window.history.replaceState(window.history.state, '', next)
  }, [urlRead, shared, lastYear])
  const shareUrl = viewUrl(`${window.location.origin}${window.location.pathname}`, shared, lastYear)
  // #5: the message says the area, this month, its ratio to the usual pace and whether that is unusual, then the link
  const monthLine = useMemo(() => {
    if (!series || areaLoading) return null
    const t = series.months.indexOf(partialMonth)
    if (t < 0) return null
    const cmp = compareMonth(series.months, series.value, t, partialDays)
    const [y, m] = partialMonth.split('-').map(Number)
    const month = `${i.monthShort(m - 1)} ${y}`
    const verdict = i.t(cmp.unusual ? 'shareUnusual' : 'shareUsual')
    return cmp.ratio !== null
      ? i.t('shareMonth', { month, n: i.det(cmp.value), r: i.one(cmp.ratio), verdict })
      : i.t('shareMonthNoRatio', { month, n: i.det(cmp.value) })
  }, [series, areaLoading, partialMonth, partialDays, i])
  const answer = [monthLine, summary].filter(Boolean).join(' ') || null
  const share = <SharePanel url={shareUrl} text={shareText(areaName, answer, shareUrl)} touch={!desktop} />
  const drawHint = drawing && (
    <p role="status" className="float absolute inset-x-3 top-3 z-10 m-0 rounded-xl border border-brand bg-surface px-4 py-3 text-sm">
      {drawMode === 'rectangle' ? i.t('tapRect') : i.t('tapPoly')}{' '}
      <button type="button" className="font-semibold text-link underline" onClick={() => setDrawMode('none')}>{i.t('cancel')}</button>
    </p>
  )

  const method = page === 'method' && (
    <LoadBoundary fallback={<main className="h-[60dvh]">{partFailed}</main>}>
      <Suspense fallback={<main className="p-6"><p className="py-12 text-ink-2" aria-busy="true">{i.t('loadingData')}</p></main>}>
        <Method manifest={data?.manifest ?? null} repo={REPO} brazil={data?.areas.BR ?? null} phone={phone} />
      </Suspense>
    </LoadBoundary>
  )

  // The calendar page. It stays mounted, hidden, while the Method page shows: coming back does not rebuild the map
  // (a WebGL context, its workers and about a second of work on a slow phone) and keeps its view, tab and scroll.
  let body: ReactNode
  if (loadError) {
    body = (
      <main className="p-6" role="alert">
        <p className="text-ink-2">{i.t('loadError', { msg: loadError })}</p>
        <button type="button" className="btn" onClick={load}>{i.t('tryAgain')}</button>
      </main>
    )
  } else if (!data || !filterProps || !panelProps) {
    body = <main className="p-6"><p className="py-12 text-ink-2" aria-busy="true">{i.t('loadingData')}</p></main>
  } else if (desktop) {
    const cols = wide ? '300px minmax(0,1fr) 460px' : '260px minmax(0,1fr) 400px'
    body = (
      <main className="grid h-[calc(100dvh-56px)] overflow-hidden"
        style={{ gridTemplateColumns: dataCollapsed ? cols.split(' ').slice(0, 2).join(' ') : cols }}>
        <aside className="relative overflow-y-auto border-r border-line bg-surface p-5" aria-label={i.t('filters')}>
          <AreaPanel {...filterProps} about={about} share={share} />
        </aside>
        <section className="relative min-w-0" aria-label={i.t('mapRegion')}>
          {map}
          {drawHint}
          {dataCollapsed && (
            <button type="button" className="btn float absolute right-16 top-4 z-10 !bg-surface" onClick={() => setDataCollapsed(false)}>
              <ChevronLeft size={16} aria-hidden="true" /> {i.t('showData')}
            </button>
          )}
        </section>
        {!dataCollapsed && (
          <aside id="data" tabIndex={-1} className="flex min-h-0 flex-col border-l border-line bg-surface outline-none" aria-label={i.t('dataRegion')}>
            <div className="flex flex-none flex-col gap-3 px-[22px] pt-5">
              <div className="flex items-start gap-3">
                <div className="flex grow flex-col gap-0.5">
                  <h1 className="m-0 text-xl font-bold tracking-[-0.01em]">{areaName}</h1>
                  <span className="text-xs text-ink-3">{kindLabel}</span>
                </div>
                <button type="button" className="ico !size-9" aria-label={i.t('collapseData')} onClick={() => setDataCollapsed(true)}><ChevronRight size={18} aria-hidden="true" /></button>
              </div>
              <p className="m-0 text-[15px] leading-[1.45]">{summary ?? i.t('loadingHistory')}</p>
              {status && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <StatusPill percentile={status.percentile} />
                  <span className="text-[13px] text-ink-3">{percentileText(status, i)}</span>
                </div>
              )}
              {notices}
              <TabList tab={tab} onTab={setTab} labels={tabLabels(lastYear, i)} tabStyle="underline" />
            </div>
            {/* relative: the screen-reader tables (position: absolute) stay inside this scroll box */}
            <div className="relative min-h-0 flex-1 overflow-y-auto px-[22px] pb-6">
              <DataPanel {...panelProps} tabStyle="underline" hideTabs />
            </div>
          </aside>
        )}
      </main>
    )
  } else if (!phone) {
    body = (
      <main>
        <section className="relative h-[520px] max-h-[55dvh] min-h-[360px]" aria-label={i.t('mapRegion')}>
          {map}
          {drawHint || (
            <div className="touch absolute left-4 top-4 z-10">
              <button type="button" className="btn float !bg-surface" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal size={18} aria-hidden="true" /> {i.t('areaAndLayers')}
              </button>
            </div>
          )}
        </section>
        <section id="data" tabIndex={-1} className="grid grid-cols-[260px_minmax(0,1fr)] gap-6 border-t border-line bg-surface px-6 pt-5 pb-8 outline-none max-[719px]:grid-cols-1" aria-label={i.t('dataRegion')}>
          <div className="flex flex-col gap-3 self-start min-[720px]:sticky min-[720px]:top-4">
            <div className="flex flex-col gap-1">
              <h1 className="m-0 text-xl font-semibold">{areaName}</h1>
              <span className="text-xs text-ink-3">{kindLabel}</span>
            </div>
            <p className="m-0 text-base leading-[1.45]">{summary ?? i.t('loadingHistory')}</p>
            {status && <div><StatusPill percentile={status.percentile} /></div>}
            {status && <span className="text-[13px] text-ink-3">{percentileText(status, i)}</span>}
            <div className="flex flex-col gap-1 text-sm leading-[1.45] text-ink-2">{about}</div>
            {notices}
            <button type="button" className="btn touch mt-2 !min-h-12 !rounded-xl !text-sm !font-semibold" onClick={download} disabled={!filterProps.canDownload}>
              <Download size={18} aria-hidden="true" /> {i.t('downloadCsv')}
            </button>
            <button type="button" className="btn touch !min-h-12 !rounded-xl !text-sm" onClick={() => window.print()} disabled={!filterProps.canDownload}>
              <Printer size={18} aria-hidden="true" /> {i.t('printReport')}
            </button>
            <div className="mt-2">{share}</div>
          </div>
          <div className="min-w-0">
            <DataPanel {...panelProps} tabStyle="segment" />
          </div>
        </section>
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent side="left" showCloseButton={false} className="w-[380px] max-w-[90vw] gap-0 p-0 sm:max-w-[380px]">
            <SheetHeader className="flex h-16 flex-none flex-row items-center gap-3 border-b border-line py-0 pr-2 pl-6">
              <SheetTitle className="m-0 flex-1 text-xl font-semibold">{i.t('areaAndLayers')}</SheetTitle>
              <SheetDescription className="sr-only">{i.t('areaAndLayersDesc')}</SheetDescription>
              <button type="button" className="ico touch !border-0 !bg-transparent" aria-label={i.t('closeAreaLayers')} onClick={() => setFiltersOpen(false)}><X size={20} aria-hidden="true" /></button>
            </SheetHeader>
            <div className="relative min-h-0 flex-1 overflow-y-auto p-6">
              <AreaPanel {...filterProps} touch />
            </div>
            <div className="touch flex-none border-t border-line px-6 pt-4 pb-6">
              <button type="button" className="btn main w-full" onClick={() => setFiltersOpen(false)}>{i.t('showOnMap')}</button>
            </div>
          </SheetContent>
        </Sheet>
      </main>
    )
  } else {
    body = (
      <PhoneLayout data={data} area={area} onArea={chooseArea} onPickMuni={pickMuni} name={areaName} kindLabel={kindLabel} dataDate={dataDate}
        summary={summary} percentile={status?.percentile ?? null} percentileText={status ? percentileText(status, i, true) : null}
        view={sheet} onView={setSheet} peekHeight={peekHeight} map={map} notices={notices}
        tabs={<TabList tab={tab} onTab={setTab} labels={tabLabels(lastYear, i, true)} tabStyle="segment" />}
        panel={<DataPanel {...panelProps} tabStyle="segment" hideTabs />}
        canDownload={filterProps.canDownload} onDownload={download} share={share}
        drawMode={drawMode} onDrawMode={startDraw} onConfirmBox={() => setConfirmBox((n) => n + 1)}
        biomes={biomes?.list ?? []} standings={standings} biomeStandings={biomeStandings}
        munis={muniNames ?? null} layer={layer} onLayer={setLayer} recurrenceYears={filterProps.recurrenceYears} period={period} onPeriod={setPeriod}
        recentSpan={filterProps.recentSpan} values={view} onValues={setView} sat={sat} onSat={setSat} biomeBorders={biomeBorders} onBiomeBorders={setBiomeBorders}
        stateBorders={stateBorders} onStateBorders={setStateBorders} places={places} onPlaces={setPlaces} lang={lang} onLang={onLang}
        theme={theme} onTheme={setTheme} />
    )
  }

  const navLink = 'flex h-9 items-center rounded-lg px-3.5 text-sm text-ink-2 no-underline hover:text-ink aria-[current=page]:bg-nav-on aria-[current=page]:font-semibold aria-[current=page]:text-ink max-[1100px]:min-h-11 max-[1100px]:rounded-[10px] max-[1100px]:px-3'
  const langSelect = (
    <label className="flex h-9 items-center gap-1.5 rounded-lg border border-line-2 px-2.5 text-ink-2 max-[1100px]:h-11 max-[1100px]:rounded-[10px]">
      <Globe size={16} aria-hidden="true" />
      <span className="sr-only">{i.t('language')}</span>
      <select className="border-0 bg-transparent text-[13px] text-ink outline-none [&>option]:bg-surface" value={lang} onChange={(e) => onLang(e.target.value as Lang)}>
        <option value="en" lang="en">{shortLang ? 'EN' : 'English'}</option>
        <option value="pt" lang="pt-BR">{shortLang ? 'PT' : 'Português'}</option>
      </select>
    </label>
  )
  const themeButton = (
    <button type="button" className="ico !h-9 !w-9 max-[1100px]:!size-11" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? i.t('toLight') : i.t('toDark')}>
      {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  )
  const header = phone ? (
    page === 'method' ? (
      <header className="touch sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-surface pr-4 pl-1">
        <a href="#" className="ico !border-0 !bg-transparent !text-ink" aria-label={i.t('backToMap')}><ChevronLeft size={22} aria-hidden="true" /></a>
        <span className="flex-1 text-lg font-semibold">{i.t('navMethod')}</span>
        {langSelect}
        {themeButton}
      </header>
    ) : null
  ) : (
    <header className="flex h-14 flex-none items-center gap-4 border-b border-line bg-surface px-5 max-[1100px]:h-16 max-[1100px]:gap-3 max-[1100px]:pr-4 max-[1100px]:pl-6">
      {/* keyboard users skip the header and the filters; shown when focused */}
      {page === 'calendar' && data && (
        <a href="#data" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#1A0C02]"
          onClick={(e) => { e.preventDefault(); document.getElementById('data')?.focus() }}>
          {i.t('skipToData')}
        </a>
      )}
      <a href="#" className="flex min-h-11 items-center gap-2.5 text-ink no-underline">
        <Logo />
        <span className="flex flex-col leading-[1.15]">
          <span className="text-base font-bold tracking-[-0.01em]">Jangada Orbital</span>
          <span className="text-xs text-ink-3 max-[1100px]:hidden">{i.t('tagline')}</span>
        </span>
      </a>
      <span className="grow" />
      {data && (
        <span className="flex h-8 items-center gap-2 rounded-2xl bg-surface-2 px-3 text-[13px] text-ink-2 max-[1100px]:bg-transparent max-[1100px]:px-0 max-[1100px]:text-xs max-[1100px]:text-ink-3 max-[719px]:hidden">
          <span className="size-2 rounded-full bg-live max-[1100px]:hidden" aria-hidden="true" />{i.t('dataThrough', { date: dataDate })}
        </span>
      )}
      <nav aria-label="Main" className="flex gap-1">
        <a href="#" className={navLink} aria-current={page === 'calendar' ? 'page' : undefined}>{i.t('navCalendar')}</a>
        <a href="#method" className={navLink} aria-current={page === 'method' ? 'page' : undefined}>{i.t('navMethod')}</a>
      </nav>
      {langSelect}
      {themeButton}
      <a className="inline-flex min-h-9 items-center text-[13px] text-link no-underline hover:underline max-[1100px]:-mx-1.5 max-[1100px]:min-h-11 max-[1100px]:min-w-11 max-[1100px]:justify-center max-[1100px]:px-1.5" href={REPO} target="_blank" rel="noreferrer">
        {i.t('code')}<span className="sr-only">{i.t('codeSr')}</span>
      </a>
    </header>
  )

  return (
    <>
      {header}
      {method}
      {/* display: contents keeps the layouts' own boxes; [hidden] wins over it (Tailwind preflight, !important) */}
      {calendarSeen && <div className="contents" hidden={page === 'method'}>{body}</div>}
      {printing && data && series && (
        <PrintReport series={series} areaName={panelProps?.areaName ?? areaName} kindLabel={kindLabel} summary={summary}
          standing={status ? percentileText(status, i) : null} dataDate={dataDate} view={view} sat={sat}
          fromYear={fromYear} toYear={endYear} partialMonth={partialMonth} partialDays={partialDays} />
      )}
    </>
  )
}
