import { useCallback, useEffect, useRef, useState } from 'react'
import { getMapProvider } from './map/createMapProvider'
import type { Basemap, LngLat, MapProvider, Place, PhotoSpot } from './map/types'
import { FALLBACK_CENTER, useGeolocation } from './location/useGeolocation'
import { photoSpotsNear } from './data/photoSpots'
import { getHealth, searchPlaces } from './data/api'
import { VisionCore, type GuideMessage, type VisionStatus } from './vision/visionCore'
import { SearchBar } from './components/SearchBar'
import { MapControls } from './components/MapControls'
import { PlaceSheet, type SheetTarget } from './components/PlaceSheet'
import { GuideOverlay } from './components/GuideOverlay'
import { InsecureBanner } from './components/InsecureBanner'

function boundsOf(points: LngLat[]) {
  const lngs = points.map((p) => p.lng)
  const lats = points.map((p) => p.lat)
  return {
    sw: { lng: Math.min(...lngs), lat: Math.min(...lats) },
    ne: { lng: Math.max(...lngs), lat: Math.max(...lats) },
  }
}

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null)
  const providerRef = useRef<MapProvider | null>(null)
  const visionRef = useRef<VisionCore | null>(null)
  const followRef = useRef(true)

  const geo = useGeolocation()
  const [spots, setSpots] = useState<PhotoSpot[]>([])
  const [results, setResults] = useState<Place[]>([])
  const [selected, setSelected] = useState<SheetTarget | null>(null)
  const [basemap, setBasemap] = useState<Basemap>('map')
  const [guideOpen, setGuideOpen] = useState(false)
  const [visionStatus, setVisionStatus] = useState<VisionStatus>('idle')
  const [messages, setMessages] = useState<GuideMessage[]>([])
  const [mode, setMode] = useState<'live' | 'mock' | null>(null)
  const [showInsecure, setShowInsecure] = useState(!window.isSecureContext)

  const center = geo.position ?? FALLBACK_CENTER

  useEffect(() => {
    getHealth().then((h) => setMode(h?.mode ?? null))
  }, [])

  // --- Init map once ---
  useEffect(() => {
    let disposed = false
    if (!mapRef.current) return
    getMapProvider('maplibre')({ container: mapRef.current, center, zoom: 15 }).then((p) => {
      if (disposed) {
        p.destroy()
        return
      }
      providerRef.current = p
      p.onPhotoSpotTap((s) => setSelected({ kind: 'spot', spot: s }))
      p.onPlaceTap((place) => {
        p.setSelectedPlace(place)
        setSelected({ kind: 'place', place })
      })
      p.onMoveEnd(() => {
        followRef.current = false
      })
    })
    return () => {
      disposed = true
      providerRef.current?.destroy()
      providerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Live location + nearby photo spots ---
  useEffect(() => {
    const p = providerRef.current
    if (!p || !geo.position) return
    p.setUserLocation(geo.position, geo.heading ?? undefined, geo.accuracy ?? undefined)
    if (followRef.current) p.flyTo(geo.position)
    const nearby = photoSpotsNear(geo.position)
    setSpots(nearby)
    p.setPhotoSpots(nearby)
    visionRef.current?.updateContext({
      location: geo.position,
      accuracy: geo.accuracy,
      heading: geo.heading,
      nearby: nearby.map((s) => s.name),
    })
  }, [geo.position, geo.heading, geo.accuracy])

  const recenter = () => {
    followRef.current = true
    if (geo.position) providerRef.current?.flyTo(geo.position, 16)
  }

  // --- Search ---
  const runSearch = useCallback(async (q: string, bounded = false) => {
    const p = providerRef.current
    if (!p) return
    if (q === '__photospots__') {
      // "Photo spots" chip: frame the ranked vantage points already on the map.
      if (spots.length) p.fitBounds(boundsOf(spots.map((s) => s.position)))
      return
    }
    const found = await searchPlaces(q, p.getBounds(), bounded)
    setResults(found)
    p.setPlaces(found)
    p.setSelectedPlace(null)
    if (found.length) p.fitBounds(boundsOf(found.map((r) => r.position)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots])

  const pickResult = (place: Place) => {
    const p = providerRef.current
    if (!p) return
    p.setSelectedPlace(place)
    p.flyTo(place.position, 16)
    setSelected({ kind: 'place', place })
  }

  const clearSearch = () => {
    setResults([])
    providerRef.current?.setPlaces([])
    providerRef.current?.setSelectedPlace(null)
  }

  // --- Guide session ---
  const startGuide = useCallback(async () => {
    const anyDO = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    if (typeof anyDO?.requestPermission === 'function') {
      try {
        await anyDO.requestPermission()
      } catch {
        /* declined compass */
      }
    }
    const core = new VisionCore({
      onStatus: setVisionStatus,
      onMessage: (msg) =>
        setMessages((prev) =>
          prev.length && prev[prev.length - 1].partial ? [...prev.slice(0, -1), msg] : [...prev, msg],
        ),
      onError: (e) => setMessages((prev) => [...prev, { role: 'guide', text: `⚠︎ ${e}` }]),
    })
    visionRef.current = core
    setMessages([])
    setGuideOpen(true)
    core.connect({
      location: geo.position,
      accuracy: geo.accuracy,
      heading: geo.heading,
      nearby: spots.map((s) => s.name),
    })
  }, [geo.position, geo.heading, geo.accuracy, spots])

  const stopGuide = () => {
    visionRef.current?.disconnect()
    visionRef.current = null
    setGuideOpen(false)
    setVisionStatus('idle')
  }

  const attachVideo = useCallback((el: HTMLVideoElement) => {
    visionRef.current?.startCamera(el).catch((err) => {
      setMessages((prev) => [...prev, { role: 'guide', text: `⚠︎ ${err.message}` }])
    })
  }, [])

  return (
    <div className="app">
      <div className="map" ref={mapRef} />

      {showInsecure && <InsecureBanner onDismiss={() => setShowInsecure(false)} />}

      <SearchBar
        results={results}
        onSearch={runSearch}
        onCategory={(q) => runSearch(q, true)}
        onPick={pickResult}
        onClear={clearSearch}
      />

      <MapControls
        basemap={basemap}
        onBasemap={(b) => {
          setBasemap(b)
          providerRef.current?.setBasemap(b)
        }}
        onZoomIn={() => providerRef.current?.zoomIn()}
        onZoomOut={() => providerRef.current?.zoomOut()}
        onRecenter={recenter}
      />

      <div className="dock">
        <button className="guide-btn" onClick={startGuide}>
          ◐ Start guide
          {mode && (
            <span className={`guide-btn__badge ${mode}`}>{mode === 'live' ? 'AI live' : 'demo'}</span>
          )}
        </button>
        <div className="dock__hint">
          {geo.error
            ? geo.error
            : geo.position
              ? `GPS · ±${Math.round(geo.accuracy ?? 0)}m`
              : 'Locating…'}
          {' · '}
          {spots.length} photo spots nearby
        </div>
      </div>

      {guideOpen && (
        <GuideOverlay status={visionStatus} messages={messages} onClose={stopGuide} attachVideo={attachVideo} />
      )}

      {selected && (
        <PlaceSheet
          target={selected}
          userPos={geo.position}
          onClose={() => {
            setSelected(null)
            providerRef.current?.setSelectedPlace(null)
          }}
          onNavigate={(pos) => {
            followRef.current = false
            providerRef.current?.flyTo(pos, 17)
            setSelected(null)
          }}
          onGuide={() => {
            setSelected(null)
            startGuide()
          }}
        />
      )}
    </div>
  )
}
