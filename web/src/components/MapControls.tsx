import type { Basemap } from '../map/types'
import { Icon } from '../ui/Icon'

export function MapControls({
  basemap,
  onBasemap,
  onZoomIn,
  onZoomOut,
  onRecenter,
  trailActive,
  onTrail,
}: {
  basemap: Basemap
  onBasemap: (b: Basemap) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onRecenter: () => void
  trailActive: boolean
  onTrail: () => void
}) {
  return (
    <div className="mapctrl">
      <button
        className={`mapctrl__trail ${trailActive ? 'on' : ''}`}
        onClick={onTrail}
        aria-label="Toggle pathway trail"
        aria-pressed={trailActive}
      >
        <Icon name="trail" size={22} />
      </button>
      <button
        className="mapctrl__layers"
        onClick={() => onBasemap(basemap === 'map' ? 'satellite' : 'map')}
        aria-label="Toggle satellite"
      >
        <Icon name={basemap === 'map' ? 'satellite' : 'layers'} size={22} />
      </button>
      <div className="mapctrl__zoom">
        <button onClick={onZoomIn} aria-label="Zoom in">
          <Icon name="plus" size={20} />
        </button>
        <span className="mapctrl__sep" />
        <button onClick={onZoomOut} aria-label="Zoom out">
          <Icon name="minus" size={20} />
        </button>
      </div>
      <button className="mapctrl__recenter" onClick={onRecenter} aria-label="Recenter">
        <Icon name="locate" size={22} />
      </button>
    </div>
  )
}
