import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibre, Marker, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type ImageSource, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 builds its worker URL at runtime, which bundlers cannot see; ship the worker as an asset instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
// terra-draw loads when the map is idle or someone draws (ensureDraw); only its type is needed up front
import type { TerraDraw } from 'terra-draw'
import { Flame, Maximize, Minus, Plus, X } from 'lucide-react'
import type { Ring } from '../geo/aoi'
import { splitEdges } from '../geo/edges'
import { mercatorRow, yearsWithFire, type Recent, type Recurrence } from '../data/extras'
import { percentileClass } from '../rank/ranking'
import { useI18n } from '../i18n'

/** 'box': an orange rectangle with draggable corners, confirmed with `confirmBox` (phones, design "Celular: desenhar área") */
export type DrawMode = 'none' | 'rectangle' | 'polygon' | 'box'
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
  /** OpenFreeMap basemap with place names; off, the map is the design's plain navy land and sea */
  places: boolean
  states: GeoJSON.FeatureCollection
  /** highlighted state code, if the area is a state */
  stateCode: string | null
  /** outline of a drawn or typed area */
  ring: Ring | null
  /** other parts of the area (a municipality's islands), outlined with `ring` */
  parts?: Ring[]
  bounds: [number, number, number, number] | null
  drawMode: DrawMode
  onDrawn: (ring: Ring) => void
  /** increase to take the box of the 'box' draw mode as the area */
  confirmBox?: number
  layer: MapLayer
  /** this year's standing of each state, by code, and of each biome, by id */
  standings: Record<string, StateStanding>
  biomeStandings: Record<string, StateStanding>
  /** "This year vs normal" colours states, or biomes when a biome is the area */
  normalUnit: 'state' | 'biome'
  /** e.g. "14 Nov" */
  dateLabel: string
  onPickState: (uf: string) => void
  onPickBiome: (id: string) => void
  /** biome outlines (IBGE), the highlighted biome and whether every border is drawn */
  biomes: GeoJSON.FeatureCollection | null
  biomeId: string | null
  biomeBorders: boolean
  stateBorders: boolean
  recurrence: Recurrence | null
  /** years counted by the recurrence layer */
  period: [number, number]
  recent: Recent | null
  /** zoom in, zoom out and "show all of Brazil" buttons, top right (desktop and tablet) */
  controls?: boolean
  /** tablet: 48 px buttons */
  touchControls?: boolean
  onShowBrazil?: () => void
  /** smaller legend for phones (at most ~20% of the map) */
  compact?: boolean
  /** room kept free at the bottom of the map (the phone sheet covers it), for the legend and the framing */
  bottomInset?: number
  className?: string
}

setWorkerUrl(workerUrl)

const BASEMAP = { dark: 'https://tiles.openfreemap.org/styles/fiord', light: 'https://tiles.openfreemap.org/styles/positron' }
const BRAZIL: [number, number, number, number] = [-74, -34, -34.7, 5.4]
const PLAIN_STYLE = (bg: string): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': bg } }],
})
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

// Label anchors of the design (lon, lat): inside each biome and near each state's centre.
const BIOME_LABEL: Record<string, [number, number]> = {
  amazonia: [-62, -4], cerrado: [-49, -14], caatinga: [-40.6, -8.2], mata_atlantica: [-42.8, -21.6], pantanal: [-57, -18.6], pampa: [-54, -31.2],
}
const STATE_LABEL: Record<string, [number, number]> = {
  AC: [-70.5, -9.0], AM: [-64.5, -4.0], RR: [-61.3, 2.0], AP: [-51.8, 1.4], PA: [-52.5, -4.5], TO: [-48.3, -10.2], MA: [-45.3, -5.0], PI: [-42.8, -7.5],
  CE: [-39.5, -5.2], RN: [-36.6, -5.8], PB: [-36.8, -7.1], PE: [-38.0, -8.3], AL: [-36.6, -9.6], SE: [-37.4, -10.6], BA: [-41.7, -12.5], MG: [-44.6, -18.5],
  ES: [-40.6, -19.6], RJ: [-42.7, -22.3], SP: [-48.6, -22.3], PR: [-51.6, -24.6], SC: [-50.5, -27.3], RS: [-53.2, -29.8], MS: [-54.8, -20.5], MT: [-55.9, -12.9],
  GO: [-49.6, -15.9], DF: [-47.8, -15.8], RO: [-62.8, -10.9],
}
/** small states get a label only when zoomed in */
const SMALL = new Set(['RN', 'PB', 'AL', 'SE', 'ES', 'RJ', 'DF'])

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const DIV_VARS = ['--div0', '--div1', '--div2', '--div3', '--div4', '--div5', '--div6']
const REC_VARS = Array.from({ length: 11 }, (_, k) => `--r${k}`)

/** fill colour per feature key from its percentile class */
function anomalyColor(standings: Record<string, StateStanding>, key: string): ExpressionSpecification {
  const pairs = Object.entries(standings).flatMap(([k, s]) => [k, cssVar(DIV_VARS[percentileClass(s.percentile)])])
  return (pairs.length ? ['match', ['get', key], ...pairs, cssVar('--map-land')] : ['to-color', cssVar('--map-land')]) as ExpressionSpecification
}

/** recurrence colour step 0..10 for `n` of `span` years with fire */
export const recurrenceStep = (n: number, span: number) => Math.max(0, Math.min(10, Math.round((n * 10) / Math.max(1, span))))

type RecImage = { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] }

/** CSS colours as the 32-bit pixels of an ImageData (RGBA bytes, little-endian), read back from a 1 x 1 canvas. */
function pixels(colors: string[]): Uint32Array | null {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  return Uint32Array.from(colors, (c) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = c
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
  })
}

/** number of set bits */
const bits = (v: number) => {
  v -= (v >>> 1) & 0x55555555
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

// one image per recurrence file, period and palette: switching layers, periods or themes back reuses it
const recImages = new WeakMap<Recurrence, Map<string, RecImage>>()

/** The recurrence grid as one image (one pixel column per 0.1° cell), drawn on a canvas and placed over Brazil.
 * MapLibre stretches an image source linearly in Web Mercator, so the rows follow Mercator y, not latitude: drawn
 * linearly in latitude, the cells in central Brazil land about 1° (100 km) south of where they are. The pixels are
 * written straight into an ImageData: 56 thousand fillRect calls took a third of a second on a slow phone. */
function recurrenceImage(r: Recurrence, from: number, to: number): RecImage | null {
  const colors = REC_VARS.map(cssVar)
  const key = `${from}-${to}-${colors.join()}`
  let byKey = recImages.get(r)
  if (!byKey) recImages.set(r, (byKey = new Map()))
  const hit = byKey.get(key)
  if (hit) return hit
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity
  for (const [la, lo] of r.cells) {
    if (la < latMin) latMin = la
    if (la > latMax) latMax = la
    if (lo < lonMin) lonMin = lo
    if (lo > lonMax) lonMax = lo
  }
  const west = lonMin / 10, east = (lonMax + 1) / 10, north = (latMax + 1) / 10, south = latMin / 10
  const w = lonMax - lonMin + 1
  const rows = (latMax - latMin + 1) * 4 // four canvas rows per cell keep the rounding within a quarter of a cell
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = rows
  const ctx = canvas.getContext('2d')
  const px = pixels(colors)
  if (!ctx || !px) return null
  const image = ctx.createImageData(w, rows)
  const out = new Uint32Array(image.data.buffer)
  const span = to - from + 1
  // years from..to as bits of the mask (bit 0 = r.first), as yearsWithFire counts them
  let range = 0
  for (let y = Math.max(from, r.first); y <= to && y - r.first < 31; y++) range |= 1 << (y - r.first)
  // canvas rows of each cell latitude, computed once per latitude
  const top = new Int32Array(latMax - latMin + 2)
  for (let la = latMin; la <= latMax + 1; la++) top[la - latMin] = mercatorRow(la / 10, north, south, rows)
  for (const [la, lo, mask] of r.cells) {
    const c = px[recurrenceStep(bits(mask & range), span)]
    const y0 = top[la + 1 - latMin]
    const y1 = y0 + Math.max(1, top[la - latMin] - y0)
    for (let y = y0; y < y1 && y < rows; y++) out[y * w + lo - lonMin] = c
  }
  ctx.putImageData(image, 0, 0)
  const img: RecImage = { url: canvas.toDataURL(), coordinates: [[west, north], [east, north], [east, south], [west, south]] }
  byKey.set(key, img)
  return img
}

function recentGeoJson(r: Recent | null): GeoJSON.FeatureCollection {
  if (!r) return EMPTY
  return {
    type: 'FeatureCollection',
    features: r.cells.map(([la, lo, n, eq, , , , , above], k) => ({
      type: 'Feature', id: k, properties: { i: k, n, eq, above: above ? 1 : 0 },
      geometry: { type: 'Point', coordinates: [(lo + 0.5) / 10, (la + 0.5) / 10] },
    })),
  }
}

function addOverlays(map: MapLibre, states: GeoJSON.FeatureCollection, places: boolean) {
  const area = cssVar('--map-area')
  const halo = cssVar('--map-halo')
  const outline = (id: string, source: string, filter?: ExpressionSpecification) => {
    map.addLayer({ id: `${id}-halo`, type: 'line', source, ...(filter ? { filter } : {}), paint: { 'line-color': halo, 'line-width': 6, 'line-opacity': 0.9 }, layout: { 'line-join': 'round' } })
    map.addLayer({ id: `${id}-line`, type: 'line', source, ...(filter ? { filter } : {}), paint: { 'line-color': area, 'line-width': 2.6 }, layout: { 'line-join': 'round' } })
  }
  if (!map.getSource('states')) map.addSource('states', { type: 'geojson', data: states })
  if (!map.getSource('biomes')) map.addSource('biomes', { type: 'geojson', data: EMPTY })
  if (!map.getSource('biome-edges')) map.addSource('biome-edges', { type: 'geojson', data: EMPTY })
  if (!map.getSource('area')) map.addSource('area', { type: 'geojson', data: EMPTY })
  if (map.getLayer('land')) return
  // land of the design's map; with the basemap on, its own land shows instead
  map.addLayer({ id: 'land', type: 'fill', source: 'states', paint: { 'fill-color': cssVar('--map-land'), 'fill-opacity': places ? 0 : 1 } })
  map.addSource('recurrence', { type: 'image', url: BLANK, coordinates: [[-74, 5.4], [-34.7, 5.4], [-34.7, -34], [-74, -34]] })
  map.addLayer({ id: 'recurrence', type: 'raster', source: 'recurrence', layout: { visibility: 'none' }, paint: { 'raster-opacity': places ? 0.85 : 1, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } })
  map.addLayer({ id: 'anomaly-fill', type: 'fill', source: 'states', layout: { visibility: 'none' }, paint: { 'fill-color': cssVar('--map-land'), 'fill-opacity': places ? 0.85 : 1 } })
  map.addLayer({ id: 'biome-anomaly', type: 'fill', source: 'biomes', layout: { visibility: 'none' }, paint: { 'fill-color': cssVar('--map-land'), 'fill-opacity': places ? 0.85 : 1 } })
  map.addLayer({ id: 'states-hit', type: 'fill', source: 'states', paint: { 'fill-color': '#000000', 'fill-opacity': 0 } })
  map.addLayer({ id: 'biomes-hit', type: 'fill', source: 'biomes', paint: { 'fill-color': '#000000', 'fill-opacity': 0 } })
  // faint state edges stand in for the country outline until the biome edges are known
  map.addLayer({ id: 'states-faint', type: 'line', source: 'states', paint: { 'line-color': cssVar('--map-outline'), 'line-width': 0.7, 'line-opacity': 0.45 } })
  map.addLayer({ id: 'states-line', type: 'line', source: 'states', layout: { visibility: 'none' }, paint: { 'line-color': cssVar('--ink-2'), 'line-width': 0.9, 'line-opacity': 0.6 } })
  // design: inner biome borders dashed, the country outline solid
  map.addLayer({ id: 'biomes-line', type: 'line', source: 'biome-edges', filter: ['==', ['get', 'kind'], 'inner'], layout: { visibility: 'none' }, paint: { 'line-color': cssVar('--map-border'), 'line-width': 1.6, 'line-dasharray': [3, 2] } })
  map.addLayer({ id: 'country-line', type: 'line', source: 'biome-edges', filter: ['==', ['get', 'kind'], 'outer'], paint: { 'line-color': cssVar('--map-outline'), 'line-width': 1.2 } })
  outline('biome', 'biomes', ['==', ['get', 'id'], ''])
  outline('state', 'states', ['==', ['get', 'uf'], ''])
  outline('area', 'area')
  map.addSource('recent', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'recent', type: 'circle', source: 'recent', layout: { visibility: 'none' },
    paint: {
      'circle-color': cssVar('--c5'),
      'circle-opacity': 0.9,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['step', ['get', 'n'], 1.6, 5, 2.4, 20, 3.4], 7, ['step', ['get', 'n'], 4, 5, 6, 20, 9]],
      'circle-stroke-width': ['case', ['==', ['get', 'above'], 1], 1.6, 0],
      'circle-stroke-color': cssVar('--unusual'),
    },
  })
}

/** The theme's colours on the overlay layers, without rebuilding the map (a new map costs a WebGL context, a style
 * and new workers). The anomaly fill and the recurrence image follow in their own effects. */
function recolor(map: MapLibre) {
  type ColorProp = 'background-color' | 'fill-color' | 'line-color' | 'circle-color' | 'circle-stroke-color'
  const set = (id: string, prop: ColorProp, v: string) => { if (map.getLayer(id)) map.setPaintProperty(id, prop, v) }
  set('bg', 'background-color', cssVar('--map-bg'))
  set('land', 'fill-color', cssVar('--map-land'))
  set('states-faint', 'line-color', cssVar('--map-outline'))
  set('states-line', 'line-color', cssVar('--ink-2'))
  set('biomes-line', 'line-color', cssVar('--map-border'))
  set('country-line', 'line-color', cssVar('--map-outline'))
  for (const id of ['biome', 'state', 'area']) {
    set(`${id}-halo`, 'line-color', cssVar('--map-halo'))
    set(`${id}-line`, 'line-color', cssVar('--map-area'))
  }
  set('recent', 'circle-color', cssVar('--c5'))
  set('recent', 'circle-stroke-color', cssVar('--unusual'))
}

type Pop =
  | { kind: 'state'; uf: string; x: number; y: number }
  | { kind: 'biome'; id: string; x: number; y: number }
  | { kind: 'cell'; lat: number; lon: number; uf: string; x: number; y: number }
  | { kind: 'recent'; i: number; x: number; y: number }

const round6 = (v: number) => Math.round(v * 1e6) / 1e6

/** Map of the design: land and sea in navy, biome and state borders, the selected area outlined in light orange,
 * one data layer at a time, rectangle/polygon drawing. The plain map follows the theme in place; remount it (key) to
 * turn the basemap on or off, or to change the basemap's theme. */
export function MapView(p: Props) {
  const i = useI18n()
  const { theme, places, states, stateCode, ring, bounds, drawMode, onDrawn, layer, standings, biomeStandings, normalUnit, dateLabel, compact, className } = p
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibre | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)
  const drawLoad = useRef<Promise<TerraDraw | null> | null>(null)
  const boxId = useRef<string | number | null>(null)
  const onDrawnRef = useRef(onDrawn)
  onDrawnRef.current = onDrawn
  const [ready, setReady] = useState(false)
  // the drawing tools have loaded (data-drawing-ready, for the end-to-end tests)
  const [drawReady, setDrawReady] = useState(false)
  const [offline, setOffline] = useState(false)
  const [pop, setPop] = useState<Pop | null>(null)
  // phones with little room for the map start with the legend folded
  const [legendOpen, setLegendOpen] = useState(() => !(compact && window.innerHeight < 700))
  const drawModeRef = useRef(drawMode)
  drawModeRef.current = drawMode
  const layerRef = useRef(layer)
  layerRef.current = layer
  const unitRef = useRef(normalUnit)
  unitRef.current = normalUnit
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds
  const insetRef = useRef(p.bottomInset ?? 0)
  insetRef.current = p.bottomInset ?? 0
  // phones: the top bar floats over the map, so frame the area below it
  const padding = () => ({ top: compact ? 72 : 24, left: 24, right: 24, bottom: 24 + insetRef.current })

  // cell index of the recurrence masks, for the cell popover
  const masks = useMemo(() => {
    const m = new Map<number, number>()
    for (const [la, lo, mask] of p.recurrence?.cells ?? []) m.set(la * 10000 + lo, mask)
    return m
  }, [p.recurrence])
  const stateNames = useMemo(() => Object.fromEntries(states.features.map((f) => [f.properties?.uf, f.properties?.name])) as Record<string, string>, [states])
  const biomeNames = useMemo(() => Object.fromEntries((p.biomes?.features ?? []).map((f) => [f.properties?.id, f.properties?.name])) as Record<string, string>, [p.biomes])
  const edges = useMemo(() => (p.biomes ? splitEdges(p.biomes) : null), [p.biomes])

  useEffect(() => {
    if (!container.current) return
    const map = new MapLibre({
      container: container.current,
      style: places ? BASEMAP[theme] : PLAIN_STYLE(cssVar('--map-bg')),
      bounds: BRAZIL,
      fitBoundsOptions: { padding: 12 },
      attributionControl: places ? { compact: false } : false,
      dragRotate: false,
      pitchWithRotate: false,
    })
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __map?: MapLibre }).__map = map // inspection in dev only
    // the map lives in panels that open, close and resize; keep the canvas in step with its box
    // and keep the selected area framed when the box changes (panels opening, phone rotation)
    let frame = 0
    const box = container.current
    let last = { w: 0, h: 0 }
    const resize = new ResizeObserver(() => {
      const w = box.clientWidth, h = box.clientHeight
      // hidden (the Method page): nothing to draw; shown again at the same size: keep the view as the user left it
      if (!w || !h || (w === last.w && h === last.h)) return
      last = { w, h }
      map.resize()
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => map.fitBounds(boundsRef.current ?? BRAZIL, { padding: padding(), maxZoom: 7.5, duration: 0 }))
    })
    resize.observe(container.current)
    let loaded = false
    let fellBack = false
    const goOffline = () => {
      if (loaded) return
      loaded = true
      fellBack = true
      setOffline(true)
      map.setStyle(PLAIN_STYLE(cssVar('--map-bg')))
    }
    const timer = places ? window.setTimeout(goOffline, 8000) : 0
    map.on('error', (e) => {
      if (places && !map.isStyleLoaded() && !loaded) goOffline()
      else console.warn('map:', e.error?.message)
    })
    map.on('style.load', () => {
      window.clearTimeout(timer)
      addOverlays(map, states, places && !fellBack)
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
      const uf = map.queryRenderedFeatures(e.point, { layers: ['states-hit'] })[0]?.properties?.uf as string | undefined
      // outside Brazil there is no data: no card there, rather than "no fire recorded"
      if (!uf) return setPop(null)
      if (l === 'recurrence') {
        return setPop({ kind: 'cell', lat: Math.floor(e.lngLat.lat * 10), lon: Math.floor(e.lngLat.lng * 10), uf, x: e.point.x, y: e.point.y })
      }
      if (l === 'normal' && unitRef.current === 'biome') {
        const id = map.queryRenderedFeatures(e.point, { layers: ['biomes-hit'] })[0]?.properties?.id as string | undefined
        if (id) return setPop({ kind: 'biome', id, x: e.point.x, y: e.point.y })
      }
      setPop({ kind: 'state', uf, x: e.point.x, y: e.point.y })
    })
    map.on('dragstart', () => setPop(null))
    return () => {
      window.clearTimeout(timer)
      resize.disconnect()
      drawRef.current?.stop()
      drawRef.current = null
      drawLoad.current = null
      map.remove()
      mapRef.current = null
    }
    // Runs once: a basemap change remounts the component (key), and states never change after load.
  }, [])

  /** The drawing tools (terra-draw, about 50 KB gzip), created once per map: when the map is idle, or at once when
   * someone draws before that. */
  const ensureDraw = (map: MapLibre): Promise<TerraDraw | null> => {
    if (drawRef.current) return Promise.resolve(drawRef.current)
    drawLoad.current ??= Promise.all([import('terra-draw'), import('terra-draw-maplibre-gl-adapter')])
      .then(([td, adapter]) => {
        if (mapRef.current !== map) return null
        const draw = new td.TerraDraw({
          adapter: new adapter.TerraDrawMapLibreGLAdapter({ map }),
          modes: [
            new td.TerraDrawRectangleMode(),
            new td.TerraDrawPolygonMode(),
            // the phone box: drag a corner and the opposite one stays put
            new td.TerraDrawSelectMode({
              flags: { rectangle: { feature: { draggable: true, coordinates: { draggable: true, resizable: 'opposite' } } } },
              styles: {
                selectedPolygonColor: '#F97316', selectedPolygonFillOpacity: 0.15, selectedPolygonOutlineColor: '#FDBA74', selectedPolygonOutlineWidth: 3,
                selectionPointColor: '#F97316', selectionPointWidth: 9, selectionPointOutlineColor: '#FFFFFF', selectionPointOutlineWidth: 2,
              },
            }),
          ],
        })
        draw.start()
        draw.on('finish', (id) => {
          if (drawModeRef.current === 'box') return // dragging the box's corners also "finishes"; the button confirms it
          const feature = draw.getSnapshotFeature(id)
          const coords = feature?.geometry.type === 'Polygon' ? (feature.geometry.coordinates[0] as Ring) : null
          draw.clear()
          draw.setMode('static')
          if (coords && coords.length >= 4) onDrawnRef.current(coords)
        })
        drawRef.current = draw
        setDrawReady(true)
        return draw
      })
      .catch((e: Error) => {
        drawLoad.current = null // a failed download is tried again on the next drawing
        throw e
      })
    return drawLoad.current
  }

  // load the drawing tools once the first screen is done
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const handle = idle(() => { ensureDraw(map).catch(() => { /* retried when someone draws */ }) }, { timeout: 5000 })
    return () => cancel(handle)
    // ensureDraw only reads refs
  }, [ready])

  // the plain map follows the theme in place
  const themeRef = useRef(theme)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || themeRef.current === theme) return
    themeRef.current = theme
    recolor(map)
  }, [ready, theme])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const filter = ['==', ['get', 'uf'], stateCode ?? ''] as ExpressionSpecification
    map.setFilter('state-halo', filter)
    map.setFilter('state-line', filter)
    const bfilter = ['==', ['get', 'id'], p.biomeId ?? ''] as ExpressionSpecification
    map.setFilter('biome-halo', bfilter)
    map.setFilter('biome-line', bfilter)
    const data: GeoJSON.FeatureCollection = ring
      ? { type: 'FeatureCollection', features: [ring, ...(p.parts ?? [])].map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [r] } })) }
      : EMPTY
    ;(map.getSource('area') as GeoJSONSource | undefined)?.setData(data)
    map.fitBounds(bounds ?? BRAZIL, { padding: padding(), maxZoom: 7.5, duration: 600 })
  }, [ready, stateCode, ring, p.parts, bounds, p.biomeId])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource('biomes') as GeoJSONSource | undefined)?.setData(p.biomes ?? EMPTY)
    const edgeData: GeoJSON.FeatureCollection = edges && edges.shared > 0
      ? { type: 'FeatureCollection', features: [{ ...edges.inner, properties: { kind: 'inner' } }, { ...edges.outer, properties: { kind: 'outer' } }] }
      : EMPTY
    ;(map.getSource('biome-edges') as GeoJSONSource | undefined)?.setData(edgeData)
    map.setLayoutProperty('biomes-line', 'visibility', p.biomeBorders && edgeData.features.length ? 'visible' : 'none')
    // with the country outline drawn, the faint state edges are no longer needed
    map.setLayoutProperty('states-faint', 'visibility', edgeData.features.length ? 'none' : 'visible')
    map.setLayoutProperty('states-line', 'visibility', p.stateBorders ? 'visible' : 'none')
  }, [ready, p.biomes, edges, p.biomeBorders, p.stateBorders])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !map.getLayer('anomaly-fill')) return
    map.setPaintProperty('anomaly-fill', 'fill-color', anomalyColor(standings, 'uf'))
    map.setPaintProperty('biome-anomaly', 'fill-color', anomalyColor(biomeStandings, 'id'))
    map.setLayoutProperty('anomaly-fill', 'visibility', layer === 'normal' && normalUnit === 'state' ? 'visible' : 'none')
    map.setLayoutProperty('biome-anomaly', 'visibility', layer === 'normal' && normalUnit === 'biome' ? 'visible' : 'none')
    map.setLayoutProperty('recurrence', 'visibility', layer === 'recurrence' && p.recurrence ? 'visible' : 'none')
    map.setLayoutProperty('recent', 'visibility', layer === 'recent' && p.recent ? 'visible' : 'none')
    setPop(null)
    // theme: the anomaly colours come from the theme's palette
  }, [ready, layer, standings, biomeStandings, normalUnit, p.recurrence, p.recent, theme])

  const [from, to] = p.period
  const shownImage = useRef<RecImage | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !p.recurrence || layer !== 'recurrence') return
    const img = recurrenceImage(p.recurrence, from, to)
    if (img && img !== shownImage.current) {
      ;(map.getSource('recurrence') as ImageSource | undefined)?.updateImage(img)
      shownImage.current = img
    }
    // theme: the image is drawn in the theme's palette
  }, [ready, p.recurrence, from, to, layer, theme])

  // the last-7-days points go to the map only while that layer shows, and only once
  const recentSent = useRef<Recent | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || layer !== 'recent' || !p.recent || recentSent.current === p.recent) return
    ;(map.getSource('recent') as GeoJSONSource | undefined)?.setData(recentGeoJson(p.recent))
    recentSent.current = p.recent
  }, [ready, p.recent, layer])

  // Name chips of the design: biomes when their borders show, state codes when state borders or state colours show.
  const showStateChips = p.stateBorders || (layer === 'normal' && normalUnit === 'state')
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const markers: Marker[] = []
    const chip = (text: string, at: [number, number], small = false) => {
      const el = document.createElement('span')
      el.className = 'map-chip'
      el.textContent = text
      el.setAttribute('aria-hidden', 'true')
      if (small) el.dataset.small = '1'
      markers.push(new Marker({ element: el }).setLngLat(at).addTo(map))
    }
    if (p.biomeBorders && p.biomes) for (const [id, at] of Object.entries(BIOME_LABEL)) if (biomeNames[id]) chip(biomeNames[id], at)
    if (showStateChips) for (const [uf, at] of Object.entries(STATE_LABEL)) chip(uf, at, SMALL.has(uf))
    const zoom = () => {
      const z = map.getZoom()
      for (const m of markers) { const el = m.getElement(); el.style.display = el.dataset.small && z < 5 ? 'none' : '' }
    }
    zoom()
    map.on('zoom', zoom)
    return () => { map.off('zoom', zoom); markers.forEach((m) => m.remove()) }
  }, [ready, p.biomeBorders, p.biomes, biomeNames, showStateChips])

  useEffect(() => { if (drawMode !== 'none') setPop(null) }, [drawMode])

  // drawing modes; 'box' puts an editable rectangle in the middle of the view
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || (!drawRef.current && drawMode === 'none')) return
    let cancelled = false
    ensureDraw(map).then((draw) => {
      if (cancelled || !draw) return
      if (drawMode !== 'box' && boxId.current !== null) { draw.clear(); boxId.current = null }
      if (drawMode !== 'box') { draw.setMode(drawMode === 'none' ? 'static' : drawMode); return }
      draw.setMode('select')
      // in the middle of the part of the map that shows: below the hint at the top, above the sheet at the bottom
      const { clientWidth: w, clientHeight: h } = map.getContainer()
      const top = 80, bottom = h - (insetRef.current || 96) - 16
      const nw = map.unproject([w * 0.3, top + (bottom - top) * 0.3])
      const se = map.unproject([w * 0.7, top + (bottom - top) * 0.7])
      const box = [[nw.lng, se.lat], [se.lng, se.lat], [se.lng, nw.lat], [nw.lng, nw.lat], [nw.lng, se.lat]].map((q) => q.map(round6))
      const [res] = draw.addFeatures([{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [box] }, properties: { mode: 'rectangle' } }])
      if (res?.valid && res.id !== undefined) { boxId.current = res.id; draw.selectFeature(res.id) }
    }).catch((e: Error) => console.warn('drawing tools could not load:', e.message))
    return () => { cancelled = true }
    // ensureDraw only reads refs
  }, [ready, drawMode])

  useEffect(() => {
    const draw = drawRef.current
    if (!p.confirmBox || !draw || boxId.current === null) return
    const feature = draw.getSnapshotFeature(boxId.current)
    const coords = feature?.geometry.type === 'Polygon' ? (feature.geometry.coordinates[0] as Ring) : null
    draw.clear()
    boxId.current = null
    draw.setMode('static')
    if (coords && coords.length >= 4) onDrawnRef.current(coords)
  }, [p.confirmBox])

  const box = container.current?.getBoundingClientRect()
  const popW = Math.min(280, (box?.width ?? 300) - 24)
  const popLeft = pop && box ? Math.max(12, Math.min(box.width - popW - 12, pop.x + 14)) : 0
  const popTop = pop && box ? Math.max(12, Math.min(box.height - (p.bottomInset ?? 0) - 200, pop.y - 30)) : 0
  const span = to - from + 1

  let title: React.ReactNode = null
  let line: React.ReactNode = null
  let popLabel = ''
  let select: { label: string; run: () => void } | null = null
  if ((pop?.kind === 'state' && standings[pop.uf]) || (pop?.kind === 'biome' && biomeStandings[pop.id])) {
    const s = pop.kind === 'state' ? standings[pop.uf] : biomeStandings[(pop as { id: string }).id]
    popLabel = i.t('detailsOf', { name: s.name })
    title = i.t('popStanding', { name: s.name, v: i.k(s.ytd), date: dateLabel, p: i.ord(s.percentile), a: s.first, b: s.last })
    line = i.t(pop.kind === 'state' ? 'popState' : 'popBiome', { first: s.first })
    const target = pop
    select = { label: i.t('selectThisArea'), run: () => (target.kind === 'state' ? p.onPickState(target.uf) : p.onPickBiome((target as { id: string }).id)) }
  } else if (pop?.kind === 'cell' && p.recurrence) {
    const mask = masks.get(pop.lat * 10000 + pop.lon) ?? 0
    const n = yearsWithFire(mask, p.recurrence.first, from, to)
    const years = Array.from({ length: span }, (_, k) => from + k).filter((y) => (mask >> (y - p.recurrence!.first)) & 1)
    const name = stateNames[pop.uf] ?? pop.uf
    popLabel = i.t('cellDetails')
    title = i.t('popFireIn', { n, span })
    line = <>{i.t('popCell', { name, a: from, b: to })}{years.length ? <><br />{i.t('popYears', { list: years.join(', ') })}</> : i.t('popNoFire')}</>
    const uf = pop.uf
    select = { label: i.t('selectPlace', { name }), run: () => p.onPickState(uf) }
  } else if (pop?.kind === 'recent' && p.recent) {
    const [, , n, eq, frp, first, last, sats, above] = p.recent.cells[pop.i]
    const when = first === last ? first : i.t('dateRange', { a: first, b: last })
    popLabel = i.t('clusterDetails')
    title = n === 1 ? i.t('popCluster1', { when }) : i.t('popCluster', { n: i.int(n), when })
    line = <>{i.t('popClusterLine', { sats: sats.replaceAll(',', ', '), eq: i.upTo1(eq), frp: i.upTo1(frp) })}{above ? i.t('popMoreUsual') : ''}</>
  }

  const legendFirst = Object.values(normalUnit === 'biome' ? biomeStandings : standings)[0]
  const legend = `absolute left-3 z-10 flex flex-col rounded-[10px] border border-line-2 bg-[color-mix(in_srgb,var(--surface)_95%,transparent)] text-xs text-ink-2 ${compact ? 'max-w-[250px] gap-1 px-2.5 py-2' : 'w-[260px] gap-1.5 px-3.5 py-3'}`
  const sw = `flex-1 rounded-[2px] ${compact ? 'h-2.5' : 'h-3.5'}`
  const legendTitle = layer === 'normal'
    ? (legendFirst ? i.t('legNormal', { year: legendFirst.last + 1, a: legendFirst.first, b: legendFirst.last }) : i.t('legNormalAny'))
    : layer === 'recurrence' ? i.t('legRec', { a: from, b: to }) : i.t('layerRecent')

  return (
    <div className={`map relative overflow-hidden bg-map-bg ${className ?? 'h-80 rounded-xl border border-line max-lg:h-64'}`} role="region" aria-label={i.t('mapAria')}
      data-drawing-ready={drawReady ? '' : undefined}>
      {offline && <p className="absolute left-2 top-2 z-10 m-0 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2">{i.t('basemapOff')}</p>}
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {p.controls && (
        <div className={`absolute right-4 top-4 z-10 flex flex-col ${p.touchControls ? 'touch gap-2' : 'gap-1.5'}`}>
          <button type="button" className="ico float" aria-label={i.t('zoomIn')} onClick={() => mapRef.current?.zoomIn()}><Plus size={18} aria-hidden="true" /></button>
          <button type="button" className="ico float" aria-label={i.t('zoomOut')} onClick={() => mapRef.current?.zoomOut()}><Minus size={18} aria-hidden="true" /></button>
          <button type="button" className="ico float" aria-label={i.t('showBrazil')} onClick={() => { p.onShowBrazil?.(); mapRef.current?.fitBounds(BRAZIL, { padding: padding(), duration: 600 }) }}><Maximize size={18} aria-hidden="true" /></button>
        </div>
      )}
      {layer !== 'none' && !legendOpen && (
        <button type="button" className="absolute left-3 z-10 min-h-11 rounded-[10px] border border-line-2 bg-surface px-3 text-xs font-semibold text-ink"
          style={{ bottom: 12 + (p.bottomInset ?? 0) }} aria-expanded={false} onClick={() => setLegendOpen(true)}>
          {i.t('mapLegend')}
        </button>
      )}
      {layer !== 'none' && legendOpen && (
        <div className={legend} style={{ bottom: 12 + (p.bottomInset ?? 0) }} aria-label={i.t('mapLegend')}>
          <span className="flex items-start gap-2 font-semibold text-ink">
            <span className="flex-1">{legendTitle}</span>
            {compact && (
              <button type="button" className="-m-3 inline-flex size-11 flex-none items-center justify-center text-ink-2" aria-label={i.t('hideLegend')} aria-expanded onClick={() => setLegendOpen(false)}>
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </span>
          {layer === 'normal' && (
            <>
              <span className="flex gap-0.5" aria-hidden="true">{DIV_VARS.map((v, k) => <span key={v} className={`${sw} ${k === 3 ? 'shadow-[inset_0_0_0_1px_var(--ink-3)]' : ''}`} style={{ background: `var(${v})` }} />)}</span>
              <span className="flex justify-between"><span>{i.t('lower')}</span><span>{i.t('normalShort')}</span><span>{i.t('higher')}</span></span>
              {!compact && <span className="text-ink-3">{i.t('pctScale')}</span>}
            </>
          )}
          {layer === 'recurrence' && (
            <>
              <span className="flex gap-0.5" aria-hidden="true">{REC_VARS.map((v) => <span key={v} className={sw} style={{ background: `var(${v})` }} />)}</span>
              <span className="flex justify-between"><span>{i.t('nYears', { n: 0 })}</span><span>{i.t('nYears', { n: span })}</span></span>
              {!p.recurrence && <span>{i.t('recNotPublished')}</span>}
            </>
          )}
          {layer === 'recent' && (
            <>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1.5"><Flame size={14} className="text-c5" aria-hidden="true" />{i.t('perCell')}</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full bg-c5 shadow-[0_0_0_1.6px_var(--unusual)]" />{i.t('moreThanUsual')}</span>
              </span>
              {p.recent ? <span>{i.t('nearRealTime', { a: p.recent.from, b: p.recent.to })}</span> : <span>{i.t('recentNotPublished')}</span>}
            </>
          )}
        </div>
      )}
      {pop && title && (
        <div role="dialog" aria-label={popLabel}
          className="absolute z-20 box-border flex flex-col gap-2.5 rounded-xl bg-[#F2F5FA] py-2 pl-3.5 pr-2 pb-3 text-[13px] text-[#0C1424] shadow-[0_10px_30px_rgb(0_0_0/0.45)]"
          style={{ left: popLeft, top: popTop, width: popW }}>
          <div className="flex items-start gap-1">
            <div className="flex flex-1 flex-col gap-1 pt-1">
              <span className="text-[15px] font-semibold leading-[1.35]">{title}</span>
              <span className="leading-[1.4] text-[#334155]">{line}</span>
            </div>
            <button type="button" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-[#334155] hover:bg-black/5" aria-label={i.t('closeDetails')} onClick={() => setPop(null)}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {select && (
            <button type="button" className="min-h-11 rounded-[10px] bg-[#C2410C] px-3.5 text-sm font-semibold text-white" onClick={() => { select!.run(); setPop(null) }}>
              {select.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
