import { useEffect, useRef, useState } from 'react'
import type { LngLat } from '../map/types'

export interface GeoState {
  position: LngLat | null
  heading: number | null
  accuracy: number | null
  error: string | null
}

// Default center used until the first real fix (San Francisco — Ferry Building area).
export const FALLBACK_CENTER: LngLat = { lng: -122.3937, lat: 37.7955 }

// Maximum precision a web app is allowed: enableHighAccuracy asks iOS/Android to use the
// actual GPS chip (+ Wi-Fi/cell), maximumAge:0 forbids cached fixes. A website cannot access
// raw GNSS hardware beyond this — that's a native-app capability.
const GEO_OPTS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }

function describeError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location blocked — allow it in Settings'
    case err.POSITION_UNAVAILABLE:
      return 'GPS signal unavailable'
    case err.TIMEOUT:
      return 'GPS timed out — retrying'
    default:
      return err.message || 'GPS error'
  }
}

/**
 * Live high-accuracy GPS + compass heading. Falls back gracefully: if geolocation is denied
 * or unavailable the app still runs centered on FALLBACK_CENTER.
 */
export function useGeolocation(): GeoState {
  const [state, setState] = useState<GeoState>({
    position: null,
    heading: null,
    accuracy: null,
    error: null,
  })
  const headingRef = useRef<number | null>(null)

  useEffect(() => {
    // The browser blocks geolocation entirely on non-secure origins (plain http://).
    if (!window.isSecureContext) {
      setState((s) => ({ ...s, error: 'GPS needs HTTPS' }))
      return
    }
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, error: 'Geolocation not supported' }))
      return
    }

    const onFix = (pos: GeolocationPosition) => {
      setState({
        position: { lng: pos.coords.longitude, lat: pos.coords.latitude },
        heading: (pos.coords.heading != null && !Number.isNaN(pos.coords.heading)
          ? pos.coords.heading
          : headingRef.current),
        accuracy: pos.coords.accuracy,
        error: null,
      })
    }
    const onErr = (err: GeolocationPositionError) =>
      setState((s) => ({ ...s, error: describeError(err) }))

    // Kick a fast one-shot fix, then keep a high-accuracy watch running.
    navigator.geolocation.getCurrentPosition(onFix, onErr, GEO_OPTS)
    const watchId = navigator.geolocation.watchPosition(onFix, onErr, GEO_OPTS)

    // Compass heading (iOS exposes webkitCompassHeading; needs a gesture-granted permission).
    const onOrientation = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const h = e.webkitCompassHeading ?? (e.alpha != null ? 360 - e.alpha : null)
      if (h != null && !Number.isNaN(h)) {
        headingRef.current = h
        setState((s) => ({ ...s, heading: h }))
      }
    }
    window.addEventListener('deviceorientation', onOrientation)

    return () => {
      navigator.geolocation.clearWatch(watchId)
      window.removeEventListener('deviceorientation', onOrientation)
    }
  }, [])

  return state
}
