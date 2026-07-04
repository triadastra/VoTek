import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import express from 'express'
import { WebSocketServer } from 'ws'
import { GuideSession } from './gemini.js'

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
    if (msg.type === 'context') guide.pushContext(msg.context)
    else if (msg.type === 'frame') guide.pushFrame(msg.jpegBase64)
  })

  client.on('close', () => guide.stop())
  client.on('error', () => guide.stop())
})

server.listen(PORT, () => {
  console.log(`VoTek broker on :${PORT} — mode: ${API_KEY ? 'LIVE (Gemini)' : 'MOCK (no key)'}`)
})
