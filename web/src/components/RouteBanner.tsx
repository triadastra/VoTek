import type { RouteResult } from '../data/api'
import { Icon } from '../ui/Icon'

function fmtDuration(s: number): string {
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${min % 60} min`
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

export function RouteBanner({ route, onClear }: { route: RouteResult; onClear: () => void }) {
  const mode = route.mode === 'driving' ? 'Drive' : route.mode === 'cycling' ? 'Cycle' : 'Walk'
  return (
    <div className="routebar">
      <div className="routebar__icon">
        <Icon name={route.mode === 'foot' ? 'walk' : 'route'} size={20} />
      </div>
      <div className="routebar__main">
        <div className="routebar__time">{fmtDuration(route.durationS)}</div>
        <div className="routebar__sub">
          <Icon name="clock" size={13} /> {mode} · {fmtDist(route.distanceM)}
        </div>
      </div>
      <button className="routebar__x" onClick={onClear} aria-label="Clear route">
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
