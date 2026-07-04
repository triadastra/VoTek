import type { PhotoSpot } from '../map/types'

export function PhotoSpotSheet({
  spot,
  onClose,
  onNavigate,
}: {
  spot: PhotoSpot
  onClose: () => void
  onNavigate: (spot: PhotoSpot) => void
}) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={spot.name}>
        <div className="sheet__grip" />
        <div className="sheet__title">{spot.name}</div>
        <div className="sheet__score">★ {Math.round(spot.score * 100)}% photo score</div>
        <div className="sheet__blurb">{spot.blurb}</div>
        <button className="sheet__go" onClick={() => onNavigate(spot)}>
          Take me here
        </button>
      </div>
    </>
  )
}
