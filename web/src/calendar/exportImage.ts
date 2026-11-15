// "Download image": the calendar as a PNG that can be shared as a picture (WhatsApp, a report, a slide). The challenge
// statement asks that users can "download analytics and visualizations"; the CSV covers the first.
// Built as plain SVG from the same grid the on-screen table uses, then drawn to a canvas: no extra dependency.
import { downloadBlob } from '../data/csv'

/** The fields of a calendar cell the image needs (CalendarTable's cells have them). */
export interface ImageCell {
  month: string
  value: number | null
  /** -1 no data, 0 no fire, 1..7 colour class */
  cls: number
  unusual: boolean
  /** 0 Aqua observed, 1 Terra converted, 2 VIIRS converted */
  source: number | null
}

export interface ImageColors {
  surface: string
  ink: string
  ink2: string
  ink3: string
  line: string
  unusual: string
  /** colour classes 0..7 */
  classes: string[]
}

/** Words of the image, in the interface language. */
export interface ImageWords {
  /** initials of the months, January first */
  months: string
  estimated: string
  noDetections: string
  /** "1–{a} … > {b} detections / month" with the class breaks already formatted */
  scale: (low: string, high: string) => string
  unusual: string
  partial: string
  format: (v: number) => string
}

export interface ImageOptions {
  title: string
  /** sentences under the title, already worded */
  lines: string[]
  caption: string
  grid: ImageCell[][]
  breaks: number[]
  /** "YYYY-MM" of the partial month, marked with a dashed outline */
  partialMonth: string
  /** harmonized view: unusual dots and "est." marks apply */
  harmonized: boolean
  footer: string[]
  colors: ImageColors
  words: ImageWords
}

const W = 880
const MARGIN = 28
const LABEL_W = 70
const CELL_W = 52
const CELL_H = 16
const GAP = 3
const FONT = "Archivo, 'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Greedy word wrap by character count; SVG text has no automatic wrapping. */
export function wrap(text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > max) {
      out.push(line)
      line = word
    } else {
      line = line ? line + ' ' + word : word
    }
  }
  if (line) out.push(line)
  return out
}

export function calendarSvg(o: ImageOptions): { svg: string; width: number; height: number } {
  const c = o.colors
  const w = o.words
  const parts: string[] = []
  const text = (x: number, y: number, size: number, fill: string, s: string, extra = '') =>
    parts.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-family="${esc(FONT)}" ${extra}>${esc(s)}</text>`)

  let y = MARGIN + 24
  text(MARGIN, y, 26, c.ink, o.title, 'font-weight="700"')
  y += 12
  for (const line of o.lines.flatMap((l) => wrap(l, 100))) {
    y += 22
    text(MARGIN, y, 15, c.ink2, line)
  }
  y += 34
  text(MARGIN, y, 13, c.ink3, o.caption)
  y += 12

  // month initials
  const x0 = MARGIN + LABEL_W
  y += 14
  for (let m = 0; m < 12; m++) text(x0 + m * (CELL_W + GAP) + CELL_W / 2, y, 12, c.ink3, w.months[m], 'text-anchor="middle"')
  y += 6

  // cells
  for (const row of o.grid) {
    const year = row[0].month.slice(0, 4)
    const estimated = o.harmonized && row.some((cell) => cell.source !== null && cell.source > 0 && cell.value !== null)
    text(x0 - 8, y + CELL_H - 4, 12, c.ink3, estimated ? `${year} ${w.estimated}` : year, 'text-anchor="end"')
    row.forEach((cell, m) => {
      const x = x0 + m * (CELL_W + GAP)
      if (cell.cls < 0) {
        parts.push(`<rect x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}" rx="3" fill="none" stroke="${c.line}" stroke-dasharray="3 2"/>`)
        return
      }
      parts.push(`<rect x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}" rx="3" fill="${c.classes[cell.cls]}"/>`)
      if (cell.month === o.partialMonth) {
        parts.push(`<rect x="${x + 1}" y="${y + 1}" width="${CELL_W - 2}" height="${CELL_H - 2}" rx="2" fill="none" stroke="${c.ink}" stroke-width="1.5" stroke-dasharray="4 3"/>`)
      }
      if (cell.unusual) {
        parts.push(`<circle cx="${x + CELL_W - 7}" cy="${y + 6}" r="3.2" fill="${c.unusual}" stroke="${c.surface}" stroke-width="1.5"/>`)
      }
    })
    y += CELL_H + GAP
  }

  // legend
  y += 20
  parts.push(`<rect x="${MARGIN}" y="${y - 11}" width="22" height="12" rx="2" fill="${c.classes[0]}" stroke="${c.line}"/>`)
  text(MARGIN + 28, y, 12, c.ink2, w.noDetections)
  let lx = MARGIN + 150
  for (let k = 1; k <= 7; k++) parts.push(`<rect x="${lx + (k - 1) * 24}" y="${y - 11}" width="22" height="12" rx="2" fill="${c.classes[k]}"/>`)
  lx += 7 * 24 + 6
  if (o.breaks.length) text(lx, y, 12, c.ink2, w.scale(w.format(o.breaks[0]), w.format(o.breaks[o.breaks.length - 1])))
  y += 22
  if (o.harmonized) {
    parts.push(`<circle cx="${MARGIN + 6}" cy="${y - 4}" r="3.5" fill="${c.unusual}"/>`)
    text(MARGIN + 18, y, 12, c.ink2, w.unusual)
    parts.push(`<rect x="${MARGIN + 400}" y="${y - 11}" width="22" height="12" rx="2" fill="none" stroke="${c.ink}" stroke-width="1.5" stroke-dasharray="4 3"/>`)
    text(MARGIN + 428, y, 12, c.ink2, w.partial)
    y += 22
  }

  // footer
  y += 14
  for (const line of o.footer.flatMap((l) => wrap(l, 120))) {
    text(MARGIN, y, 11, c.ink3, line)
    y += 16
  }
  const height = y + MARGIN - 6
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">` +
    `<rect width="${W}" height="${height}" fill="${c.surface}"/>${parts.join('')}</svg>`
  return { svg, width: W, height }
}

/** Colours of the theme on screen right now, read from the CSS tokens. */
export function readColors(): ImageColors {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    surface: v('--surface'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), line: v('--line'), unusual: v('--unusual'),
    classes: Array.from({ length: 8 }, (_, k) => v(`--c${k}`)),
  }
}

export function imageFileName(areaLabel: string, fromYear: number, toYear: number): string {
  const slug = areaLabel.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `jangada-orbital-calendar_${slug || 'area'}_${fromYear}-${toYear}.png`
}

/** Draws the SVG on a canvas at 2× and saves it as a PNG. Rejects if the browser cannot render the image. */
export async function downloadPng(svg: string, width: number, height: number, fileName: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('the browser could not draw the image'))
      img.src = url
    })
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas is not available')
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('the image could not be encoded')
    downloadBlob(blob, fileName)
  } finally {
    URL.revokeObjectURL(url)
  }
}
