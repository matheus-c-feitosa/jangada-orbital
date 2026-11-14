import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, MapPinned, Moon, Pentagon, RectangleHorizontal, Sun, Crosshair, ExternalLink } from 'lucide-react'
import { loadAppData, SATELLITES, type AppData, type AreaSeries, type Satellite } from './data/load'
import { seriesForRing } from './data/queries'
import { buildCsv, csvFileName, downloadText } from './data/csv'
import { circleRing, ringBounds, type Ring } from './geo/aoi'
import { compareMonth } from './calendar/stats'
import { AnswerLine } from './calendar/AnswerLine'
import { CalendarTable } from './calendar/CalendarTable'
import { MapView, type DrawMode, type Theme } from './map/MapView'
import { Method } from './Method'

type Area = { kind: 'country' } | { kind: 'state'; uf: string } | { kind: 'ring'; ring: Ring; label: string }
type View = 'harmonized' | 'observed'

const REPO = 'https://github.com/matheus-c-feitosa/jangada-orbital'
const SAT_LABEL: Record<Satellite, string> = {
  Terra: 'Terra (MODIS)', Aqua: 'Aqua (MODIS)', 'S-NPP': 'Suomi NPP (VIIRS)', 'NOAA-20': 'NOAA-20 (VIIRS)', 'NOAA-21': 'NOAA-21 (VIIRS)',
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') return saved
  } catch { /* storage blocked: fall back to the device preference */ }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
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

export function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [page, setPage] = usePage()
  const [area, setArea] = useState<Area>({ kind: 'country' })
  const [ringSeries, setRingSeries] = useState<(AreaSeries & { cells: number }) | null>(null)
  const [areaLoading, setAreaLoading] = useState(false)
  const [areaError, setAreaError] = useState<string | null>(null)
  const [view, setView] = useState<View>('harmonized')
  const [sat, setSat] = useState<Satellite>('Aqua')
  const [fromYear, setFromYear] = useState(2001)
  const [toYear, setToYear] = useState<number | null>(null)
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [panelOpen, setPanelOpen] = useState(false)
  const [circle, setCircle] = useState({ lat: '-7.23', lon: '-39.31', km: '30' })
  const [circleError, setCircleError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    loadAppData().then(setData).catch((e: Error) => setLoadError(e.message))
  }, [])
  useEffect(load, [load])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('theme', theme) } catch { /* not persisted; still applied */ }
  }, [theme])

  // Drawn or typed areas are read from the Parquet files; Brazil and states come from series.json.
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

  const onDrawn = useCallback((ring: Ring) => {
    setDrawMode('none')
    const [w, s, e, n] = ringBounds(ring)
    setArea({ kind: 'ring', ring, label: `Drawn area (${s.toFixed(2)}°, ${w.toFixed(2)}° to ${n.toFixed(2)}°, ${e.toFixed(2)}°)` })
  }, [])

  const applyCircle = () => {
    const lat = Number(circle.lat), lon = Number(circle.lon), km = Number(circle.km)
    if (!Number.isFinite(lat) || lat < -34 || lat > 6) return setCircleError('Latitude must be between -34 and 6 (Brazil).')
    if (!Number.isFinite(lon) || lon < -74.5 || lon > -28) return setCircleError('Longitude must be between -74.5 and -28 (Brazil).')
    if (!Number.isFinite(km) || km < 5 || km > 500) return setCircleError('Radius must be between 5 and 500 km.')
    setCircleError(null)
    setArea({ kind: 'ring', ring: circleRing(lat, lon, km), label: `${km} km around ${lat.toFixed(2)}°, ${lon.toFixed(2)}°` })
  }

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

  const values = !series ? [] : view === 'harmonized' ? series.value : series.observed[sat]
  const years = Array.from({ length: lastYear - 2001 + 1 }, (_, i) => 2001 + i)
  const empty = series && ringSeries && area.kind === 'ring' && ringSeries.cells === 0

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#" onClick={() => setPage('calendar')}>Jangada Orbital <span>Harmonized fire calendar · Brazil</span></a>
        <nav aria-label="Main">
          {data && <span className="date num">Data through {data.manifest.data_date}</span>}
          <button className="navlink" aria-current={page === 'calendar' ? 'page' : undefined} onClick={() => setPage('calendar')}>Calendar</button>
          <button className="navlink" aria-current={page === 'method' ? 'page' : undefined} onClick={() => setPage('method')}>Method</button>
          <button className="navlink" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
          <a className="navlink" href={REPO} target="_blank" rel="noreferrer"><span className="label">Code</span><ExternalLink size={14} aria-label="Source code on GitHub" /></a>
        </nav>
      </header>

      {page === 'method' ? (
        <Method manifest={data?.manifest ?? null} repo={REPO} />
      ) : loadError ? (
        <main className="layout"><div className="status" role="alert">
          <p>The fire data could not be loaded ({loadError}).</p>
          <button className="btn" style={{ flex: 'none' }} onClick={load}>Try again</button>
        </div></main>
      ) : !data ? (
        <main className="layout"><p className="status" aria-busy="true">Loading 26 years of fire data…</p></main>
      ) : (
        <div className="layout">
          <button className="btn area-toggle" aria-expanded={panelOpen} aria-controls="area-panel" onClick={() => setPanelOpen(!panelOpen)}>
            <MapPinned size={18} aria-hidden="true" /> {panelOpen ? 'Hide area controls' : 'Choose area'}
          </button>
          <aside id="area-panel" className="panel" data-open={panelOpen} aria-label="Area and view">
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="field">
                <label htmlFor="state">Area</label>
                <select id="state" className="select" value={area.kind === 'state' ? area.uf : area.kind === 'country' ? 'BR' : ''}
                  onChange={(e) => setArea(e.target.value === 'BR' ? { kind: 'country' } : { kind: 'state', uf: e.target.value })}>
                  {area.kind === 'ring' && <option value="">{area.label}</option>}
                  <option value="BR">Brazil (all states)</option>
                  {data.stateList.map((s) => <option key={s.uf} value={s.uf}>{s.name}</option>)}
                </select>
              </div>
              <div className="field">
                <span className="label" id="draw-label">Or draw on the map</span>
                <div className="row" role="group" aria-labelledby="draw-label">
                  <button className="btn" aria-pressed={drawMode === 'rectangle'} onClick={() => setDrawMode(drawMode === 'rectangle' ? 'none' : 'rectangle')}>
                    <RectangleHorizontal size={16} aria-hidden="true" /> Rectangle
                  </button>
                  <button className="btn" aria-pressed={drawMode === 'polygon'} onClick={() => setDrawMode(drawMode === 'polygon' ? 'none' : 'polygon')}>
                    <Pentagon size={16} aria-hidden="true" /> Polygon
                  </button>
                </div>
                {drawMode !== 'none' && <p className="hint">{drawMode === 'rectangle' ? 'Click two opposite corners on the map.' : 'Click each corner; click the first point to close.'}</p>}
              </div>
              <form className="field" onSubmit={(e) => { e.preventDefault(); applyCircle() }}>
                <span className="label">Or a point and radius</span>
                <div className="circle-form">
                  <input className="input num" aria-label="Latitude" inputMode="decimal" value={circle.lat} onChange={(e) => setCircle({ ...circle, lat: e.target.value })} />
                  <input className="input num" aria-label="Longitude" inputMode="decimal" value={circle.lon} onChange={(e) => setCircle({ ...circle, lon: e.target.value })} />
                  <input className="input num" aria-label="Radius in km" inputMode="decimal" value={circle.km} onChange={(e) => setCircle({ ...circle, km: e.target.value })} />
                </div>
                <button className="btn" type="submit"><Crosshair size={16} aria-hidden="true" /> Use lat, lon, radius (km)</button>
                {circleError && <p className="error" role="alert">{circleError}</p>}
              </form>
            </div>
            <MapView key={theme} theme={theme} states={data.states} stateCode={area.kind === 'state' ? area.uf : null}
              ring={area.kind === 'ring' ? area.ring : null} bounds={areaBounds} drawMode={drawMode} onDrawn={onDrawn} />
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="field">
                <span className="label" id="view-label">Values</span>
                <div className="segmented" role="radiogroup" aria-labelledby="view-label">
                  {(['harmonized', 'observed'] as View[]).map((v) => (
                    <label key={v}><input type="radio" name="view" value={v} checked={view === v} onChange={() => setView(v)} /><span>{v === 'harmonized' ? 'Harmonized' : 'Observed'}</span></label>
                  ))}
                </div>
                {view === 'observed' && (
                  <select className="select" aria-label="Satellite" value={sat} onChange={(e) => setSat(e.target.value as Satellite)}>
                    {SATELLITES.map((s) => <option key={s} value={s}>{SAT_LABEL[s]}</option>)}
                  </select>
                )}
              </div>
              <div className="field">
                <span className="label">Years</span>
                <div className="row">
                  <select className="select num" aria-label="From year" value={fromYear} onChange={(e) => setFromYear(Math.min(Number(e.target.value), endYear))}>
                    {years.map((y) => <option key={y}>{y}</option>)}
                  </select>
                  <select className="select num" aria-label="To year" value={endYear} onChange={(e) => setToYear(Math.max(Number(e.target.value), fromYear))}>
                    {years.map((y) => <option key={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn primary" onClick={download} disabled={!series || areaLoading}><Download size={16} aria-hidden="true" /> Download CSV</button>
            </div>
          </aside>

          <main className="main">
            <AnswerLine areaName={areaName} comparison={comparison} loading={areaLoading || !series}
              cells={area.kind === 'ring' ? ringSeries?.cells : undefined} lastDayPartial={data.manifest.last_day_partial} />
            {areaError && <p className="error" role="alert">{areaError}</p>}
            {empty && <p className="hint" role="status">This area has no grid cells inside Brazil. Draw inside Brazil or pick a state.</p>}
            {series && !areaLoading && (
              <CalendarTable
                months={series.months}
                values={values}
                source={view === 'harmonized' ? series.source : null}
                fromYear={fromYear}
                toYear={endYear}
                partialMonth={partialMonth}
                partialDays={partialDays}
                caption={view === 'harmonized'
                  ? 'Fire detections per month, harmonized (Aqua-MODIS equivalent)'
                  : `Fire detections per month as delivered by ${SAT_LABEL[sat]} (not comparable across sensors)`}
              />
            )}
          </main>
        </div>
      )}
    </>
  )
}
