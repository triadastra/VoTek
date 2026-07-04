import { useEffect, useState } from 'react'
import type { LensData } from '../vision/visionCore'
import { Icon } from '../ui/Icon'
import { speak, stopSpeaking } from '../vision/speech'

// The Lens deep-dive: a white focus screen. Image gallery on one side, the answer + web
// summary on the other, with read-aloud. Stays until dismissed or the user's GPS moves away.
export function LensView({ lens, onClose }: { lens: LensData; onClose: () => void }) {
  const images = lens.images && lens.images.length ? lens.images : lens.imageUrl ? [lens.imageUrl] : []
  const [active, setActive] = useState(0)
  const [reading, setReading] = useState(false)

  useEffect(() => () => stopSpeaking(), [])

  const readAloud = () => {
    if (reading) {
      stopSpeaking()
      setReading(false)
      return
    }
    const body = [lens.answer, lens.article || lens.extract].filter(Boolean).join(' ')
    setReading(true)
    speak(body, { onEnd: () => setReading(false) })
  }

  return (
    <div className="lens">
      <div className="lens__media">
        {images.length ? (
          <>
            <img src={images[active]} alt={lens.title} className="lens__img" />
            {images.length > 1 && (
              <div className="lens__thumbs">
                {images.map((src, i) => (
                  <button
                    key={src}
                    className={`lens__thumb ${i === active ? 'on' : ''}`}
                    onClick={() => setActive(i)}
                    aria-label={`Image ${i + 1}`}
                  >
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="lens__noimg">
            <Icon name="search" size={40} />
            <span>No image found</span>
          </div>
        )}
      </div>

      <div className="lens__panel">
        <button className="lens__close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={20} />
        </button>

        <div className="lens__tag">LENS</div>
        <h2 className="lens__title">{lens.title}</h2>

        <button className={`lens__read ${reading ? 'on' : ''}`} onClick={readAloud}>
          <Icon name={reading ? 'mute' : 'volume'} size={16} />
          {reading ? 'Stop' : 'Read aloud'}
        </button>

        {lens.answer && <p className="lens__answer">{lens.answer}</p>}
        {(lens.article || lens.extract) && <p className="lens__extract">{lens.article || lens.extract}</p>}

        <div className="lens__foot">
          {lens.url && (
            <a className="lens__source" href={lens.url} target="_blank" rel="noreferrer">
              {lens.source || 'Source'} ↗
            </a>
          )}
          <span className="lens__hint">Walk away or tap ✕ to close</span>
        </div>
      </div>
    </div>
  )
}
