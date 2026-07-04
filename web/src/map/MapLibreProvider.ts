import maplibregl, { Map as MlMap, GeoJSONSource, Marker } from 'maplibre-gl'
import type { LngLat, MapProvider, MapProviderOptions, PhotoSpot } from './types'

// A free, key-less raster style built on OpenStreetMap tiles. Swap for a vector style
// (MapTiler/Stadia) later for a more polished look — no other code changes needed.
const FREE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0b0f17' } },
    { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-brightness-max': 0.85 } },
  ],
}

const SPOTS_SOURCE = 'photo-spots'
const ACCURACY_SOURCE = 'gps-accuracy'

// Approximate a geodesic circle (meters) as a polygon so the GPS accuracy ring scales
// correctly with zoom (MapLibre's circle radius is in pixels, not meters).
function circlePolygon(center: LngLat, radiusM: number, steps = 48): GeoJSON.Feature {
  const coords: [number, number][] = []
  const earth = 6378137
  const lat = (center.lat * Math.PI) / 180
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI
    const dLat = (radiusM * Math.cos(theta)) / earth
    const dLng = (radiusM * Math.sin(theta)) / (earth * Math.cos(lat))
    coords.push([center.lng + (dLng * 180) / Math.PI, center.lat + (dLat * 180) / Math.PI])
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }
}

function toFeatureCollection(spots: PhotoSpot[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: spots.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.position.lng, s.position.lat] },
      properties: { id: s.id, name: s.name, score: s.score, blurb: s.blurb },
    })),
  }
}

export async function createMapLibreProvider(opts: MapProviderOptions): Promise<MapProvider> {
  const map = new MlMap({
    container: opts.container,
    style: FREE_STYLE,
    center: [opts.center.lng, opts.center.lat],
    zoom: opts.zoom,
    attributionControl: { compact: true },
    // Our own UI supplies all controls — no default map chrome.
  })

  // Build our own location dot (default marker replaced with a styled element).
  const dotEl = document.createElement('div')
  dotEl.className = 'user-dot'
  dotEl.innerHTML = '<span class="user-dot__pulse"></span><span class="user-dot__core"></span>'
  const userMarker = new Marker({ element: dotEl, rotationAlignment: 'map' })

  let spotTapCb: ((spot: PhotoSpot) => void) | null = null
  let currentSpots: PhotoSpot[] = []

  await new Promise<void>((resolve) => map.on('load', () => resolve()))

  // GPS accuracy ring — rendered beneath everything so it reads as "live GPS is on".
  map.addSource(ACCURACY_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: 'gps-accuracy-fill',
    type: 'fill',
    source: ACCURACY_SOURCE,
    paint: { 'fill-color': '#5b8cff', 'fill-opacity': 0.12 },
  })
  map.addLayer({
    id: 'gps-accuracy-line',
    type: 'line',
    source: ACCURACY_SOURCE,
    paint: { 'line-color': '#5b8cff', 'line-opacity': 0.5, 'line-width': 1 },
  })

  map.addSource(SPOTS_SOURCE, { type: 'geojson', data: toFeatureCollection([]) })

  // Halo circle sized + colored by score.
  map.addLayer({
    id: 'photo-spots-halo',
    type: 'circle',
    source: SPOTS_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'score'], 0, 14, 1, 30],
      'circle-color': '#8b5bff',
      'circle-opacity': ['interpolate', ['linear'], ['get', 'score'], 0, 0.12, 1, 0.28],
      'circle-stroke-color': '#a98bff',
      'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: 'photo-spots-core',
    type: 'circle',
    source: SPOTS_SOURCE,
    paint: { 'circle-radius': 5, 'circle-color': '#c9b8ff' },
  })

  map.on('click', 'photo-spots-halo', (e) => {
    const id = e.features?.[0]?.properties?.id
    const spot = currentSpots.find((s) => s.id === id)
    if (spot && spotTapCb) spotTapCb(spot)
  })
  map.on('mouseenter', 'photo-spots-halo', () => (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'photo-spots-halo', () => (map.getCanvas().style.cursor = ''))

  return {
    flyTo(pos: LngLat, zoom?: number) {
      map.flyTo({ center: [pos.lng, pos.lat], zoom: zoom ?? map.getZoom(), speed: 0.8 })
    },
    setUserLocation(pos: LngLat, headingDeg?: number, accuracyM?: number) {
      userMarker.setLngLat([pos.lng, pos.lat]).addTo(map)
      if (headingDeg != null) userMarker.setRotation(headingDeg)
      const accSrc = map.getSource(ACCURACY_SOURCE) as GeoJSONSource | undefined
      accSrc?.setData(
        accuracyM && accuracyM > 0
          ? { type: 'FeatureCollection', features: [circlePolygon(pos, accuracyM)] }
          : { type: 'FeatureCollection', features: [] },
      )
    },
    setPhotoSpots(spots: PhotoSpot[]) {
      currentSpots = spots
      const src = map.getSource(SPOTS_SOURCE) as GeoJSONSource | undefined
      src?.setData(toFeatureCollection(spots))
    },
    onPhotoSpotTap(cb) {
      spotTapCb = cb
    },
    destroy() {
      userMarker.remove()
      map.remove()
    },
  }
}
