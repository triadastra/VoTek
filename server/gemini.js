import WebSocket from 'ws'

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

/**
 * A single guide session. Wraps either a real Gemini Live connection or a mock generator.
 * The client-facing contract is identical: call pushContext(), pushFrame(), and receive
 * onGuide(text, partial) callbacks.
 */
export class GuideSession {
  constructor({ apiKey, model, onGuide }) {
    this.apiKey = apiKey
    this.model = model || 'gemini-2.0-flash-live-001'
    this.onGuide = onGuide
    this.context = null
    this.upstream = null
    this.mock = !apiKey
    this.mockTimer = null
    this.mockIdx = 0
  }

  start() {
    if (this.mock) return // mock narration is driven by frames/context
    const url =
      'wss://generativelanguage.googleapis.com/ws/' +
      'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent' +
      `?key=${this.apiKey}`
    this.upstream = new WebSocket(url)
    this.upstream.on('open', () => this.sendSetup())
    this.upstream.on('message', (data) => this.handleUpstream(data))
    this.upstream.on('error', (err) => this.onGuide(`connection error: ${err.message}`, false))
  }

  sendSetup() {
    const setup = {
      setup: {
        model: `models/${this.model}`,
        generationConfig: { responseModalities: ['TEXT'] },
        systemInstruction: { parts: [{ text: buildSystemPrompt(this.context) }] },
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
    const parts = msg?.serverContent?.modelTurn?.parts
    if (Array.isArray(parts)) {
      const text = parts.map((p) => p.text).filter(Boolean).join('')
      if (text) this.onGuide(text, !msg?.serverContent?.turnComplete)
    }
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
    if (this.upstream?.readyState !== WebSocket.OPEN) return
    this.upstream.send(
      JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ mimeType: 'image/jpeg', data: jpegBase64 }],
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
    if (this.mockTimer) clearInterval(this.mockTimer)
    this.mockTimer = null
    this.upstream?.close()
    this.upstream = null
  }
}
