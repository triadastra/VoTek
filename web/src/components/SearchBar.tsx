import { useEffect, useRef, useState } from 'react'
import type { Place } from '../map/types'

const CATEGORIES = [
  { label: 'Photo spots', q: '__photospots__', icon: '📸' },
  { label: 'Coffee', q: 'coffee', icon: '☕' },
  { label: 'Food', q: 'restaurant', icon: '🍽️' },
  { label: 'Hotels', q: 'hotel', icon: '🛏️' },
  { label: 'Museums', q: 'museum', icon: '🏛️' },
  { label: 'Parks', q: 'park', icon: '🌳' },
  { label: 'Bars', q: 'bar', icon: '🍸' },
]

export function SearchBar({
  results,
  onSearch,
  onCategory,
  onPick,
  onClear,
  mode,
}: {
  results: Place[]
  onSearch: (q: string) => void
  onCategory: (q: string, label: string) => void
  onPick: (p: Place) => void
  onClear: () => void
  mode: 'live' | 'mock' | null
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
        <span className="search__icon">🔍</span>
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
            ✕
          </button>
        )}
        {mode && <span className={`search__mode ${mode}`}>{mode === 'live' ? 'AI live' : 'demo'}</span>}
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
            <span>{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}
