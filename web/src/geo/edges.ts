// Splits polygon borders into the edges two polygons share (inner borders) and the edges only one polygon has (the
// outline of the whole set). The design draws the inner biome borders dashed and the country outline solid; the IBGE
// biome polygons share their vertices along common borders, so a segment that appears twice is an inner border.

type Pos = number[]

function ringsOf(fc: GeoJSON.FeatureCollection): Pos[][] {
  const out: Pos[][] = []
  for (const f of fc.features) {
    const g = f.geometry
    if (g?.type === 'Polygon') out.push(...g.coordinates)
    else if (g?.type === 'MultiPolygon') for (const poly of g.coordinates) out.push(...poly)
  }
  return out
}

type Edges = { inner: GeoJSON.Feature<GeoJSON.MultiLineString>; outer: GeoJSON.Feature<GeoJSON.MultiLineString>; shared: number }

// the biome outlines are one object for the whole visit; remounting the map must not split them again
const memo = new WeakMap<GeoJSON.FeatureCollection, Edges>()

/** `inner` (shared, each drawn once) and `outer` edges as MultiLineStrings; consecutive segments are joined so a
 * dash pattern runs along the border instead of restarting at every vertex. */
export function splitEdges(fc: GeoJSON.FeatureCollection): Edges {
  const hit = memo.get(fc)
  if (hit) return hit
  const rings = ringsOf(fc)
  // Numbers, not strings, for keys: each point (to 1e-5 degree) gets a small id, and a segment is the pair of ids in
  // either direction. 25.5 thousand vertices take a few milliseconds this way instead of a few hundred.
  const ids = new Map<number, number>()
  const pid = (p: Pos) => {
    const k = Math.round(p[0] * 1e5) * 1e7 + Math.round(p[1] * 1e5)
    let v = ids.get(k)
    if (v === undefined) { v = ids.size; ids.set(k, v) }
    return v
  }
  const N = 2 ** 26
  const seg = (a: number, b: number) => (a < b ? a * N + b : b * N + a)
  const ringIds = rings.map((r) => r.map(pid))
  const count = new Map<number, number>()
  for (const r of ringIds) for (let k = 1; k < r.length; k++) { const s = seg(r[k - 1], r[k]); count.set(s, (count.get(s) ?? 0) + 1) }
  const inner: Pos[][] = []
  const outer: Pos[][] = []
  const drawn = new Set<number>()
  let shared = 0
  rings.forEach((r, j) => {
    const rid = ringIds[j]
    let run: Pos[] = []
    let runKind: 'inner' | 'outer' | null = null
    const flush = () => { if (run.length > 1 && runKind) (runKind === 'inner' ? inner : outer).push(run); run = []; runKind = null }
    for (let k = 1; k < r.length; k++) {
      const s = seg(rid[k - 1], rid[k])
      const isInner = (count.get(s) ?? 0) > 1
      if (isInner) shared++
      // an inner edge is drawn by the first polygon that has it
      const kind = isInner ? (drawn.has(s) ? null : 'inner') : 'outer'
      if (isInner) drawn.add(s)
      if (kind !== runKind) { flush(); runKind = kind; if (kind) run = [r[k - 1]] }
      if (kind) run.push(r[k])
    }
    flush()
  })
  const feature = (coordinates: Pos[][]): GeoJSON.Feature<GeoJSON.MultiLineString> => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates } })
  const out = { inner: feature(inner), outer: feature(outer), shared }
  memo.set(fc, out)
  return out
}
