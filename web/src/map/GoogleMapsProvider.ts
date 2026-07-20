/// <reference types="google.maps" />
// Google Maps JS implementation of the MapProvider interface. Requires a browser key in
// VITE_GOOGLE_MAPS_KEY (put it in web/.env.local — never commit it) with billing enabled
// and the Maps JavaScript API turned on. The key ships in the client bundle by design,
// so it MUST be restricted to your domain (HTTP referrers) in the Google Cloud console.
import type { Basemap, Bounds, MapProvider, MapProviderOptions, Place, PhotoSpot } from './types'
import { iconFor, smooth } from './shared'
import { iconSvg } from '../ui/icons'

declare global {
  interface Window {
    __votekGmapsReady?: () => void
  }
}

let loader: Promise<void> | null = null
function loadGoogleMaps(key: string): Promise<void> {
  if (window.google?.maps?.Map) return Promise.resolve()
  if (!loader) {
    loader = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Google Maps script timed out')), 15000)
      window.__votekGmapsReady = () => {
        clearTimeout(timeout)
        resolve()
      }
      const s = document.createElement('script')
      const params = new URLSearchParams({
        key,
        v: 'weekly',
        libraries: 'marker',
        loading: 'async',
        callback: '__votekGmapsReady',
      })
      s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
      s.async = true
      s.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Google Maps script failed to load'))
      }
      document.head.appendChild(s)
    })
    // Allow a retry (e.g. after a transient network failure) instead of caching the rejection.
    loader.catch(() => {
      loader = null
    })
  }
  return loader
}

// AdvancedMarkerElement anchors its content at bottom-center (pin-style). For symbols that
// must sit centered ON the coordinate (user dot, spot circles) we wrap them in a shifter.
function centered(el: HTMLElement): HTMLElement {
  const wrap = document.createElement('div')
  wrap.style.transform = 'translateY(50%)'
  wrap.appendChild(el)
  return wrap
}

export async function createGoogleMapsProvider(opts: MapProviderOptions): Promise<MapProvider> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_KEY
  if (!key) throw new Error('VITE_GOOGLE_MAPS_KEY is not set')
  await loadGoogleMaps(key)
  const { AdvancedMarkerElement } = (await google.maps.importLibrary('marker')) as google.maps.MarkerLibrary

  const map = new google.maps.Map(opts.container, {
    center: { lat: opts.center.lat, lng: opts.center.lng },
    zoom: opts.zoom,
    // Advanced markers need a map id; the default styling one works without console setup.
    mapId: import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID',
    disableDefaultUI: true, // our own UI supplies all controls — no default map chrome
    clickableIcons: false,
    gestureHandling: 'greedy',
  })

  // --- User dot + heading beam (same DOM/CSS as the MapLibre provider) ---
  const dotEl = document.createElement('div')
  dotEl.className = 'user-dot'
  dotEl.innerHTML =
    '<span class="user-dot__beam"></span>' +
    '<span class="user-dot__pulse"></span>' +
    '<span class="user-dot__core"></span>'
  const userMarker = new AdvancedMarkerElement({ content: centered(dotEl), zIndex: 30 })

  const accuracyCircle = new google.maps.Circle({
    strokeColor: '#4285f4',
    strokeOpacity: 0.4,
    strokeWeight: 1,
    fillColor: '#4285f4',
    fillOpacity: 0.12,
    clickable: false,
  })

  // --- Route (casing + colored line) ---
  const routeCasing = new google.maps.Polyline({
    strokeColor: '#1b57c4',
    strokeWeight: 10,
    clickable: false,
  })
  const routeLine = new google.maps.Polyline({
    strokeColor: '#4285f4',
    strokeWeight: 6,
    clickable: false,
  })

  // --- Breadcrumb trail (glow + curved line with sample-point dots along it) ---
  const trailGlow = new google.maps.Polyline({
    strokeColor: '#8b5bff',
    strokeOpacity: 0.25,
    strokeWeight: 13,
    clickable: false,
  })
  const trailLine = new google.maps.Polyline({
    strokeColor: '#8b5bff',
    strokeWeight: 5,
    clickable: false,
    icons: [
      {
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 3,
          fillColor: '#ffffff',
          fillOpacity: 1,
          strokeColor: '#8b5bff',
          strokeWeight: 2,
        },
        offset: '0',
        repeat: '26px',
      },
    ],
  })

  let spotMarkers: google.maps.marker.AdvancedMarkerElement[] = []
  let placeMarkers: google.maps.marker.AdvancedMarkerElement[] = []
  let selectedMarker: google.maps.marker.AdvancedMarkerElement | null = null
  let spotTapCb: ((s: PhotoSpot) => void) | null = null
  let placeTapCb: ((p: Place) => void) | null = null
  let moveEndCb: (() => void) | null = null

  map.addListener('dragend', () => moveEndCb?.())

  function clearMarkers(list: google.maps.marker.AdvancedMarkerElement[]) {
    list.forEach((m) => (m.map = null))
    list.length = 0
  }

  return {
    flyTo(pos, zoom) {
      map.panTo({ lat: pos.lat, lng: pos.lng })
      if (zoom != null) map.setZoom(zoom)
    },
    fitBounds(b: Bounds, padding = 80) {
      map.fitBounds(
        new google.maps.LatLngBounds({ lat: b.sw.lat, lng: b.sw.lng }, { lat: b.ne.lat, lng: b.ne.lng }),
        padding,
      )
    },
    setUserLocation(pos, headingDeg, accuracyM) {
      userMarker.position = { lat: pos.lat, lng: pos.lng }
      userMarker.map = map
      if (headingDeg != null && !Number.isNaN(headingDeg)) {
        dotEl.classList.add('user-dot--heading')
        dotEl.style.transform = `rotate(${headingDeg}deg)` // Google maps stay north-up
      } else {
        dotEl.classList.remove('user-dot--heading')
      }
      if (accuracyM && accuracyM > 0) {
        accuracyCircle.setCenter({ lat: pos.lat, lng: pos.lng })
        accuracyCircle.setRadius(accuracyM)
        accuracyCircle.setMap(map)
      } else {
        accuracyCircle.setMap(null)
      }
    },
    setPhotoSpots(spots) {
      clearMarkers(spotMarkers)
      spotMarkers = spots.map((s) => {
        const el = document.createElement('button')
        el.className = 'spot-circle'
        const size = Math.round(28 + s.score * 32)
        el.style.width = el.style.height = `${size}px`
        el.onclick = (ev) => {
          ev.stopPropagation()
          spotTapCb?.(s)
        }
        return new AdvancedMarkerElement({
          map,
          position: { lat: s.position.lat, lng: s.position.lng },
          content: centered(el),
          zIndex: 10,
        })
      })
    },
    onPhotoSpotTap(cb) {
      spotTapCb = cb
    },
    setPlaces(places) {
      clearMarkers(placeMarkers)
      placeMarkers = places.map((p) => {
        const el = document.createElement('button')
        el.className = 'poi-pin'
        el.innerHTML = `<span class="poi-pin__icon">${iconSvg(iconFor(p.category), { size: 15, stroke: 2.2 })}</span>`
        el.onclick = (ev) => {
          ev.stopPropagation()
          placeTapCb?.(p)
        }
        return new AdvancedMarkerElement({
          map,
          position: { lat: p.position.lat, lng: p.position.lng },
          content: el,
          zIndex: 20,
        })
      })
    },
    onPlaceTap(cb) {
      placeTapCb = cb
    },
    setSelectedPlace(place) {
      if (selectedMarker) selectedMarker.map = null
      selectedMarker = null
      if (!place) return
      const el = document.createElement('div')
      el.className = 'sel-pin'
      el.innerHTML =
        `<span class="sel-pin__head">${iconSvg(iconFor(place.category), { size: 20, stroke: 2.2 })}</span>` +
        `<span class="sel-pin__stem"></span>`
      selectedMarker = new AdvancedMarkerElement({
        map,
        position: { lat: place.position.lat, lng: place.position.lng },
        content: el,
        zIndex: 25,
      })
    },
    setRoute(coords) {
      if (!coords || coords.length < 2) {
        routeCasing.setMap(null)
        routeLine.setMap(null)
        return
      }
      const path = coords.map((c) => ({ lat: c.lat, lng: c.lng }))
      routeCasing.setPath(path)
      routeLine.setPath(path)
      routeCasing.setMap(map)
      routeLine.setMap(map)
    },
    setTrail(coords) {
      if (!coords || coords.length === 0) {
        trailGlow.setMap(null)
        trailLine.setMap(null)
        return
      }
      const path = smooth(coords).map(([lng, lat]) => ({ lat, lng }))
      trailGlow.setPath(path)
      trailLine.setPath(path)
      trailGlow.setMap(map)
      trailLine.setMap(map)
    },
    setBasemap(kind: Basemap) {
      map.setMapTypeId(kind === 'satellite' ? 'hybrid' : 'roadmap')
    },
    zoomIn() {
      map.setZoom((map.getZoom() ?? 15) + 1)
    },
    zoomOut() {
      map.setZoom((map.getZoom() ?? 15) - 1)
    },
    getCenter() {
      const c = map.getCenter()
      return c ? { lng: c.lng(), lat: c.lat() } : { lng: opts.center.lng, lat: opts.center.lat }
    },
    getBounds() {
      const b = map.getBounds()
      if (!b) {
        const c = map.getCenter()
        const p = c ? { lng: c.lng(), lat: c.lat() } : { lng: opts.center.lng, lat: opts.center.lat }
        return { sw: p, ne: p }
      }
      const j = b.toJSON()
      return { sw: { lng: j.west, lat: j.south }, ne: { lng: j.east, lat: j.north } }
    },
    onMoveEnd(cb) {
      moveEndCb = cb
    },
    destroy() {
      clearMarkers(spotMarkers)
      clearMarkers(placeMarkers)
      if (selectedMarker) selectedMarker.map = null
      userMarker.map = null
      accuracyCircle.setMap(null)
      routeCasing.setMap(null)
      routeLine.setMap(null)
      trailGlow.setMap(null)
      trailLine.setMap(null)
      google.maps.event.clearInstanceListeners(map)
      opts.container.innerHTML = ''
    },
  }
}
