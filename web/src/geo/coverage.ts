// Is an area inside Brazil? Used only when an area comes back with no detections at all, to tell "nothing burned here"
// from "there is no data here" (open sea, other countries). Cell centres are tested against the simplified state outlines.
import { cellCentre, cellOfKey, pointInRing, type Ring } from './aoi'

interface Outline {
  ring: Ring
  box: [number, number, number, number]
}

/** Outer rings of every Polygon and MultiPolygon in the state outlines, each with its bounding box. */
export function outlinesOf(states: GeoJSON.FeatureCollection): Outline[] {
  const out: Outline[] = []
  const add = (ring: number[][]) => {
    const lons = ring.map((p) => p[0])
    const lats = ring.map((p) => p[1])
    out.push({ ring: ring as Ring, box: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] })
  }
  for (const f of states.features) {
    const g = f.geometry
    if (g.type === 'Polygon') add(g.coordinates[0])
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) add(poly[0])
  }
  return out
}

/** True when the centre of at least one of the cells lies inside a state outline. */
export function anyCellInBrazil(cells: Iterable<number>, outlines: Outline[]): boolean {
  for (const key of cells) {
    const [lon, lat] = cellCentre(...cellOfKey(key))
    for (const o of outlines) {
      if (lon < o.box[0] || lon > o.box[2] || lat < o.box[1] || lat > o.box[3]) continue
      if (pointInRing(lon, lat, o.ring)) return true
    }
  }
  return false
}
