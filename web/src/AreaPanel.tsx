import { useState } from 'react'
import { Crosshair, Download, Pentagon, RectangleHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SATELLITES, type AppData, type Satellite } from './data/load'
import { circleRing, type Ring } from './geo/aoi'
import { MapView, type DrawMode, type Theme } from './map/MapView'

export type Area = { kind: 'country' } | { kind: 'state'; uf: string } | { kind: 'ring'; ring: Ring; label: string }
export type View = 'harmonized' | 'observed'

export const SAT_LABEL: Record<Satellite, string> = {
  Terra: 'Terra (MODIS)', Aqua: 'Aqua (MODIS)', 'S-NPP': 'Suomi NPP (VIIRS)', 'NOAA-20': 'NOAA-20 (VIIRS)', 'NOAA-21': 'NOAA-21 (VIIRS)',
}

const card = 'flex flex-col gap-4 rounded-xl border border-line bg-surface p-4'
const field = 'flex flex-col gap-1.5'
const label = 'text-[13px] font-medium text-ink-2'
const toggleOn = 'h-10 flex-1 text-ink-2 data-[state=on]:border-brand data-[state=on]:bg-brand/10 data-[state=on]:text-ink data-[state=on]:font-semibold'
const tall = 'h-10 flex-1 gap-2 text-sm data-[active=true]:border-brand data-[active=true]:shadow-[inset_0_0_0_1px_var(--brand)]'

interface Props {
  data: AppData
  theme: Theme
  area: Area
  onArea: (area: Area) => void
  areaBounds: [number, number, number, number] | null
  drawMode: DrawMode
  onDrawMode: (mode: DrawMode) => void
  onDrawn: (ring: Ring) => void
  view: View
  onView: (view: View) => void
  sat: Satellite
  onSat: (sat: Satellite) => void
  years: number[]
  fromYear: number
  toYear: number
  onRange: (from: number, to: number) => void
  canDownload: boolean
  onDownload: () => void
}

/** Area selection, map, view and range controls. Rendered as a sidebar on desktop and inside a sheet on phones. */
export function AreaPanel(p: Props) {
  const [circle, setCircle] = useState({ lat: '-7.23', lon: '-39.31', km: '30' })
  const [circleError, setCircleError] = useState<string | null>(null)

  const applyCircle = () => {
    const lat = Number(circle.lat), lon = Number(circle.lon), km = Number(circle.km)
    if (!Number.isFinite(lat) || lat < -34 || lat > 6) return setCircleError('Latitude must be between -34 and 6 (Brazil).')
    if (!Number.isFinite(lon) || lon < -74.5 || lon > -28) return setCircleError('Longitude must be between -74.5 and -28 (Brazil).')
    if (!Number.isFinite(km) || km < 5 || km > 500) return setCircleError('Radius must be between 5 and 500 km.')
    setCircleError(null)
    p.onArea({ kind: 'ring', ring: circleRing(lat, lon, km), label: `${km} km around ${lat.toFixed(2)}°, ${lon.toFixed(2)}°` })
  }

  const areaValue = p.area.kind === 'state' ? p.area.uf : p.area.kind === 'country' ? 'BR' : 'ring'

  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <div className={field}>
          <Label htmlFor="area" className={label}>Area</Label>
          <Select value={areaValue} onValueChange={(v) => v !== 'ring' && p.onArea(v === 'BR' ? { kind: 'country' } : { kind: 'state', uf: v })}>
            <SelectTrigger id="area" className="h-10 w-full bg-surface-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              {p.area.kind === 'ring' && <SelectItem value="ring">{p.area.label}</SelectItem>}
              <SelectItem value="BR">Brazil (all states)</SelectItem>
              {p.data.stateList.map((s) => <SelectItem key={s.uf} value={s.uf}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className={field}>
          <span className={label} id="draw-label">Or draw on the map</span>
          <div className="flex gap-2" role="group" aria-labelledby="draw-label">
            {(['rectangle', 'polygon'] as const).map((mode) => (
              <Button key={mode} variant="outline" className={tall} aria-pressed={p.drawMode === mode}
                data-active={p.drawMode === mode || undefined}
                onClick={() => p.onDrawMode(p.drawMode === mode ? 'none' : mode)}>
                {mode === 'rectangle' ? <RectangleHorizontal aria-hidden="true" /> : <Pentagon aria-hidden="true" />}
                {mode === 'rectangle' ? 'Rectangle' : 'Polygon'}
              </Button>
            ))}
          </div>
          {p.drawMode !== 'none' && (
            <p className="m-0 text-[13px] text-ink-3">
              {p.drawMode === 'rectangle' ? 'Click two opposite corners on the map.' : 'Click each corner; click the first point to close.'}
            </p>
          )}
        </div>

        <form className={field} onSubmit={(e) => { e.preventDefault(); applyCircle() }}>
          <span className={label}>Or a point and radius</span>
          <div className="grid grid-cols-[1fr_1fr_0.8fr] gap-2">
            <Input className="h-10 bg-surface-2 tabular-nums" aria-label="Latitude" inputMode="decimal" value={circle.lat} onChange={(e) => setCircle({ ...circle, lat: e.target.value })} />
            <Input className="h-10 bg-surface-2 tabular-nums" aria-label="Longitude" inputMode="decimal" value={circle.lon} onChange={(e) => setCircle({ ...circle, lon: e.target.value })} />
            <Input className="h-10 bg-surface-2 tabular-nums" aria-label="Radius in km" inputMode="decimal" value={circle.km} onChange={(e) => setCircle({ ...circle, km: e.target.value })} />
          </div>
          <Button type="submit" variant="outline" className="h-10 gap-2 text-sm"><Crosshair aria-hidden="true" /> Use lat, lon, radius (km)</Button>
          {circleError && <p className="m-0 text-[13px] text-unusual" role="alert">{circleError}</p>}
        </form>
      </div>

      <MapView key={p.theme} theme={p.theme} states={p.data.states} stateCode={p.area.kind === 'state' ? p.area.uf : null}
        ring={p.area.kind === 'ring' ? p.area.ring : null} bounds={p.areaBounds} drawMode={p.drawMode} onDrawn={p.onDrawn} />

      <div className={card}>
        <div className={field}>
          <span className={label} id="view-label">Values</span>
          <ToggleGroup type="single" variant="outline" value={p.view} aria-labelledby="view-label" className="w-full"
            onValueChange={(v) => v && p.onView(v as View)}>
            <ToggleGroupItem value="harmonized" className={toggleOn}>Harmonized</ToggleGroupItem>
            <ToggleGroupItem value="observed" className={toggleOn}>Observed</ToggleGroupItem>
          </ToggleGroup>
          {p.view === 'observed' && (
            <Select value={p.sat} onValueChange={(v) => p.onSat(v as Satellite)}>
              <SelectTrigger aria-label="Satellite" className="h-10 w-full bg-surface-2"><SelectValue /></SelectTrigger>
              <SelectContent>{SATELLITES.map((s) => <SelectItem key={s} value={s}>{SAT_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
        <div className={field}>
          <span className={label}>Years</span>
          <div className="flex gap-2">
            <Select value={String(p.fromYear)} onValueChange={(v) => p.onRange(Math.min(Number(v), p.toYear), p.toYear)}>
              <SelectTrigger aria-label="From year" className="h-10 flex-1 bg-surface-2 tabular-nums"><SelectValue /></SelectTrigger>
              <SelectContent>{p.years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(p.toYear)} onValueChange={(v) => p.onRange(p.fromYear, Math.max(Number(v), p.fromYear))}>
              <SelectTrigger aria-label="To year" className="h-10 flex-1 bg-surface-2 tabular-nums"><SelectValue /></SelectTrigger>
              <SelectContent>{p.years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <Button className="h-10 gap-2 text-sm" onClick={p.onDownload} disabled={!p.canDownload}>
          <Download aria-hidden="true" /> Download CSV
        </Button>
      </div>
    </div>
  )
}
