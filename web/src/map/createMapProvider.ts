import type { MapProviderFactory } from './types'

export type MapBackend = 'maplibre' | 'google' // | 'mapkit' — future providers

// The backend is chosen by env config: set VITE_MAP_BACKEND=google plus VITE_GOOGLE_MAPS_KEY
// in web/.env.local to use Google Maps; anything else gets the free key-less MapLibre stack.
export function defaultMapBackend(): MapBackend {
  return import.meta.env.VITE_MAP_BACKEND === 'google' && import.meta.env.VITE_GOOGLE_MAPS_KEY
    ? 'google'
    : 'maplibre'
}

// Single place the app chooses a map. The provider (and the map engine it pulls in) is
// dynamically imported, so it loads as a separate chunk AFTER the app shell paints —
// the search bar and dock appear immediately instead of blocking on the map engine to parse.
export async function getMapProvider(backend: MapBackend = defaultMapBackend()): Promise<MapProviderFactory> {
  switch (backend) {
    case 'google': {
      const { createGoogleMapsProvider } = await import('./GoogleMapsProvider')
      // If Google fails (bad key, no billing, offline) the app still gets a map.
      return async (opts) => {
        try {
          return await createGoogleMapsProvider(opts)
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
