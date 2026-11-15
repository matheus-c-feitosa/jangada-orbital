import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AppData } from '../data/load'
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

interface Props {
  data: AppData
  /** code of the selected state, if any */
  selected: string | null
  compare: string[]
  onSelect: (uf: string) => void
  onToggleCompare: (uf: string) => void
}

/** Spec 002, story 3 (FR-024): states ranked by this year so far; rows select the area or join the comparison. */
export function RankingTable({ data, selected, compare, onSelect, onToggleCompare }: Props) {
  const [sort, setSort] = useState<RankSort>('total')
  const [all, setAll] = useState(false)
  const { manifest } = data
  const lastMonth = manifest.last_month.slice(0, 7)
  const rows = useMemo(
    () => rankAreas(data.areas, data.stateList.map((s) => s.uf), lastMonth, manifest.last_month_days, sort),
    [data, lastMonth, manifest.last_month_days, sort],
  )
  if (!rows.length) return <p className="text-sm text-ink-2">Not enough history to rank the states yet.</p>

  const metric = (r: (typeof rows)[number]) => (sort === 'total' ? r.ytd : sort === 'density' ? r.density : r.percentile)
  const value = (r: (typeof rows)[number]) => (sort === 'total' ? fmt.format(r.ytd) : sort === 'density' ? dens.format(r.density) : ordinal(r.percentile))
  const max = Math.max(...rows.map(metric), 1)
  const shown = all ? rows : rows.slice(0, 10)
  const top = rows[0]
  const full = compare.length >= MAX_COMPARE
  const sentence = sort === 'total' ? `${top.name} has the most detections so far this year, ${fmt.format(top.ytd)}.`
    : sort === 'density' ? `${top.name} has the most fire for its size, ${dens.format(top.density)} detections per 1,000 km².`
    : `${top.name} is furthest above its normal, at the ${ordinal(top.percentile)} percentile of previous years for this date.`

  const download = () => {
    const lines = [
      `# Jangada Orbital ranking of states, data_version=${manifest.data_version}; through ${manifest.data_date}; sorted by ${sort}`,
      'rank,uf,state,detections_so_far,area_km2,per_1000_km2,percentile',
      ...rows.map((r, i) => [i + 1, r.code, r.name, Math.round(r.ytd), Math.round(r.km2), dens.format(r.density), r.percentile].join(',')),
    ]
    downloadText(lines.join('\n') + '\n', `jangada-orbital_ranking_${manifest.data_version.replaceAll('-', '')}_${sort}.csv`)
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="rank-title">
      <h2 id="rank-title" className="sr-only">Ranking of states</h2>
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
      <div className={`overflow-x-auto rounded-xl border border-line ${all ? 'max-h-[520px] overflow-y-auto' : ''}`}>
        <table className="w-full min-w-[320px] border-collapse text-sm tabular-nums">
          <caption className="sr-only">States by {SORTS.find((s) => s.key === sort)!.label.toLowerCase()}, this year through {manifest.data_date}</caption>
          <thead className="sticky top-0 bg-surface text-left text-xs text-ink-3">
            <tr className="border-b border-line">
              <th scope="col" className="w-11 py-2 pl-2 font-medium">Compare</th>
              <th scope="col" className="w-7 py-2 font-medium">#</th>
              <th scope="col" className="py-2 font-medium">State</th>
              <th scope="col" aria-sort="descending" className="w-28 py-2 pr-3 text-right font-medium">{SORTS.find((s) => s.key === sort)!.column}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const inCompare = compare.includes(r.code)
              return (
                <tr key={r.code} className={`border-b border-line/60 ${selected === r.code ? 'bg-brand/10 shadow-[inset_3px_0_0_var(--brand)]' : ''}`}>
                  <td className="pl-2">
                    <label className="flex size-11 cursor-pointer items-center justify-center">
                      <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={inCompare} disabled={full && !inCompare}
                        onChange={() => onToggleCompare(r.code)} aria-label={`Compare ${r.name}`} />
                    </label>
                  </td>
                  <td className="text-ink-3">{i + 1}</td>
                  <td>
                    <button type="button" className="flex min-h-11 w-full flex-col items-start justify-center py-1 text-left" onClick={() => onSelect(r.code)}
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
      {full && <p className="m-0 text-[13px] text-ink-2">You can compare up to {MAX_COMPARE} states. Clear one to add another.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 text-sm" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show top 10' : `Show all ${rows.length}`}
        </Button>
        <Button variant="outline" className="h-11 gap-2 text-sm" onClick={download}><Download aria-hidden="true" /> Download ranking CSV</Button>
      </div>
      <p className="m-0 text-xs text-ink-3">Biomes and municipalities join the ranking once the data pipeline aggregates them.</p>
    </section>
  )
}
