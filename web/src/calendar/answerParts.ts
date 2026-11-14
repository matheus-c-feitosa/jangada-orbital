// The words of the answer ("is this month unusual here?"), built once and used by the on-screen answer line and the
// PNG export, so the picture says exactly what the screen says.
import { MIN_UNUSUAL, type MonthComparison } from './stats'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const ratioFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** "1 detection", "2 detections": counts are rounded for display, so the word follows the rounded number. */
export const det = (n: number) => `${fmt.format(n)} ${Math.round(n) === 1 ? 'detection' : 'detections'}`

export type AnswerStatus = 'unusual' | 'quiet' | 'tooFew' | 'within'

export interface AnswerParts {
  monthName: string
  period: string
  noFire: boolean
  /** "8,744 detections" */
  valueText: string
  /** "0.9", or null when none are usually detected in this month */
  ratio: string | null
  /** "the usual pace for these days" or "the usual November" */
  usual: string
  /** second line: rank and usual value, or "No fires detected in any November since 2000" */
  rankText: string
  status: AnswerStatus
  statusText: string
}

export function answerParts(c: MonthComparison, lastDayPartial?: boolean): AnswerParts {
  const [y, m] = c.month.split('-').map(Number)
  const monthName = MONTHS[m - 1]
  const so = c.partial ? ' so far' : ''
  const period = c.partial
    ? `${monthName} ${y} so far (${c.days} of ${c.daysInMonth} days${lastDayPartial ? ' plus today, still arriving' : ''})`
    : `${monthName} ${y}`
  const noFire = c.median === 0 && c.value === 0
  const since = y - c.of + 1
  // A ratio of 5× on two detections is noise, not a signal: say so instead of calling it "within the usual range".
  const pace = (c.value * c.daysInMonth) / Math.max(c.days, 1)
  const tooFew = !c.unusual && c.ratio !== null && c.ratio >= 2 && pace < MIN_UNUSUAL
  const status: AnswerStatus = c.unusual ? 'unusual' : c.quiet ? 'quiet' : tooFew ? 'tooFew' : 'within'
  const statusText =
    status === 'unusual' ? `${monthName}${so}: unusual, above the 90th percentile of past ${monthName}s`
    : status === 'quiet' ? `${monthName}${so}: unusually quiet, below the 10th percentile of past ${monthName}s`
    : status === 'tooFew' ? `${monthName}${so}: too few detections (under ${MIN_UNUSUAL} a month) to call it unusual`
    : `${monthName}${so}: within the usual range`
  return {
    monthName,
    period,
    noFire,
    valueText: det(c.value),
    ratio: c.ratio === null ? null : ratioFmt.format(c.ratio),
    usual: c.partial ? 'the usual pace for these days' : `the usual ${monthName}`,
    rankText: noFire
      ? `No fires detected in any ${monthName} since ${since}`
      : `${c.partial ? 'On pace for' : 'Ranks'} #${c.rank} of ${c.of} ${monthName}s since ${since} · usual ${monthName}: ${det(c.median)}`,
    status,
    statusText,
  }
}

/** The answer as plain sentences: the headline, the rank line and the verdict. */
export function answerLines(p: AnswerParts): string[] {
  const headline = p.noFire
    ? `${p.period}: no fires detected, as usual for ${p.monthName}.`
    : p.ratio !== null
      ? `${p.period}: ${p.valueText} — ${p.ratio}× ${p.usual}.`
      : `${p.period}: ${p.valueText}, where none are usually detected in ${p.monthName}.`
  return [headline, p.rankText, p.statusText]
}
