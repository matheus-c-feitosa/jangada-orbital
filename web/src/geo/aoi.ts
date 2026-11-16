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

/** Cell (cellLat, cellLon) of a key made by `cellKey`. Longitudes stay within ±5000 cells, so rounding is exact. */
export function cellOfKey(key: number): [number, number] {
  const cLat = Math.round(key / 10000)
  return [cLat, key - cLat * 10000]
}

/** Centre of a cell as [lon, lat]. */
export const cellCentre = (cLat: number, cLon: number): [number, number] => [(cLon + 0.5) / 10, (cLat + 0.5) / 10]

/** Approximate area of one 0.1° cell, in km² (0.1° of latitude is 11.12 km; longitude shrinks with the cosine). */
export const cellAreaKm2 = (cLat: number) => 11.1195 * 11.1195 * Math.cos(((cLat + 0.5) / 10) * (Math.PI / 180))

/**
 * Cells whose centre falls inside the ring, plus the cell-id box that bounds them. An area too small to contain any
 * cell centre (a 5 km circle, a small municipality) uses the single cell around its centre and is flagged
 * `approximate`, so it never comes back empty.
 */
export function cellsInRing(ring: Ring): { cells: Set<number>; box: CellBox | null; approximate: boolean } {
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
  if (cells.size) return { cells, box: { latMin, latMax, lonMin, lonMax }, approximate: false }
  const cLat = Math.floor(((Math.min(...lats) + Math.max(...lats)) / 2) * 10)
  const cLon = Math.floor(((Math.min(...lons) + Math.max(...lons)) / 2) * 10)
  return { cells: new Set([cellKey(cLat, cLon)]), box: { latMin: cLat, latMax: cLat, lonMin: cLon, lonMax: cLon }, approximate: true }
}

/**
 * Cells of an area made of several parts (a municipality with islands): the main ring as `cellsInRing` reads it, plus
 * the cells whose centre falls inside each other part. A part too small for a cell centre adds nothing, so a small
 * island does not pull in a whole 0.1° cell of sea.
 */
export function cellsInRings(main: Ring, parts: Ring[] = []): { cells: Set<number>; box: CellBox | null; approximate: boolean } {
  const first = cellsInRing(main)
  if (!parts.length) return first
  const cells = new Set(first.approximate ? [] : first.cells)
  let box = first.approximate ? null : first.box
  for (const p of parts) {
    const r = cellsInRing(p)
    if (r.approximate || !r.box) continue
    for (const c of r.cells) cells.add(c)
    box = box
      ? { latMin: Math.min(box.latMin, r.box.latMin), latMax: Math.max(box.latMax, r.box.latMax), lonMin: Math.min(box.lonMin, r.box.lonMin), lonMax: Math.max(box.lonMax, r.box.lonMax) }
      : r.box
  }
  return cells.size ? { cells, box, approximate: false } : first
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

/** Tile ids "<ty>_<tx>" (tiles of `tileCells` cells, 20 = 2°) that a cell box touches. */
export function tilesForBox(box: CellBox, tileCells: number): string[] {
  const ids: string[] = []
  for (let ty = Math.floor(box.latMin / tileCells); ty <= Math.floor(box.latMax / tileCells); ty++) {
    for (let tx = Math.floor(box.lonMin / tileCells); tx <= Math.floor(box.lonMax / tileCells); tx++) ids.push(`${ty}_${tx}`)
  }
  return ids
}

/** Area of a lon/lat ring on a sphere of the mean Earth radius, in km² (spherical excess; holes not supported). */
export function ringAreaKm2(ring: Ring): number {
  const R = 6371.0088
  const rad = Math.PI / 180
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i]
    const [lon2, lat2] = ring[(i + 1) % ring.length]
    sum += (lon2 - lon1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad))
  }
  return Math.abs((sum * R * R) / 2)
}

export function ringBounds(ring: Ring): [number, number, number, number] {
  const lons = ring.map((p) => p[0])
  const lats = ring.map((p) => p[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}
