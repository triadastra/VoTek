// Real path routing via the public OSRM server (free, no key). Returns a GeoJSON-style
// list of coordinates plus distance/duration so the UI can draw and label the route.

const PROFILES = { foot: 'foot', walk: 'foot', bike: 'cycling', car: 'driving' }

export async function getRoute(from, to, mode = 'foot') {
  if (!from || !to) return null
  const profile = PROFILES[mode] || 'foot'
  const url =
    `https://router.project-osrm.org/route/v1/${profile}/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(9000) })
    if (!res.ok) return null
    const data = await res.json()
    const r = data.routes?.[0]
    if (!r) return null
    return {
      mode: profile,
      distanceM: r.distance,
      durationS: r.duration,
      // OSRM returns [lng,lat]; hand back {lng,lat} for the map layer.
      coords: (r.geometry?.coordinates || []).map(([lng, lat]) => ({ lng, lat })),
    }
  } catch {
    return null
  }
}
