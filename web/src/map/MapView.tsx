import { useEffect, useRef, useState } from 'react'
import { Map as MapLibre, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 builds its worker URL at runtime, which bundlers cannot see; ship the worker as an asset instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import { X } from 'lucide-react'
import type { Ring } from '../geo/aoi'
import { ordinal, percentileClass, PERCENTILE_LABEL } from '../rank/ranking'

export type DrawMode = 'none' | 'rectangle' | 'polygon'
export type Theme = 'dark' | 'light'
/** data shown on the map, one at a time (spec 002, story 2) */
export type MapLayer = 'normal' | 'none'

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

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const DIV_VARS = ['--div0', '--div1', '--div2', '--div3', '--div4', '--div5', '--div6']

/** fill colour per state code from its percentile class */
function anomalyColor(standings: Record<string, StateStanding>): ExpressionSpecification {
  const pairs = Object.entries(standings).flatMap(([uf, s]) => [uf, cssVar(DIV_VARS[percentileClass(s.percentile)])])
  return (pairs.length ? ['match', ['get', 'uf'], ...pairs, cssVar('--surface-2')] : ['to-color', cssVar('--surface-2')]) as ExpressionSpecification
}

function addOverlays(map: MapLibre, states: GeoJSON.FeatureCollection) {
  const area = cssVar('--map-area')
  if (!map.getSource('states')) map.addSource('states', { type: 'geojson', data: states })
  if (!map.getLayer('anomaly-fill')) {
    map.addLayer({ id: 'anomaly-fill', type: 'fill', source: 'states', layout: { visibility: 'none' }, paint: { 'fill-color': cssVar('--surface-2'), 'fill-opacity': 0.85 } })
  }
  if (!map.getLayer('states-hit')) {
    map.addLayer({ id: 'states-hit', type: 'fill', source: 'states', paint: { 'fill-color': '#000000', 'fill-opacity': 0 } })
  }
  if (!map.getSource('area')) map.addSource('area', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  if (!map.getLayer('states-line')) {
    map.addLayer({ id: 'states-line', type: 'line', source: 'states', paint: { 'line-color': cssVar('--ink-3'), 'line-width': 0.6, 'line-opacity': 0.7 } })
  }
  if (!map.getLayer('state-fill')) {
    map.addLayer({ id: 'state-fill', type: 'fill', source: 'states', filter: ['==', ['get', 'uf'], ''], paint: { 'fill-color': area, 'fill-opacity': 0.18 } })
    map.addLayer({ id: 'state-line', type: 'line', source: 'states', filter: ['==', ['get', 'uf'], ''], paint: { 'line-color': area, 'line-width': 2 } })
  }
  if (!map.getLayer('area-fill')) {
    map.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': area, 'fill-opacity': 0.18 } })
    map.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': area, 'line-width': 2 } })
  }
}

/** Map with state outlines, the selected area, and rectangle/polygon drawing. Remount it (key) to change theme. */
export function MapView({ theme, states, stateCode, ring, bounds, drawMode, onDrawn, layer, standings, dateLabel, onPickState, compact, className }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibre | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)
  const onDrawnRef = useRef(onDrawn)
  onDrawnRef.current = onDrawn
  const [ready, setReady] = useState(false)
  const [offline, setOffline] = useState(false)
  const [pop, setPop] = useState<{ uf: string; x: number; y: number } | null>(null)
  const drawModeRef = useRef(drawMode)
  drawModeRef.current = drawMode
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds

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
      if (!drawRef.current) {
        const draw = new TerraDraw({
          adapter: new TerraDrawMapLibreGLAdapter({ map }),
          modes: [new TerraDrawRectangleMode(), new TerraDrawPolygonMode()],
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
      }
      loaded = true
      setReady(true)
    })
    map.on('click', 'states-hit', (e) => {
      if (drawModeRef.current !== 'none') return
      const uf = e.features?.[0]?.properties?.uf as string | undefined
      if (uf) setPop({ uf, x: e.point.x, y: e.point.y })
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
    const data: GeoJSON.FeatureCollection = ring
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] }
      : { type: 'FeatureCollection', features: [] }
    ;(map.getSource('area') as GeoJSONSource | undefined)?.setData(data)
    map.fitBounds(bounds ?? BRAZIL, { padding: 24, maxZoom: 7.5, duration: 600 })
  }, [ready, stateCode, ring, bounds])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !map.getLayer('anomaly-fill')) return
    map.setPaintProperty('anomaly-fill', 'fill-color', anomalyColor(standings))
    map.setLayoutProperty('anomaly-fill', 'visibility', layer === 'normal' ? 'visible' : 'none')
  }, [ready, layer, standings])

  useEffect(() => { if (drawMode !== 'none') setPop(null) }, [drawMode])

  useEffect(() => {
    const draw = drawRef.current
    if (!ready || !draw) return
    draw.setMode(drawMode === 'none' ? 'static' : drawMode)
  }, [ready, drawMode])

  const box = container.current?.getBoundingClientRect()
  const popInfo = pop ? standings[pop.uf] : null
  const popW = 272
  const popLeft = pop && box ? Math.max(8, Math.min(box.width - popW - 8, pop.x + 12)) : 0
  const popTop = pop && box ? Math.max(8, Math.min(box.height - 180, pop.y - 24)) : 0

  return (
    <div className={`map relative overflow-hidden bg-surface-2 ${className ?? 'h-80 rounded-xl border border-line max-lg:h-64'}`} role="region" aria-label="Map of the selected area">
      {offline && <p className="absolute left-2 top-2 z-10 m-0 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2">Basemap unavailable: showing state outlines only.</p>}
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {layer === 'normal' && (
        <div className={`pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col rounded-lg border border-line bg-surface/95 text-xs text-ink-2 ${compact ? 'max-w-[240px] gap-1 px-2.5 py-2' : 'w-[260px] gap-1.5 px-3 py-2.5'}`}
          aria-label="Map legend">
          <span className="font-semibold text-ink">This year so far vs the same date in past years</span>
          <span className="flex gap-0.5" aria-hidden="true">{DIV_VARS.map((v, i) => <span key={v} className={`flex-1 rounded-sm ${compact ? 'h-2.5' : 'h-3'} ${i === 3 ? 'shadow-[inset_0_0_0_1px_var(--ink-3)]' : ''}`} style={{ background: `var(${v})` }} />)}</span>
          <span className="flex justify-between"><span>Lower</span><span>Normal</span><span>Higher</span></span>
        </div>
      )}
      {pop && popInfo && (
        <div role="dialog" aria-label={`${popInfo.name} details`} className="absolute z-20 flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3 pr-2 text-sm shadow-[0_10px_30px_rgb(0_0_0/0.35)]"
          style={{ left: popLeft, top: popTop, width: popW }}>
          <div className="flex items-start gap-1">
            <p className="m-0 flex-1 pt-1 leading-snug">
              <strong className="font-semibold">{popInfo.name}:</strong> {fmt.format(popInfo.ytd)} detections by {dateLabel},{' '}
              {ordinal(popInfo.percentile)} percentile of {popInfo.first}–{popInfo.last}
              <span className="mt-1 block text-xs text-ink-2">{PERCENTILE_LABEL[percentileClass(popInfo.percentile)]}</span>
            </p>
            <button type="button" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="Close details" onClick={() => setPop(null)}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="min-h-11 rounded-lg bg-brand px-3 text-sm font-semibold text-[var(--brand-ink)]" onClick={() => { onPickState(pop.uf); setPop(null) }}>
            Select this area
          </button>
        </div>
      )}
    </div>
  )
}
