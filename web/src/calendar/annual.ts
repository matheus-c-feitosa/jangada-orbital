// Yearly totals with the conversion uncertainty (spec 002, story 1, FR-020/FR-021).
// One row per calendar year from the harmonized monthly series; converted years (Terra before August 2002, VIIRS from
// 2024) carry the lo–hi range (P25–P75 of the conversion), observed Aqua years do not.
import { SNPP_END, type AreaSeries } from '../data/load'
import { median } from './stats'

export type YearSource = 'aqua' | 'terra' | 'viirs' | 'terra+aqua'

export interface AnnualRow {
  year: number
  value: number
  lo: number
  hi: number
  /** at least one month of the year is converted (source 1 or 2) */
  converted: boolean
  source: YearSource
  /** the year is not complete yet (missing months or the partial last month) */
  partial: boolean
}

const SOURCE_TEXT: Record<YearSource, string> = {
  aqua: 'observed by Aqua MODIS',
  terra: 'converted from Terra MODIS',
  'terra+aqua': 'Terra converted until July, then Aqua observed',
  viirs: 'converted from VIIRS',
}
export const sourceText = (s: YearSource) => SOURCE_TEXT[s]

type Series = Pick<AreaSeries, 'months' | 'value' | 'lo' | 'hi' | 'source'>

/** `partialMonth` is "YYYY-MM" of the newest month when it is not complete ('' when it is). */
export function annualRows(series: Series, partialMonth: string, fromYear = 2001): AnnualRow[] {
  const byYear = new Map<number, { value: number; lo: number; hi: number; months: number; src: Set<number>; partial: boolean }>()
  series.months.forEach((m, i) => {
    const year = Number(m.slice(0, 4))
    if (year < fromYear) return
    const row = byYear.get(year) ?? { value: 0, lo: 0, hi: 0, months: 0, src: new Set<number>(), partial: false }
    row.value += series.value[i]
    row.lo += series.lo[i]
    row.hi += series.hi[i]
    row.months += 1
    row.src.add(series.source[i])
    if (m.slice(0, 7) === partialMonth) row.partial = true
    byYear.set(year, row)
  })
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, r]) => {
      const source: YearSource = r.src.has(2) ? 'viirs' : r.src.has(1) ? (r.src.has(0) ? 'terra+aqua' : 'terra') : 'aqua'
      return {
        year,
        value: r.value,
        lo: r.lo,
        hi: r.hi,
        converted: r.src.has(1) || r.src.has(2),
        source,
        partial: r.partial || r.months < 12,
      }
    })
}

/** Median of the complete years; NaN when there are none. */
export const medianOfComplete = (rows: AnnualRow[]) => median(rows.filter((r) => !r.partial).map((r) => r.value))

export interface FamilyRow {
  year: number
  /** Aqua, or Terra before Aqua flew */
  modis: number | null
  /** S-NPP, or NOAA-20 / NOAA-21 when S-NPP is not flying */
  viirs: number | null
  partial: boolean
}

/** Observed counts per sensor family, for the "Observed" view (never converted, never summed across families). */
export function familyRows(series: Pick<AreaSeries, 'months' | 'observed'>, partialMonth: string, fromYear = 2001): FamilyRow[] {
  const o = series.observed
  const byYear = new Map<number, FamilyRow & { months: number }>()
  series.months.forEach((m, i) => {
    const year = Number(m.slice(0, 4))
    if (year < fromYear) return
    const row = byYear.get(year) ?? { year, modis: null, viirs: null, partial: false, months: 0 }
    const modis = o.Aqua[i] ?? o.Terra[i]
    // in its last month S-NPP flew only a few days; NOAA-20 takes over from that month
    const snpp = m.slice(0, 7) >= SNPP_END.slice(0, 7) ? null : o['S-NPP'][i]
    const viirs = snpp ?? o['NOAA-20'][i] ?? o['NOAA-21'][i]
    if (modis !== null) row.modis = (row.modis ?? 0) + modis
    if (viirs !== null) row.viirs = (row.viirs ?? 0) + viirs
    row.months += 1
    if (m.slice(0, 7) === partialMonth) row.partial = true
    byYear.set(year, row)
  })
  return [...byYear.values()]
    .sort((a, b) => a.year - b.year)
    .map(({ months, ...r }) => ({ ...r, partial: r.partial || months < 12 }))
}
