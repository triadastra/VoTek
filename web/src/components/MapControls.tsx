import type { Basemap } from '../map/types'

export function MapControls({
  basemap,
  onBasemap,
  onZoomIn,
  onZoomOut,
  onRecenter,
}: {
  basemap: Basemap
  onBasemap: (b: Basemap) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onRecenter: () => void
}) {
  return (
    <div className="mapctrl">
      <button
        className="mapctrl__layers"
        onClick={() => onBasemap(basemap === 'map' ? 'satellite' : 'map')}
        aria-label="Toggle satellite"
      >
        {basemap === 'map' ? '🛰️' : '🗺️'}
      </button>
      <div className="mapctrl__zoom">
        <button onClick={onZoomIn} aria-label="Zoom in">
          +
        </button>
        <span className="mapctrl__sep" />
        <button onClick={onZoomOut} aria-label="Zoom out">
          −
        </button>
      </div>
      <button className="mapctrl__recenter" onClick={onRecenter} aria-label="Recenter">
        ◎
      </button>
    </div>
  )
}
