import type { MapProviderFactory } from './types'

export type MapBackend = 'maplibre' | 'google' // | 'mapkit' — future providers

interface MapConfig {
  backend: MapBackend
  googleMapsKey?: string
  googleMapId?: string
}

// The basemap is configured in ONE place: server/.env. Set GOOGLE_MAPS_KEY there and the
// broker's /api/mapconfig switches the app to Google Maps — no rebuild needed. The VITE_*
// build-time vars remain as a fallback for running the web app without the broker.
async function resolveMapConfig(): Promise<MapConfig> {
  try {
    const res = await fetch('/api/mapconfig')
    if (res.ok) {
      const cfg = (await res.json()) as MapConfig
      if (cfg.backend === 'google' && cfg.googleMapsKey) return cfg
      if (cfg.backend === 'maplibre') return cfg
    }
  } catch {
    /* broker not running — fall through to build-time config */
  }
  if (import.meta.env.VITE_MAP_BACKEND === 'google' && import.meta.env.VITE_GOOGLE_MAPS_KEY) {
    return {
      backend: 'google',
      googleMapsKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
      googleMapId: import.meta.env.VITE_GOOGLE_MAP_ID,
    }
  }
  return { backend: 'maplibre' }
}

// Single place the app chooses a map. The provider (and the map engine it pulls in) is
// dynamically imported, so it loads as a separate chunk AFTER the app shell paints —
// the search bar and dock appear immediately instead of blocking on the map engine to parse.
export async function getMapProvider(backend?: MapBackend): Promise<MapProviderFactory> {
  const cfg = backend ? { backend } : await resolveMapConfig()
  switch (cfg.backend) {
    case 'google': {
      const { createGoogleMapsProvider } = await import('./GoogleMapsProvider')
      // If Google fails (bad key, no billing, offline) the app still gets a map.
      return async (opts) => {
        try {
          return await createGoogleMapsProvider(opts, { key: cfg.googleMapsKey ?? '', mapId: cfg.googleMapId })
        } catch (err) {
          console.warn('Google Maps unavailable, falling back to MapLibre:', err)
          const { createMapLibreProvider } = await import('./MapLibreProvider')
          return createMapLibreProvider(opts)
        }
      }
    }
    case 'maplibre':
    default: {
      const { createMapLibreProvider } = await import('./MapLibreProvider')
      return createMapLibreProvider
    }
  }
}
