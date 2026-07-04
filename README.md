# VoTek

A mobile **web app** that fuses a live map with an AI **vision core**. Point your phone at
what's around you and VoTek acts as a tour guide — it knows where you are, narrates the history
of what you're looking at, and circles the best spots to take photos.

> Built map-first on **MapLibre** (free, no key) behind a **pluggable map interface**, so Apple
> MapKit JS or Google Maps can drop in later. The vision core streams your camera to **Gemini
> Live (Flash)** through a **broker** that keeps the API key server-side. See
> [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Run it locally

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

- ✅ Live map + your location dot + heading (MapLibre, custom UI — no default map chrome)
- ✅ Our own mobile UI shell (dark, glassy)
- ✅ Photo-spot **circle overlays** (stubbed dataset) with a detail sheet
- ✅ Camera guide overlay + vision core streaming frames to the broker
- ✅ Broker with mock fallback and a Gemini Live relay path

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
