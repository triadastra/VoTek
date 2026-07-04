// Text-to-speech for the guide narration (Web Speech API). Picks a natural English voice,
// supports muting, and warms up on a user gesture so iOS lets it speak later.

let muted = false
let voice: SpeechSynthesisVoice | null = null

function pickVoice(): SpeechSynthesisVoice | null {
  const vs = window.speechSynthesis?.getVoices?.() ?? []
  if (!vs.length) return null
  const prefer = ['Samantha', 'Google US English', 'Google UK English Female', 'Karen', 'Serena', 'Moira', 'Daniel']
  for (const name of prefer) {
    const v = vs.find((x) => x.name === name)
    if (v) return v
  }
  return vs.find((x) => x.lang?.startsWith('en')) ?? vs[0]
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

if (speechSupported()) {
  voice = pickVoice()
  window.speechSynthesis.onvoiceschanged = () => {
    voice = pickVoice()
  }
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(m: boolean): void {
  muted = m
  if (m) stopSpeaking()
}

/** Call on a user gesture (the Start guide tap) so iOS unlocks audio for later speech. */
export function warmUpSpeech(): void {
  if (!speechSupported() || muted) return
  try {
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    window.speechSynthesis.speak(u)
  } catch {
    /* noop */
  }
}

export function stopSpeaking(): void {
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* noop */
  }
}

export function speak(text: string, on: { onStart?: () => void; onEnd?: () => void } = {}): void {
  if (!speechSupported() || muted) {
    on.onEnd?.()
    return
  }
  const clean = text.trim()
  // Skip warnings and meta notes (they start with ⚠ or a parenthetical).
  if (!clean || clean.startsWith('⚠') || clean.startsWith('(')) {
    on.onEnd?.()
    return
  }
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(clean)
    if (!voice) voice = pickVoice()
    if (voice) u.voice = voice
    u.rate = 1.0
    u.pitch = 1.02
    u.onstart = () => on.onStart?.()
    u.onend = () => on.onEnd?.()
    u.onerror = () => on.onEnd?.()
    window.speechSynthesis.speak(u)
  } catch {
    on.onEnd?.()
  }
}
