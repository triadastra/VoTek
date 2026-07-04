// Voice input (Web Speech API SpeechRecognition) so the user can talk to the guide.
// Gracefully reports when unsupported (some browsers lack it).

export interface Recognizer {
  start(): void
  stop(): void
  readonly supported: boolean
}

interface RecEvents {
  onInterim?: (text: string) => void
  onFinal?: (text: string) => void
  onStart?: () => void
  onEnd?: () => void
  onError?: (msg: string) => void
}

export function createRecognizer(ev: RecEvents): Recognizer {
  const SR =
    (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
      .SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  if (!SR) {
    return {
      supported: false,
      start: () => ev.onError?.('Voice input isn’t supported in this browser'),
      stop: () => {},
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rec: any = new (SR as any)()
  rec.lang = 'en-US'
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1

  let finalText = ''
  rec.onstart = () => {
    finalText = ''
    ev.onStart?.()
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rec.onresult = (e: any) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) finalText += r[0].transcript
      else interim += r[0].transcript
    }
    ev.onInterim?.((finalText + ' ' + interim).trim())
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rec.onerror = (e: any) => ev.onError?.(e?.error || 'voice error')
  rec.onend = () => {
    if (finalText.trim()) ev.onFinal?.(finalText.trim())
    ev.onEnd?.()
  }

  return {
    supported: true,
    start: () => {
      try {
        rec.start()
      } catch {
        /* already started */
      }
    },
    stop: () => {
      try {
        rec.stop()
      } catch {
        /* noop */
      }
    },
  }
}
