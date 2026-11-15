import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import type { AppData } from '../data/load'
import type { BiomeData, MuniRanking } from '../data/extras'
import { downloadText } from '../data/csv'
import { rankAreas, type RankSort } from './ranking'
import { useI18n, type Key } from '../i18n'

export const MAX_COMPARE = 3

export type RankScope = 'states' | 'biomes' | 'municipalities'
const SCOPE_KEY: Record<RankScope, Key> = { states: 'scopeStates', biomes: 'scopeBiomes', municipalities: 'scopeMunis' }

interface Row {
  /** state code, "bio:<id>" or IBGE municipality id */
  key: string
  name: string
  ytd: number
  km2: number
  density: number
  percentile: number
  /** municipalities have no monthly series in the browser, so they cannot join the comparison */
  comparable: boolean
  /** fewer than SMALL_SAMPLE detections so far: density and percentile are noise (spec 002 edge cases) */
  small?: boolean
  select: () => void
}

/** below this many detections so far, a municipality's density and percentile read "small sample" */
const SMALL_SAMPLE = 20

interface Props {
  data: AppData
  biomes: BiomeData | null
  munis: MuniRanking | null
  /** key of the selected area (state code or "bio:<id>"), if any */
  selected: string | null
  compare: string[]
  onSelect: (uf: string) => void
  onSelectBiome: (id: string) => void
  onSelectMuni: (id: string, uf: string, name: string) => void
  onToggleCompare: (key: string) => void
}

/** Spec 002, story 3 (FR-024): states, biomes or municipalities ranked by this year so far; rows select the area or
 * join the comparison. */
export function RankingTable(p: Props) {
  const i = useI18n()
  const { data, compare } = p
  const [scope, setScope] = useState<RankScope>('states')
  const [sort, setSort] = useState<RankSort>('total')
  const [all, setAll] = useState(false)
  const { manifest } = data
  const year = manifest.last_month.slice(0, 4)
  const SORTS: { key: RankSort; label: string; column: string }[] = [
    { key: 'total', label: i.t('sortTotal', { year }), column: i.t('colTotal', { year }) },
    { key: 'density', label: i.t('sortDensity'), column: i.t('sortDensity') },
    { key: 'percentile', label: i.t('sortNormal'), column: i.t('sortNormal') },
  ]
  const lastMonth = manifest.last_month.slice(0, 7)
  const days = manifest.last_month_days

  const rows = useMemo((): Row[] => {
    if (scope === 'states') {
      return rankAreas(data.areas, data.stateList.map((s) => s.uf), lastMonth, days, sort)
        .map((r) => ({ ...r, key: r.code, comparable: true, select: () => p.onSelect(r.code) }))
    }
    if (scope === 'biomes') {
      if (!p.biomes) return []
      return rankAreas(p.biomes.areas, Object.keys(p.biomes.areas), lastMonth, days, sort)
        .map((r) => ({ ...r, key: `bio:${r.code}`, comparable: true, select: () => p.onSelectBiome(r.code) }))
    }
    if (!p.munis) return []
    const out: Row[] = p.munis.rows.map(([id, name, uf, ytd, km2, pct]) => ({
      key: id, name: `${name}, ${uf}`, ytd, km2, density: km2 > 0 ? (ytd / km2) * 1000 : 0, percentile: pct, comparable: false,
      small: ytd < SMALL_SAMPLE, select: () => p.onSelectMuni(id, uf, name),
    }))
    const metric = (r: Row) => (sort === 'total' ? r.ytd : sort === 'density' ? r.density : r.percentile)
    // small samples go last by density and against normal: one detection in a tiny municipality is not a hot spot
    const smallLast = (a: Row, b: Row) => (sort === 'total' ? 0 : Number(!!a.small) - Number(!!b.small))
    return out.sort((a, b) => smallLast(a, b) || metric(b) - metric(a) || b.ytd - a.ytd)
    // the callbacks are stable (useCallback in App)
  }, [data, p.biomes, p.munis, scope, sort, lastMonth, days])

  const metric = (r: Row) => (sort === 'total' ? r.ytd : sort === 'density' ? r.density : r.percentile)
  const value = (r: Row) => (sort === 'total' ? i.int(r.ytd) : r.small ? i.t('smallSampleCap') : sort === 'density' ? i.one(r.density) : i.ord(r.percentile))
  const max = Math.max(...rows.filter((r) => sort === 'total' || !r.small).map(metric), 1)
  const shown = all ? rows.slice(0, scope === 'municipalities' ? 200 : rows.length) : rows.slice(0, 10)
  const top = rows[0]
  const full = compare.length >= MAX_COMPARE
  const sentence = !top ? '' : sort === 'total' ? i.t('rankTop', { name: top.name, year, n: i.int(top.ytd) })
    : sort === 'density' ? i.t('rankDensity', { name: top.name, d: i.one(top.density) })
    : i.t('rankNormal', { name: top.name, p: i.ord(top.percentile) })

  const download = () => {
    const lines = [
      `# Jangada Orbital ranking of ${scope}, data_version=${manifest.data_version}; through ${manifest.data_date}; sorted by ${sort}`,
      'rank,code,name,detections_so_far,area_km2,per_1000_km2,percentile',
      // plain numbers: a grouped "1,234.5" would split the CSV column
      ...rows.map((r, k) => [k + 1, r.key.replace('bio:', ''), `"${r.name}"`, Math.round(r.ytd), Math.round(r.km2), r.density.toFixed(1), r.percentile].join(',')),
    ]
    downloadText(lines.join('\n') + '\n', `jangada-orbital_ranking_${scope}_${manifest.data_version.replaceAll('-', '')}_${sort}.csv`)
  }

  const scopes = (Object.keys(SCOPE_KEY) as RankScope[]).filter((s) => s === 'states' || (s === 'biomes' ? p.biomes : p.munis))
  const scopeName = i.t(SCOPE_KEY[scope])
  const sortItem = SORTS.find((s) => s.key === sort)!

  return (
    <section className="flex flex-col gap-3" aria-labelledby="rank-title">
      <h2 id="rank-title" className="sr-only">{i.t('rankTitle', { scope: scopeName.toLowerCase() })}</h2>
      <p className="m-0 text-[15px] leading-normal">{sentence}</p>
      {scopes.length > 1 && (
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label={i.t('rankGroup')}>
          {scopes.map((s) => (
            <button key={s} type="button" aria-pressed={scope === s} onClick={() => { setScope(s); setAll(false) }}
              className="min-h-11 flex-1 rounded-[10px] px-1.5 text-[13px] font-semibold text-ink-3 aria-pressed:bg-seg-on aria-pressed:text-ink">
              {i.t(SCOPE_KEY[s])}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={i.t('sortBy')}>
        <span className="text-[13px] text-ink-3">{i.t('sortBy')}</span>
        {SORTS.map((s) => (
          <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}
            className="min-h-11 rounded-full border border-line-2 px-3 text-[13px] font-semibold text-ink-2 aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-brand-soft-ink">
            {s.label}
          </button>
        ))}
      </div>
      {!rows.length ? <p className="text-sm text-ink-2">{i.t('rankEmpty')}</p> : (
        <div className={`overflow-x-auto rounded-xl border border-line ${all ? 'max-h-[470px] overflow-y-auto' : ''}`}>
          <table className="w-full min-w-[300px] border-collapse text-sm tabular-nums">
            <caption className="sr-only">{i.t('rankCaption', { scope: scopeName, sort: sortItem.label.toLowerCase(), date: manifest.data_date })}</caption>
            <thead className="sticky top-0 z-[1] bg-surface text-left text-xs text-ink-3">
              <tr className="border-b border-line">
                <th scope="col" className="w-11 py-2 pl-2 font-normal">{i.t('thCompare')}</th>
                <th scope="col" className="w-7 py-2 font-normal">#</th>
                <th scope="col" className="py-2 font-normal">{i.t('thArea')}</th>
                <th scope="col" aria-sort="descending" className="w-[104px] py-2 pr-3 text-right font-normal">{sortItem.column}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, k) => {
                const inCompare = compare.includes(r.key)
                const sel = p.selected === r.key
                return (
                  <tr key={r.key} className={`border-b border-row-line ${sel ? 'bg-brand-soft shadow-[inset_3px_0_0_var(--brand)]' : ''}`}>
                    <td className="pl-2">
                      {r.comparable ? (
                        <label className="flex size-11 cursor-pointer items-center justify-center">
                          <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={inCompare} disabled={full && !inCompare}
                            onChange={() => p.onToggleCompare(r.key)} aria-label={i.t('compareName', { name: r.name })} />
                        </label>
                      ) : <span className="block size-11" />}
                    </td>
                    <td className="text-ink-3">{k + 1}</td>
                    <td>
                      <button type="button" className="flex min-h-11 w-full flex-col items-start justify-center py-1 text-left" onClick={r.select}
                        aria-label={i.t('selectName', { name: r.name })}>
                        <span className="font-semibold">{r.name}</span>
                        <span className="text-xs text-ink-3">
                          {r.small ? (sort === 'total' ? i.t('smallSample') : i.t('nSoFar', { n: i.int(r.ytd) })) : (
                            <>
                              {sort !== 'total' && `${i.t('nSoFar', { n: i.int(r.ytd) })}, `}
                              {sort !== 'density' ? i.t('perKm2', { d: i.one(r.density) }) : i.t('pct', { p: i.ord(r.percentile) })}
                            </>
                          )}
                        </span>
                      </button>
                    </td>
                    <td className="pr-3">
                      <div className="flex flex-col items-end gap-1">
                        <span className={r.small && sort !== 'total' ? 'text-xs text-ink-3' : undefined}>{value(r)}</span>
                        <span className="relative block h-1.5 w-full rounded-full bg-surface-2" aria-hidden="true">
                          {!(r.small && sort !== 'total') && <span className={`absolute inset-y-0 left-0 rounded-full ${sel ? 'bg-link' : 'bg-brand'}`} style={{ width: `${Math.max(3, (metric(r) / max) * 100)}%` }} />}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {full && <p className="m-0 text-[13px] text-ink-2">{i.t('maxCompare', { n: MAX_COMPARE })}</p>}
      {scope === 'municipalities' && <p className="m-0 text-xs text-ink-3">{i.t('muniNote', { n: SMALL_SAMPLE })}</p>}
      <div className="touch flex flex-wrap gap-2">
        <button type="button" className="btn !min-h-11 !rounded-[10px]" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? i.t('showTop10') : scope === 'municipalities' ? i.t('showTop200') : i.t('showAll', { n: rows.length })}
        </button>
        <button type="button" className="btn !min-h-11 !rounded-[10px]" onClick={download}><Download size={18} aria-hidden="true" /> {i.t('downloadCsv')}</button>
      </div>
    </section>
  )
}
