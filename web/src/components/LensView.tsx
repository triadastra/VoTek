import type { LensData } from '../vision/visionCore'
import { Icon } from '../ui/Icon'

// The Lens deep-dive: a white focus screen. Reference image on the left, the answer + web
// summary (captions) on the right. Stays until dismissed or the user's GPS moves away.
export function LensView({ lens, onClose }: { lens: LensData; onClose: () => void }) {
  return (
    <div className="lens">
      <div className="lens__media">
        {lens.imageUrl ? (
          <img src={lens.imageUrl} alt={lens.title} />
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

        {lens.answer && <p className="lens__answer">{lens.answer}</p>}
        {lens.extract && <p className="lens__extract">{lens.extract}</p>}

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
