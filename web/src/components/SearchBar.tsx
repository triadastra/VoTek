import { useEffect, useRef, useState } from 'react'
import type { Place } from '../map/types'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/icons'

const CATEGORIES: { label: string; q: string; icon: IconName }[] = [
  { label: 'Photo spots', q: '__photospots__', icon: 'camera' },
  { label: 'Coffee', q: 'coffee', icon: 'coffee' },
  { label: 'Food', q: 'restaurant', icon: 'food' },
  { label: 'Hotels', q: 'hotel', icon: 'hotel' },
  { label: 'Museums', q: 'museum', icon: 'museum' },
  { label: 'Parks', q: 'park', icon: 'park' },
  { label: 'Bars', q: 'bar', icon: 'bar' },
]

export function SearchBar({
  results,
  onSearch,
  onCategory,
  onPick,
  onClear,
}: {
  results: Place[]
  onSearch: (q: string) => void
  onCategory: (q: string, label: string) => void
  onPick: (p: Place) => void
  onClear: () => void
}) {
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const debounce = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(debounce.current)
    if (!q.trim()) return
    debounce.current = window.setTimeout(() => onSearch(q), 350)
    return () => window.clearTimeout(debounce.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const showDropdown = focused && q.trim().length > 0 && results.length > 0

  return (
    <div className="search">
      <div className="search__bar">
        <span className="search__icon">
          <Icon name="search" size={18} />
        </span>
        <input
          className="search__input"
          placeholder="Search places, food, sights…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          enterKeyHint="search"
          onKeyDown={(e) => e.key === 'Enter' && onSearch(q)}
        />
        {q && (
          <button
            className="search__clear"
            onClick={() => {
              setQ('')
              setActive(null)
              onClear()
            }}
            aria-label="Clear"
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="search__results">
          {results.slice(0, 8).map((r) => (
            <button key={r.id} className="search__result" onMouseDown={() => onPick(r)}>
              <span className="search__result-name">{r.name}</span>
              {r.address && <span className="search__result-addr">{r.address}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="chips">
        {CATEGORIES.map((c) => (
          <button
            key={c.label}
            className={`chip ${active === c.label ? 'chip--on' : ''}`}
            onClick={() => {
              setActive(active === c.label ? null : c.label)
              if (active === c.label) onClear()
              else onCategory(c.q, c.label)
            }}
          >
            <Icon name={c.icon} size={15} />
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}
