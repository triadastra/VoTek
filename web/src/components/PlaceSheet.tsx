import type { LngLat, Place, PhotoSpot } from '../map/types'
import { Icon } from '../ui/Icon'

function distanceM(a: LngLat, b: LngLat): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

export interface SheetTarget {
  kind: 'place' | 'spot'
  place?: Place
  spot?: PhotoSpot
}

export function PlaceSheet({
  target,
  userPos,
  onClose,
  onNavigate,
  onGuide,
}: {
  target: SheetTarget
  userPos: LngLat | null
  onClose: () => void
  onNavigate: (pos: LngLat) => void
  onGuide: () => void
}) {
  const isSpot = target.kind === 'spot'
  const name = isSpot ? target.spot!.name : target.place!.name
  const pos = isSpot ? target.spot!.position : target.place!.position
  const sub = isSpot ? target.spot!.blurb : target.place!.address
  const category = isSpot ? 'Photo spot' : target.place!.category

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={name}>
        <div className="sheet__grip" />
        <div className="sheet__head">
          <div>
            <div className="sheet__title">{name}</div>
            <div className="sheet__meta">
              {category && <span className="sheet__cat">{category}</span>}
              {userPos && <span>· {fmtDist(distanceM(userPos, pos))} away</span>}
            </div>
          </div>
          {isSpot && (
            <div className="sheet__score">
              <Icon name="star" size={13} /> {Math.round(target.spot!.score * 100)}%
            </div>
          )}
        </div>
        {sub && <div className="sheet__blurb">{sub}</div>}
        <div className="sheet__actions">
          <button className="sheet__go" onClick={() => onNavigate(pos)}>
            <Icon name="route" size={18} /> Directions
          </button>
          <button className="sheet__guide" onClick={onGuide}>
            <Icon name="navigation" size={16} /> Guide me here
          </button>
        </div>
      </div>
    </>
  )
}
