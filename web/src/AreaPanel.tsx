import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Crosshair, Download, Pentagon, Printer, RectangleHorizontal } from 'lucide-react'
import { SATELLITES, type AppData, type Satellite } from './data/load'
import { circleRing, type Ring } from './geo/aoi'
import type { BiomeInfo, MuniNames } from './data/extras'
import type { DrawMode, MapLayer } from './map/MapView'
import { useI18n, type Key } from './i18n'

/** A ring is a drawn shape, a point and radius, or a municipality outline: `origin` says which. */
export type Area =
  | { kind: 'country' }
  | { kind: 'state'; uf: string }
  | { kind: 'biome'; id: string }
  | { kind: 'ring'; ring: Ring; label: string; origin: 'draw' | 'circle' | 'muni'; circle?: { lat: number; lon: number; km: number }; muni?: string
      /** other parts of a municipality (islands, enclaves), counted with `ring` */
      parts?: Ring[] }
export type View = 'harmonized' | 'observed'
export type AreaKind = 'brazil' | 'biome' | 'state' | 'muni' | 'drawn'

export const SAT_LABEL: Record<Satellite, string> = {
  Terra: 'Terra (MODIS)', Aqua: 'Aqua (MODIS)', 'S-NPP': 'Suomi NPP (VIIRS)', 'NOAA-20': 'NOAA-20 (VIIRS)', 'NOAA-21': 'NOAA-21 (VIIRS)',
}

export const KIND_KEY: Record<AreaKind, Key> = { brazil: 'kindBrazil', biome: 'kindBiome', state: 'kindState', muni: 'kindMuni', drawn: 'kindDrawn' }

export const kindOf = (a: Area): AreaKind =>
  a.kind === 'country' ? 'brazil' : a.kind === 'state' ? 'state' : a.kind === 'biome' ? 'biome' : a.origin === 'muni' ? 'muni' : 'drawn'

/** The first area of a kind, when the kind changes: the design opens on Caatinga and Ceará. */
export function defaultArea(kind: 'biome' | 'state', data: AppData, biomes: BiomeInfo[]): Area | null {
  if (kind === 'biome') {
    const b = biomes.find((x) => x.id === 'caatinga') ?? biomes[0]
    return b ? { kind: 'biome', id: b.id } : null
  }
  const s = data.stateList.find((x) => x.uf === 'CE') ?? data.stateList[0]
  return s ? { kind: 'state', uf: s.uf } : null
}

// one collator for the 5 thousand names: localeCompare with a locale builds a new one on every comparison
const PT_ORDER = new Intl.Collator('pt-BR')

/** Lower case without accents, for searching names: "São Paulo" and "sao paulo" fold to the same text. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')

/** Municipality search: "Iguatu, CE" → its row, for an <input list> with a datalist. */
export function useMuniIndex(munis: MuniNames | null) {
  return useMemo(() => {
    const byLabel = new Map<string, [string, string, string]>()
    for (const [id, name, uf] of munis ?? []) byLabel.set(`${name}, ${uf}`, [id, uf, name])
    const labels = [...byLabel.keys()].sort(PT_ORDER.compare)
    // folded once, for the phone search that filters on every key press
    const folded = labels.map(fold)
    const byFolded = new Map(folded.map((f, k) => [f, labels[k]]))
    return { byLabel, labels, folded, byFolded }
  }, [munis])
}

/** Point and radius: an extra way to draw an area (lat, lon, km). */
export function CircleForm({ onArea }: { onArea: (a: Area) => void }) {
  const i = useI18n()
  const [circle, setCircle] = useState({ lat: '-7.23', lon: '-39.31', km: '30' })
  const [error, setError] = useState<string | null>(null)
  const num = (s: string) => Number(s.replace(',', '.'))
  const apply = () => {
    const lat = num(circle.lat), lon = num(circle.lon), km = num(circle.km)
    if (!Number.isFinite(lat) || lat < -34 || lat > 6) return setError(i.t('errLat'))
    if (!Number.isFinite(lon) || lon < -74.5 || lon > -28) return setError(i.t('errLon'))
    if (!Number.isFinite(km) || km < 5 || km > 500) return setError(i.t('errKm'))
    setError(null)
    onArea({ kind: 'ring', ring: circleRing(lat, lon, km), label: `${km} km, ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, origin: 'circle', circle: { lat, lon, km } })
  }
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); apply() }}>
      <span className="text-xs text-ink-3">{i.t('orPoint')}</span>
      {/* visible labels: a placeholder-less number field does not say what it holds */}
      <div className="grid grid-cols-[1fr_1fr_0.8fr] items-end gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-3">{i.t('latitude')}
          <input className="ctl" inputMode="decimal" value={circle.lat} onChange={(e) => setCircle({ ...circle, lat: e.target.value })} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-3">{i.t('longitude')}
          <input className="ctl" inputMode="decimal" value={circle.lon} onChange={(e) => setCircle({ ...circle, lon: e.target.value })} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-3">{i.t('radiusKm')}
          <input className="ctl" inputMode="decimal" value={circle.km} onChange={(e) => setCircle({ ...circle, km: e.target.value })} />
        </label>
      </div>
      <button type="submit" className="btn"><Crosshair size={16} aria-hidden="true" /> {i.t('useCircle')}</button>
      {error && <p className="m-0 text-[13px] text-unusual" role="alert">{error}</p>}
    </form>
  )
}

interface Props {
  data: AppData
  area: Area
  onArea: (area: Area) => void
  drawMode: DrawMode
  onDrawMode: (mode: DrawMode) => void
  layer: MapLayer
  onLayer: (layer: MapLayer) => void
  /** IBGE biomes, once biomes.geojson has loaded */
  biomes: BiomeInfo[]
  /** every municipality, for the search (municipalities/index.json) */
  munis: MuniNames | null
  onPickMuni: (id: string, uf: string, name: string) => void
  biomeBorders: boolean
  onBiomeBorders: (on: boolean) => void
  stateBorders: boolean
  onStateBorders: (on: boolean) => void
  places: boolean
  onPlaces: (on: boolean) => void
  /** recurrence: years available and the chosen period; undefined while the file loads, null when not published */
  recurrenceYears: [number, number] | null | undefined
  period: [number, number]
  onPeriod: (period: [number, number]) => void
  /** dates of the last-7-days file; undefined until its layer is picked (it loads then), null when not published */
  recentSpan: string | null | undefined
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
  /** "Print report" (desktop) */
  onPrint?: () => void
  /** "Share this view" (desktop sidebar) */
  share?: ReactNode
  /** "About this area" lines (desktop); the tablet shows them beside the data instead */
  about?: ReactNode
  /** tablet drawer: 48 px controls, biomes as radio buttons, no download button (it sits beside the data) */
  touch?: boolean
}

/** Area, values, years and map layers: the left column on desktop, a side drawer on tablets (design "UI - PC"). */
export function AreaPanel(p: Props) {
  const i = useI18n()
  const derived = kindOf(p.area)
  // Municipality and Drawn area show their controls before an area of that kind exists.
  const [pending, setPending] = useState<AreaKind | null>(null)
  useEffect(() => setPending(null), [p.area])
  const kind = pending ?? derived
  const muni = useMuniIndex(p.munis)
  const [muniText, setMuniText] = useState(p.area.kind === 'ring' && p.area.origin === 'muni' ? p.area.label : '')

  const pickKind = (k: AreaKind) => {
    if (k === 'brazil') return p.onArea({ kind: 'country' })
    if (k === 'biome' || k === 'state') {
      const a = derived === k ? p.area : defaultArea(k, p.data, p.biomes)
      if (a) p.onArea(a)
      return
    }
    setPending(k)
  }
  // Municipality search (#6): our own suggestion list instead of a <datalist>, whose filtering is the browser's and
  // does not ignore accents. "sao paulo" finds São Paulo; arrows, Enter and Escape work (ARIA combobox pattern).
  const [muniOpen, setMuniOpen] = useState(false)
  const [muniActive, setMuniActive] = useState(-1)
  const muniMatches = useMemo(() => {
    const q = fold(muniText.trim())
    if (q.length < 2) return []
    // the name itself first ("sao paulo" → São Paulo, SP before São Paulo das Missões), then names that start with it
    const exact: string[] = []
    const starts: string[] = []
    const inside: string[] = []
    muni.folded.forEach((f, k) => {
      if (f.startsWith(`${q},`)) exact.push(muni.labels[k])
      else if (f.startsWith(q)) starts.push(muni.labels[k])
      else if (f.includes(q)) inside.push(muni.labels[k])
    })
    return [...exact, ...starts, ...inside].slice(0, 8)
  }, [muniText, muni])
  const pickMuniLabel = (label: string) => {
    const hit = muni.byLabel.get(label)
    if (!hit) return false
    setMuniText(label)
    setMuniOpen(false)
    p.onPickMuni(hit[0], hit[1], hit[2])
    return true
  }
  const onMuniText = (text: string) => {
    setMuniText(text)
    setMuniOpen(true)
    setMuniActive(-1)
    // a full name, also typed without accents ("sao paulo, sp")
    const label = muni.byLabel.has(text) ? text : muni.byFolded.get(fold(text.trim()))
    if (label) pickMuniLabel(label)
  }
  const onMuniKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = muniMatches.length
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); setMuniOpen(true); setMuniActive((a) => Math.min(n - 1, a + 1)) }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setMuniActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && muniOpen && n) { e.preventDefault(); pickMuniLabel(muniMatches[Math.max(0, muniActive)]) }
    else if (e.key === 'Escape' && muniOpen) { e.preventDefault(); setMuniOpen(false) }
  }
  const yearsFor = p.recurrenceYears ? Array.from({ length: p.recurrenceYears[1] - p.recurrenceYears[0] + 1 }, (_, k) => p.recurrenceYears![0] + k) : []
  const layers: [MapLayer, string, string | null][] = [
    ['recurrence', i.t('layerRecurrence'), p.recurrenceYears === null ? i.t('notPublished') : null],
    ['normal', i.t('layerNormal'), null],
    ['recent', i.t('layerRecent'), p.recentSpan === null ? i.t('notPublished') : p.recentSpan ?? null],
    ['none', i.t('layerNone'), null],
  ]
  const sub = 'text-[13px] text-ink-3'

  return (
    <div className={`flex min-h-full flex-col gap-5 ${p.touch ? 'touch gap-6' : ''}`}>
      <div className="flex flex-col gap-2">
        <label className="lbl" htmlFor="area-kind">{i.t('area')}</label>
        <select id="area-kind" className="ctl" value={kind} onChange={(e) => pickKind(e.target.value as AreaKind)}>
          {(Object.keys(KIND_KEY) as AreaKind[]).filter((k) => (k === 'biome' ? p.biomes.length : k === 'muni' ? p.munis : true))
            .map((k) => <option key={k} value={k}>{i.t(KIND_KEY[k])}</option>)}
        </select>

        {kind === 'biome' && (p.touch ? (
          <fieldset className="m-0 mt-1 flex flex-col border-0 p-0">
            <legend className={`${sub} mb-1 p-0`}>{i.t('biomeIbge')}</legend>
            {p.biomes.map((b) => (
              <label key={b.id} className="opt">
                <input type="radio" name="biome" checked={p.area.kind === 'biome' && p.area.id === b.id} onChange={() => p.onArea({ kind: 'biome', id: b.id })} />{b.name}
              </label>
            ))}
          </fieldset>
        ) : (
          <>
            <label className={sub} htmlFor="area-biome">{i.t('biomeIbge')}</label>
            <select id="area-biome" className="ctl" value={p.area.kind === 'biome' ? p.area.id : ''} onChange={(e) => p.onArea({ kind: 'biome', id: e.target.value })}>
              {p.biomes.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </>
        ))}
        {kind === 'state' && (
          <>
            <label className={sub} htmlFor="area-state">{i.t('kindState')}</label>
            <select id="area-state" className="ctl" value={p.area.kind === 'state' ? p.area.uf : ''} onChange={(e) => p.onArea({ kind: 'state', uf: e.target.value })}>
              {p.data.stateList.map((s) => <option key={s.uf} value={s.uf}>{s.name}</option>)}
            </select>
          </>
        )}
        {kind === 'muni' && (
          <>
            <label className={sub} htmlFor="area-muni">{i.t('kindMuni')}</label>
            <div className="relative">
              <input id="area-muni" className="ctl" type="search" placeholder={i.t('typeMuni')} autoComplete="off"
                role="combobox" aria-autocomplete="list" aria-controls="muni-options" aria-expanded={muniOpen && muniMatches.length > 0}
                aria-activedescendant={muniOpen && muniActive >= 0 ? `muni-opt-${muniActive}` : undefined}
                value={muniText} onChange={(e) => onMuniText(e.target.value)} onKeyDown={onMuniKey}
                onFocus={() => setMuniOpen(true)} onBlur={() => setMuniOpen(false)} />
              {muniOpen && muniMatches.length > 0 && (
                <ul id="muni-options" role="listbox" aria-label={i.t('kindMuni')}
                  className="absolute inset-x-0 top-full z-20 m-0 mt-1 max-h-64 list-none overflow-y-auto rounded-[10px] border border-line-2 bg-surface p-1 shadow-[0_10px_30px_rgb(0_0_0/0.35)]">
                  {muniMatches.map((l, k) => (
                    <li key={l} id={`muni-opt-${k}`} role="option" aria-selected={k === muniActive}
                      className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-ink aria-selected:bg-surface-2"
                      onMouseDown={(e) => { e.preventDefault(); pickMuniLabel(l) }} onMouseEnter={() => setMuniActive(k)}>
                      {l}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        {kind === 'drawn' && (
          <>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={i.t('drawOnMap')}>
              {(['rectangle', 'polygon'] as const).map((mode) => (
                <button key={mode} type="button" className="btn" aria-pressed={p.drawMode === mode}
                  onClick={() => p.onDrawMode(p.drawMode === mode ? 'none' : mode)}>
                  {mode === 'rectangle' ? <RectangleHorizontal size={16} aria-hidden="true" /> : <Pentagon size={16} aria-hidden="true" />}
                  {i.t(mode)}
                </button>
              ))}
            </div>
            <p className={`m-0 ${sub}`}>
              {p.drawMode === 'rectangle' ? i.t('clickRect') : p.drawMode === 'polygon' ? i.t('clickPoly') : i.t('pickShape')}
            </p>
            <CircleForm onArea={p.onArea} />
          </>
        )}
      </div>

      {p.about && (
        <section aria-label={i.t('aboutTitle')} className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-panel p-3.5 text-[13px] leading-[1.45] text-ink-2">
          <p className="m-0 font-semibold text-ink">{i.t('aboutTitle')}</p>
          {p.about}
        </section>
      )}

      <div className="flex flex-col gap-2">
        <p className="lbl" id="values-label">{i.t('values')}</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="values-label">
          <button type="button" className="btn" aria-pressed={p.view === 'harmonized'} onClick={() => p.onView('harmonized')}>{i.t('harmonized')}</button>
          <button type="button" className="btn" aria-pressed={p.view === 'observed'} onClick={() => p.onView('observed')}>{i.t('observed')}</button>
        </div>
        {p.view === 'observed' && (
          <select className="ctl" aria-label={i.t('satellite')} value={p.sat} onChange={(e) => p.onSat(e.target.value as Satellite)}>
            {SATELLITES.map((s) => <option key={s} value={s}>{SAT_LABEL[s]}</option>)}
          </select>
        )}
        {p.touch && <span className="text-xs leading-snug text-ink-3">{i.t('harmonizedHelp')}</span>}
      </div>

      <div className="flex flex-col gap-2">
        <p className="lbl">{i.t('years')}</p>
        <div className="grid grid-cols-2 gap-2">
          <select className="ctl" aria-label={i.t('fromYear')} value={p.fromYear} onChange={(e) => p.onRange(Math.min(Number(e.target.value), p.toYear), p.toYear)}>
            {p.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="ctl" aria-label={i.t('toYear')} value={p.toYear} onChange={(e) => p.onRange(p.fromYear, Math.max(Number(e.target.value), p.fromYear))}>
            {p.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="lbl mb-2 p-0">{i.t('mapLayers')}</legend>
        <span className="text-xs text-ink-3">{i.t('oneAtATime')}</span>
        {layers.map(([v, text, note]) => (
          <div key={v} className="flex flex-col">
            <label className="opt">
              <input type="radio" name="map-layer" checked={p.layer === v} onChange={() => p.onLayer(v)} />
              <span className="flex flex-col leading-tight">{text}{note && <span className="text-xs text-ink-3">{note}</span>}</span>
            </label>
            {v === 'recurrence' && p.layer === 'recurrence' && p.recurrenceYears && (
              <div className="flex items-center gap-1.5 pb-1 pl-7 text-xs text-ink-2">
                <select className="ctl !h-8 !w-[76px] !px-1.5 !text-xs" aria-label={i.t('recFrom')} value={p.period[0]}
                  onChange={(e) => p.onPeriod([Math.min(Number(e.target.value), p.period[1]), p.period[1]])}>
                  {yearsFor.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <span>{i.t('to')}</span>
                <select className="ctl !h-8 !w-[76px] !px-1.5 !text-xs" aria-label={i.t('recTo')} value={p.period[1]}
                  onChange={(e) => p.onPeriod([p.period[0], Math.max(Number(e.target.value), p.period[0])])}>
                  {yearsFor.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
          </div>
        ))}
        <span className="mt-1.5 text-xs text-ink-3">{i.t('borders')}</span>
        <label className="opt">
          <input type="checkbox" checked={p.biomeBorders} disabled={!p.biomes.length} onChange={(e) => p.onBiomeBorders(e.target.checked)} />{i.t('biomeBorders')}
        </label>
        <label className="opt">
          <input type="checkbox" checked={p.stateBorders} onChange={(e) => p.onStateBorders(e.target.checked)} />{i.t('stateBorders')}
        </label>
        <label className="opt">
          <input type="checkbox" checked={p.places} onChange={(e) => p.onPlaces(e.target.checked)} />{i.t('places')}
        </label>
      </fieldset>

      {!p.touch && (
        <>
          <div className="grow" />
          <button type="button" className="btn main" onClick={p.onDownload} disabled={!p.canDownload}>
            <Download size={16} strokeWidth={2.2} aria-hidden="true" /> {i.t('downloadCsv')}
          </button>
          {p.onPrint && (
            <button type="button" className="btn" onClick={p.onPrint} disabled={!p.canDownload}>
              <Printer size={16} aria-hidden="true" /> {i.t('printReport')}
            </button>
          )}
          {p.share}
        </>
      )}
      {/* the CSV holds monthly counts; single detections need the FIRMS archive (and a key that never reaches this site) */}
      <p className="m-0 text-xs leading-snug text-ink-3">
        {i.t('hotspotsNeed')}{' '}
        <a className="text-link underline underline-offset-2" href="https://firms.modaps.eosdis.nasa.gov/download/" target="_blank" rel="noreferrer">
          {i.t('hotspotsLink')}<span className="sr-only"> {i.t('newTab')}</span>
        </a>
      </p>
    </div>
  )
}
