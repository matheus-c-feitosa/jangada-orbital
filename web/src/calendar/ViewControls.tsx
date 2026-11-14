import { Download, ImageDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SATELLITES, type Satellite } from '../data/load'
import { SAT_LABEL, type View } from '../AreaPanel'

const field = 'flex flex-col gap-1.5 max-sm:w-full'
const label = 'text-[13px] font-medium text-ink-2'
const toggleOn = 'h-10 min-w-28 max-sm:flex-1 text-ink-2 data-[state=on]:border-brand data-[state=on]:bg-brand/10 data-[state=on]:text-ink data-[state=on]:font-semibold'

interface Props {
  view: View
  onView: (view: View) => void
  sat: Satellite
  onSat: (sat: Satellite) => void
  years: number[]
  fromYear: number
  toYear: number
  onRange: (from: number, to: number) => void
  canExport: boolean
  onCsv: () => void
  onImage: () => void
  imageBusy: boolean
  imageError: string | null
  /** west, south, east, north of the area and the date range, for the NASA FIRMS archive request */
  firms: { bbox: [number, number, number, number]; from: string; to: string }
}

/**
 * What the calendar shows and what leaves the page: values, years, CSV, image. It sits right above the calendar,
 * on every screen size, so a phone user does not have to reopen the area sheet to change the view or download.
 */
export function ViewControls(p: Props) {
  const [w, s, e, n] = p.firms.bbox.map((v) => v.toFixed(2))
  return (
    <section aria-label="View and export" className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className={field}>
          <span className={label} id="view-label">Values</span>
          <ToggleGroup type="single" variant="outline" value={p.view} aria-labelledby="view-label" className="max-sm:w-full" onValueChange={(v) => v && p.onView(v as View)}>
            <ToggleGroupItem value="harmonized" className={toggleOn}>Harmonized</ToggleGroupItem>
            <ToggleGroupItem value="observed" className={toggleOn}>Observed</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {p.view === 'observed' && (
          <div className={field}>
            <span className={label}>Satellite</span>
            <Select value={p.sat} onValueChange={(v) => p.onSat(v as Satellite)}>
              <SelectTrigger aria-label="Satellite" className="h-10 w-48 bg-surface-2 data-[size=default]:h-10 max-sm:w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{SATELLITES.map((x) => <SelectItem key={x} value={x}>{SAT_LABEL[x]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className={field}>
          <span className={label}>Years</span>
          <div className="flex items-center gap-2 max-sm:[&>*:not(span)]:flex-1">
            <Select value={String(p.fromYear)} onValueChange={(v) => p.onRange(Math.min(Number(v), p.toYear), p.toYear)}>
              <SelectTrigger aria-label="From year" className="h-10 w-24 bg-surface-2 tabular-nums data-[size=default]:h-10 max-sm:w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{p.years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <span aria-hidden="true" className="text-ink-3">–</span>
            <Select value={String(p.toYear)} onValueChange={(v) => p.onRange(p.fromYear, Math.max(Number(v), p.fromYear))}>
              <SelectTrigger aria-label="To year" className="h-10 w-24 bg-surface-2 tabular-nums data-[size=default]:h-10 max-sm:w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{p.years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto max-sm:w-full">
          <Button className="h-10 gap-2 text-sm max-sm:flex-1" onClick={p.onCsv} disabled={!p.canExport}>
            <Download aria-hidden="true" /> Download CSV
          </Button>
          <Button variant="outline" className="h-10 gap-2 text-sm max-sm:flex-1" onClick={p.onImage} disabled={!p.canExport || p.imageBusy}>
            <ImageDown aria-hidden="true" /> Download image
          </Button>
        </div>
      </div>
      {p.imageError && <p className="m-0 text-[13px] text-unusual" role="alert">{p.imageError}</p>}
      <details className="max-w-[70ch] text-sm text-ink-2 [&_a]:text-ink [&_a]:underline">
        <summary className="min-h-6 cursor-pointer">Need the individual hotspots?</summary>
        <p className="mt-2 mb-0">
          The CSV holds monthly counts per area, not single detections. For every detection (time, position, confidence, fire
          radiative power), request an archive from{' '}
          <a href="https://firms.modaps.eosdis.nasa.gov/download/" target="_blank" rel="noreferrer">NASA FIRMS</a> with this
          bounding box (west, south, east, north): <span className="tabular-nums">{w}, {s}, {e}, {n}</span>; dates{' '}
          <span className="tabular-nums">{p.firms.from}</span> to <span className="tabular-nums">{p.firms.to}</span>; products
          MODIS C6.1 and VIIRS 375 m.
        </p>
      </details>
    </section>
  )
}
