import { useEffect, useRef } from 'react'
import type { GuideMessage, VisionStatus } from '../vision/visionCore'

export function GuideOverlay({
  status,
  messages,
  onClose,
  attachVideo,
}: {
  status: VisionStatus
  messages: GuideMessage[]
  onClose: () => void
  attachVideo: (el: HTMLVideoElement) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (videoRef.current) attachVideo(videoRef.current)
  }, [attachVideo])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  return (
    <div className="overlay">
      <video ref={videoRef} className="overlay__video" playsInline muted />
      <div className="overlay__scrim" />
      <div className="overlay__top">
        <div className={`pill ${status === 'live' ? 'live' : status === 'error' ? 'error' : ''}`}>
          <span className="dot" />
          {status === 'live' ? 'Guide is watching' : status === 'connecting' ? 'Connecting…' : status}
        </div>
        <button className="overlay__close" onClick={onClose} aria-label="Close guide">
          ✕
        </button>
      </div>
      <div className="transcript" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.partial ? 'partial' : ''}`}>
            <div className="bubble__tag">GUIDE</div>
            {m.text}
          </div>
        ))}
      </div>
    </div>
  )
}
