// Reverse geocoding: turn the precise GPS fix into a human place name from map data,
// so the guide "knows where it is" rather than just raw coordinates. Uses the free OSM
// Nominatim service (no key). Results are cached and rate-considerate; failures degrade
// gracefully to null so narration still works.

const cache = new Map() // key -> { place, at } (at is a request counter, not wall-clock)
let reqCounter = 0

function key(lat, lng) {
  // ~11m grid: enough to avoid re-querying for tiny GPS jitter.
  return `${lat.toFixed(4)},${lng.toFixed(4)}`
}

export async function reverseGeocode(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  const k = key(lat, lng)
  const hit = cache.get(k)
  if (hit) return hit.place

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VoTek/0.1 (tour-guide)' },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const a = data.address || {}
    // Build a compact, guide-friendly place string.
    const parts = [
      a.tourism || a.historic || a.building || a.amenity,
      a.road || a.pedestrian || a.footway,
      a.neighbourhood || a.suburb || a.quarter,
      a.city || a.town || a.village,
    ].filter(Boolean)
    const place = parts.length ? [...new Set(parts)].join(', ') : data.display_name || null
    cache.set(k, { place, at: reqCounter++ })
    return place
  } catch {
    return null // offline / blocked / timeout — narration continues without a place name
  }
}
