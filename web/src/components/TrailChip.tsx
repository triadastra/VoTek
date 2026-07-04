import { Icon } from '../ui/Icon'

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`
}

export function TrailChip({
  active,
  points,
  distanceM,
  onToggle,
  onClear,
}: {
  active: boolean
  points: number
  distanceM: number
  onToggle: () => void
  onClear: () => void
}) {
  return (
    <div className="trailchip">
      <span className={`trailchip__ic ${active ? 'rec' : ''}`}>
        <Icon name="trail" size={18} />
      </span>
      <div className="trailchip__main" onClick={onToggle}>
        <div className="trailchip__title">{active ? 'Recording pathway' : 'Pathway paused'}</div>
        <div className="trailchip__sub">
          {fmtDist(distanceM)} · {points} point{points === 1 ? '' : 's'}
        </div>
      </div>
      <button className="trailchip__clear" onClick={onClear} aria-label="Clear trail">
        <Icon name="trash" size={16} />
      </button>
    </div>
  )
}
