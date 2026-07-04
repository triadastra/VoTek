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

const FRAME_INTERVAL_MS = 1500 // send ~1 frame every 1.5s — gate to control cost/latency
const FRAME_MAX_EDGE = 512 // downscale before sending

export class VisionCore {
  private ws: WebSocket | null = null
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private canvas = document.createElement('canvas')
  private frameTimer: number | null = null
  private status: VisionStatus = 'idle'

  constructor(private events: VisionCoreEvents = {}) {}

  getStatus() {
    return this.status
  }

  /** Attach the live camera to a <video> element the UI controls. */
  async startCamera(video: HTMLVideoElement) {
    this.video = video
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    })
    video.srcObject = this.stream
    await video.play()
  }

  /** Open the broker link and begin streaming frames + context. */
  connect(context: VisionContext) {
    this.setStatus('connecting')
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    this.ws = new WebSocket(`${proto}://${location.host}/vision`)

    this.ws.onopen = () => {
      this.setStatus('live')
      this.send({ type: 'context', context })
      this.startFrameLoop()
    }
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'guide') {
          this.events.onMessage?.({ role: 'guide', text: msg.text, partial: msg.partial })
        }
      } catch {
        /* ignore malformed frames */
      }
    }
    this.ws.onerror = () => {
      this.setStatus('error')
      this.events.onError?.('Vision link error')
    }
    this.ws.onclose = () => {
      if (this.status !== 'error') this.setStatus('idle')
      this.stopFrameLoop()
    }
  }

  /** Update grounding context mid-session (e.g. the user moved). */
  updateContext(context: VisionContext) {
    this.send({ type: 'context', context })
  }

  disconnect() {
    this.stopFrameLoop()
    this.ws?.close()
    this.ws = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.setStatus('idle')
  }

  private startFrameLoop() {
    this.stopFrameLoop()
    this.frameTimer = window.setInterval(() => this.captureAndSend(), FRAME_INTERVAL_MS)
  }

  private stopFrameLoop() {
    if (this.frameTimer != null) window.clearInterval(this.frameTimer)
    this.frameTimer = null
  }

  private captureAndSend() {
    if (!this.video || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const vw = this.video.videoWidth
    const vh = this.video.videoHeight
    if (!vw || !vh) return
    const scale = Math.min(1, FRAME_MAX_EDGE / Math.max(vw, vh))
    this.canvas.width = Math.round(vw * scale)
    this.canvas.height = Math.round(vh * scale)
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
    const dataUrl = this.canvas.toDataURL('image/jpeg', 0.6)
    this.send({ type: 'frame', jpegBase64: dataUrl.split(',')[1] })
  }

  private send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  private setStatus(s: VisionStatus) {
    this.status = s
    this.events.onStatus?.(s)
  }
}
