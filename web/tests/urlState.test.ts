import { describe, expect, test } from 'vitest'
import { MAX_URL, parseView, polygonText, shareText, viewUrl, type SharedView } from '../src/app/urlState'
import type { Ring } from '../src/geo/aoi'

const BASE = 'https://matheus-c-feitosa.github.io/jangada-orbital/'
const LAST = 2026
const roundTrip = (v: SharedView) => parseView(new URL(viewUrl(BASE, v, LAST)).search, LAST)

describe('shareable view link (#5)', () => {
  test('state, biome, municipality, circle and polygon come back exactly', () => {
    const base = { sat: null, years: null, lang: 'en' } as const
    expect(roundTrip({ ...base, area: { kind: 'state', uf: 'CE' } }).area).toEqual({ kind: 'state', uf: 'CE' })
    expect(roundTrip({ ...base, area: { kind: 'biome', id: 'cerrado' } }).area).toEqual({ kind: 'biome', id: 'cerrado' })
    expect(roundTrip({ ...base, area: { kind: 'muni', id: '2304400', uf: 'CE' } }).area).toEqual({ kind: 'muni', id: '2304400', uf: 'CE' })
    expect(roundTrip({ ...base, area: { kind: 'circle', lat: -3.731, lon: -38.527, km: 25 } }).area)
      .toEqual({ kind: 'circle', lat: -3.731, lon: -38.527, km: 25 })
    const ring: Ring = [[-50.1, -10.2], [-49.8, -10.2], [-49.9, -9.9], [-50.1, -10.2]]
    expect(roundTrip({ ...base, area: { kind: 'polygon', ring } }).area).toEqual({ kind: 'polygon', ring })
  })

  test('values, years and language come back; the defaults stay out of the link', () => {
    const v: SharedView = { area: { kind: 'state', uf: 'PA' }, sat: 'NOAA-20', years: [2010, 2020], lang: 'pt' }
    const url = viewUrl(BASE, v, LAST)
    expect(url).toBe(`${BASE}?a=uf:PA&v=obs:NOAA-20&y=2010-2020&lang=pt`)
    expect(roundTrip(v)).toEqual(v)
    expect(viewUrl(BASE, { area: { kind: 'country' }, sat: null, years: [2001, LAST], lang: 'en' }, LAST)).toBe(BASE)
  })

  test('the page hash and other parameters are kept', () => {
    const url = viewUrl(`${BASE}?x=1#method`, { area: { kind: 'state', uf: 'CE' }, sat: null, years: null, lang: 'en' }, LAST)
    expect(url).toBe(`${BASE}?x=1&a=uf:CE#method`)
  })

  test('a tampered or malformed link falls back to Brazil and the defaults', () => {
    for (const q of ['?a=uf:XX', '?a=bio:sahara', '?a=m:99', '?a=m:9999999', '?a=c:abc', '?a=c:-3,-38,1', '?a=c:40,-38,10',
      '?a=p:1,2;3,4', '?a=p:-50,-10;-49,-10', '?a=nothing', '?a=<script>', '?a=']) {
      expect(parseView(q, LAST).area, q).toEqual({ kind: 'country' })
    }
    expect(parseView('?v=obs:Landsat&y=1990-2050', LAST)).toEqual({ area: { kind: 'country' }, sat: null, years: null, lang: 'en' })
    expect(parseView('?y=2020-2010', LAST).years).toBeNull()
  })

  test('a long drawn outline is thinned until its link fits under 2,000 characters', () => {
    const ring: Ring = Array.from({ length: 500 }, (_, k) => {
      const t = (k / 500) * 2 * Math.PI
      return [-50 + Math.cos(t), -10 + Math.sin(t)] as [number, number]
    })
    const url = viewUrl(BASE, { area: { kind: 'polygon', ring }, sat: 'NOAA-21', years: [2001, 2020], lang: 'pt' }, LAST)
    expect(url.length).toBeLessThan(MAX_URL)
    const back = parseView(new URL(url).search, LAST).area
    expect(back.kind).toBe('polygon')
    // short outlines keep every point, at 3 decimals
    const pts = polygonText(ring.slice(0, 5)).split(';')
    expect(pts).toHaveLength(5)
    expect(pts.every((p) => /^-?\d+(\.\d{1,3})?,-?\d+(\.\d{1,3})?$/.test(p))).toBe(true)
  })

  test('the WhatsApp message holds the area, the answer and the link in under 300 characters', () => {
    const link = `${BASE}?a=uf:PA&v=obs:NOAA-20&y=2010-2020`
    const text = shareText('Pará', '2026 so far: 12.3k detections. A usual year has 30.1k by 14 Nov.', link)
    expect(text).toBe(`Pará: 2026 so far: 12.3k detections. A usual year has 30.1k by 14 Nov.\n${link}`)
    const long = shareText('Pará', 'x'.repeat(500), link)
    expect(long.length).toBeLessThanOrEqual(300)
    expect(long.endsWith(link)).toBe(true)
  })
})
