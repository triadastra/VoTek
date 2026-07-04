import type { Bounds, LngLat, Place } from '../map/types'

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

export interface RouteResult {
  mode: string
  distanceM: number
  durationS: number
  coords: LngLat[]
}

export async function getRoute(
  from: LngLat,
  to: LngLat,
  mode: 'foot' | 'bike' | 'car' = 'foot',
): Promise<RouteResult | null> {
  const params = new URLSearchParams({
    from: `${from.lng},${from.lat}`,
    to: `${to.lng},${to.lat}`,
    mode,
  })
  try {
    const res = await fetch(`/api/route?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    return (data.route ?? null) as RouteResult | null
  } catch {
    return null
  }
}

export interface ProviderInfo {
  id: 'gemini' | 'openai' | 'anthropic'
  label: string
  models: string[]
  live: boolean
}

export async function getProviders(): Promise<{ providers: ProviderInfo[]; default: string | null }> {
  try {
    const res = await fetch('/api/providers')
    if (!res.ok) return { providers: [], default: null }
    return await res.json()
  } catch {
    return { providers: [], default: null }
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
