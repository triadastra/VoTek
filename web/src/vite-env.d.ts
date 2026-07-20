/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'maplibre' (default, free, key-less) or 'google'. */
  readonly VITE_MAP_BACKEND?: string
  /** Google Maps browser key — set in web/.env.local, never committed. */
  readonly VITE_GOOGLE_MAPS_KEY?: string
  /** Optional Google Map ID for cloud-based styling; a sensible default is used if unset. */
  readonly VITE_GOOGLE_MAP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
