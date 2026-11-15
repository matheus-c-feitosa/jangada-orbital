// Splits polygon borders into the edges two polygons share (inner borders) and the edges only one polygon has (the
// outline of the whole set). The design draws the inner biome borders dashed and the country outline solid; the IBGE
// biome polygons share their vertices along common borders, so a segment that appears twice is an inner border.

type Pos = number[]

const key = (a: Pos, b: Pos) => {
  const p = `${a[0].toFixed(5)},${a[1].toFixed(5)}`
  const q = `${b[0].toFixed(5)},${b[1].toFixed(5)}`
  return p < q ? `${p}|${q}` : `${q}|${p}`
}

function ringsOf(fc: GeoJSON.FeatureCollection): Pos[][] {
  const out: Pos[][] = []
  for (const f of fc.features) {
    const g = f.geometry
    if (g?.type === 'Polygon') out.push(...g.coordinates)
    else if (g?.type === 'MultiPolygon') for (const poly of g.coordinates) out.push(...poly)
  }
  return out
}

/** `inner` (shared, each drawn once) and `outer` edges as MultiLineStrings; consecutive segments are joined so a
 * dash pattern runs along the border instead of restarting at every vertex. */
export function splitEdges(fc: GeoJSON.FeatureCollection): { inner: GeoJSON.Feature<GeoJSON.MultiLineString>; outer: GeoJSON.Feature<GeoJSON.MultiLineString>; shared: number } {
  const rings = ringsOf(fc)
  const count = new Map<string, number>()
  for (const r of rings) for (let k = 1; k < r.length; k++) { const s = key(r[k - 1], r[k]); count.set(s, (count.get(s) ?? 0) + 1) }
  const inner: Pos[][] = []
  const outer: Pos[][] = []
  const drawn = new Set<string>()
  let shared = 0
  for (const r of rings) {
    let run: Pos[] = []
    let runKind: 'inner' | 'outer' | null = null
    const flush = () => { if (run.length > 1 && runKind) (runKind === 'inner' ? inner : outer).push(run); run = []; runKind = null }
    for (let k = 1; k < r.length; k++) {
      const s = key(r[k - 1], r[k])
      const isInner = (count.get(s) ?? 0) > 1
      if (isInner) shared++
      // an inner edge is drawn by the first polygon that has it
      const kind = isInner ? (drawn.has(s) ? null : 'inner') : 'outer'
      if (isInner) drawn.add(s)
      if (kind !== runKind) { flush(); runKind = kind; if (kind) run = [r[k - 1]] }
      if (kind) run.push(r[k])
    }
    flush()
  }
  const feature = (coordinates: Pos[][]): GeoJSON.Feature<GeoJSON.MultiLineString> => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates } })
  return { inner: feature(inner), outer: feature(outer), shared }
}
