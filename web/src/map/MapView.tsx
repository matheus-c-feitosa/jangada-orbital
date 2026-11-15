import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibre, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type ImageSource, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 builds its worker URL at runtime, which bundlers cannot see; ship the worker as an asset instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
// terra-draw loads the first time someone draws (see the drawMode effect); only its type is needed up front
import type { TerraDraw } from 'terra-draw'
import { Flame, X } from 'lucide-react'
import type { Ring } from '../geo/aoi'
import { recurrenceClass, yearsWithFire, type Recent, type Recurrence } from '../data/extras'
import { ordinal, percentileClass, PERCENTILE_LABEL } from '../rank/ranking'

export type DrawMode = 'none' | 'rectangle' | 'polygon'
export type Theme = 'dark' | 'light'
/** data shown on the map, one at a time (spec 002, story 2 and FR-029) */
export type MapLayer = 'normal' | 'recurrence' | 'recent' | 'none'

export interface StateStanding {
  name: string
  ytd: number
  percentile: number
  first: number
  last: number
}

interface Props {
  theme: Theme
  states: GeoJSON.FeatureCollection
  /** highlighted state code, if the area is a state */
  stateCode: string | null
  /** outline of a drawn or typed area */
  ring: Ring | null
  bounds: [number, number, number, number] | null
  drawMode: DrawMode
  onDrawn: (ring: Ring) => void
  layer: MapLayer
  /** this year's standing of each state, by code */
  standings: Record<string, StateStanding>
  /** e.g. "14 Nov" */
  dateLabel: string
  onPickState: (uf: string) => void
  /** biome outlines (IBGE), the highlighted biome and whether every border is drawn */
  biomes: GeoJSON.FeatureCollection | null
  biomeId: string | null
  biomeBorders: boolean
  recurrence: Recurrence | null
  /** years counted by the recurrence layer */
  period: [number, number]
  recent: Recent | null
  /** smaller legend for phones (at most ~20% of the map) */
  compact?: boolean
  className?: string
}

setWorkerUrl(workerUrl)

const BASEMAP = { dark: 'https://tiles.openfreemap.org/styles/fiord', light: 'https://tiles.openfreemap.org/styles/positron' }
const BRAZIL: [number, number, number, number] = [-74, -34, -34.7, 5.4]
const OFFLINE_STYLE = (bg: string): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': bg } }],
})
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const one = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const DIV_VARS = ['--div0', '--div1', '--div2', '--div3', '--div4', '--div5', '--div6']
const RAMP_VARS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7']

/** fill colour per state code from its percentile class */
function anomalyColor(standings: Record<string, StateStanding>): ExpressionSpecification {
  const pairs = Object.entries(standings).flatMap(([uf, s]) => [uf, cssVar(DIV_VARS[percentileClass(s.percentile)])])
  return (pairs.length ? ['match', ['get', 'uf'], ...pairs, cssVar('--surface-2')] : ['to-color', cssVar('--surface-2')]) as ExpressionSpecification
}


/** The recurrence grid as one image (one pixel per 0.1° cell), drawn on a canvas and placed over Brazil. */
function recurrenceImage(r: Recurrence, from: number, to: number) {
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity
  for (const [la, lo] of r.cells) {
    latMin = Math.min(latMin, la); latMax = Math.max(latMax, la); lonMin = Math.min(lonMin, lo); lonMax = Math.max(lonMax, lo)
  }
  const w = lonMax - lonMin + 1
  const h = latMax - latMin + 1
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const colors = RAMP_VARS.map(cssVar)
  const span = to - from + 1
  for (const [la, lo, mask] of r.cells) {
    const c = recurrenceClass(yearsWithFire(mask, r.first, from, to), span)
    if (!c) continue
    ctx.fillStyle = colors[c - 1]
    ctx.fillRect(lo - lonMin, latMax - la, 1, 1)
  }
  const west = lonMin / 10, east = (lonMax + 1) / 10, north = (latMax + 1) / 10, south = latMin / 10
  return {
    url: canvas.toDataURL(),
    coordinates: [[west, north], [east, north], [east, south], [west, south]] as [[number, number], [number, number], [number, number], [number, number]],
  }
}

function recentGeoJson(r: Recent | null): GeoJSON.FeatureCollection {
  if (!r) return EMPTY
  return {
    type: 'FeatureCollection',
    features: r.cells.map(([la, lo, n, eq, , , , , above], i) => ({
      type: 'Feature', id: i, properties: { i, n, eq, above: above ? 1 : 0 },
      geometry: { type: 'Point', coordinates: [(lo + 0.5) / 10, (la + 0.5) / 10] },
    })),
  }
}

function addOverlays(map: MapLibre, states: GeoJSON.FeatureCollection) {
  const area = cssVar('--map-area')
  if (!map.getSource('states')) map.addSource('states', { type: 'geojson', data: states })
  if (!map.getSource('recurrence')) {
    map.addSource('recurrence', { type: 'image', url: BLANK, coordinates: [[-74, 5.4], [-34.7, 5.4], [-34.7, -34], [-74, -34]] })
    map.addLayer({ id: 'recurrence', type: 'raster', source: 'recurrence', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.9, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } })
  }
  if (!map.getLayer('anomaly-fill')) {
    map.addLayer({ id: 'anomaly-fill', type: 'fill', source: 'states', layout: { visibility: 'none' }, paint: { 'fill-color': cssVar('--surface-2'), 'fill-opacity': 0.85 } })
  }
  if (!map.getLayer('states-hit')) {
    map.addLayer({ id: 'states-hit', type: 'fill', source: 'states', paint: { 'fill-color': '#000000', 'fill-opacity': 0 } })
  }
  if (!map.getSource('area')) map.addSource('area', { type: 'geojson', data: EMPTY })
  if (!map.getSource('biomes')) map.addSource('biomes', { type: 'geojson', data: EMPTY })
  if (!map.getLayer('states-line')) {
    map.addLayer({ id: 'states-line', type: 'line', source: 'states', paint: { 'line-color': cssVar('--ink-3'), 'line-width': 0.6, 'line-opacity': 0.7 } })
  }
  if (!map.getLayer('biomes-line')) {
    map.addLayer({ id: 'biomes-line', type: 'line', source: 'biomes', layout: { visibility: 'none' }, paint: { 'line-color': cssVar('--ink'), 'line-width': 1.4, 'line-dasharray': [3, 2] } })
    map.addLayer({ id: 'biome-fill', type: 'fill', source: 'biomes', filter: ['==', ['get', 'id'], ''], paint: { 'fill-color': area, 'fill-opacity': 0.12 } })
    map.addLayer({ id: 'biome-line', type: 'line', source: 'biomes', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': area, 'line-width': 2.5 } })
  }
  if (!map.getLayer('state-fill')) {
    map.addLayer({ id: 'state-fill', type: 'fill', source: 'states', filter: ['==', ['get', 'uf'], ''], paint: { 'fill-color': area, 'fill-opacity': 0.18 } })
    map.addLayer({ id: 'state-line', type: 'line', source: 'states', filter: ['==', ['get', 'uf'], ''], paint: { 'line-color': area, 'line-width': 2 } })
  }
  if (!map.getLayer('area-fill')) {
    map.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': area, 'fill-opacity': 0.18 } })
    map.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': area, 'line-width': 2 } })
  }
  if (!map.getSource('recent')) {
    map.addSource('recent', { type: 'geojson', data: EMPTY })
    map.addLayer({
      id: 'recent', type: 'circle', source: 'recent', layout: { visibility: 'none' },
      paint: {
        'circle-color': cssVar('--c6'),
        'circle-opacity': 0.85,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['step', ['get', 'n'], 1.6, 5, 2.4, 20, 3.4], 7, ['step', ['get', 'n'], 4, 5, 6, 20, 9]],
        'circle-stroke-width': ['case', ['==', ['get', 'above'], 1], 1.6, 0],
        'circle-stroke-color': cssVar('--unusual'),
      },
    })
  }
}

type Pop =
  | { kind: 'state'; uf: string; x: number; y: number }
  | { kind: 'cell'; lat: number; lon: number; x: number; y: number }
  | { kind: 'recent'; i: number; x: number; y: number }

/** Map with state and biome outlines, the selected area, data layers and rectangle/polygon drawing. Remount it (key)
 * to change theme. */
export function MapView(p: Props) {
  const { theme, states, stateCode, ring, bounds, drawMode, onDrawn, layer, standings, dateLabel, onPickState, compact, className } = p
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibre | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)
  const onDrawnRef = useRef(onDrawn)
  onDrawnRef.current = onDrawn
  const [ready, setReady] = useState(false)
  const [offline, setOffline] = useState(false)
  const [pop, setPop] = useState<Pop | null>(null)
  const drawModeRef = useRef(drawMode)
  drawModeRef.current = drawMode
  const layerRef = useRef(layer)
  layerRef.current = layer
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds

  // cell index of the recurrence masks, for the cell popover
  const masks = useMemo(() => {
    const m = new Map<number, number>()
    for (const [la, lo, mask] of p.recurrence?.cells ?? []) m.set(la * 10000 + lo, mask)
    return m
  }, [p.recurrence])

  useEffect(() => {
    if (!container.current) return
    const map = new MapLibre({
      container: container.current,
      style: BASEMAP[theme],
      bounds: BRAZIL,
      fitBoundsOptions: { padding: 12 },
      attributionControl: { compact: false },
      dragRotate: false,
      pitchWithRotate: false,
    })
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __map?: MapLibre }).__map = map // inspection in dev only
    // the map lives in panels that open, close and resize; keep the canvas in step with its box
    // and keep the selected area framed when the box changes (panels opening, phone rotation)
    let frame = 0
    const resize = new ResizeObserver(() => {
      map.resize()
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => map.fitBounds(boundsRef.current ?? BRAZIL, { padding: 24, maxZoom: 7.5, duration: 0 }))
    })
    resize.observe(container.current)
    let loaded = false
    const goOffline = () => {
      if (loaded) return
      loaded = true
      setOffline(true)
      map.setStyle(OFFLINE_STYLE(cssVar('--surface-2')))
    }
    const timer = window.setTimeout(goOffline, 8000)
    map.on('error', (e) => {
      if (!map.isStyleLoaded() && !loaded) goOffline()
      else console.warn('map:', e.error?.message)
    })
    map.on('style.load', () => {
      window.clearTimeout(timer)
      addOverlays(map, states)
      loaded = true
      setReady(true)
    })
    map.on('click', (e) => {
      if (drawModeRef.current !== 'none') return
      const l = layerRef.current
      if (l === 'recent') {
        const f = map.queryRenderedFeatures(e.point, { layers: ['recent'] })[0]
        if (f) return setPop({ kind: 'recent', i: Number(f.properties?.i), x: e.point.x, y: e.point.y })
      }
      if (l === 'recurrence') {
        return setPop({ kind: 'cell', lat: Math.floor(e.lngLat.lat * 10), lon: Math.floor(e.lngLat.lng * 10), x: e.point.x, y: e.point.y })
      }
      const uf = map.queryRenderedFeatures(e.point, { layers: ['states-hit'] })[0]?.properties?.uf as string | undefined
      setPop(uf ? { kind: 'state', uf, x: e.point.x, y: e.point.y } : null)
    })
    map.on('dragstart', () => setPop(null))
    return () => {
      window.clearTimeout(timer)
      resize.disconnect()
      drawRef.current?.stop()
      drawRef.current = null
      map.remove()
      mapRef.current = null
    }
    // Runs once: a theme change remounts the component (key), and states never change after load.
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const filter = ['==', ['get', 'uf'], stateCode ?? ''] as ['==', ['get', string], string]
    map.setFilter('state-fill', filter)
    map.setFilter('state-line', filter)
    const bfilter = ['==', ['get', 'id'], p.biomeId ?? ''] as ['==', ['get', string], string]
    map.setFilter('biome-fill', bfilter)
    map.setFilter('biome-line', bfilter)
    const data: GeoJSON.FeatureCollection = ring
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] }
      : EMPTY
    ;(map.getSource('area') as GeoJSONSource | undefined)?.setData(data)
    map.fitBounds(bounds ?? BRAZIL, { padding: 24, maxZoom: 7.5, duration: 600 })
  }, [ready, stateCode, ring, bounds, p.biomeId])

  // Outlines go to the map only while something shows them (borders on, or a biome selected), and only once.
  const biomesSent = useRef<GeoJSON.FeatureCollection | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const shown = !!p.biomes && (p.biomeBorders || !!p.biomeId)
    if (shown && biomesSent.current !== p.biomes) {
      ;(map.getSource('biomes') as GeoJSONSource | undefined)?.setData(p.biomes!)
      biomesSent.current = p.biomes
    }
    map.setLayoutProperty('biomes-line', 'visibility', p.biomeBorders && p.biomes ? 'visible' : 'none')
  }, [ready, p.biomes, p.biomeBorders, p.biomeId])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !map.getLayer('anomaly-fill')) return
    map.setPaintProperty('anomaly-fill', 'fill-color', anomalyColor(standings))
    map.setLayoutProperty('anomaly-fill', 'visibility', layer === 'normal' ? 'visible' : 'none')
    map.setLayoutProperty('recurrence', 'visibility', layer === 'recurrence' && p.recurrence ? 'visible' : 'none')
    map.setLayoutProperty('recent', 'visibility', layer === 'recent' && p.recent ? 'visible' : 'none')
    setPop(null)
  }, [ready, layer, standings, p.recurrence, p.recent])

  const [from, to] = p.period
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !p.recurrence || layer !== 'recurrence') return
    const img = recurrenceImage(p.recurrence, from, to)
    if (img) (map.getSource('recurrence') as ImageSource | undefined)?.updateImage(img)
  }, [ready, p.recurrence, from, to, layer])

  // the last-7-days points go to the map only while that layer is on, and only once
  const recentSent = useRef<Recent | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || layer !== 'recent' || !p.recent || recentSent.current === p.recent) return
    ;(map.getSource('recent') as GeoJSONSource | undefined)?.setData(recentGeoJson(p.recent))
    recentSent.current = p.recent
  }, [ready, p.recent, layer])

  useEffect(() => { if (drawMode !== 'none') setPop(null) }, [drawMode])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (drawRef.current) { drawRef.current.setMode(drawMode === 'none' ? 'static' : drawMode); return }
    if (drawMode === 'none') return
    // first drawing: load terra-draw now (about 160 KB of script nobody needs until then)
    let cancelled = false
    Promise.all([import('terra-draw'), import('terra-draw-maplibre-gl-adapter')])
      .then(([td, adapter]) => {
        if (cancelled || mapRef.current !== map || drawRef.current) return
        const draw = new td.TerraDraw({
          adapter: new adapter.TerraDrawMapLibreGLAdapter({ map }),
          modes: [new td.TerraDrawRectangleMode(), new td.TerraDrawPolygonMode()],
        })
        draw.start()
        draw.on('finish', (id) => {
          const feature = draw.getSnapshotFeature(id)
          const coords = feature?.geometry.type === 'Polygon' ? (feature.geometry.coordinates[0] as Ring) : null
          draw.clear()
          draw.setMode('static')
          if (coords && coords.length >= 4) onDrawnRef.current(coords)
        })
        drawRef.current = draw
        draw.setMode(drawModeRef.current === 'none' ? 'static' : drawModeRef.current)
      })
      .catch((e: Error) => console.warn('drawing tools could not load:', e.message))
    return () => { cancelled = true }
  }, [ready, drawMode])

  const box = container.current?.getBoundingClientRect()
  const popW = 280
  const popLeft = pop && box ? Math.max(8, Math.min(box.width - popW - 8, pop.x + 12)) : 0
  const popTop = pop && box ? Math.max(8, Math.min(box.height - 190, pop.y - 24)) : 0
  const span = to - from + 1

  let popBody: React.ReactNode = null
  let popLabel = ''
  let select: string | null = null
  if (pop?.kind === 'state' && standings[pop.uf]) {
    const s = standings[pop.uf]
    popLabel = `${s.name} details`
    select = pop.uf
    popBody = (
      <>
        <strong className="font-semibold">{s.name}:</strong> {fmt.format(s.ytd)} detections by {dateLabel},{' '}
        {ordinal(s.percentile)} percentile of {s.first}–{s.last}
        <span className="mt-1 block text-xs text-ink-2">{PERCENTILE_LABEL[percentileClass(s.percentile)]}</span>
      </>
    )
  } else if (pop?.kind === 'cell' && p.recurrence) {
    const mask = masks.get(pop.lat * 10000 + pop.lon) ?? 0
    const n = yearsWithFire(mask, p.recurrence.first, from, to)
    const years = Array.from({ length: span }, (_, k) => from + k).filter((y) => (mask >> (y - p.recurrence!.first)) & 1)
    popLabel = 'Grid cell details'
    popBody = (
      <>
        <strong className="font-semibold">Fire in {n} of {span} years</strong> ({from}–{to}) in this 11 km cell
        <span className="mt-1 block text-xs text-ink-2">{years.length ? `Years: ${years.join(', ')}` : 'No fire recorded in these years.'}</span>
      </>
    )
  } else if (pop?.kind === 'recent' && p.recent) {
    const [, , n, eq, frp, first, last, sats, above] = p.recent.cells[pop.i]
    popLabel = 'Fire cluster details'
    popBody = (
      <>
        <strong className="font-semibold">{fmt.format(n)} {n === 1 ? 'detection' : 'detections'}</strong>, {first === last ? first : `${first} to ${last}`}
        <span className="mt-1 block text-xs text-ink-2">
          {sats.replaceAll(',', ', ')}. Aqua-MODIS equivalent: {one.format(eq)}. Strongest pixel {one.format(frp)} MW.
          {above ? ' More than usual for this place and month.' : ''}
        </span>
      </>
    )
  }

  return (
    <div className={`map relative overflow-hidden bg-surface-2 ${className ?? 'h-80 rounded-xl border border-line max-lg:h-64'}`} role="region" aria-label="Map of the selected area">
      {offline && <p className="absolute left-2 top-2 z-10 m-0 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2">Basemap unavailable: showing state outlines only.</p>}
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {layer !== 'none' && (
        <div className={`pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col rounded-lg border border-line bg-surface/95 text-xs text-ink-2 ${compact ? 'max-w-[240px] gap-1 px-2.5 py-2' : 'w-[260px] gap-1.5 px-3 py-2.5'}`}
          aria-label="Map legend">
          {layer === 'normal' && (
            <>
              <span className="font-semibold text-ink">This year so far vs the same date in past years</span>
              <span className="flex gap-0.5" aria-hidden="true">{DIV_VARS.map((v, i) => <span key={v} className={`flex-1 rounded-sm ${compact ? 'h-2.5' : 'h-3'} ${i === 3 ? 'shadow-[inset_0_0_0_1px_var(--ink-3)]' : ''}`} style={{ background: `var(${v})` }} />)}</span>
              <span className="flex justify-between"><span>Lower</span><span>Normal</span><span>Higher</span></span>
            </>
          )}
          {layer === 'recurrence' && (
            <>
              <span className="font-semibold text-ink">Years with fire, {from}–{to}</span>
              <span className="flex gap-0.5" aria-hidden="true">{RAMP_VARS.map((v) => <span key={v} className={`flex-1 rounded-sm ${compact ? 'h-2.5' : 'h-3'}`} style={{ background: `var(${v})` }} />)}</span>
              <span className="flex justify-between"><span>1 year</span><span>{span} years</span></span>
              {!p.recurrence && <span>Recurrence data not published yet.</span>}
            </>
          )}
          {layer === 'recent' && (
            <>
              <span className="font-semibold text-ink">Detections, last 7 days</span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1.5"><Flame size={14} className="text-c6" aria-hidden="true" />Per 11 km cell</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full bg-c6 shadow-[0_0_0_1.6px_var(--unusual)]" />More than usual</span>
              </span>
              {p.recent ? <span>{p.recent.from} to {p.recent.to}, near real time</span> : <span>Recent data not published yet.</span>}
            </>
          )}
        </div>
      )}
      {pop && popBody && (
        <div role="dialog" aria-label={popLabel} className="absolute z-20 flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3 pr-2 text-sm shadow-[0_10px_30px_rgb(0_0_0/0.35)]"
          style={{ left: popLeft, top: popTop, width: popW }}>
          <div className="flex items-start gap-1">
            <p className="m-0 flex-1 pt-1 leading-snug">{popBody}</p>
            <button type="button" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="Close details" onClick={() => setPop(null)}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {select && (
            <button type="button" className="min-h-11 rounded-lg bg-brand px-3 text-sm font-semibold text-[var(--brand-ink)]" onClick={() => { onPickState(select!); setPop(null) }}>
              Select this area
            </button>
          )}
        </div>
      )}
    </div>
  )
}
