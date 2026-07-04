import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { getMapProvider } from './map/createMapProvider'
import type { Basemap, LngLat, MapProvider, Place, PhotoSpot } from './map/types'
import { FALLBACK_CENTER, useGeolocation } from './location/useGeolocation'
import { useTrail } from './location/useTrail'
import { photoSpotsNear } from './data/photoSpots'
import { getHealth, getProviders, getRoute, searchPlaces, type ProviderInfo, type RouteResult } from './data/api'
import type { VisionCore, GuideMessage, LensData, VisionStatus } from './vision/visionCore'
import { warmUpSpeech } from './vision/speech'
import { SearchBar } from './components/SearchBar'
import { MapControls } from './components/MapControls'
import { PlaceSheet, type SheetTarget } from './components/PlaceSheet'
import { InsecureBanner } from './components/InsecureBanner'
import { RouteBanner } from './components/RouteBanner'
import { TrailChip } from './components/TrailChip'
import type { Selection } from './components/SettingsSheet'
import { Icon } from './ui/Icon'

// The camera guide, Lens focus screen, and Settings sheet aren't needed at first paint — they
// load on demand (first time they open), keeping the initial download to the map + shell.
const GuideOverlay = lazy(() => import('./components/GuideOverlay').then((m) => ({ default: m.GuideOverlay })))
const LensView = lazy(() => import('./components/LensView').then((m) => ({ default: m.LensView })))
const SettingsSheet = lazy(() => import('./components/SettingsSheet').then((m) => ({ default: m.SettingsSheet })))

const SEL_KEY = 'votek.selection'
function loadSelection(): Selection | null {
  try {
    const s = localStorage.getItem(SEL_KEY)
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}

function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

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
  const posRef = useRef<LngLat | null>(null)
  posRef.current = geo.position
  const lensAnchorRef = useRef<LngLat | null>(null)
  const [lens, setLens] = useState<LensData | null>(null)
  const [spots, setSpots] = useState<PhotoSpot[]>([])
  const [results, setResults] = useState<Place[]>([])
  const [selected, setSelected] = useState<SheetTarget | null>(null)
  const [basemap, setBasemap] = useState<Basemap>('map')
  const [guideOpen, setGuideOpen] = useState(false)
  const [visionStatus, setVisionStatus] = useState<VisionStatus>('idle')
  const [liveMode, setLiveMode] = useState(false)
  const [messages, setMessages] = useState<GuideMessage[]>([])
  const [mode, setMode] = useState<'live' | 'mock' | null>(null)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [selection, setSelection] = useState<Selection | null>(loadSelection)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showInsecure, setShowInsecure] = useState(!window.isSecureContext)
  const [showSpots, setShowSpots] = useState(false)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [trailActive, setTrailActive] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const trail = useTrail(trailActive, geo.position)

  const center = geo.position ?? FALLBACK_CENTER

  useEffect(() => {
    getHealth().then((h) => setMode(h?.mode ?? null))
    getProviders().then(({ providers: ps }) => {
      setProviders(ps)
      // Default the selection to the first provider's first model if none saved / stale.
      setSelection((cur) => {
        if (cur && ps.some((p) => p.id === cur.provider && p.models.includes(cur.model || ''))) return cur
        const first = ps[0]
        return first ? { provider: first.id, model: first.models[0] } : null
      })
    })
  }, [])

  // Persist the model choice.
  useEffect(() => {
    if (selection) localStorage.setItem(SEL_KEY, JSON.stringify(selection))
  }, [selection])

  // --- Init map once ---
  useEffect(() => {
    let disposed = false
    if (!mapRef.current) return
    getMapProvider('maplibre').then((factory) => {
      if (disposed || !mapRef.current) return
      factory({ container: mapRef.current, center, zoom: 15 }).then((p) => {
        if (disposed) {
          p.destroy()
          return
        }
        providerRef.current = p
        setMapReady(true)
        p.onPhotoSpotTap((s) => setSelected({ kind: 'spot', spot: s }))
        p.onPlaceTap((place) => {
          p.setSelectedPlace(place)
          setSelected({ kind: 'place', place })
        })
        p.onMoveEnd(() => {
          followRef.current = false
        })
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
    visionRef.current?.updateContext({
      location: geo.position,
      accuracy: geo.accuracy,
      heading: geo.heading,
      nearby: nearby.map((s) => s.name),
    })
  }, [geo.position, geo.heading, geo.accuracy])

  // Photo-spot circles are hidden by default (keeps the map clean, Apple-Maps style) and
  // only shown when the user taps the Photo spots chip.
  useEffect(() => {
    providerRef.current?.setPhotoSpots(showSpots ? spots : [])
  }, [showSpots, spots, mapReady])

  // Draw the breadcrumb trail whenever its points change (and once the map is ready, so a
  // trail restored from localStorage shows on load).
  useEffect(() => {
    providerRef.current?.setTrail(trail.points.length ? trail.points : null)
  }, [trail.points, mapReady])

  // Close the Lens once the user walks away from where they opened it.
  useEffect(() => {
    if (!lens || !lensAnchorRef.current || !geo.position) return
    if (haversineM(geo.position, lensAnchorRef.current) > 40) setLens(null)
  }, [geo.position, lens])

  const recenter = () => {
    followRef.current = true
    if (geo.position) providerRef.current?.flyTo(geo.position, 16)
  }

  // --- Search ---
  const runSearch = useCallback(async (q: string, bounded = false) => {
    const p = providerRef.current
    if (!p) return
    if (q === '__photospots__') {
      // "Photo spots" chip: reveal the ranked vantage points and frame them.
      setShowSpots(true)
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
    setShowSpots(false)
    providerRef.current?.setPlaces([])
    providerRef.current?.setSelectedPlace(null)
  }

  // --- Directions: fetch a real route and draw it ---
  const navigateTo = useCallback(
    async (dest: LngLat) => {
      const p = providerRef.current
      setSelected(null)
      if (!p) return
      if (!geo.position) {
        // No fix yet — just center on the destination.
        followRef.current = false
        p.flyTo(dest, 17)
        return
      }
      followRef.current = false
      const r = await getRoute(geo.position, dest, 'foot')
      if (r && r.coords.length > 1) {
        p.setRoute(r.coords)
        setRoute(r)
        p.fitBounds(boundsOf(r.coords), 110)
      } else {
        // Routing service unavailable — draw a straight-line beeline so guidance still shows.
        const coords = [geo.position, dest]
        const distanceM = haversineM(geo.position, dest)
        p.setRoute(coords)
        setRoute({ mode: 'foot', distanceM, durationS: distanceM / 1.4, coords })
        p.fitBounds(boundsOf(coords), 110)
      }
    },
    [geo.position],
  )

  const clearRoute = () => {
    setRoute(null)
    providerRef.current?.setRoute(null)
  }

  // --- Guide session ---
  const startGuide = useCallback(async () => {
    warmUpSpeech() // unlock audio on this user gesture so the guide can speak (iOS)
    const anyDO = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    if (typeof anyDO?.requestPermission === 'function') {
      try {
        await anyDO.requestPermission()
      } catch {
        /* declined compass */
      }
    }
    const { VisionCore } = await import('./vision/visionCore')
    const core = new VisionCore({
      onStatus: setVisionStatus,
      onLive: setLiveMode,
      onLens: (l) => {
        lensAnchorRef.current = posRef.current // remember where we were, for walk-away close
        setLens(l)
      },
      onMessage: (msg) =>
        setMessages((prev) =>
          prev.length && prev[prev.length - 1].partial ? [...prev.slice(0, -1), msg] : [...prev, msg],
        ),
      onError: (e) => setMessages((prev) => [...prev, { role: 'guide', text: `⚠︎ ${e}` }]),
    })
    core.setSelection(selection)
    visionRef.current = core
    setMessages([])
    setGuideOpen(true)
    core.connect({
      location: geo.position,
      accuracy: geo.accuracy,
      heading: geo.heading,
      nearby: spots.map((s) => s.name),
    })
  }, [geo.position, geo.heading, geo.accuracy, spots, selection])

  const stopGuide = () => {
    visionRef.current?.disconnect()
    visionRef.current = null
    setGuideOpen(false)
    setVisionStatus('idle')
    setLiveMode(false)
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

      {route && !showInsecure && <RouteBanner route={route} onClear={clearRoute} />}

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
        trailActive={trailActive}
        onTrail={() => setTrailActive((v) => !v)}
      />

      <div className="dock">
        {(trailActive || trail.points.length > 0) && (
          <TrailChip
            active={trailActive}
            points={trail.points.length}
            distanceM={trail.distanceM}
            onToggle={() => setTrailActive((v) => !v)}
            onClear={() => {
              trail.clear()
              setTrailActive(false)
            }}
          />
        )}
        <button className="guide-btn" onClick={startGuide}>
          <span className="guide-btn__ic">
            <Icon name="navigation" size={19} />
          </span>
          <span className="guide-btn__label">Start guide</span>
          {mode && (
            <span className={`guide-btn__badge ${mode}`}>{mode === 'live' ? 'AI live' : 'Demo'}</span>
          )}
        </button>
        <div className="dock__row2">
          <span className="dock__hint">
            {geo.error ? geo.error : geo.position ? `GPS · ±${Math.round(geo.accuracy ?? 0)}m` : 'Locating…'}
            {' · '}
            {spots.length} spots
          </span>
          <button className="model-pill" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <Icon name="settings" size={13} />
            {selection ? selection.model : mode === 'mock' ? 'demo' : 'AI model'}
          </button>
        </div>
      </div>

      <Suspense fallback={null}>
        {guideOpen && (
          <GuideOverlay
            status={visionStatus}
            messages={messages}
            onClose={stopGuide}
            attachVideo={attachVideo}
            onAsk={(q) => visionRef.current?.ask(q)}
            liveMode={liveMode}
            onMicMute={(m) => visionRef.current?.setMicMuted(m)}
            onSettings={() => setSettingsOpen(true)}
          />
        )}

        {lens && <LensView lens={lens} onClose={() => setLens(null)} />}

        {settingsOpen && (
          <SettingsSheet
            providers={providers}
            selection={selection}
            onSelect={(s) => {
              setSelection(s)
              visionRef.current?.setSelection(s)
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </Suspense>

      {selected && (
        <PlaceSheet
          target={selected}
          userPos={geo.position}
          onClose={() => {
            setSelected(null)
            providerRef.current?.setSelectedPlace(null)
          }}
          onNavigate={navigateTo}
          onGuide={() => {
            setSelected(null)
            startGuide()
          }}
        />
      )}
    </div>
  )
}
