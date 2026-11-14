import type { Peaks } from './peaks'

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const monthLabel = (key: string) => `${MONTH[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`

/** Where the fire is: the busiest year, the highest single month and the months that usually burn most. */
export function Highlights({ peaks }: { peaks: Peaks }) {
  if (!peaks.span || (!peaks.year && !peaks.month && !peaks.typical.length)) return null
  const [from, to] = peaks.span
  const item = 'flex flex-col gap-0.5'
  const term = 'text-[13px] font-medium text-ink-3'
  const detail = 'm-0 text-sm text-ink-2 tabular-nums [&_strong]:font-semibold [&_strong]:text-ink'
  return (
    <section className="mb-5" aria-label={`Busiest periods, ${from} to ${to}`}>
      <dl className="m-0 flex flex-wrap gap-x-8 gap-y-3">
        {peaks.year && (
          <div className={item}>
            <dt className={term}>Busiest year</dt>
            <dd className={detail}><strong>{peaks.year.year}</strong> · {fmt.format(peaks.year.total)} detections</dd>
          </div>
        )}
        {peaks.month && (
          <div className={item}>
            <dt className={term}>Highest month</dt>
            <dd className={detail}><strong>{monthLabel(peaks.month.month)}</strong> · {fmt.format(peaks.month.value)} detections</dd>
          </div>
        )}
        {peaks.typical.length > 0 && (
          <div className={item}>
            <dt className={term}>Usually busiest months</dt>
            <dd className={detail}><strong>{peaks.typical.map((m) => MONTH[m - 1]).join(', ')}</strong> · median of {from}–{to}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}
