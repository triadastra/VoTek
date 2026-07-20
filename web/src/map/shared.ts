// Helpers shared by the map provider implementations.
import type { LngLat } from './types'
import type { IconName } from '../ui/icons'

// Catmull-Rom spline → denser polyline, so the breadcrumb trail renders as smooth curves
// instead of straight zig-zags between the 3-second sample points.
export function smooth(points: LngLat[], steps = 10): [number, number][] {
  if (points.length < 3) return points.map((p) => [p.lng, p.lat])
  const out: [number, number][] = []
  const pt = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = pt(i - 1)
    const p1 = pt(i)
    const p2 = pt(i + 1)
    const p3 = pt(i + 2)
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const t2 = t * t
      const t3 = t2 * t
      const lng =
        0.5 *
        (2 * p1.lng +
          (-p0.lng + p2.lng) * t +
          (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * t2 +
          (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * t3)
      const lat =
        0.5 *
        (2 * p1.lat +
          (-p0.lat + p2.lat) * t +
          (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 +
          (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3)
      out.push([lng, lat])
    }
  }
  const last = points[points.length - 1]
  out.push([last.lng, last.lat])
  return out
}

const CATEGORY_ICON: Record<string, IconName> = {
  restaurant: 'food',
  cafe: 'coffee',
  coffee: 'coffee',
  bar: 'bar',
  hotel: 'hotel',
  lodging: 'hotel',
  museum: 'museum',
  park: 'park',
  viewpoint: 'camera',
  attraction: 'star',
}

export function iconFor(category?: string): IconName {
  if (!category) return 'pin'
  const key = Object.keys(CATEGORY_ICON).find((k) => category.toLowerCase().includes(k))
  return key ? CATEGORY_ICON[key] : 'pin'
}
