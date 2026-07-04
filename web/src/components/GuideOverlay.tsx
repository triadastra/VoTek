import { useEffect, useRef, useState } from 'react'
import type { GuideMessage, VisionStatus } from '../vision/visionCore'
import { Icon } from '../ui/Icon'
import { isMuted, setMuted as setGlobalMuted, speak, speechSupported, stopSpeaking } from '../vision/speech'
import { createRecognizer, type Recognizer } from '../vision/recognition'

export function GuideOverlay({
  status,
  messages,
  onClose,
  attachVideo,
  onAsk,
}: {
  status: VisionStatus
  messages: GuideMessage[]
  onClose: () => void
  attachVideo: (el: HTMLVideoElement) => void
  onAsk: (question: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const recRef = useRef<Recognizer | null>(null)
  const spokenRef = useRef('')

  const [muted, setMuted] = useState(isMuted())
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')

  useEffect(() => {
    if (videoRef.current) attachVideo(videoRef.current)
  }, [attachVideo])

  // Speak each new finalized guide line aloud.
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'guide' || last.partial) return
    if (last.text === spokenRef.current) return
    spokenRef.current = last.text
    speak(last.text, { onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) })
  }, [messages])

  // Clean up speech + recognition when the guide closes.
  useEffect(() => {
    return () => {
      stopSpeaking()
      recRef.current?.stop()
    }
  }, [])

  const toggleMute = () => {
    const m = !muted
    setMuted(m)
    setGlobalMuted(m)
  }

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop()
      return
    }
    if (!recRef.current) {
      recRef.current = createRecognizer({
        onStart: () => {
          setListening(true)
          setInterim('')
        },
        onInterim: (t) => setInterim(t),
        onEnd: () => setListening(false),
        onError: (e) => {
          setListening(false)
          setInterim('')
          onAskError(e)
        },
        onFinal: (q) => {
          setInterim('')
          onAsk(q)
        },
      })
    }
    stopSpeaking() // don't talk over the user
    recRef.current.start()
  }

  const onAskError = (_e: string) => {
    /* surfaced via the caption placeholder; nothing else to do */
  }

  const last = messages[messages.length - 1]
  const caption = listening
    ? interim || 'Listening…'
    : last
      ? last.text
      : status === 'connecting'
        ? 'Connecting to your guide…'
        : 'Point your camera and I’ll tell you about it.'
  const captionRole = listening ? 'you' : last?.role ?? 'guide'

  return (
    <div className="overlay">
      <video ref={videoRef} className="overlay__video" playsInline muted />
      <div className="overlay__scrim" />

      <div className="overlay__top">
        <div className={`pill ${status === 'live' ? 'live' : status === 'error' ? 'error' : ''}`}>
          <span className="dot" />
          {status === 'live' ? 'Guide is watching' : status === 'connecting' ? 'Connecting…' : status}
        </div>
        {speechSupported() && (
          <button className="overlay__icbtn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            <Icon name={muted ? 'mute' : 'volume'} size={18} />
          </button>
        )}
        <button className="overlay__icbtn" onClick={onClose} aria-label="Close guide">
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="caption-wrap">
        <div className={`caption caption--${captionRole}`}>
          <span className="caption__tag">{captionRole === 'you' ? 'YOU' : 'GUIDE'}</span>
          <span className="caption__text">{caption}</span>
          {speaking && !listening && (
            <span className="caption__wave">
              <i /><i /><i /><i />
            </span>
          )}
        </div>

        <button
          className={`mic ${listening ? 'mic--on' : ''}`}
          onClick={toggleMic}
          aria-label={listening ? 'Stop listening' : 'Ask the guide'}
        >
          <Icon name="mic" size={26} />
        </button>
        <div className="mic__hint">{listening ? 'Listening — tap to stop' : 'Tap to ask'}</div>
      </div>
    </div>
  )
}
