# VoTek

A mobile **web app** that fuses a live map with an AI **vision core**. Point your phone at
what's around you and VoTek acts as a tour guide — it knows where you are, narrates the history
of what you're looking at, and circles the best spots to take photos.

> Built map-first on **MapLibre** (free, no key) behind a **pluggable map interface**, so Apple
> MapKit JS or Google Maps can drop in later. The vision core streams your camera to **Gemini
> Live (Flash)** through a **broker** that keeps the API key server-side. See
> [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Run it with Docker (single hosted container)

One container builds the web app and serves it from the broker, so the UI, the `/api`
endpoints, and the `/vision` websocket all share one origin.

```bash
# Build + run (mock guide, no key needed)
docker compose up --build            # → http://localhost:8787

# Or with the real Gemini guide:
GEMINI_API_KEY=your_key docker compose up --build
```

Or with plain Docker:

```bash
docker build -t votek .
docker run -p 8787:8787 -e GEMINI_API_KEY=your_key votek   # omit -e for mock mode
```

Then open **http://localhost:8787**. Camera + GPS need HTTPS in production — put the container
behind a TLS-terminating reverse proxy (or a tunnel like `ngrok http 8787`) so the browser
grants camera/location.

> **Behind a TLS-inspecting proxy** (corporate network / some CI)? Pass your CA at build time so
> `npm` trusts the registry — nothing is baked into the image:
> `docker build --secret id=ca,src=/path/to/ca-bundle.crt -t votek .`

## Run it locally (dev, two processes)

Two processes: the **broker** (`/server`) and the **web app** (`/web`).

```bash
# 1. Broker (holds the Gemini key; runs in MOCK mode with no key)
cd server
npm install
cp .env.example .env      # optional: add GEMINI_API_KEY for the real guide
npm run dev               # → http://localhost:8787

# 2. Web app (in a second terminal)
cd web
npm install
npm run dev               # → http://localhost:5173
```

Open **http://localhost:5173** on your phone (same network) or desktop. Camera + geolocation
need **HTTPS or localhost** — on a phone, use a tunnel (e.g. `ngrok http 5173`) so the browser
grants camera/GPS.

- **No API key?** The guide runs in **mock mode** with scripted, location-aware narration — the
  full app (map, location dot, photo-spot circles, camera overlay) still works end-to-end.
- **With a key?** Set `GEMINI_API_KEY` in `server/.env` and the broker relays your live camera to
  Gemini Flash for real narration.

## What's here today

- ✅ **Google/Apple-Maps-style map** — clean CARTO basemap + **satellite toggle**, our own
  zoom / recenter / layers controls (no default map chrome)
- ✅ **Search** for places (Nominatim) and **category browsing** — Coffee, Food, Hotels,
  Museums, Parks, Bars — as real POI pins (Overpass), with result & detail cards
- ✅ Live high-accuracy **GPS** location dot + heading + accuracy ring
- ✅ Photo-spot **circle overlays** (stubbed dataset) with distance + score in the place sheet
- ✅ **Live AI guide** — streams camera **and mic audio** to Gemini Live; the model
  **auto-answers** (voice-activity detection), speaks back in its own voice, with live
  captions. Talk to it hands-free, or tap the mic. Falls back to browser TTS + push-to-talk
  speech recognition (and an HTTP path) when Live/WebSocket isn't available.
- ✅ **Precise location grounding** — the broker reverse-geocodes your GPS fix to a real place
  and feeds location + accuracy + heading + place name into the guide
- ✅ Graceful **HTTPS handling** — off a secure origin, camera/GPS show a clear banner instead
  of crashing; the map still works
- ✅ Broker with mock fallback and a Gemini Live relay path
- ✅ Dockerized: one container serves the web app + broker

## ⚠️ Camera + GPS require HTTPS

Browsers only expose the camera (`getUserMedia`) and precise location in a **secure context**
— i.e. `https://` or `localhost`. If you host over plain **http://** (e.g. a bare IP), the map
still works but the live guide and GPS are blocked by the browser. Put the container behind a
TLS-terminating proxy, or use a tunnel like `ngrok http 8787` / a platform that gives HTTPS
(Render, Fly.io, Railway) — see below.

## Next

- Real Gemini Live media (audio out + ephemeral tokens)
- Frame-level composition coaching
- Real photo-spot dataset (Wikimedia/Mapillary/Flickr geotag density)
- Optional Apple MapKit JS / Google Maps providers

## Layout

```
/web       Vite + React + TypeScript PWA
/server    Node broker (Gemini key stays here)
```
