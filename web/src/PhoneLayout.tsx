import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download, Layers, Moon, SlidersHorizontal, Sun } from 'lucide-react'
import { SATELLITES, type AppData, type Satellite } from './data/load'
import type { BiomeInfo, MuniNames } from './data/extras'
import type { DrawMode, MapLayer, StateStanding, Theme } from './map/MapView'
import { CircleForm, SAT_LABEL, fold, kindOf, useMuniIndex, type Area, type View } from './AreaPanel'
import { Logo, StatusPill, km2Text, statusOf } from './AreaHeader'
import { useI18n, type Lang } from './i18n'

export type SheetView = 'peek' | 'data' | 'filters' | 'biome' | 'state' | 'muni'

interface Props {
  data: AppData
  area: Area
  onArea: (a: Area) => void
  onPickMuni: (id: string, uf: string, name: string) => void
  name: string
  kindLabel: string
  /** "14 Nov 2026" */
  dataDate: string
  summary: string | null
  percentile: number | null
  percentileText: string | null
  view: SheetView
  onView: (v: SheetView) => void
  /** height of the sheet when it peeks over the map (less on short screens) */
  peekHeight: number
  map: ReactNode
  tabs: ReactNode
  panel: ReactNode
  notices: ReactNode
  canDownload: boolean
  onDownload: () => void
  /** "Share this view", under the CSV download of the data view */
  share?: ReactNode
  drawMode: DrawMode
  onDrawMode: (m: DrawMode) => void
  onConfirmBox: () => void
  biomes: BiomeInfo[]
  standings: Record<string, StateStanding>
  biomeStandings: Record<string, StateStanding>
  /** every municipality, for the search */
  munis: MuniNames | null
  layer: MapLayer
  onLayer: (l: MapLayer) => void
  /** undefined while the file loads, null when it is not published */
  recurrenceYears: [number, number] | null | undefined
  period: [number, number]
  onPeriod: (p: [number, number]) => void
  recentSpan: string | null | undefined
  values: View
  onValues: (v: View) => void
  /** satellite of the "as observed" values */
  sat: Satellite
  onSat: (s: Satellite) => void
  biomeBorders: boolean
  onBiomeBorders: (on: boolean) => void
  stateBorders: boolean
  onStateBorders: (on: boolean) => void
  places: boolean
  onPlaces: (on: boolean) => void
  lang: Lang
  onLang: (l: Lang) => void
  theme: Theme
  onTheme: (t: Theme) => void
}

/** Height of the sheet over the map, per view (design "UI - Mobile", 390 × 844); the peek is set by the caller. */
export const SHEET_HEIGHT: Record<Exclude<SheetView, 'peek'> | 'draw', string> = {
  data: 'calc(100dvh - 92px)', filters: '100dvh', biome: '100dvh', state: '100dvh', muni: '100dvh', draw: '96px',
}

const row = 'flex min-h-14 cursor-pointer items-center gap-3 border-b border-row-line px-1 py-2 text-base'
const radio = 'm-0 size-[22px] flex-none accent-[var(--brand)]'

function Header({ title, onBack, backLabel, action }: { title: string; onBack?: () => void; backLabel?: string; action?: ReactNode }) {
  return (
    <div className={`flex h-16 flex-none items-center gap-2 border-b border-line ${onBack ? 'pl-1 pr-4' : 'pl-4 pr-2'}`}>
      {onBack && <button type="button" className="ico !border-0 !bg-transparent touch" aria-label={backLabel} onClick={onBack}><ChevronLeft size={22} aria-hidden="true" /></button>}
      {/* focus lands on the title when the view opens, so a screen reader announces where the user is */}
      <h2 className="m-0 flex-1 text-xl font-semibold outline-none" tabIndex={-1} data-autofocus>{title}</h2>
      {action}
    </div>
  )
}

/** Phone: the map fills the screen; a sheet at the bottom peeks with the answer, expands to the data, or covers the map
 * with the area and layer choices. */
export function PhoneLayout(p: Props) {
  const i = useI18n()
  const kind = kindOf(p.area)
  const drawing = p.drawMode !== 'none'
  const view: SheetView | 'draw' = drawing ? 'draw' : p.view
  const full = view === 'filters' || view === 'biome' || view === 'state' || view === 'muni'
  const go = (v: SheetView) => () => p.onView(v)
  const muni = useMuniIndex(p.munis)
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const q = fold(query.trim())
    return q.length < 2 ? [] : muni.labels.filter((_, k) => muni.folded[k].includes(q)).slice(0, 40)
  }, [query, muni])
  const yearsFor = p.recurrenceYears ? Array.from({ length: p.recurrenceYears[1] - p.recurrenceYears[0] + 1 }, (_, k) => p.recurrenceYears![0] + k) : []
  const selectedBiome = p.area.kind === 'biome' ? p.biomes.find((b) => b.id === (p.area as { id: string }).id) : null
  const selectedState = p.area.kind === 'state' ? p.data.stateList.find((s) => s.uf === (p.area as { uf: string }).uf) : null
  const sheet = useRef<HTMLElement>(null)

  // a full-screen view takes the focus; going back to the map returns it to the sheet's first control (not on load)
  const prevView = useRef(view)
  useEffect(() => {
    const el = sheet.current
    if (!el || prevView.current === view) return
    prevView.current = view
    const target = el.querySelector<HTMLElement>(full ? '[data-autofocus]' : 'button')
    target?.focus({ preventScroll: true })
  }, [view, full])

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    if (view === 'draw') p.onDrawMode('none')
    else if (view === 'biome' || view === 'state' || view === 'muni') p.onView('filters')
    else if (view !== 'peek') p.onView('peek')
  }

  const chooser = (label: string, sub: string | null, pct: number | null, checked: boolean, pick: () => void, key: string) => (
    <label key={key} className={`${row} items-start py-3`}>
      <input type="radio" name="phone-choice" className={`${radio} mt-0.5`} checked={checked} onChange={pick} />
      <span className="flex flex-1 flex-col gap-1">
        <span className="font-semibold">{label}</span>
        {sub && <span className="text-[13px] text-ink-3">{sub}</span>}
      </span>
      {pct !== null && <StatusPill percentile={pct} short className="!min-h-7 !px-2.5 !text-xs" />}
    </label>
  )
  const height = view === 'peek' ? `${p.peekHeight}px` : SHEET_HEIGHT[view]

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-map-bg">
      <div className="absolute inset-0">{p.map}</div>

      {!full && !drawing && (
        <div className="touch absolute inset-x-3 top-3 z-20 flex items-center gap-2">
          <a href="#method" className="ico float !bg-surface" aria-label={i.t('howMade')}><Logo size={26} satellite={false} label={null} /></a>
          <button type="button" onClick={go('filters')} className="float flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line-2 bg-surface px-4 text-sm font-semibold text-ink">
            <span className="min-w-0 flex-1 truncate text-left">{p.name}</span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <button type="button" className="ico float !bg-surface" aria-label={i.t('mapLayers')} onClick={go('filters')}><Layers size={20} aria-hidden="true" /></button>
        </div>
      )}

      {drawing && (
        <div role="status" className="float absolute inset-x-3 top-3 z-20 rounded-xl border border-brand bg-surface px-4 py-3 text-sm leading-snug">
          {p.drawMode === 'box' ? i.t('dragBox') : p.drawMode === 'rectangle' ? i.t('tapRect') : i.t('tapPoly')}
        </div>
      )}

      <section ref={sheet} onKeyDown={onKey}
        aria-label={view === 'data' ? i.t('fireDataFor', { name: p.name }) : full ? i.t('areaAndLayers') : i.t('selectedArea')}
        className={`sheet absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden border-t border-line-2 bg-surface shadow-[0_-8px_24px_rgb(5_10_20/0.55)] ${full ? '' : 'rounded-t-[20px]'}`}
        style={{ height }}>
        {(view === 'peek' || view === 'data') && (
          <button type="button" className="flex h-7 w-full flex-none items-center justify-center" onClick={go(view === 'data' ? 'peek' : 'data')}
            aria-expanded={view === 'data'} aria-label={view === 'data' ? i.t('collapseToMap') : i.t('expandData')}>
            <span className="h-1 w-10 rounded-full bg-handle" />
          </button>
        )}

        {view === 'peek' && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 max-[700px]:gap-2 max-[700px]:pb-3">
            <div className="flex flex-col gap-1">
              <h1 className="m-0 text-xl font-semibold">{p.name}</h1>
              <span className="text-xs text-ink-3">{i.t('kindDataThrough', { kind: p.kindLabel, date: p.dataDate })}</span>
            </div>
            <p className="m-0 text-base leading-[1.45] max-[700px]:text-[15px]">{p.summary ?? i.t('loadingHistory')}</p>
            {p.percentile !== null && <div><StatusPill percentile={p.percentile} /></div>}
            {p.notices}
            <div className="touch mt-auto grid grid-cols-2 gap-2 max-[359px]:[&_.btn]:gap-1.5 max-[359px]:[&_.btn]:px-2.5 max-[359px]:[&_.btn]:text-[13px]">
              <button type="button" className="btn" onClick={go('filters')}><SlidersHorizontal size={18} aria-hidden="true" /> {i.t('areaAndLayers')}</button>
              <button type="button" className="btn main" onClick={go('data')}><CalendarDays size={18} aria-hidden="true" /> {i.t('fireCalendar')}</button>
            </div>
          </div>
        )}

        {view === 'data' && (
          <>
            <div className="flex flex-none flex-col gap-3 px-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h1 className="m-0 truncate text-base font-semibold">{p.name}</h1>
                  {p.percentile !== null && <span className="text-xs text-ink-2">{statusOf(p.percentile, i).text}, {p.percentileText}</span>}
                </div>
                <button type="button" className="ico touch" aria-label={i.t('backToMap')} onClick={go('peek')}><ChevronDown size={20} aria-hidden="true" /></button>
              </div>
              {p.tabs}
            </div>
            <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6">
              {p.notices}
              {p.panel}
              <button type="button" className="btn touch mt-5 w-full !min-h-12 !rounded-xl" onClick={p.onDownload} disabled={!p.canDownload}>
                <Download size={18} aria-hidden="true" /> {i.t('downloadCsv')}
              </button>
              {p.share && <div className="mt-4">{p.share}</div>}
            </div>
          </>
        )}

        {view === 'filters' && (
          <div role="dialog" aria-label={i.t('areaAndLayers')} className="flex min-h-0 flex-1 flex-col">
            <Header title={i.t('areaAndLayers')} action={<button type="button" className="min-h-12 px-4 text-base font-semibold text-link" onClick={go('peek')}>{i.t('done')}</button>} />
            <div className="touch relative flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
              <fieldset className="m-0 border-0 p-0">
                <legend className="lbl mb-1 p-0">{i.t('area')}</legend>
                <label className={row}><input type="radio" name="phone-kind" className={radio} checked={kind === 'brazil'} onChange={() => p.onArea({ kind: 'country' })} /><span className="flex-1">{i.t('kindBrazil')}</span></label>
                {p.biomes.length > 0 && (
                  <label className={row}>
                    <input type="radio" name="phone-kind" className={radio} checked={kind === 'biome'} onChange={() => {}} onClick={go('biome')} />
                    <span className="flex-1">{i.t('kindBiome')}</span><span className="text-sm text-ink-3">{selectedBiome?.name}</span><ChevronRight size={18} className="text-ink-3" aria-hidden="true" />
                  </label>
                )}
                <label className={row}>
                  <input type="radio" name="phone-kind" className={radio} checked={kind === 'state'} onChange={() => {}} onClick={go('state')} />
                  <span className="flex-1">{i.t('kindState')}</span><span className="text-sm text-ink-3">{selectedState?.name}</span><ChevronRight size={18} className="text-ink-3" aria-hidden="true" />
                </label>
                {p.munis && (
                  <label className={row}>
                    <input type="radio" name="phone-kind" className={radio} checked={kind === 'muni'} onChange={() => {}} onClick={go('muni')} />
                    <span className="flex-1">{i.t('kindMuni')}</span><ChevronRight size={18} className="text-ink-3" aria-hidden="true" />
                  </label>
                )}
                <label className={row}>
                  <input type="radio" name="phone-kind" className={radio} checked={kind === 'drawn'} onChange={() => {}} onClick={() => p.onDrawMode('box')} />
                  <span className="flex-1">{i.t('drawArea')}</span>
                </label>
                <details className="pt-3 [&_.ctl]:!h-12">
                  <summary className="cursor-pointer text-sm text-ink-2">{i.t('orTypePoint')}</summary>
                  <CircleForm onArea={(a) => { p.onArea(a); p.onView('peek') }} />
                </details>
              </fieldset>

              <div className="flex flex-col gap-2">
                <p className="lbl" id="phone-values">{i.t('values')}</p>
                <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="phone-values">
                  <button type="button" className="btn" aria-pressed={p.values === 'harmonized'} onClick={() => p.onValues('harmonized')}>{i.t('harmonized')}</button>
                  <button type="button" className="btn" aria-pressed={p.values === 'observed'} onClick={() => p.onValues('observed')}>{i.t('observed')}</button>
                </div>
                {p.values === 'observed' && (
                  <select className="ctl !h-12" aria-label={i.t('satellite')} value={p.sat} onChange={(e) => p.onSat(e.target.value as Satellite)}>
                    {SATELLITES.map((s) => <option key={s} value={s}>{SAT_LABEL[s]}</option>)}
                  </select>
                )}
                <span className="text-xs leading-snug text-ink-3">{i.t('harmonizedHelp')}</span>
              </div>

              <fieldset className="m-0 border-0 p-0">
                <legend className="lbl mb-1 p-0">{i.t('dataOnMap')}</legend>
                {([['recurrence', i.t('layerRecurrence')], ['normal', i.t('layerNormal')], ['recent', i.t('layerRecent')], ['none', i.t('layerNone')]] as [MapLayer, string][]).map(([v, text]) => (
                  <div key={v}>
                    <label className={row}><input type="radio" name="phone-layer" className={radio} checked={p.layer === v} onChange={() => p.onLayer(v)} /><span className="flex-1">{text}</span>
                      {v === 'recent' && p.recentSpan && <span className="text-xs text-ink-3">{p.recentSpan}</span>}</label>
                    {v === 'recurrence' && p.layer === 'recurrence' && p.recurrenceYears && (
                      <div className="flex items-center gap-2 py-2 pl-[34px] text-sm text-ink-2">
                        <select className="ctl !w-24" aria-label={i.t('recFrom')} value={p.period[0]} onChange={(e) => p.onPeriod([Math.min(Number(e.target.value), p.period[1]), p.period[1]])}>
                          {yearsFor.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <span>{i.t('to')}</span>
                        <select className="ctl !w-24" aria-label={i.t('recTo')} value={p.period[1]} onChange={(e) => p.onPeriod([p.period[0], Math.max(Number(e.target.value), p.period[0])])}>
                          {yearsFor.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </fieldset>

              <fieldset className="m-0 border-0 p-0">
                <legend className="lbl mb-1 p-0">{i.t('borders')}</legend>
                <label className={row}><input type="checkbox" className={radio} checked={p.biomeBorders} disabled={!p.biomes.length} onChange={(e) => p.onBiomeBorders(e.target.checked)} /><span className="flex-1">{i.t('biomeBorders')}</span></label>
                <label className={row}><input type="checkbox" className={radio} checked={p.stateBorders} onChange={(e) => p.onStateBorders(e.target.checked)} /><span className="flex-1">{i.t('stateBorders')}</span></label>
                <label className={row}><input type="checkbox" className={radio} checked={p.places} onChange={(e) => p.onPlaces(e.target.checked)} /><span className="flex-1">{i.t('places')}</span></label>
              </fieldset>

              <div className="flex flex-col gap-2">
                <p className="lbl" id="phone-lang">{i.t('language')}</p>
                <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="phone-lang">
                  <button type="button" lang="en" className="btn" aria-pressed={p.lang === 'en'} onClick={() => p.onLang('en')}>English</button>
                  <button type="button" lang="pt-BR" className="btn" aria-pressed={p.lang === 'pt'} onClick={() => p.onLang('pt')}>Português</button>
                </div>
              </div>

              {/* phones have no header bar: the theme switch of the other layouts lives here */}
              <div className="flex flex-col gap-2">
                <p className="lbl" id="phone-theme">{i.t('theme')}</p>
                <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="phone-theme">
                  <button type="button" className="btn" aria-pressed={p.theme === 'dark'} onClick={() => p.onTheme('dark')}><Moon size={16} aria-hidden="true" />{i.t('themeDark')}</button>
                  <button type="button" className="btn" aria-pressed={p.theme === 'light'} onClick={() => p.onTheme('light')}><Sun size={16} aria-hidden="true" />{i.t('themeLight')}</button>
                </div>
              </div>
            </div>
            <div className="touch flex-none border-t border-line px-4 pt-3 pb-6">
              <button type="button" className="btn main w-full" onClick={go('peek')}>{i.t('showOnMap')}</button>
            </div>
          </div>
        )}

        {view === 'biome' && (
          <div role="dialog" aria-label={i.t('chooseBiome')} className="flex min-h-0 flex-1 flex-col">
            <Header title={i.t('chooseBiome')} onBack={go('filters')} backLabel={i.t('backToFilters')} />
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
              <p className="mt-2 mb-3 text-sm leading-[1.45] text-ink-2">{i.t('biomeHelp')}</p>
              <fieldset className="m-0 border-0 p-0">
                <legend className="sr-only">{i.t('kindBiome')}</legend>
                {p.biomes.map((b) => {
                  const st = p.biomeStandings[b.id]
                  const sub = `${km2Text(b.area_km2, i)}${st ? `, ${i.t('detSoFar', { n: i.k(st.ytd) })}` : ''}`
                  return chooser(b.name, sub, st?.percentile ?? null, p.area.kind === 'biome' && p.area.id === b.id, () => p.onArea({ kind: 'biome', id: b.id }), b.id)
                })}
              </fieldset>
            </div>
            <div className="touch flex-none border-t border-line px-4 pt-3 pb-6">
              <button type="button" className="btn main w-full" onClick={go('peek')}>{selectedBiome ? i.t('showName', { name: selectedBiome.name }) : i.t('showOnMap')}</button>
            </div>
          </div>
        )}

        {view === 'state' && (
          <div role="dialog" aria-label={i.t('chooseState')} className="flex min-h-0 flex-1 flex-col">
            <Header title={i.t('chooseState')} onBack={go('filters')} backLabel={i.t('backToFilters')} />
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
              <fieldset className="m-0 border-0 p-0">
                <legend className="sr-only">{i.t('kindState')}</legend>
                {p.data.stateList.map((s) => {
                  const st = p.standings[s.uf]
                  return chooser(s.name, st ? i.t('detSoFar', { n: i.k(st.ytd) }) : null, st?.percentile ?? null, p.area.kind === 'state' && p.area.uf === s.uf, () => p.onArea({ kind: 'state', uf: s.uf }), s.uf)
                })}
              </fieldset>
            </div>
            <div className="touch flex-none border-t border-line px-4 pt-3 pb-6">
              <button type="button" className="btn main w-full" onClick={go('peek')}>{selectedState ? i.t('showName', { name: selectedState.name }) : i.t('showOnMap')}</button>
            </div>
          </div>
        )}

        {view === 'muni' && (
          <div role="dialog" aria-label={i.t('chooseMuni')} className="flex min-h-0 flex-1 flex-col">
            <Header title={i.t('chooseMuni')} onBack={go('filters')} backLabel={i.t('backToFilters')} />
            <div className="touch flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pt-4 pb-4">
              <label className="lbl" htmlFor="phone-muni">{i.t('kindMuni')}</label>
              <input id="phone-muni" className="ctl" type="search" placeholder={i.t('typeMuni')} autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
              <ul className="m-0 list-none p-0" aria-label={i.t('matching')}>
                {matches.map((l) => {
                  const hit = muni.byLabel.get(l)!
                  return (
                    <li key={l}>
                      <button type="button" className={`${row} w-full text-left`} onClick={() => { p.onPickMuni(hit[0], hit[1], hit[2]); p.onView('peek') }}>{l}</button>
                    </li>
                  )
                })}
              </ul>
              {query.trim().length >= 2 && !matches.length && <p className="text-sm text-ink-3">{i.t('noMatch', { q: query })}</p>}
            </div>
          </div>
        )}

        {view === 'draw' && (
          <div className="touch grid grid-cols-2 gap-2 px-4 pt-4 pb-6">
            <button type="button" className="btn" onClick={() => { p.onDrawMode('none'); p.onView('filters') }}>{i.t('cancel')}</button>
            {p.drawMode === 'box'
              ? <button type="button" className="btn main" onClick={p.onConfirmBox}>{i.t('useArea')}</button>
              : <button type="button" className="btn" onClick={() => p.onDrawMode('box')}>{i.t('useArea')}</button>}
          </div>
        )}
      </section>
    </main>
  )
}
