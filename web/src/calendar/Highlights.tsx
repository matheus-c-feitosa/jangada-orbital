import { useMemo } from 'react'
import { peaks } from './peaks'
import { useI18n } from '../i18n'

interface Props {
  months: string[]
  values: (number | null)[]
  fromYear: number
  toYear: number
  partialMonth: string
}

/** "Which months and years had the highest fire activity?" (challenge statement, FR-007): the busiest year, the highest
 * single month and the months that usually burn most, from the series on screen (so they match the calendar and CSV). */
export function Highlights({ months, values, fromYear, toYear, partialMonth }: Props) {
  const i = useI18n()
  const p = useMemo(() => peaks(months, values, fromYear, toYear, partialMonth), [months, values, fromYear, toYear, partialMonth])
  if (!p.span || (!p.year && !p.month && !p.typical.length)) return null
  const [from, to] = p.span
  const item = 'flex min-w-0 flex-col gap-0.5'
  const term = 'text-xs text-ink-3'
  const detail = 'm-0 text-[13px] leading-snug text-ink-2 tabular-nums [&_strong]:font-semibold [&_strong]:text-ink'
  return (
    <section className="mt-4 rounded-[10px] border border-line px-3.5 py-3" aria-label={i.t('peaksTitle', { a: from, b: to })}>
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-x-4 gap-y-2.5">
        {p.year && (
          <div className={item}>
            <dt className={term}>{i.t('peakYear')}</dt>
            <dd className={detail}><strong>{p.year.year}</strong><br />{i.det(p.year.total)}</dd>
          </div>
        )}
        {p.month && (
          <div className={item}>
            <dt className={term}>{i.t('peakMonth')}</dt>
            <dd className={detail}><strong>{i.monthShort(Number(p.month.month.slice(5, 7)) - 1)} {p.month.month.slice(0, 4)}</strong><br />{i.det(p.month.value)}</dd>
          </div>
        )}
        {p.typical.length > 0 && (
          <div className={item}>
            <dt className={term}>{i.t('peakTypical')}</dt>
            <dd className={detail}><strong>{p.typical.map((m) => i.monthShort(m - 1)).join(', ')}</strong><br />{i.t('peakMedian', { a: from, b: to })}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}
