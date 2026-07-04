// The pluggable map interface. MapLibre is the only implementation today; Apple MapKit JS
// or Google Maps can be added later behind this same surface without touching the app.

export interface LngLat {
  lng: number
  lat: number
}

export interface Bounds {
  sw: LngLat
  ne: LngLat
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

/** A searchable place / point of interest. */
export interface Place {
  id: string
  name: string
  position: LngLat
  category?: string
  address?: string
}

export type Basemap = 'map' | 'satellite'

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
  /** Fit the camera to a bounding box. */
  fitBounds(b: Bounds, padding?: number): void
  /** Update the user's position dot + heading (degrees) + GPS accuracy radius (meters). */
  setUserLocation(pos: LngLat, headingDeg?: number, accuracyM?: number): void

  /** Render the photo-spot circle overlays. */
  setPhotoSpots(spots: PhotoSpot[]): void
  onPhotoSpotTap(cb: (spot: PhotoSpot) => void): void

  /** Render search-result / POI pins. */
  setPlaces(places: Place[]): void
  onPlaceTap(cb: (place: Place) => void): void
  /** Highlight one place (drops a big pin, e.g. the selected search result). */
  setSelectedPlace(place: Place | null): void

  /** Draw a routed path (list of points) for guidance, or clear it with null. */
  setRoute(coords: LngLat[] | null): void

  /** Switch between the map and satellite basemaps. */
  setBasemap(kind: Basemap): void
  zoomIn(): void
  zoomOut(): void

  getCenter(): LngLat
  getBounds(): Bounds
  /** Fired after the user pans/zooms (debounced by the map). */
  onMoveEnd(cb: () => void): void

  /** Clean up map resources. */
  destroy(): void
}

export type MapProviderFactory = (opts: MapProviderOptions) => Promise<MapProvider>
