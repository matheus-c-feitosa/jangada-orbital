// Area of interest → 0.1° grid cells. A cell (cellLat, cellLon) spans
// [cellLat/10, cellLat/10 + 0.1) × [cellLon/10, cellLon/10 + 0.1); it belongs to an area when its centre is inside.

export type Ring = [number, number][] // [lon, lat], first point may or may not repeat the last

export interface CellBox {
  latMin: number
  latMax: number
  lonMin: number
  lonMax: number
}

export const cellKey = (cellLat: number, cellLon: number) => cellLat * 10000 + cellLon

/** Ray-casting point-in-polygon test. */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Cells whose centre falls inside the ring, plus the cell-id box that bounds them. */
export function cellsInRing(ring: Ring): { cells: Set<number>; box: CellBox | null } {
  const lons = ring.map((p) => p[0])
  const lats = ring.map((p) => p[1])
  const latMin = Math.floor(Math.min(...lats) * 10)
  const latMax = Math.floor(Math.max(...lats) * 10)
  const lonMin = Math.floor(Math.min(...lons) * 10)
  const lonMax = Math.floor(Math.max(...lons) * 10)
  const cells = new Set<number>()
  for (let cLat = latMin; cLat <= latMax; cLat++) {
    for (let cLon = lonMin; cLon <= lonMax; cLon++) {
      if (pointInRing((cLon + 0.5) / 10, (cLat + 0.5) / 10, ring)) cells.add(cellKey(cLat, cLon))
    }
  }
  return { cells, box: cells.size ? { latMin, latMax, lonMin, lonMax } : null }
}

/** Circle of `km` radius around (lat, lon) as a 64-vertex ring (spherical approximation). */
export function circleRing(lat: number, lon: number, km: number, vertices = 64): Ring {
  const R = 6371.0088
  const d = km / R
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lon * Math.PI) / 180
  const ring: Ring = []
  for (let i = 0; i <= vertices; i++) {
    const θ = (2 * Math.PI * i) / vertices
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ))
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2))
    ring.push([(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI])
  }
  return ring
}

export function ringBounds(ring: Ring): [number, number, number, number] {
  const lons = ring.map((p) => p[0])
  const lats = ring.map((p) => p[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}
