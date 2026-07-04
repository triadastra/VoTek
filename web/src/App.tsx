import { useCallback, useEffect, useRef, useState } from 'react'
import { getMapProvider } from './map/createMapProvider'
import type { MapProvider, PhotoSpot } from './map/types'
import { FALLBACK_CENTER, useGeolocation } from './location/useGeolocation'
import { photoSpotsNear } from './data/photoSpots'
import { VisionCore, type GuideMessage, type VisionStatus } from './vision/visionCore'
import { GuideOverlay } from './components/GuideOverlay'
import { PhotoSpotSheet } from './components/PhotoSpotSheet'

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null)
  const providerRef = useRef<MapProvider | null>(null)
  const visionRef = useRef<VisionCore | null>(null)
  const followRef = useRef(true)

  const geo = useGeolocation()
  const [spots, setSpots] = useState<PhotoSpot[]>([])
  const [selected, setSelected] = useState<PhotoSpot | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [visionStatus, setVisionStatus] = useState<VisionStatus>('idle')
  const [messages, setMessages] = useState<GuideMessage[]>([])

  const center = geo.position ?? FALLBACK_CENTER

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
      p.onPhotoSpotTap((s) => setSelected(s))
    })
    return () => {
      disposed = true
      providerRef.current?.destroy()
      providerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Push live location + refresh spots ---
  useEffect(() => {
    const p = providerRef.current
    if (!p || !geo.position) return
    p.setUserLocation(geo.position, geo.heading ?? undefined)
    if (followRef.current) p.flyTo(geo.position)
    const nearby = photoSpotsNear(geo.position)
    setSpots(nearby)
    p.setPhotoSpots(nearby)
    // Keep the guide's grounding context fresh while it's live.
    visionRef.current?.updateContext({
      location: geo.position,
      heading: geo.heading,
      nearby: nearby.map((s) => s.name),
    })
  }, [geo.position, geo.heading])

  const recenter = () => {
    followRef.current = true
    if (geo.position) providerRef.current?.flyTo(geo.position, 16)
  }

  // --- Guide session ---
  const startGuide = useCallback(async () => {
    // iOS needs a user gesture to request the motion/orientation permission.
    const anyDO = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    if (typeof anyDO?.requestPermission === 'function') {
      try {
        await anyDO.requestPermission()
      } catch {
        /* user declined compass — narration still works */
      }
    }

    const core = new VisionCore({
      onStatus: setVisionStatus,
      onMessage: (msg) =>
        setMessages((prev) => {
          // Replace the trailing partial with the newest chunk, else append.
          if (prev.length && prev[prev.length - 1].partial) {
            return [...prev.slice(0, -1), msg]
          }
          return [...prev, msg]
        }),
      onError: (e) => setMessages((prev) => [...prev, { role: 'guide', text: `⚠︎ ${e}` }]),
    })
    visionRef.current = core
    setMessages([])
    setGuideOpen(true)
    core.connect({
      location: geo.position,
      heading: geo.heading,
      nearby: spots.map((s) => s.name),
    })
  }, [geo.position, geo.heading, spots])

  const stopGuide = () => {
    visionRef.current?.disconnect()
    visionRef.current = null
    setGuideOpen(false)
    setVisionStatus('idle')
  }

  const attachVideo = useCallback((el: HTMLVideoElement) => {
    visionRef.current?.startCamera(el).catch((err) => {
      setMessages((prev) => [...prev, { role: 'guide', text: `⚠︎ Camera unavailable: ${err.message}` }])
    })
  }, [])

  return (
    <div className="app">
      <div className="map" ref={mapRef} />

      <div className="topbar">
        <div className="brand">
          <span className="brand__dot" />
          VoTek
        </div>
        <div className={`pill ${geo.error ? 'error' : geo.position ? 'live' : ''}`}>
          <span className="dot" />
          {geo.error ? 'No location' : geo.position ? 'Located' : 'Locating…'}
        </div>
      </div>

      <button className="fab" onClick={recenter} aria-label="Recenter">
        ◎
      </button>

      <div className="dock">
        <div className="dock__row">
          <button className="guide-btn" onClick={startGuide}>
            ◐ Start guide
          </button>
        </div>
        <div className="dock__hint">
          {spots.length} photo spots nearby · point your camera to hear the story
        </div>
      </div>

      {guideOpen && (
        <GuideOverlay
          status={visionStatus}
          messages={messages}
          onClose={stopGuide}
          attachVideo={attachVideo}
        />
      )}

      {selected && (
        <PhotoSpotSheet
          spot={selected}
          onClose={() => setSelected(null)}
          onNavigate={(s) => {
            followRef.current = false
            providerRef.current?.flyTo(s.position, 17)
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}
