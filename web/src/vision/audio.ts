// Audio streaming for the live guide: capture the mic as 16kHz PCM16 (what Gemini Live wants)
// and play back Gemini's 24kHz PCM audio with gapless scheduling via the Web Audio API.

function base64FromBytes(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Float32 [-1,1] at inRate → Int16 PCM at 16kHz.
function toPcm16k(input: Float32Array, inRate: number): ArrayBuffer {
  const ratio = inRate / 16000
  const outLen = Math.floor(input.length / ratio)
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out.buffer
}

/** Streams the mic as base64 PCM16/16kHz chunks. */
export class MicStreamer {
  private ctx: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private proc: ScriptProcessorNode | null = null
  private muted = false

  constructor(private onChunk: (b64: string) => void) {}

  start(stream: MediaStream) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new AC()
    this.source = this.ctx.createMediaStreamSource(stream)
    this.proc = this.ctx.createScriptProcessor(4096, 1, 1)
    const inRate = this.ctx.sampleRate
    this.proc.onaudioprocess = (e) => {
      if (this.muted) return
      const pcm = toPcm16k(e.inputBuffer.getChannelData(0), inRate)
      this.onChunk(base64FromBytes(new Uint8Array(pcm)))
    }
    // ScriptProcessor only fires while connected to the graph; route through a silent gain
    // node so we don't echo the mic to the speakers.
    const silent = this.ctx.createGain()
    silent.gain.value = 0
    this.source.connect(this.proc)
    this.proc.connect(silent)
    silent.connect(this.ctx.destination)
    this.ctx.resume().catch(() => {})
  }

  setMuted(m: boolean) {
    this.muted = m
  }

  stop() {
    try {
      this.proc?.disconnect()
      this.source?.disconnect()
      this.ctx?.close()
    } catch {
      /* noop */
    }
    this.ctx = null
    this.source = null
    this.proc = null
  }
}

/** Plays a stream of base64 PCM16 chunks (24kHz, Gemini's output rate) gaplessly. */
export class PlaybackQueue {
  private ctx: AudioContext | null = null
  private nextTime = 0
  private live = false

  private ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AC()
      this.ctx.resume().catch(() => {})
      this.nextTime = 0
    }
    return this.ctx
  }

  enqueue(b64: string, rate = 24000) {
    const ctx = this.ensure()
    const bytes = bytesFromBase64(b64)
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
    const f32 = new Float32Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768
    const buf = ctx.createBuffer(1, f32.length, rate)
    buf.copyToChannel(f32, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const now = ctx.currentTime
    this.nextTime = Math.max(this.nextTime, now + 0.02)
    src.start(this.nextTime)
    this.nextTime += buf.duration
    this.live = true
  }

  /** True once any audio has been enqueued (used to know Gemini is speaking natively). */
  isLive() {
    return this.live
  }

  /** Stop playback immediately (e.g. the user starts talking — barge-in). */
  flush() {
    if (this.ctx) {
      this.ctx.close().catch(() => {})
      this.ctx = null
    }
    this.nextTime = 0
  }

  stop() {
    this.flush()
    this.live = false
  }
}
