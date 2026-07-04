import type { MapProviderFactory } from './types'

export type MapBackend = 'maplibre' // | 'mapkit' | 'google' — future providers

// Single place the app chooses a map. The provider (and the ~800KB MapLibre engine it pulls
// in) is dynamically imported, so it loads as a separate chunk AFTER the app shell paints —
// the search bar and dock appear immediately instead of blocking on the map engine to parse.
export async function getMapProvider(backend: MapBackend = 'maplibre'): Promise<MapProviderFactory> {
  switch (backend) {
    case 'maplibre':
    default: {
      const { createMapLibreProvider } = await import('./MapLibreProvider')
      return createMapLibreProvider
    }
  }
}
