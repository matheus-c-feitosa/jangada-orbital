import { useEffect, useRef, useState } from 'react'
import { Map as MapLibre, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 builds its worker URL at runtime, which bundlers cannot see; ship the worker as an asset instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { Ring } from '../geo/aoi'

export type DrawMode = 'none' | 'rectangle' | 'polygon'
export type Theme = 'dark' | 'light'

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
}

setWorkerUrl(workerUrl)

const BASEMAP = { dark: 'https://tiles.openfreemap.org/styles/dark', light: 'https://tiles.openfreemap.org/styles/positron' }
const BRAZIL: [number, number, number, number] = [-74, -34, -34.7, 5.4]
const OFFLINE_STYLE = (bg: string): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': bg } }],
})

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function addOverlays(map: MapLibre, states: GeoJSON.FeatureCollection) {
  const area = cssVar('--map-area')
  if (!map.getSource('states')) map.addSource('states', { type: 'geojson', data: states })
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
export function MapView({ theme, states, stateCode, ring, bounds, drawMode, onDrawn }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibre | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)
  const onDrawnRef = useRef(onDrawn)
  onDrawnRef.current = onDrawn
  const [ready, setReady] = useState(false)
  const [offline, setOffline] = useState(false)

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
    return () => {
      window.clearTimeout(timer)
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
    const draw = drawRef.current
    if (!ready || !draw) return
    draw.setMode(drawMode === 'none' ? 'static' : drawMode)
  }, [ready, drawMode])

  return (
    <div className="map" role="region" aria-label="Map of the selected area">
      {offline && <p className="map-note">Basemap unavailable: showing state outlines only.</p>}
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
