import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AppData } from '../data/load'
import type { BiomeData, MuniRanking } from '../data/extras'
import { downloadText } from '../data/csv'
import { ordinal, rankAreas, type RankSort } from './ranking'

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const dens = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const MAX_COMPARE = 3

const SORTS: { key: RankSort; label: string; column: string }[] = [
  { key: 'total', label: 'Total this year', column: 'So far' },
  { key: 'density', label: 'Per 1,000 km²', column: 'Per 1,000 km²' },
  { key: 'percentile', label: 'Against normal', column: 'Percentile' },
]

export type RankScope = 'states' | 'biomes' | 'municipalities'
const SCOPE_LABEL: Record<RankScope, string> = { states: 'States', biomes: 'Biomes', municipalities: 'Municipalities' }
const NOUN: Record<RankScope, string> = { states: 'State', biomes: 'Biome', municipalities: 'Municipality' }

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
  select: () => void
}

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
  const { data, compare } = p
  const [scope, setScope] = useState<RankScope>('states')
  const [sort, setSort] = useState<RankSort>('total')
  const [all, setAll] = useState(false)
  const { manifest } = data
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
      select: () => p.onSelectMuni(id, uf, name),
    }))
    const metric = (r: Row) => (sort === 'total' ? r.ytd : sort === 'density' ? r.density : r.percentile)
    return out.sort((a, b) => metric(b) - metric(a) || b.ytd - a.ytd)
    // the callbacks are stable (useCallback in App)
  }, [data, p.biomes, p.munis, scope, sort, lastMonth, days])

  const metric = (r: Row) => (sort === 'total' ? r.ytd : sort === 'density' ? r.density : r.percentile)
  const value = (r: Row) => (sort === 'total' ? fmt.format(r.ytd) : sort === 'density' ? dens.format(r.density) : ordinal(r.percentile))
  const max = Math.max(...rows.map(metric), 1)
  const shown = all ? rows.slice(0, scope === 'municipalities' ? 200 : rows.length) : rows.slice(0, 10)
  const top = rows[0]
  const full = compare.length >= MAX_COMPARE
  const sentence = !top ? '' : sort === 'total' ? `${top.name} has the most detections so far this year, ${fmt.format(top.ytd)}.`
    : sort === 'density' ? `${top.name} has the most fire for its size, ${dens.format(top.density)} detections per 1,000 km².`
    : `${top.name} is furthest above its normal, at the ${ordinal(top.percentile)} percentile of previous years for this date.`

  const download = () => {
    const lines = [
      `# Jangada Orbital ranking of ${scope}, data_version=${manifest.data_version}; through ${manifest.data_date}; sorted by ${sort}`,
      'rank,code,name,detections_so_far,area_km2,per_1000_km2,percentile',
      ...rows.map((r, i) => [i + 1, r.key.replace('bio:', ''), `"${r.name}"`, Math.round(r.ytd), Math.round(r.km2), dens.format(r.density), r.percentile].join(',')),
    ]
    downloadText(lines.join('\n') + '\n', `jangada-orbital_ranking_${scope}_${manifest.data_version.replaceAll('-', '')}_${sort}.csv`)
  }

  const scopes = (Object.keys(SCOPE_LABEL) as RankScope[]).filter((s) => s === 'states' || (s === 'biomes' ? p.biomes : p.munis))

  return (
    <section className="flex flex-col gap-3" aria-labelledby="rank-title">
      <h2 id="rank-title" className="sr-only">Ranking of {SCOPE_LABEL[scope].toLowerCase()}</h2>
      {scopes.length > 1 && (
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label="Rank">
          {scopes.map((s) => (
            <button key={s} type="button" aria-pressed={scope === s} onClick={() => { setScope(s); setAll(false) }}
              className="min-h-11 flex-1 rounded-lg px-1 text-[13px] font-semibold text-ink-3 aria-pressed:bg-line aria-pressed:text-ink">
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
      )}
      <p className="m-0 text-sm">{sentence}</p>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sort by">
        <span className="text-[13px] text-ink-3">Sort by</span>
        {SORTS.map((s) => (
          <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}
            className="min-h-11 rounded-full border border-line px-3 text-[13px] font-medium text-ink-2 aria-pressed:border-brand aria-pressed:bg-brand/10 aria-pressed:text-ink">
            {s.label}
          </button>
        ))}
      </div>
      {!rows.length ? <p className="text-sm text-ink-2">Not enough history to rank yet.</p> : (
        <div className={`overflow-x-auto rounded-xl border border-line ${all ? 'max-h-[520px] overflow-y-auto' : ''}`}>
          <table className="w-full min-w-[320px] border-collapse text-sm tabular-nums">
            <caption className="sr-only">{SCOPE_LABEL[scope]} by {SORTS.find((s) => s.key === sort)!.label.toLowerCase()}, this year through {manifest.data_date}</caption>
            <thead className="sticky top-0 bg-surface text-left text-xs text-ink-3">
              <tr className="border-b border-line">
                <th scope="col" className="w-11 py-2 pl-2 font-medium">Compare</th>
                <th scope="col" className="w-7 py-2 font-medium">#</th>
                <th scope="col" className="py-2 font-medium">{NOUN[scope]}</th>
                <th scope="col" aria-sort="descending" className="w-28 py-2 pr-3 text-right font-medium">{SORTS.find((s) => s.key === sort)!.column}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const inCompare = compare.includes(r.key)
                return (
                  <tr key={r.key} className={`border-b border-line/60 ${p.selected === r.key ? 'bg-brand/10 shadow-[inset_3px_0_0_var(--brand)]' : ''}`}>
                    <td className="pl-2">
                      {r.comparable ? (
                        <label className="flex size-11 cursor-pointer items-center justify-center">
                          <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={inCompare} disabled={full && !inCompare}
                            onChange={() => p.onToggleCompare(r.key)} aria-label={`Compare ${r.name}`} />
                        </label>
                      ) : <span className="block size-11" />}
                    </td>
                    <td className="text-ink-3">{i + 1}</td>
                    <td>
                      <button type="button" className="flex min-h-11 w-full flex-col items-start justify-center py-1 text-left" onClick={r.select}
                        aria-label={`Select ${r.name} as the area`}>
                        <span className="font-medium">{r.name}</span>
                        <span className="text-xs text-ink-3">
                          {sort !== 'total' && `${fmt.format(r.ytd)} so far, `}
                          {sort !== 'density' ? `${dens.format(r.density)} per 1,000 km²` : `${ordinal(r.percentile)} percentile`}
                        </span>
                      </button>
                    </td>
                    <td className="pr-3">
                      <div className="flex flex-col items-end gap-1">
                        <span>{value(r)}</span>
                        <span className="relative block h-1.5 w-full rounded-full bg-surface-2" aria-hidden="true">
                          <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${Math.max(3, (metric(r) / max) * 100)}%` }} />
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
      {full && <p className="m-0 text-[13px] text-ink-2">You can compare up to {MAX_COMPARE} areas. Clear one to add another.</p>}
      {scope === 'municipalities' && <p className="m-0 text-xs text-ink-3">Municipalities are counted on the 0.1° cells whose centre falls inside them; very small ones may have none. Selecting one loads it as an area.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 text-sm" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show top 10' : scope === 'municipalities' ? 'Show top 200' : `Show all ${rows.length}`}
        </Button>
        <Button variant="outline" className="h-11 gap-2 text-sm" onClick={download}><Download aria-hidden="true" /> Download ranking CSV</Button>
      </div>
    </section>
  )
}
