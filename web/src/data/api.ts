import type { Bounds, Place } from '../map/types'

// Thin client for the broker's search/reverse endpoints.

export async function searchPlaces(q: string, bounds?: Bounds, bounded = false): Promise<Place[]> {
  const params = new URLSearchParams({ q })
  if (bounds) {
    params.set('bbox', `${bounds.sw.lng},${bounds.sw.lat},${bounds.ne.lng},${bounds.ne.lat}`)
    if (bounded) params.set('bounded', '1')
  }
  try {
    const res = await fetch(`/api/search?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []) as Place[]
  } catch {
    return []
  }
}

export interface HealthInfo {
  ok: boolean
  mode: 'live' | 'mock'
  model: string
}

export async function getHealth(): Promise<HealthInfo | null> {
  try {
    const res = await fetch('/api/health')
    if (!res.ok) return null
    return (await res.json()) as HealthInfo
  } catch {
    return null
  }
}
