/**
 * Geographic snapping utilities.
 * No external dependencies — pure coordinate math in degrees.
 */

// Default threshold in degrees (~0.05° ≈ 5.5 km at the equator)
export const DEFAULT_SNAP_THRESHOLD = 0.05

/**
 * Nearest point on a line segment [a, b] to point p.
 * All coords are [lng, lat].
 */
function nearestOnSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return { coord: a, distSq: distSq2(p, a) }
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq))
  const nearest = [a[0] + t * dx, a[1] + t * dy]
  return { coord: nearest, distSq: distSq2(p, nearest) }
}

function distSq2(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
}

/**
 * Extract all ring coordinate sequences from a GeoJSON FeatureCollection or Feature.
 */
function extractRings(geojson) {
  const rings = []
  const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson]
  for (const f of features) {
    const g = f.geometry || f
    if (!g) continue
    switch (g.type) {
      case 'LineString':      rings.push(g.coordinates); break
      case 'MultiLineString': g.coordinates.forEach(r => rings.push(r)); break
      case 'Polygon':         g.coordinates.forEach(r => rings.push(r)); break
      case 'MultiPolygon':    g.coordinates.forEach(p => p.forEach(r => rings.push(r))); break
    }
  }
  return rings
}

/**
 * Snap a single [lng, lat] coordinate to the nearest point on refGeometry.
 * Returns the snapped coordinate if within thresholdDeg, otherwise the original.
 */
export function snapCoord(coord, rings, thresholdDeg) {
  const threshSq = thresholdDeg * thresholdDeg
  let bestDistSq = threshSq
  let bestCoord = null

  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const { coord: near, distSq } = nearestOnSegment(coord, ring[i], ring[i + 1])
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        bestCoord = near
      }
    }
  }

  return bestCoord ?? coord
}

/**
 * Apply boundary snapping to all vertices of a GeoJSON Polygon or MultiPolygon feature.
 * Returns a new feature with snapped coordinates.
 *
 * @param {GeoJSON.Feature} feature  - Polygon or MultiPolygon feature to snap
 * @param {GeoJSON}         refGeojson - Reference geometry to snap to
 * @param {number}          [thresholdDeg] - Snap distance in degrees
 */
export function snapFeatureToGeometry(feature, refGeojson, thresholdDeg = DEFAULT_SNAP_THRESHOLD) {
  if (!feature || !refGeojson) return feature
  const rings = extractRings(refGeojson)
  if (rings.length === 0) return feature

  const snapRing = ring => ring.map(coord => snapCoord(coord, rings, thresholdDeg))

  let newCoords
  const g = feature.geometry
  if (g.type === 'Polygon') {
    newCoords = g.coordinates.map(snapRing)
  } else if (g.type === 'MultiPolygon') {
    newCoords = g.coordinates.map(poly => poly.map(snapRing))
  } else {
    return feature
  }

  return { ...feature, geometry: { ...g, coordinates: newCoords } }
}

/**
 * Count how many vertices in a feature were snapped (moved more than epsilon).
 * Useful for reporting to the user.
 */
export function countSnappedVertices(original, snapped) {
  const eps = 1e-9
  let count = 0
  const oCoords = original.geometry.coordinates.flat(3)
  const sCoords = snapped.geometry.coordinates.flat(3)
  for (let i = 0; i < oCoords.length; i++) {
    if (Math.abs(oCoords[i] - sCoords[i]) > eps) count++
  }
  return count / 2 // each vertex is 2 values
}
