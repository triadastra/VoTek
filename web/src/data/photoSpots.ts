import type { LngLat, PhotoSpot } from '../map/types'

// STUB dataset. Real sources: Wikimedia Commons geosearch, Mapillary, Flickr geotag density,
// or VoTek's own users' captures over time. See ARCHITECTURE.md.
//
// For the scaffold we synthesize a handful of ranked vantage points around the user's location
// so the circle overlays are visible wherever the demo runs.
const OFFSETS: Array<{ dx: number; dy: number; name: string; score: number; blurb: string }> = [
  { dx: 0.0016, dy: 0.0011, name: 'Golden hour overlook', score: 0.95, blurb: 'Wide view, best light 1h before sunset.' },
  { dx: -0.0021, dy: 0.0009, name: 'Waterfront frame', score: 0.82, blurb: 'Leading lines along the rail toward the skyline.' },
  { dx: 0.0009, dy: -0.0018, name: 'Alley symmetry', score: 0.7, blurb: 'Tight symmetry; shoot portrait, low angle.' },
  { dx: -0.0014, dy: -0.0013, name: 'Rooftop reflection', score: 0.6, blurb: 'Glass reflections after rain; blue hour.' },
]

export function photoSpotsNear(center: LngLat): PhotoSpot[] {
  return OFFSETS.map((o, i) => ({
    id: `spot-${i}`,
    name: o.name,
    score: o.score,
    blurb: o.blurb,
    position: { lng: center.lng + o.dx, lat: center.lat + o.dy },
  }))
}
