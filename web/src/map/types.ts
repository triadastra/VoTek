// The pluggable map interface. MapLibre is the only implementation today; Apple MapKit JS
// or Google Maps can be added later behind this same surface without touching the app.

export interface LngLat {
  lng: number
  lat: number
}

export interface PhotoSpot {
  id: string
  name: string
  position: LngLat
  /** 0..1 — how good this vantage point is, drives the circle's size/color. */
  score: number
  /** Short reason the spot is good, shown in the UI. */
  blurb: string
}

export interface MapProviderOptions {
  container: HTMLElement
  center: LngLat
  zoom: number
}

/**
 * Everything the app needs from a map. Keep this small — the vision core, narration,
 * and photo logic must never import a concrete map SDK directly.
 */
export interface MapProvider {
  /** Recenter/animate the camera to a position. */
  flyTo(pos: LngLat, zoom?: number): void
  /** Update the user's position dot + heading (degrees) + GPS accuracy radius (meters). */
  setUserLocation(pos: LngLat, headingDeg?: number, accuracyM?: number): void
  /** Render the photo-spot circle overlays. Called whenever the set changes. */
  setPhotoSpots(spots: PhotoSpot[]): void
  /** Fired when the user taps a photo-spot circle. */
  onPhotoSpotTap(cb: (spot: PhotoSpot) => void): void
  /** Clean up map resources. */
  destroy(): void
}

export type MapProviderFactory = (opts: MapProviderOptions) => Promise<MapProvider>
