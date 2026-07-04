import { union } from '@turf/union'
import { featureCollection } from '@turf/helpers'

// Dissolve an array of polygon features into a single (Multi)Polygon via union.
// Returns null if no valid polygon features are found.
export function dissolveFeatures(features) {
  const polys = features.filter(
    f => f?.geometry?.type === 'Polygon' || f?.geometry?.type === 'MultiPolygon'
  )
  if (!polys.length) return null
  if (polys.length === 1) return { ...polys[0] }
  return union(featureCollection(polys))
}
