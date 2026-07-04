// Place search + category lookup, proxied through the broker so the browser doesn't hit
// a third-party API directly (keeps a proper User-Agent and avoids CORS). Uses the free
// OSM Nominatim service. Degrades to an empty list on any error.

const UA = 'VoTek/0.1 (tour-guide)'

// Category term -> OSM tag. Category browsing uses Overpass (real POIs); free text uses Nominatim.
const CATEGORY_TAGS = {
  coffee: ['amenity', 'cafe'],
  cafe: ['amenity', 'cafe'],
  restaurant: ['amenity', 'restaurant'],
  food: ['amenity', 'restaurant'],
  hotel: ['tourism', 'hotel'],
  lodging: ['tourism', 'hotel'],
  museum: ['tourism', 'museum'],
  park: ['leisure', 'park'],
  bar: ['amenity', 'bar'],
}

// Real POI lookup within a viewport via the Overpass API (free, no key).
async function overpassCategory(tag, bbox) {
  const [w, s, e, n] = bbox
  const [k, v] = tag
  const q =
    `[out:json][timeout:10];` +
    `(node["${k}"="${v}"](${s},${w},${n},${e});way["${k}"="${v}"](${s},${w},${n},${e}););` +
    `out center 30;`
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(11000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.elements || [])
      .map((el) => {
        const lat = el.lat ?? el.center?.lat
        const lng = el.lon ?? el.center?.lon
        const t = el.tags || {}
        if (lat == null || lng == null || !t.name) return null
        const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ')
        return {
          id: `${el.type}/${el.id}`,
          name: t.name,
          position: { lat, lng },
          category: v,
          address: street || t['addr:city'] || undefined,
        }
      })
      .filter(Boolean)
      .slice(0, 25)
  } catch {
    return []
  }
}

function normalize(item) {
  const a = item.address || {}
  const category = item.category || item.type || a.class || undefined
  const addressParts = [
    a.road || a.pedestrian,
    a.neighbourhood || a.suburb,
    a.city || a.town || a.village,
  ].filter(Boolean)
  return {
    id: String(item.place_id),
    name: item.namedetails?.name || item.name || item.display_name?.split(',')[0] || 'Unknown',
    position: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) },
    category,
    address: addressParts.join(', ') || item.display_name,
  }
}

// Web lookup for the Lens feature: find a Wikipedia article for a subject and return its
// summary + lead image. Free, no key.
export async function wikiLookup(query) {
  if (!query || !query.trim()) return null
  try {
    const s = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) },
    )
    if (!s.ok) return null
    const sd = await s.json()
    const title = sd?.query?.search?.[0]?.title
    if (!title) return null
    const sum = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    })
    if (!sum.ok) return null
    const d = await sum.json()
    return {
      title: d.title || title,
      extract: d.extract || '',
      imageUrl: d.originalimage?.source || d.thumbnail?.source || null,
      url: d.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      source: 'Wikipedia',
    }
  } catch {
    return null
  }
}

/**
 * Free-text or category search, biased to the current map viewport when a bbox is given.
 * @param {string} q query text (a place name or a category like "coffee")
 * @param {object} [opts] { bbox: [west,south,east,north] }
 */
export async function searchPlaces(q, opts = {}) {
  if (!q || !q.trim()) return []

  // Category browse (chips) -> Overpass POIs within the viewport.
  const tag = CATEGORY_TAGS[q.trim().toLowerCase()]
  if (tag && opts.bbox && opts.bbox.length === 4) {
    return overpassCategory(tag, opts.bbox)
  }

  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    limit: '20',
  })
  if (opts.bbox && opts.bbox.length === 4) {
    // viewbox is west,north,east,south for Nominatim. bounded=1 hard-limits to the viewport
    // (right for category browsing like "coffee"); bounded=0 just biases (right for named places).
    const [w, s, e, n] = opts.bbox
    params.set('viewbox', `${w},${n},${e},${s}`)
    params.set('bounded', opts.bounded ? '1' : '0')
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data.map(normalize) : []
  } catch {
    return []
  }
}
