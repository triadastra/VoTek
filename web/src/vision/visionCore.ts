import type { LngLat } from '../map/types'

// The VisionCore owns the camera and the link to the broker. Transport is a WebSocket today;
// a WebRTC transport can drop in behind this same interface (see ARCHITECTURE.md). The app
// never talks to Gemini directly — only through the broker, which holds the key.

export interface GuideMessage {
  role: 'guide'
  text: string
  /** true while the guide is still streaming this message. */
  partial?: boolean
}

export interface VisionCoreEvents {
  onStatus?: (status: VisionStatus) => void
  onMessage?: (msg: GuideMessage) => void
  onError?: (err: string) => void
}

export type VisionStatus = 'idle' | 'connecting' | 'live' | 'error'

export interface VisionContext {
  location: LngLat | null
  /** GPS accuracy radius in meters, so the guide knows how precise the fix is. */
  accuracy: number | null
  heading: number | null
  /** Names of nearby POIs / photo spots, to ground the narration. */
  nearby: string[]
  /** Human-readable place resolved from the map data (filled in by the broker). */
  place?: string | null
}

const FRAME_INTERVAL_MS = 1500 // WebSocket path: ~1 frame every 1.5s
const HTTP_INTERVAL_MS = 4000 // HTTP fallback: slower, one narration turn at a time
const WS_OPEN_TIMEOUT_MS = 6000 // if the socket isn't open by now, fall back to HTTP
const FRAME_MAX_EDGE = 512 // downscale before sending

export class VisionCore {
  private ws: WebSocket | null = null
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private canvas = document.createElement('canvas')
  private frameTimer: number | null = null
  private httpTimer: number | null = null
  private wsOpenTimer: number | null = null
  private status: VisionStatus = 'idle'
  private context: VisionContext | null = null
  private closed = false
  private httpBusy = false

  constructor(private events: VisionCoreEvents = {}) {}

  getStatus() {
    return this.status
  }

  /** Attach the live camera to a <video> element the UI controls. */
  async startCamera(video: HTMLVideoElement) {
    // getUserMedia only exists in a secure context (HTTPS or localhost). Off HTTPS,
    // navigator.mediaDevices is undefined — surface a clear message instead of crashing.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera needs HTTPS. Open this site over https:// (or on localhost).')
    }
    this.video = video
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    })
    video.srcObject = this.stream
    try {
      await video.play()
    } catch (e) {
      // iOS Safari rejects play() with AbortError when the stream attaches; the feed still
      // plays. Ignore that benign case; only re-throw real failures.
      if ((e as DOMException)?.name !== 'AbortError') throw e
    }
  }

  /** Open the broker link and begin streaming frames + context. */
  connect(context: VisionContext) {
    this.context = context
    this.closed = false
    this.setStatus('connecting')

    let ws: WebSocket
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/vision`)
    } catch {
      this.startHttpFallback()
      return
    }
    this.ws = ws

    // If the socket doesn't open promptly (host doesn't proxy WebSocket upgrades), fall back.
    this.wsOpenTimer = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        try {
          ws.close()
        } catch {
          /* noop */
        }
        this.startHttpFallback()
      }
    }, WS_OPEN_TIMEOUT_MS)

    ws.onopen = () => {
      this.clearWsOpenTimer()
      this.setStatus('live')
      this.send({ type: 'context', context })
      this.startFrameLoop()
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'guide') {
          this.events.onMessage?.({ role: 'guide', text: msg.text, partial: msg.partial })
        }
      } catch {
        /* ignore malformed frames */
      }
    }
    ws.onerror = () => {
      // Don't surface yet — let the fallback take over quietly.
      this.clearWsOpenTimer()
      if (!this.closed && !this.httpTimer) this.startHttpFallback()
    }
    ws.onclose = () => {
      this.stopFrameLoop()
      if (!this.closed && this.status === 'live') {
        // Was working, then dropped — try HTTP so narration continues.
        this.startHttpFallback()
      }
    }
  }

  /** Update grounding context mid-session (e.g. the user moved). */
  updateContext(context: VisionContext) {
    this.context = context
    this.send({ type: 'context', context })
  }

  disconnect() {
    this.closed = true
    this.stopFrameLoop()
    this.stopHttpFallback()
    this.clearWsOpenTimer()
    this.ws?.close()
    this.ws = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.setStatus('idle')
  }

  // ---- WebSocket frame loop ----
  private startFrameLoop() {
    this.stopFrameLoop()
    this.frameTimer = window.setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return
      const b64 = this.captureFrame()
      if (b64) this.send({ type: 'frame', jpegBase64: b64 })
    }, FRAME_INTERVAL_MS)
  }

  private stopFrameLoop() {
    if (this.frameTimer != null) window.clearInterval(this.frameTimer)
    this.frameTimer = null
  }

  // ---- HTTP fallback loop ----
  private startHttpFallback() {
    if (this.closed || this.httpTimer != null) return
    this.setStatus('live')
    const tick = async () => {
      if (this.closed || this.httpBusy) return
      this.httpBusy = true
      try {
        const res = await fetch('/api/guide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: this.context, jpegBase64: this.captureFrame() }),
        })
        if (res.ok) {
          const { text } = await res.json()
          if (text) this.events.onMessage?.({ role: 'guide', text })
        }
      } catch {
        /* transient — try again next tick */
      } finally {
        this.httpBusy = false
      }
    }
    tick()
    this.httpTimer = window.setInterval(tick, HTTP_INTERVAL_MS)
  }

  private stopHttpFallback() {
    if (this.httpTimer != null) window.clearInterval(this.httpTimer)
    this.httpTimer = null
  }

  private clearWsOpenTimer() {
    if (this.wsOpenTimer != null) window.clearTimeout(this.wsOpenTimer)
    this.wsOpenTimer = null
  }

  /** Grab the current frame as base64 JPEG (no data: prefix), or null if not ready. */
  private captureFrame(): string | null {
    if (!this.video) return null
    const vw = this.video.videoWidth
    const vh = this.video.videoHeight
    if (!vw || !vh) return null
    const scale = Math.min(1, FRAME_MAX_EDGE / Math.max(vw, vh))
    this.canvas.width = Math.round(vw * scale)
    this.canvas.height = Math.round(vh * scale)
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
    return this.canvas.toDataURL('image/jpeg', 0.6).split(',')[1] ?? null
  }

  private send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  private setStatus(s: VisionStatus) {
    this.status = s
    this.events.onStatus?.(s)
  }
}
