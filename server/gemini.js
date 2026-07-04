import WebSocket from 'ws'
import { openaiVision, anthropicVision } from './altproviders.js'

// Builds the tour-guide system prompt from live context (precise location, place, spots).
export function buildSystemPrompt(context) {
  const c = context?.location
  const loc = c
    ? `The user's precise GPS position is latitude ${c.lat.toFixed(6)}, longitude ${c.lng.toFixed(6)}` +
      (context.accuracy != null ? ` (±${Math.round(context.accuracy)}m accuracy)` : '') +
      (context.heading != null ? `, facing ${Math.round(context.heading)}° (compass heading)` : '') +
      '.'
    : 'The user location is not yet known.'
  const place = context?.place ? `They are at or near: ${context.place}.` : ''
  const nearby =
    context?.nearby?.length ? `Notable nearby photo spots: ${context.nearby.join(', ')}.` : ''
  return [
    'You are VoTek, a warm, concise walking tour guide who can SEE the user\'s live camera',
    'and knows their exact location from the map.',
    'Use the location and place name to ground everything you say in real, specific history.',
    'Narrate the history and significance of what is in view in 1–2 short sentences at a time.',
    'When you notice a great photo composition, say where to stand and how to frame it.',
    'Never mention that you are an AI or describe the raw image; speak as a guide on the street.',
    loc,
    place,
    nearby,
  ]
    .filter(Boolean)
    .join(' ')
}

// ---- Model resolution ----
// Model IDs vary by key/project/region, so hardcoding one causes 404s. Discover a valid model
// from the key via ListModels and cache it. Falls back to a candidate list if discovery fails.
let cachedRest = null
let cachedLive = null

async function listModels(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.models || []
  } catch {
    return null
  }
}

// A model that supports one-shot generateContent (for narration + Lens identify).
export async function resolveRestModel(apiKey) {
  if (cachedRest) return cachedRest
  const prefer = [process.env.GEMINI_REST_MODEL, 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'].filter(Boolean)
  const models = await listModels(apiKey)
  if (models) {
    const names = models
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
    const pick =
      prefer.find((p) => names.includes(p)) ||
      names.find((n) => /flash/.test(n) && !/(vision|thinking|exp|tts|image)/.test(n)) ||
      names.find((n) => /flash|pro/.test(n)) ||
      names[0]
    if (pick) {
      cachedRest = pick
      console.log(`Gemini REST model: ${pick}`)
      return pick
    }
  }
  cachedRest = prefer[0] || 'gemini-1.5-flash'
  return cachedRest
}

// Candidate REST models tried in order if the resolved one 404s. Self-corrects across
// key/project/region differences without needing ListModels to succeed.
const REST_CANDIDATES = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash-001',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-pro-latest',
]

// One-shot generateContent that tries the resolved model, then falls through candidates on a
// model-not-found (404/400), caching whichever works. Returns { ok, text, status }.
export async function generateContent(apiKey, parts, preferred) {
  const first = preferred || (await resolveRestModel(apiKey))
  const order = [first, ...REST_CANDIDATES.filter((m) => m !== first)]
  const tried = new Set()
  let lastStatus = 0
  for (const model of order) {
    if (tried.has(model)) continue
    tried.add(model)
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
          signal: AbortSignal.timeout(15000),
        },
      )
      if (res.status === 404 || res.status === 400) {
        lastStatus = res.status
        cachedRest = null // that model is wrong; try the next
        continue
      }
      if (!res.ok) return { ok: false, status: res.status }
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || ''
      cachedRest = model // remember the one that worked
      console.log(`Gemini REST model working: ${model}`)
      return { ok: true, text, status: 200, model }
    } catch (e) {
      return { ok: false, status: 0, error: e.message }
    }
  }
  return { ok: false, status: lastStatus || 404 }
}

// A model that supports the live bidi stream (for audio/video). Falls back gracefully.
export async function resolveLiveModel(apiKey) {
  if (cachedLive) return cachedLive
  const prefer = [process.env.GEMINI_MODEL, 'gemini-2.0-flash-live-001', 'gemini-live-2.5-flash-preview'].filter(Boolean)
  const models = await listModels(apiKey)
  if (models) {
    const names = models
      .filter((m) => (m.supportedGenerationMethods || []).includes('bidiGenerateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
    const pick = prefer.find((p) => names.includes(p)) || names.find((n) => /live/.test(n)) || names[0]
    if (pick) {
      cachedLive = pick
      console.log(`Gemini live model: ${pick}`)
      return pick
    }
  }
  cachedLive = prefer[0] || 'gemini-2.0-flash-live-001'
  return cachedLive
}

const MOCK_LINES = [
  'I can see what you see — let me tell you about this place.',
  'Notice the details around you; each one has a small story.',
  'For a great photo, step to the side and let the light lead the eye.',
  'This spot rewards a slower look. Take it in.',
  '(Add a GEMINI_API_KEY to the broker to hear the real, live guide.)',
]
let mockCursor = 0

// Dispatch a single vision generation to the chosen provider (gemini / openai / anthropic).
async function providerGenerate({ provider, apiKey, model, system, instruction, jpegBase64 }) {
  if (provider === 'openai') return openaiVision({ apiKey, model, system, instruction, jpegBase64 })
  if (provider === 'anthropic') return anthropicVision({ apiKey, model, system, instruction, jpegBase64 })
  const parts = [{ text: system + '\n' + instruction }]
  if (jpegBase64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: jpegBase64 } })
  return generateContent(apiKey, parts, model)
}

// A tiny text-only round-trip to check that a provider's key + model actually work. Powers
// the in-app Settings "Test connection" diagnostic, so a 404/401 is visible instead of cryptic.
export async function probeProvider({ keys, provider = 'gemini', model }) {
  const apiKey = keys?.[provider]
  if (!apiKey) return { ok: false, status: 0, reason: 'no-key' }
  try {
    const r = await providerGenerate({
      provider,
      apiKey,
      model,
      system: 'You are a connection test.',
      instruction: 'Reply with the single word OK.',
      jpegBase64: null,
    })
    return { ok: !!r.ok, status: r.status || 0, model: r.model || model || null, error: r.error }
  } catch (e) {
    return { ok: false, status: 0, error: e.message }
  }
}

export async function guideOnce({ keys, provider = 'gemini', model, context, jpegBase64, question }) {
  const apiKey = keys?.[provider]
  if (!apiKey) {
    const place = context?.place
    if (question) {
      return `Good question — "${question}". In the full version I'll answer with real history about ${place || 'this place'}. Add an API key (Gemini, OpenAI, or Anthropic) to enable it.`
    }
    const line =
      mockCursor === 0 && place
        ? `You're at ${place}. I can see what you see — let's explore.`
        : MOCK_LINES[mockCursor % MOCK_LINES.length]
    mockCursor++
    return line
  }
  try {
    const instruction = question
      ? `The user asks: "${question}". Answer as their in-person guide in 1–3 sentences, using what's in view and where they are.`
      : 'Describe what is in view in 1–2 sentences.'
    const r = await providerGenerate({
      provider,
      apiKey,
      model,
      system: buildSystemPrompt(context),
      instruction,
      jpegBase64,
    })
    if (!r.ok) return `(guide unavailable: ${r.status})`
    return r.text || '…'
  } catch (e) {
    return `(guide error: ${e.message})`
  }
}

// Identify what the user is asking about in the frame — returns a searchable subject plus a
// short spoken answer. Powers the Lens deep-dive (subject → Wikipedia image + summary).
export async function identify({ keys, provider = 'gemini', model, context, jpegBase64, question }) {
  const q = (question || 'What am I looking at?').trim()
  const apiKey = keys?.[provider]
  if (!apiKey) {
    return { subject: q, answer: `Let me pull up what I can find about "${q}".` }
  }
  try {
    const instruction =
      `The user asks: "${q}". Identify the specific subject in view (an artwork, landmark, ` +
      `plant, building, object). Reply ONLY as compact JSON: ` +
      `{"subject":"<short searchable name>","answer":"<1-3 sentence spoken answer>"}`
    const r = await providerGenerate({
      provider,
      apiKey,
      model,
      system: buildSystemPrompt(context),
      instruction,
      jpegBase64,
    })
    if (!r.ok) return { subject: q, answer: `(couldn’t identify: ${r.status})` }
    const text = r.text || ''
    const m = text.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        const j = JSON.parse(m[0])
        return { subject: j.subject || q, answer: j.answer || text }
      } catch {
        /* fall through */
      }
    }
    return { subject: q, answer: text || 'Here is what I found.' }
  } catch (e) {
    return { subject: q, answer: `(couldn’t identify: ${e.message})` }
  }
}

/**
 * A single guide session. Wraps either a real Gemini Live connection or a mock generator.
 * The client-facing contract is identical: call pushContext(), pushFrame(), and receive
 * onGuide(text, partial) callbacks.
 */
export class GuideSession {
  constructor({ apiKey, model, onGuide, onAudio, onUser, onMode }) {
    this.apiKey = apiKey
    this.model = model || 'gemini-2.0-flash-live-001'
    this.onGuide = onGuide // (text, partial) — narration captions
    this.onAudio = onAudio || (() => {}) // (base64 pcm16 24k) — Gemini's spoken audio
    this.onUser = onUser || (() => {}) // (text) — transcript of what the user said
    this.onMode = onMode || (() => {}) // ('rest') — tell client we fell back to text narration
    this.context = null
    this.upstream = null
    this.mock = !apiKey
    this.mockTimer = null
    this.mockIdx = 0
    // Resilience: if the live stream errors, closes, or produces nothing quickly, fall back
    // to REST narration over the same connection so the guide always transcribes + helps.
    this.rest = false
    this.gotServerContent = false
    this.restBusy = false
    this.frameN = 0
    this.watchdog = null
    this.stopped = false
  }

  async start() {
    if (this.mock) return // mock narration is driven by frames/context
    try {
      // Resolve a live model the key actually has (avoids 404s from a hardcoded ID).
      this.model = await resolveLiveModel(this.apiKey)
      if (this.stopped) return
      const url =
        'wss://generativelanguage.googleapis.com/ws/' +
        'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent' +
        `?key=${this.apiKey}`
      this.upstream = new WebSocket(url)
      this.upstream.on('open', () => this.sendSetup())
      this.upstream.on('message', (data) => this.handleUpstream(data))
      this.upstream.on('error', () => this.enterRestMode())
      this.upstream.on('close', () => {
        if (!this.gotServerContent) this.enterRestMode()
      })
    } catch {
      this.enterRestMode()
    }
  }

  // Live audio failed / went silent — narrate from frames via REST so it keeps helping.
  enterRestMode() {
    if (this.rest || this.mock || this.stopped) return
    this.rest = true
    clearTimeout(this.watchdog)
    this.onMode('rest') // client: drop live-audio expectation, use browser TTS
    this.onGuide('Reconnecting your guide…', false)
  }

  sendSetup() {
    // If the live session says nothing within a few seconds, assume it isn't working here.
    clearTimeout(this.watchdog)
    this.watchdog = setTimeout(() => {
      if (!this.gotServerContent) this.enterRestMode()
    }, 8000)
    // Full live config: spoken AUDIO output plus transcripts of both sides (for captions).
    const setup = {
      setup: {
        model: `models/${this.model}`,
        generationConfig: { responseModalities: ['AUDIO'] },
        systemInstruction: { parts: [{ text: buildSystemPrompt(this.context) }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    }
    this.upstream?.send(JSON.stringify(setup))
  }

  handleUpstream(data) {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    const sc = msg?.serverContent
    if (!sc) return
    this.gotServerContent = true
    clearTimeout(this.watchdog)

    // Spoken audio + any text parts from the model.
    const parts = sc.modelTurn?.parts
    if (Array.isArray(parts)) {
      for (const p of parts) {
        const mime = p.inlineData?.mimeType || ''
        if (mime.startsWith('audio/') && p.inlineData?.data) this.onAudio(p.inlineData.data)
        if (p.text) this.onGuide(p.text, !sc.turnComplete)
      }
    }
    // Captions from transcription of the model's own speech.
    if (sc.outputTranscription?.text) this.onGuide(sc.outputTranscription.text, !sc.turnComplete)
    // What the user said (from their streamed mic audio).
    if (sc.inputTranscription?.text) this.onUser(sc.inputTranscription.text)
  }

  pushContext(context) {
    const prevPlace = this.context?.place
    this.context = context
    if (this.mock) {
      this.primeMock()
      return
    }
    // The system prompt is fixed at setup, so when the resolved place changes we feed the
    // model fresh grounding as a text turn — this is how it "gets where you are" mid-session.
    if (context?.place && context.place !== prevPlace && this.upstream?.readyState === WebSocket.OPEN) {
      this.upstream.send(
        JSON.stringify({
          clientContent: {
            turns: [
              {
                role: 'user',
                parts: [
                  {
                    text:
                      `[location update] I am now at ${context.place} ` +
                      `(${context.location?.lat?.toFixed(6)}, ${context.location?.lng?.toFixed(6)}). ` +
                      'Keep guiding me based on where I actually am.',
                  },
                ],
              },
            ],
            turnComplete: false,
          },
        }),
      )
    }
  }

  pushFrame(jpegBase64) {
    if (this.mock) {
      this.primeMock()
      return
    }
    if (this.rest) {
      this.restNarrate(jpegBase64)
      return
    }
    if (this.upstream?.readyState !== WebSocket.OPEN) return
    this.upstream.send(
      JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ mimeType: 'image/jpeg', data: jpegBase64 }],
        },
      }),
    )
  }

  // REST fallback narration: describe roughly every 3rd frame (~4–5s), one at a time.
  restNarrate(jpegBase64) {
    this.frameN++
    if (this.restBusy || this.frameN % 3 !== 1) return
    this.restBusy = true
    guideOnce({ keys: { gemini: this.apiKey }, provider: 'gemini', context: this.context, jpegBase64 })
      .then((text) => {
        if (text && !this.stopped) this.onGuide(text, false)
      })
      .finally(() => {
        this.restBusy = false
      })
  }

  // Continuous mic audio (PCM16/16kHz). Streaming this enables Gemini's voice-activity
  // detection to auto-answer when the user stops talking.
  pushAudio(pcmBase64) {
    if (this.mock || this.upstream?.readyState !== WebSocket.OPEN) return
    this.upstream.send(
      JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: pcmBase64 }],
        },
      }),
    )
  }

  // ---- Mock narration: scripted, location-aware, so the app demos with no key ----
  primeMock() {
    if (this.mockTimer) return
    const lines = this.mockLines()
    this.mockTimer = setInterval(() => {
      if (this.mockIdx >= lines.length) {
        clearInterval(this.mockTimer)
        this.mockTimer = null
        return
      }
      this.onGuide(lines[this.mockIdx++], false)
    }, 3500)
  }

  mockLines() {
    const near = this.context?.nearby?.[0]
    const place = this.context?.place
    return [
      place
        ? `Welcome to ${place} — I can see what you see, and I know exactly where you are.`
        : 'Welcome — I can see what you see. Let\'s take a look around.',
      near
        ? `Just ahead is what locals call the "${near}". It has a story worth hearing.`
        : 'This street has more history than it lets on.',
      'For a great shot, step a couple of paces to your left and frame the building against the sky.',
      'The light here is best about an hour before sunset — keep that in mind.',
      '(Add a GEMINI_API_KEY to the broker to hear the real, live guide.)',
    ]
  }

  stop() {
    this.stopped = true
    clearTimeout(this.watchdog)
    if (this.mockTimer) clearInterval(this.mockTimer)
    this.mockTimer = null
    try {
      this.upstream?.close()
    } catch {
      /* noop */
    }
    this.upstream = null
  }
}
