// A view in the URL (T039, #5): the area, the values (harmonized or one satellite as observed) and the years, so a
// link reopens the same answer. Query parameters, not the hash: the hash routes the pages (#method, #why).
//
//   ?a=uf:CE | bio:cerrado | m:2304400 | c:-3.73,-38.53,25 | p:-50.1,-10.2;-49.8,-10.2;-49.9,-9.9
//   &v=obs:NOAA-20        (absent: harmonized)
//   &y=2010-2024          (absent: 2001 to the last year)
//   &lang=pt              (absent: English)
// Anything that does not parse falls back to Brazil and the defaults, without an error.
import { SATELLITES, type Satellite } from '../data/load'
import { circleRing, type Ring } from '../geo/aoi'

export type SharedArea =
  | { kind: 'country' }
  | { kind: 'state'; uf: string }
  | { kind: 'biome'; id: string }
  | { kind: 'muni'; id: string; uf: string }
  | { kind: 'circle'; lat: number; lon: number; km: number }
  | { kind: 'polygon'; ring: Ring }

export interface SharedView {
  area: SharedArea
  /** null: harmonized; otherwise the satellite shown as observed */
  sat: Satellite | null
  years: [number, number] | null
  lang: 'en' | 'pt'
}

export const BIOME_IDS = ['amazonia', 'caatinga', 'cerrado', 'mata_atlantica', 'pampa', 'pantanal']
/** IBGE state code (first two digits of a municipality code) → state abbreviation */
const UF_OF_CODE: Record<string, string> = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB',
  26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS',
  51: 'MT', 52: 'GO', 53: 'DF',
}
export const UFS = Object.values(UF_OF_CODE)

/** a drawn polygon's link stays under this many characters (#5); longer outlines are thinned */
export const MAX_URL = 2000
/** the box the app covers, with a margin: coordinates outside it are not a Brazilian area */
const inBox = (lon: number, lat: number) => lon >= -75 && lon <= -28 && lat >= -35 && lat <= 7

const r3 = (v: number) => String(Math.round(v * 1000) / 1000)
const num = (s: string | undefined) => (s !== undefined && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN)

function encodeArea(a: SharedArea): string | null {
  switch (a.kind) {
    case 'country': return null
    case 'state': return `uf:${a.uf}`
    case 'biome': return `bio:${a.id}`
    case 'muni': return `m:${a.id}`
    case 'circle': return `c:${r3(a.lat)},${r3(a.lon)},${r3(a.km)}`
    case 'polygon': return `p:${polygonText(a.ring)}`
  }
}

/** "lon,lat;lon,lat;…" at 3 decimals (~110 m), without the closing point; thinned until the link fits MAX_URL */
export function polygonText(ring: Ring, budget = MAX_URL - 200): string {
  let pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
  const text = (ps: Ring) => ps.map(([lon, lat]) => `${r3(lon)},${r3(lat)}`).join(';')
  // every other point, until it fits: a hand-drawn outline keeps its shape, and the area is read from 0.1° cells
  while (text(pts).length > budget && pts.length > 8) pts = pts.filter((_, k) => k % 2 === 0)
  return text(pts)
}

function decodeArea(s: string | null): SharedArea {
  if (!s || !s.includes(':')) return { kind: 'country' }
  const kind = s.slice(0, s.indexOf(':'))
  const rest = s.slice(s.indexOf(':') + 1)
  if (kind === 'uf' && UFS.includes(rest)) return { kind: 'state', uf: rest }
  if (kind === 'bio' && BIOME_IDS.includes(rest)) return { kind: 'biome', id: rest }
  if (kind === 'm' && /^\d{7}$/.test(rest) && UF_OF_CODE[rest.slice(0, 2)]) return { kind: 'muni', id: rest, uf: UF_OF_CODE[rest.slice(0, 2)] }
  if (kind === 'c') {
    const [lat, lon, km] = rest.split(',').map(num)
    if (inBox(lon, lat) && km >= 5 && km <= 500) return { kind: 'circle', lat, lon, km }
  }
  if (kind === 'p') {
    const pts = rest.split(';').map((p) => p.split(',').map(num))
    if (pts.length >= 3 && pts.length <= 1000 && pts.every((p) => p.length === 2 && inBox(p[0], p[1]))) {
      const ring = pts as Ring
      return { kind: 'polygon', ring: [...ring, ring[0]] }
    }
  }
  return { kind: 'country' }
}

/** The URL of a view, on top of `base` (its hash, such as #method, is kept). */
export function viewUrl(base: string, v: SharedView, lastYear: number): string {
  const url = new URL(base)
  for (const k of ['a', 'v', 'y', 'lang']) url.searchParams.delete(k)
  const a = encodeArea(v.area)
  if (a) url.searchParams.set('a', a)
  if (v.sat) url.searchParams.set('v', `obs:${v.sat}`)
  if (v.years && (v.years[0] !== 2001 || v.years[1] !== lastYear)) url.searchParams.set('y', `${v.years[0]}-${v.years[1]}`)
  if (v.lang === 'pt') url.searchParams.set('lang', 'pt')
  // URLSearchParams escapes ":" "," ";" — legal as they are in a query, and easier to read in a message
  return url.href.replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%3B/g, ';')
}

/** The view a URL asks for; a missing or malformed part falls back to the default. */
export function parseView(search: string, lastYear: number): SharedView {
  const q = new URLSearchParams(search)
  const sat = q.get('v')?.startsWith('obs:') ? q.get('v')!.slice(4) : null
  const y = /^(\d{4})-(\d{4})$/.exec(q.get('y') ?? '')
  const from = y ? Number(y[1]) : NaN
  const to = y ? Number(y[2]) : NaN
  return {
    area: decodeArea(q.get('a')),
    sat: sat && (SATELLITES as readonly string[]).includes(sat) ? (sat as Satellite) : null,
    years: from >= 2001 && to <= lastYear && from <= to ? [from, to] : null,
    lang: q.get('lang') === 'pt' ? 'pt' : 'en',
  }
}

/** The ring of a shared circle, as the point-and-radius form draws it. */
export const sharedCircleRing = (a: { lat: number; lon: number; km: number }) => circleRing(a.lat, a.lon, a.km)

/** WhatsApp message: the area, its answer and the link, cut to stay under `max` characters (#5: 300). */
export function shareText(area: string, answer: string | null, link: string, max = 300): string {
  const head = answer ? `${area}: ${answer}` : area
  const room = max - link.length - 1
  const cut = head.length > room ? `${head.slice(0, Math.max(0, room - 1)).trimEnd()}…` : head
  return `${cut}\n${link}`
}
