import { useEffect, useRef, useState } from 'react'
import type { LngLat } from '../map/types'

const KEY = 'votek.trail'
const SAMPLE_MS = 3000 // plot a point every 3 seconds
const MIN_MOVE_M = 2.5 // ignore jitter while standing still

function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function load(): LngLat[] {
  try {
    const s = localStorage.getItem(KEY)
    const arr = s ? JSON.parse(s) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export interface Trail {
  points: LngLat[]
  distanceM: number
  clear: () => void
}

/**
 * Breadcrumb trail. While `active`, records the current position every 3s (skipping tiny
 * jitter) and persists to localStorage so the trail survives a reload.
 */
export function useTrail(active: boolean, current: LngLat | null): Trail {
  const [points, setPoints] = useState<LngLat[]>(load)
  const curRef = useRef<LngLat | null>(current)
  curRef.current = current

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      const c = curRef.current
      if (!c) return
      setPoints((prev) => {
        const last = prev[prev.length - 1]
        if (last && haversineM(last, c) < MIN_MOVE_M) return prev
        return [...prev, c]
      })
    }, SAMPLE_MS)
    return () => window.clearInterval(id)
  }, [active])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(points))
    } catch {
      /* storage full / unavailable — trail still works in memory */
    }
  }, [points])

  const distanceM = points.reduce((sum, p, i) => (i ? sum + haversineM(points[i - 1], p) : 0), 0)
  const clear = () => setPoints([])

  return { points, distanceM, clear }
}
