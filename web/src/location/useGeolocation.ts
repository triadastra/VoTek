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

/**
 * Live GPS + compass heading. Falls back gracefully: if geolocation is denied or
 * unavailable the app still runs centered on FALLBACK_CENTER.
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
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, error: 'Geolocation not supported' }))
      return
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: { lng: pos.coords.longitude, lat: pos.coords.latitude },
          heading: pos.coords.heading ?? headingRef.current,
          accuracy: pos.coords.accuracy,
          error: null,
        })
      },
      (err) => setState((s) => ({ ...s, error: err.message })),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    )

    // Compass heading (needs a user gesture to request permission on iOS — handled in UI).
    const onOrientation = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const h = e.webkitCompassHeading ?? (e.alpha != null ? 360 - e.alpha : null)
      if (h != null) {
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
