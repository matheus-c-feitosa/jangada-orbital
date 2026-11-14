import { useMemo } from 'react'
import { describeOffset, seasonRhythm } from './season'

const INITIALS = 'JFMAMJJASOND'

interface Props {
  months: string[]
  values: number[]
  fromYear: number
  toYear: number
}

const pct = (offset: number) => `${(offset / 12) * 100}%`

/** Fire-season rhythm (T040): start, middle and end of each season as a strip; the table is also its text version. */
export function SeasonRhythm({ months, values, fromYear, toYear }: Props) {
  const rhythm = useMemo(() => seasonRhythm(months, values), [months, values])
  const seasons = rhythm.seasons.filter((s) => s.year >= fromYear && s.year <= toYear)
  if (!seasons.length) return null
  const header = Array.from({ length: 12 }, (_, k) => INITIALS[(rhythm.firstMonth - 1 + k) % 12])
  const shift = rhythm.startShiftWeeks

  return (
    <section className="mt-8 flex flex-col gap-3" aria-labelledby="rhythm-title">
      <h2 id="rhythm-title" className="m-0 text-lg font-semibold">Fire-season rhythm</h2>
      <p className="m-0 max-w-[70ch] text-sm text-ink-2">
        Each bar runs from the start of the season (10% of its fires) to its end (90%); the dot marks the middle (50%).
        {shift !== null && rhythm.compared && (
          <> On average, seasons {rhythm.compared[1]} <strong className="text-ink">started about {Math.abs(shift)} weeks{' '}
            {shift < 0 ? 'earlier' : 'later'}</strong> than seasons {rhythm.compared[0]}.</>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-separate border-spacing-y-[3px] text-xs tabular-nums">
          <caption className="sr-only">Start, middle and end of each fire season</caption>
          <thead>
            <tr>
              <th scope="col" className="w-16 pr-2 text-right font-medium text-ink-3"><span className="sr-only">Season</span></th>
              <th scope="col" className="p-0 font-medium text-ink-3">
                <span className="grid grid-cols-12" aria-hidden="true">{header.map((m, i) => <span key={i} className="text-center">{m}</span>)}</span>
                <span className="sr-only">Timing</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((s) => (
              <tr key={s.label}>
                <th scope="row" className="whitespace-nowrap pr-2 text-right font-medium text-ink-3">{s.label}</th>
                <td className="p-0">
                  <div className="relative h-4 rounded-sm bg-[repeating-linear-gradient(90deg,var(--surface-2)_0_calc(100%/12-1px),var(--line)_calc(100%/12-1px)_calc(100%/12))]">
                    <span className="absolute inset-y-1 rounded-full bg-c5" style={{ left: pct(s.start), width: pct(s.end - s.start) }} aria-hidden="true" />
                    <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink"
                      style={{ left: pct(s.middle) }} aria-hidden="true" />
                    <span className="sr-only">
                      Starts {describeOffset(s.start, rhythm.firstMonth)}, half by {describeOffset(s.middle, rhythm.firstMonth)},
                      ends {describeOffset(s.end, rhythm.firstMonth)}.
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
