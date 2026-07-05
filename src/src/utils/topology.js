/**
 * Topological edge utilities.
 * Detects approximate shared edges between polygons and provides one-shot merge.
 */

const DEFAULT_THRESHOLD = 0.02 // ~2.2 km — tighter than snap threshold

/**
 * Euclidean distance between two [lng, lat] coords (in degrees).
 */
function dist(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
}

/**
 * Return all [lng, lat] vertices from the outer ring of a Polygon feature.
 * Handles Polygon and MultiPolygon (uses first polygon only for edge detection).
 */
function outerRing(feature) {
  const g = feature.geometry
  if (!g) return []
  if (g.type === 'Polygon') return g.coordinates[0] || []
  if (g.type === 'MultiPolygon') return g.coordinates[0]?.[0] || []
  return []
}

/**
 * Detect vertex pairs between two polygon features that are within thresholdDeg.
 * Returns array of { iA, iB } index pairs.
 */
export function detectSharedVertices(featureA, featureB, thresholdDeg = DEFAULT_THRESHOLD) {
  const rA = outerRing(featureA)
  const rB = outerRing(featureB)
  const matches = []
  for (let iA = 0; iA < rA.length; iA++) {
    for (let iB = 0; iB < rB.length; iB++) {
      if (dist(rA[iA], rB[iB]) < thresholdDeg) {
        matches.push({ iA, iB })
      }
    }
  }
  return matches
}

/**
 * Merge the shared edge between featureB and featureA:
 * vertices of featureB that are close to featureA's vertices snap to featureA exactly.
 * featureA is the "authoritative" source; featureB is updated.
 * Returns a new featureB with merged vertices.
 */
export function mergeSharedEdge(featureA, featureB, thresholdDeg = DEFAULT_THRESHOLD) {
  const rA = outerRing(featureA)
  const g = featureB.geometry
  if (!g) return featureB

  const mergeRing = (ring) =>
    ring.map(coord => {
      let best = Infinity, snap = null
      for (const aCoord of rA) {
        const d = dist(coord, aCoord)
        if (d < thresholdDeg && d < best) { best = d; snap = aCoord }
      }
      return snap ?? coord
    })

  let newCoords
  if (g.type === 'Polygon') {
    newCoords = g.coordinates.map(mergeRing)
  } else if (g.type === 'MultiPolygon') {
    newCoords = g.coordinates.map(poly => poly.map(mergeRing))
  } else {
    return featureB
  }

  return { ...featureB, geometry: { ...g, coordinates: newCoords } }
}

/**
 * Find existing user features whose outer ring shares ≥2 vertices with `feature`.
 * Returns array of { feature, layerId, matchCount }.
 */
export function findSharedEdgeNeighbors(feature, userLayers, thresholdDeg = DEFAULT_THRESHOLD) {
  const POLY_TYPES = new Set(['Polygon', 'MultiPolygon'])
  if (!POLY_TYPES.has(feature.geometry?.type)) return []

  const results = []
  for (const layer of userLayers) {
    for (const f of layer.features) {
      if (f.id === feature.id) continue
      if (!POLY_TYPES.has(f.geometry?.type)) continue
      const matches = detectSharedVertices(feature, f, thresholdDeg)
      if (matches.length >= 2) {
        results.push({ feature: f, layerId: layer.id, matchCount: matches.length })
      }
    }
  }
  return results
}

/**
 * Apply one-way edge merge: snap `newFeature`'s vertices toward each neighbor.
 * Returns the updated newFeature.
 */
export function applyEdgeMerge(newFeature, neighbors) {
  return neighbors.reduce((feat, n) => mergeSharedEdge(n.feature, feat), newFeature)
}
