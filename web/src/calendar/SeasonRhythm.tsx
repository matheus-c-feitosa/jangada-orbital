import { useMemo } from 'react'
import { describeOffset, runningSeason, seasonRhythm, type OffsetWords } from './season'
import { median } from './stats'
import { useI18n } from '../i18n'

const WEEKS_PER_MONTH = 30.44 / 7

interface Props {
  months: string[]
  values: number[]
  fromYear: number
  toYear: number
  areaName: string
  /** "YYYY-MM" of the newest month and how many of its days have data: the season it falls in is still running */
  partialMonth: string
  partialDays: number
}

const pct = (offset: number) => `${(offset / 12) * 100}%`

/** Fire-season rhythm (T040), design "Season": start, middle and end of each season as a strip, and the season
 * still running, striped. */
export function SeasonRhythm({ months, values, fromYear, toYear, areaName, partialMonth, partialDays }: Props) {
  const i = useI18n()
  const words: OffsetWords = { early: i.t('early'), mid: i.t('mid'), late: i.t('late'), month: i.monthLong }
  const rhythm = useMemo(() => seasonRhythm(months, values), [months, values])
  const seasons = rhythm.seasons.filter((s) => s.year >= fromYear && s.year <= toYear)
  const usualStart = seasons.length ? median(seasons.map((s) => s.start)) : NaN
  const run = useMemo(() => {
    if (!rhythm.seasons.length) return null
    const r = runningSeason(months, values, rhythm.firstMonth, partialMonth, partialDays, median(rhythm.seasons.map((s) => s.total)))
    return r && r.year >= fromYear && r.year <= toYear && !rhythm.seasons.some((s) => s.year === r.year) ? r : null
  }, [months, values, rhythm, partialMonth, partialDays, fromYear, toYear])
  if (!seasons.length) return <p className="text-sm text-ink-2">{i.t('tooFewFires')}</p>
  const header = Array.from({ length: 12 }, (_, k) => i.monthShort((rhythm.firstMonth - 1 + k) % 12)[0])
  const shift = rhythm.startShiftWeeks
  const start = describeOffset(usualStart, rhythm.firstMonth, words)
  const end = describeOffset(median(seasons.map((s) => s.end)), rhythm.firstMonth, words)
  const runWeeks = run?.start != null ? Math.round((run.start - usualStart) * WEEKS_PER_MONTH) : null
  const runText = !run ? null
    : runWeeks === null ? i.t('runningNotStarted', { label: run.label })
    : Math.abs(runWeeks) < 2 ? i.t('runningOnTime', { label: run.label })
    : i.t(runWeeks < 0 ? 'runningEarly' : 'runningLate', { label: run.label, w: Math.abs(runWeeks) })

  return (
    <section className="flex flex-col gap-3" aria-labelledby="rhythm-title">
      <h2 id="rhythm-title" className="sr-only">{i.t('seasonTitle')}</h2>
      <p className="m-0 text-[15px] leading-normal">
        {i.t('seasonRuns', { name: areaName, start, end })}
        {shift !== null && rhythm.compared && (
          <> {i.t('seasonShift', { b: rhythm.compared[1], w: Math.abs(shift), dir: i.t(shift < 0 ? 'earlier' : 'later'), a: rhythm.compared[0] })}</>
        )}
        {runText && <> {runText}</>}
      </p>
      <table className="w-full border-separate border-spacing-x-2 border-spacing-y-1 text-[11px] tabular-nums">
        <caption className="sr-only">{i.t('seasonCaption')}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-[52px] p-0"><span className="sr-only">{i.t('thSeason')}</span></th>
            <th scope="col" className="p-0 font-normal text-ink-3">
              <span className="grid grid-cols-12" aria-hidden="true">{header.map((m, k) => <span key={k} className="text-center">{m}</span>)}</span>
              <span className="sr-only">{i.t('thTiming')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {seasons.map((s) => (
            <tr key={s.label}>
              <th scope="row" className="whitespace-nowrap p-0 text-left font-normal text-ink-2">{s.label}</th>
              <td className="p-0">
                <div className="relative h-3 rounded-md bg-surface-2">
                  <span className="absolute top-0.5 h-2 rounded bg-brand" style={{ left: pct(s.start), width: pct(s.end - s.start) }} aria-hidden="true" />
                  <span className="absolute top-px size-2.5 -translate-x-1/2 rounded-full bg-[#F2F5FA] shadow-[0_0_0_2px_var(--surface)]"
                    style={{ left: pct(s.middle) }} aria-hidden="true" />
                  <span className="sr-only">
                    {i.t('seasonSr', { a: describeOffset(s.start, rhythm.firstMonth, words), b: describeOffset(s.middle, rhythm.firstMonth, words), c: describeOffset(s.end, rhythm.firstMonth, words) })}
                  </span>
                </div>
              </td>
            </tr>
          ))}
          {run && (
            <tr>
              <th scope="row" className="whitespace-nowrap p-0 text-left font-normal text-ink">{run.label}</th>
              <td className="p-0">
                <div className="relative h-3 rounded-md bg-surface-2">
                  {run.start !== null && (
                    <span className="absolute top-0.5 h-2 rounded" aria-hidden="true"
                      style={{ left: pct(run.start), width: pct(Math.max(0.15, run.now - run.start)), background: 'repeating-linear-gradient(135deg, var(--brand) 0 3px, var(--c1) 3px 6px)' }} />
                  )}
                  {run.middle !== null && (
                    <span className="absolute top-px size-2.5 -translate-x-1/2 rounded-full bg-[#F2F5FA] shadow-[0_0_0_2px_var(--surface)]" style={{ left: pct(run.middle) }} aria-hidden="true" />
                  )}
                  <span className="sr-only">{runText}</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-[22px] rounded bg-brand" />{i.t('seasonBar')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-[#F2F5FA] shadow-[0_0_0_1px_var(--line-2)]" />{i.t('midpoint')}</span>
        {run && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-[22px] rounded" style={{ background: 'repeating-linear-gradient(135deg, var(--brand) 0 3px, var(--c1) 3px 6px)' }} />{i.t('stillRunning')}</span>}
      </div>
    </section>
  )
}
