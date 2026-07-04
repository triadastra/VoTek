import maplibregl, { Map as MlMap, GeoJSONSource, Marker } from 'maplibre-gl'
import type { Basemap, Bounds, LngLat, MapProvider, MapProviderOptions, Place, PhotoSpot } from './types'
import { iconSvg, type IconName } from '../ui/icons'

// CARTO Voyager — a clean, free, key-less basemap that reads like Google Maps.
// ESRI World Imagery — free satellite tiles. Both toggled via layer visibility.
const CARTO = ['a', 'b', 'c', 'd'].map(
  (s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`,
)
const SATELLITE = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
]

const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: { type: 'raster', tiles: CARTO, tileSize: 256, attribution: '© OpenStreetMap, © CARTO' },
    satellite: { type: 'raster', tiles: SATELLITE, tileSize: 256, attribution: 'Imagery © Esri' },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#eef1f5' } },
    { id: 'carto', type: 'raster', source: 'carto' },
    { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
  ],
}

const ACCURACY_SOURCE = 'gps-accuracy'
const SPOTS_SOURCE = 'photo-spots'
const ROUTE_SOURCE = 'route'
const TRAIL_SOURCE = 'trail'

// Catmull-Rom spline → denser polyline, so the breadcrumb trail renders as smooth curves
// instead of straight zig-zags between the 3-second sample points.
function smooth(points: LngLat[], steps = 10): [number, number][] {
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

function spotsFC(spots: PhotoSpot[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: spots.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.position.lng, s.position.lat] },
      properties: { id: s.id, score: s.score },
    })),
  }
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

function iconFor(category?: string): IconName {
  if (!category) return 'pin'
  const key = Object.keys(CATEGORY_ICON).find((k) => category.toLowerCase().includes(k))
  return key ? CATEGORY_ICON[key] : 'pin'
}

export async function createMapLibreProvider(opts: MapProviderOptions): Promise<MapProvider> {
  const map = new MlMap({
    container: opts.container,
    style: BASE_STYLE,
    center: [opts.center.lng, opts.center.lat],
    zoom: opts.zoom,
    attributionControl: { compact: true },
    // Our own UI supplies all controls — no default map chrome.
  })

  const dotEl = document.createElement('div')
  dotEl.className = 'user-dot'
  dotEl.innerHTML =
    '<span class="user-dot__beam"></span>' +
    '<span class="user-dot__pulse"></span>' +
    '<span class="user-dot__core"></span>'
  // rotationAlignment 'map' keeps the heading beam locked to compass bearing as the map moves.
  const userMarker = new Marker({ element: dotEl, rotationAlignment: 'map' })

  const placeMarkers: Marker[] = []
  let selectedMarker: Marker | null = null
  let spotTapCb: ((s: PhotoSpot) => void) | null = null
  let placeTapCb: ((p: Place) => void) | null = null
  let currentSpots: PhotoSpot[] = []

  await new Promise<void>((resolve) => map.on('load', () => resolve()))

  // GPS accuracy ring
  map.addSource(ACCURACY_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({
    id: 'gps-accuracy-fill',
    type: 'fill',
    source: ACCURACY_SOURCE,
    paint: { 'fill-color': '#4285f4', 'fill-opacity': 0.12 },
  })
  map.addLayer({
    id: 'gps-accuracy-line',
    type: 'line',
    source: ACCURACY_SOURCE,
    paint: { 'line-color': '#4285f4', 'line-opacity': 0.4, 'line-width': 1 },
  })

  // Route line (casing + colored line, drawn above the basemap).
  map.addSource(ROUTE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: ROUTE_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#1b57c4', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 7, 18, 13] },
  })
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: ROUTE_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#4285f4', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 18, 9] },
  })

  // Breadcrumb trail (glow + curved line + a dot at each 3s sample point).
  map.addSource(TRAIL_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addSource(`${TRAIL_SOURCE}-dots`, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: 'trail-glow',
    type: 'line',
    source: TRAIL_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#8b5bff', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 10, 18, 18], 'line-opacity': 0.25, 'line-blur': 3 },
  })
  map.addLayer({
    id: 'trail-line',
    type: 'line',
    source: TRAIL_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#8b5bff', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 18, 8] },
  })
  map.addLayer({
    id: 'trail-dots',
    type: 'circle',
    source: `${TRAIL_SOURCE}-dots`,
    paint: {
      'circle-radius': 3.4,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#8b5bff',
      'circle-stroke-width': 2,
    },
  })

  // Photo-spot circles
  map.addSource(SPOTS_SOURCE, { type: 'geojson', data: spotsFC([]) })
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
    paint: { 'circle-radius': 5, 'circle-color': '#7a4dff' },
  })
  map.on('click', 'photo-spots-halo', (e) => {
    const id = e.features?.[0]?.properties?.id
    const spot = currentSpots.find((s) => s.id === id)
    if (spot && spotTapCb) spotTapCb(spot)
  })

  function clearPlaceMarkers() {
    placeMarkers.forEach((m) => m.remove())
    placeMarkers.length = 0
  }

  return {
    flyTo(pos, zoom) {
      map.flyTo({ center: [pos.lng, pos.lat], zoom: zoom ?? map.getZoom(), speed: 0.9 })
    },
    fitBounds(b: Bounds, padding = 80) {
      map.fitBounds(
        [
          [b.sw.lng, b.sw.lat],
          [b.ne.lng, b.ne.lat],
        ],
        { padding, maxZoom: 17, duration: 700 },
      )
    },
    setUserLocation(pos, headingDeg, accuracyM) {
      userMarker.setLngLat([pos.lng, pos.lat]).addTo(map)
      // Show the orientation beam only when we actually have a compass heading.
      if (headingDeg != null && !Number.isNaN(headingDeg)) {
        dotEl.classList.add('user-dot--heading')
        userMarker.setRotation(headingDeg)
      } else {
        dotEl.classList.remove('user-dot--heading')
      }
      const accSrc = map.getSource(ACCURACY_SOURCE) as GeoJSONSource | undefined
      accSrc?.setData(
        accuracyM && accuracyM > 0
          ? { type: 'FeatureCollection', features: [circlePolygon(pos, accuracyM)] }
          : { type: 'FeatureCollection', features: [] },
      )
    },
    setPhotoSpots(spots) {
      currentSpots = spots
      const src = map.getSource(SPOTS_SOURCE) as GeoJSONSource | undefined
      src?.setData(spotsFC(spots))
    },
    onPhotoSpotTap(cb) {
      spotTapCb = cb
    },
    setPlaces(places) {
      clearPlaceMarkers()
      for (const p of places) {
        const el = document.createElement('button')
        el.className = 'poi-pin'
        el.innerHTML = `<span class="poi-pin__icon">${iconSvg(iconFor(p.category), { size: 15, stroke: 2.2 })}</span>`
        el.onclick = (ev) => {
          ev.stopPropagation()
          placeTapCb?.(p)
        }
        const m = new Marker({ element: el, anchor: 'bottom' }).setLngLat([p.position.lng, p.position.lat]).addTo(map)
        placeMarkers.push(m)
      }
    },
    onPlaceTap(cb) {
      placeTapCb = cb
    },
    setSelectedPlace(place) {
      selectedMarker?.remove()
      selectedMarker = null
      if (!place) return
      const el = document.createElement('div')
      el.className = 'sel-pin'
      el.innerHTML =
        `<span class="sel-pin__head">${iconSvg(iconFor(place.category), { size: 20, stroke: 2.2 })}</span>` +
        `<span class="sel-pin__stem"></span>`
      selectedMarker = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat([place.position.lng, place.position.lat])
        .addTo(map)
    },
    setRoute(coords) {
      const src = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
      if (!coords || coords.length < 2) {
        src?.setData({ type: 'FeatureCollection', features: [] })
        return
      }
      src?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords.map((c) => [c.lng, c.lat]) },
        properties: {},
      })
    },
    setTrail(coords) {
      const line = map.getSource(TRAIL_SOURCE) as GeoJSONSource | undefined
      const dots = map.getSource(`${TRAIL_SOURCE}-dots`) as GeoJSONSource | undefined
      if (!coords || coords.length === 0) {
        line?.setData({ type: 'FeatureCollection', features: [] })
        dots?.setData({ type: 'FeatureCollection', features: [] })
        return
      }
      line?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: smooth(coords) },
        properties: {},
      })
      dots?.setData({
        type: 'FeatureCollection',
        features: coords.map((c) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
          properties: {},
        })),
      })
    },
    setBasemap(kind: Basemap) {
      map.setLayoutProperty('satellite', 'visibility', kind === 'satellite' ? 'visible' : 'none')
      map.setLayoutProperty('carto', 'visibility', kind === 'satellite' ? 'none' : 'visible')
    },
    zoomIn() {
      map.zoomIn()
    },
    zoomOut() {
      map.zoomOut()
    },
    getCenter() {
      const c = map.getCenter()
      return { lng: c.lng, lat: c.lat }
    },
    getBounds() {
      const b = map.getBounds()
      return {
        sw: { lng: b.getWest(), lat: b.getSouth() },
        ne: { lng: b.getEast(), lat: b.getNorth() },
      }
    },
    onMoveEnd(cb) {
      map.on('moveend', cb)
    },
    destroy() {
      clearPlaceMarkers()
      selectedMarker?.remove()
      userMarker.remove()
      map.remove()
    },
  }
}
