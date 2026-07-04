import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import express from 'express'
import { WebSocketServer } from 'ws'
import { GuideSession } from './gemini.js'
import { reverseGeocode } from './geocode.js'
import { searchPlaces } from './search.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Minimal .env loader (no dependency).
try {
  for (const line of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {
  /* no .env — fine, mock mode */
}

const PORT = process.env.PORT || 8787
const API_KEY = process.env.GEMINI_API_KEY || ''
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-live-001'

const app = express()
app.use(express.json())

// Health / mode. The client can use this to show whether the real guide is wired up.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: API_KEY ? 'live' : 'mock', model: MODEL })
})

// In a real deploy this endpoint mints a short-lived EPHEMERAL token for the client,
// so the raw key never leaves the server. Stubbed here.
app.post('/api/session-token', (_req, res) => {
  res.json({ token: null, mode: API_KEY ? 'live' : 'mock' })
})

// Place / category search, biased to the current map viewport (bbox=w,s,e,n).
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '')
  const bbox = req.query.bbox
    ? String(req.query.bbox).split(',').map(Number).filter((n) => !Number.isNaN(n))
    : undefined
  const bounded = req.query.bounded === '1'
  const results = await searchPlaces(q, { bbox: bbox?.length === 4 ? bbox : undefined, bounded })
  res.json({ results })
})

// Reverse geocode a point to a human place name (used by the UI for tapped locations).
app.get('/api/reverse', async (req, res) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  const place = await reverseGeocode(lat, lng)
  res.json({ place })
})

// In production the broker also serves the built web app, so everything is one origin
// (no CORS, the /vision websocket shares the host). WEB_DIST defaults to the Docker layout
// (./public) and falls back to the local monorepo build (../web/dist) for `npm start`.
const WEB_DIST = process.env.WEB_DIST
  ? resolve(process.env.WEB_DIST)
  : existsSync(join(__dirname, 'public'))
    ? join(__dirname, 'public')
    : join(__dirname, '..', 'web', 'dist')

if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST))
  // SPA fallback: let the client router handle non-API, non-asset routes.
  app.get(/^\/(?!api\/|vision).*/, (_req, res) => {
    res.sendFile(join(WEB_DIST, 'index.html'))
  })
  console.log(`Serving web app from ${WEB_DIST}`)
} else {
  console.log('No web build found — API/websocket only (use the Vite dev server for the UI).')
}

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/vision' })

wss.on('connection', (client) => {
  const guide = new GuideSession({
    apiKey: API_KEY,
    model: MODEL,
    onGuide: (text, partial) => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: 'guide', text, partial }))
      }
    },
  })
  guide.start()

  client.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (msg.type === 'context') {
      // Resolve the precise GPS fix to a real place from map data, then ground the guide.
      const ctx = msg.context || {}
      if (ctx.location) {
        reverseGeocode(ctx.location.lat, ctx.location.lng)
          .then((place) => guide.pushContext({ ...ctx, place }))
          .catch(() => guide.pushContext(ctx))
      } else {
        guide.pushContext(ctx)
      }
    } else if (msg.type === 'frame') {
      guide.pushFrame(msg.jpegBase64)
    }
  })

  client.on('close', () => guide.stop())
  client.on('error', () => guide.stop())
})

server.listen(PORT, () => {
  console.log(`VoTek broker on :${PORT} — mode: ${API_KEY ? 'LIVE (Gemini)' : 'MOCK (no key)'}`)
})
