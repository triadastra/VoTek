import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import express from 'express'
import compression from 'compression'
import { WebSocketServer } from 'ws'
import { GuideSession, guideOnce, identify, generateContent, resolveLiveModel, probeProvider } from './gemini.js'
import { availableProviders } from './altproviders.js'
import { reverseGeocode } from './geocode.js'
import { searchPlaces, wikiLookup } from './search.js'
import { getRoute } from './routing.js'

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

// Provider keys — the client can pick any provider that has a key configured here.
const KEYS = {
  gemini: API_KEY,
  openai: process.env.OPENAI_API_KEY || '',
  anthropic: process.env.ANTHROPIC_API_KEY || '',
}

const app = express()
// Gzip everything (the built JS bundle is ~1MB raw → ~280KB gzipped). Without this the
// broker shipped the whole bundle uncompressed, which was the main cause of slow loads.
app.use(compression())
app.use(express.json({ limit: '6mb' })) // frames arrive as base64 JPEG

// Which AI providers are available (have a key) + their model lists, for the client selector.
app.get('/api/providers', (_req, res) => {
  const providers = availableProviders(KEYS)
  res.json({ providers, default: providers[0]?.id || null })
})

// Health / mode. The client can use this to show whether the real guide is wired up.
// With ?provider=X it runs a live "test connection" probe for that provider (used by Settings).
app.get('/api/health', async (req, res) => {
  const provider = req.query.provider ? String(req.query.provider) : null
  if (provider) {
    const r = await probeProvider({ keys: KEYS, provider, model: req.query.model ? String(req.query.model) : undefined })
    return res.json({ provider, ...r })
  }
  const out = { ok: true, mode: API_KEY ? 'live' : 'mock', build: 'model-probe' }
  if (API_KEY) {
    // Actually call the API so we can tell whether the KEY works and which model succeeds.
    const r = await generateContent(API_KEY, [{ text: 'Reply with the single word OK.' }])
    out.keyWorks = r.ok
    out.probeStatus = r.status
    out.restModel = r.model || null
    out.liveModel = await resolveLiveModel(API_KEY)
  }
  res.json(out)
})

// In a real deploy this endpoint mints a short-lived EPHEMERAL token for the client,
// so the raw key never leaves the server. Stubbed here.
app.post('/api/session-token', (_req, res) => {
  res.json({ token: null, mode: API_KEY ? 'live' : 'mock' })
})

// HTTP guide fallback — one narration turn from a frame + context. Used by the client when
// the realtime vision WebSocket can't connect (some hosts don't proxy WebSocket upgrades).
app.post('/api/guide', async (req, res) => {
  const ctx = req.body?.context || {}
  let place = ctx.place
  if (!place && ctx.location) place = await reverseGeocode(ctx.location.lat, ctx.location.lng)
  const text = await guideOnce({
    keys: KEYS,
    provider: req.body?.provider || 'gemini',
    model: req.body?.model,
    context: { ...ctx, place },
    jpegBase64: req.body?.jpegBase64,
    question: req.body?.question,
  })
  res.json({ text })
})

// Lens deep-dive: identify what's in view, then web-search it for an image + summary.
app.post('/api/lens', async (req, res) => {
  const ctx = req.body?.context || {}
  let place = ctx.place
  if (!place && ctx.location) place = await reverseGeocode(ctx.location.lat, ctx.location.lng)
  const question = req.body?.question || ''
  const id = await identify({
    keys: KEYS,
    provider: req.body?.provider || 'gemini',
    model: req.body?.model,
    context: { ...ctx, place },
    jpegBase64: req.body?.jpegBase64,
    question,
  })

  // Pick the best web-search subject. Location-aware so "this city / this place" work even
  // without image identification, and generic identify answers fall back to the real place.
  const cityOf = (p) => (p ? p.split(',').map((s) => s.trim()).filter(Boolean).pop() : null)
  let query = id.subject
  if (!query || /\b(this|here|looking at)\b/i.test(query) || /^what\b/i.test(query)) query = place || query
  if (/\b(city|town|neighbou?rhood|area|where am i)\b/i.test(question)) query = cityOf(place) || place || query

  const lens = await wikiLookup(query || question)
  res.json({ text: id.answer, lens })
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

// Real route between two points (default walking) for on-map guidance.
app.get('/api/route', async (req, res) => {
  const parse = (s) => {
    const [lng, lat] = String(s || '').split(',').map(Number)
    return Number.isNaN(lng) || Number.isNaN(lat) ? null : { lng, lat }
  }
  const route = await getRoute(parse(req.query.from), parse(req.query.to), String(req.query.mode || 'foot'))
  res.json({ route })
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
  app.use(
    express.static(WEB_DIST, {
      // Vite fingerprints asset filenames, so /assets/* can be cached forever. index.html
      // must stay uncached so a new deploy is picked up immediately.
      setHeaders: (res, path) => {
        if (path.includes(`${join('', 'assets', '')}`) || /\.[0-9a-f]{8,}\.(js|css)$/.test(path)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else if (path.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache')
        }
      },
    }),
  )
  // SPA fallback: let the client router handle non-API, non-asset routes.
  app.get(/^\/(?!api\/|vision).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(join(WEB_DIST, 'index.html'))
  })
  console.log(`Serving web app from ${WEB_DIST}`)
} else {
  console.log('No web build found — API/websocket only (use the Vite dev server for the UI).')
}

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/vision' })

wss.on('connection', (client) => {
  const send = (obj) => {
    if (client.readyState === client.OPEN) client.send(JSON.stringify(obj))
  }
  const guide = new GuideSession({
    apiKey: API_KEY,
    model: MODEL,
    onGuide: (text, partial) => send({ type: 'guide', text, partial }),
    onAudio: (data) => send({ type: 'audio', data }),
    onUser: (text) => send({ type: 'you', text }),
    // Live audio fell back to text narration — tell the client to use browser TTS again.
    onMode: (mode) => {
      if (mode === 'rest') send({ type: 'hello', audio: false, mode: 'rest' })
    },
  })
  guide.start()
  // Tell the client up-front whether Gemini native audio is available (live vs mock).
  send({ type: 'hello', audio: !!API_KEY, mode: API_KEY ? 'live' : 'mock' })

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
    } else if (msg.type === 'audio') {
      guide.pushAudio(msg.data)
    }
  })

  client.on('close', () => guide.stop())
  client.on('error', () => guide.stop())
})

server.listen(PORT, () => {
  console.log(`VoTek broker on :${PORT} — mode: ${API_KEY ? 'LIVE (Gemini)' : 'MOCK (no key)'}`)
})
