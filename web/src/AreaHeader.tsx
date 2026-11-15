import type { AreaSeries } from './data/load'
import { yearToDate } from './calendar/ytd'
import { ytdStanding } from './rank/ranking'
import { useI18n, type I18n } from './i18n'

/** States each IBGE biome covers (IBGE, Biomas e Sistema Costeiro-Marinho do Brasil, 1:250,000, 2019). */
export const BIOME_STATES: Record<string, string[]> = {
  amazonia: ['AC', 'AM', 'AP', 'MA', 'MT', 'PA', 'RO', 'RR', 'TO'],
  cerrado: ['BA', 'DF', 'GO', 'MA', 'MG', 'MS', 'MT', 'PI', 'PR', 'SP', 'TO'],
  caatinga: ['AL', 'BA', 'CE', 'MA', 'MG', 'PB', 'PE', 'PI', 'RN', 'SE'],
  mata_atlantica: ['AL', 'BA', 'CE', 'ES', 'GO', 'MG', 'MS', 'PB', 'PE', 'PR', 'RJ', 'RN', 'RS', 'SC', 'SE', 'SP'],
  pantanal: ['MS', 'MT'],
  pampa: ['RS'],
}

export type Tone = 'below' | 'within' | 'above'

/** Five words for a percentile of this year so far against the same date in previous years. */
export function statusOf(percentile: number, i: I18n): { text: string; tone: Tone } {
  if (percentile < 10) return { text: i.t('farBelow'), tone: 'below' }
  if (percentile < 25) return { text: i.t('below'), tone: 'below' }
  if (percentile < 75) return { text: i.t('within'), tone: 'within' }
  if (percentile < 90) return { text: i.t('above'), tone: 'above' }
  return { text: i.t('farAbove'), tone: 'above' }
}

export function StatusPill({ percentile, short, className = '' }: { percentile: number; short?: boolean; className?: string }) {
  const i = useI18n()
  const s = statusOf(percentile, i)
  return (
    <span className={`pill ${className}`} style={{ color: `var(--${s.tone}-ink)`, borderColor: `var(--${s.tone})` }}>
      {short && s.tone === 'within' ? i.t('normalShort') : s.text}
    </span>
  )
}

/** The design's mark: a sail on the sea inside a dashed orbit, with a satellite. */
export function Logo({ size = 30, satellite = true, label = 'Jangada Orbital logo' }: { size?: number; satellite?: boolean; label?: string | null }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <circle cx="16" cy="16" r="13" fill="none" stroke="#F97316" strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M16 6 L16 22 L8 22 Z" fill="#FDBA74" />
      <path d="M6 24 L26 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {satellite && <circle cx="27" cy="11" r="2.5" fill="#F97316" />}
    </svg>
  )
}

export interface YearStatus {
  year: number
  /** detections since January */
  current: number
  /** the median previous year at the same date, and its 10th–90th percentile range */
  usual: number
  p10: number
  p90: number
  percentile: number
  first: number
  last: number
}

/** This year so far against previous complete years at the same date (the same numbers as the map and ranking). */
export function yearStatus(series: AreaSeries | null, lastMonth: string, days: number): YearStatus | null {
  if (!series) return null
  const ytd = yearToDate(series.months, series.value, lastMonth, days)
  const st = ytdStanding(series.months, series.value, lastMonth, days)
  if (!ytd || !st) return null
  const p = ytd.points[ytd.points.length - 1]
  return { year: ytd.year, current: st.current, usual: p.median, p10: p.p10, p90: p.p90, percentile: st.percentile, first: st.first, last: st.last }
}

/** "2026 so far: 14.1k detections. A usual year has 16.8k by 14 Nov." */
export const summaryText = (s: YearStatus, date: string, i: I18n) =>
  i.t('summary', { year: s.year, now: i.k(s.current), usual: i.k(s.usual), date })

export const percentileText = (s: YearStatus, i: I18n, short?: boolean) =>
  short ? i.t('pct', { p: i.ord(s.percentile) }) : i.t('pctOf', { p: i.ord(s.percentile), a: s.first, b: s.last })

/** "Density in 2026 so far: 16.3 detections per 1,000 km²." */
export const densityText = (s: YearStatus, km2: number | undefined, i: I18n) =>
  km2 ? i.t('density', { year: s.year, d: i.one((s.current / km2) * 1000) }) : null

export const km2Text = (km2: number, i: I18n) => `${i.int(km2)} km²`
