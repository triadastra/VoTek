import type { MapProviderFactory } from './types'
import { createMapLibreProvider } from './MapLibreProvider'

export type MapBackend = 'maplibre' // | 'mapkit' | 'google' — future providers

// Single place the app chooses a map. Add a case here to introduce Apple MapKit JS
// or Google Maps; nothing else in the app needs to change.
export function getMapProvider(backend: MapBackend = 'maplibre'): MapProviderFactory {
  switch (backend) {
    case 'maplibre':
      return createMapLibreProvider
    default:
      return createMapLibreProvider
  }
}
