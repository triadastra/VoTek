# VoTek — Architecture

VoTek is a mobile **web app** (PWA) that fuses a live map with an AI **vision core**.
Point your phone at what's around you and VoTek acts as a tour guide — it knows where you
are, narrates the history of what you're looking at, and circles the best spots to take photos.

## The four systems

| Layer | Responsibility | Implementation |
|-------|----------------|----------------|
| **Map** | Base map, your live position, POIs, photo-spot circles | MapLibre GL (pluggable provider) |
| **Positioning** | Where you are + which way you face | Geolocation API + Device Orientation |
| **Vision core** | Live camera → AI that sees what you see | Gemini Live (2.x Flash) via broker |
| **Tour brain** | History narration + "best photo here" reasoning | Gemini grounded with location + POIs |

## Why a pluggable map

The map is deliberately behind a small interface (`web/src/map/types.ts`). Today the only
implementation is **MapLibre GL** — free, open-source, no account or key required to start.
Apple **MapKit JS** or **Google Maps** can be added as alternate providers later (both need a
paid/billing account and a token server) without touching the rest of the app. The interesting,
hard parts — vision, narration, photo logic — are all map-agnostic.

## The vision core / WebRTC data flow

```
 ┌─────────────┐   camera + mic + GPS    ┌──────────────┐   media session   ┌────────────┐
 │  Phone (web │ ───────────────────────▶│   Broker     │ ─────────────────▶│  Gemini    │
 │   app, PWA) │◀─────────────────────── │  (Node/ws)   │◀───────────────── │  Live API  │
 └─────────────┘   narration (audio/text)└──────────────┘   audio/text out  └────────────┘
```

- The phone captures camera + mic with `getUserMedia` and streams to the **broker**, which
  relays to the Gemini Live endpoint. The broker also injects live context (GPS, nearby POIs)
  into the model's system prompt so narration is grounded in *where you actually are*.
- **The API key never reaches the phone.** The broker holds `GEMINI_API_KEY` and (in the real
  Live path) mints short-lived ephemeral tokens. The transport is swappable: the scaffold uses a
  WebSocket relay today; a WebRTC transport can drop in behind the same `VisionCore` interface
  for lower-latency media and NAT traversal.
- **Mock mode:** with no `GEMINI_API_KEY` set, the broker returns scripted narration so the whole
  app runs end-to-end for local development and demos.

## "Circle the best photo spots" — two halves

1. **Where to stand (map level):** ranked vantage points rendered as circle overlays. The scaffold
   ships a stubbed dataset (`web/src/data/photoSpots.ts`). Real sources: geotagged-photo density
   (Wikimedia Commons geosearch, Mapillary, Flickr), Google Places popular spots, or — over time —
   VoTek's own users' captures.
2. **How to shoot (frame level):** the vision core inspects the live frame and coaches composition
   ("step left so the arch frames the tower; wait for the light"). This is the layer where the
   vision core earns its keep beyond narration.

## Build order

1. ✅ Map + live location dot (MapLibre + Geolocation)
2. ✅ Custom mobile UI shell (our own design, no default map chrome)
3. ✅ Broker + vision core wiring (WebSocket relay, mock fallback)
4. ✅ Photo-spot circle layer (stubbed dataset)
5. ⬜ Real Gemini Live media streaming + ephemeral tokens
6. ⬜ Frame-level composition coaching
7. ⬜ Real photo-spot dataset ingestion

## Repo layout

```
/web       Vite + React + TypeScript PWA (the app)
/server    Node broker (holds the Gemini key, relays the Live session)
```
