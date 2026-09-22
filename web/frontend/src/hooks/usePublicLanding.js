import { useEffect, useState } from 'react'

const POLL_MS = 10 * 1000

/**
 * The logged-out landing page's live snapshot — GET /api/public/landing.
 *
 * Deliberately separate from useLiveReadings: that hook is an authenticated SSE
 * stream, and an open, unauthenticated stream would be a cheap way to exhaust
 * the server's stream slots. This one polls a small, sanitized, server-cached
 * payload instead, pauses while the tab is hidden, and keeps the last good
 * snapshot on screen if a poll fails (`error` just flags that it is stale).
 *
 * Returns { data, loaded, error }:
 *   data   — the payload, or null before the first success
 *   loaded — true once the first request has settled (success or not)
 *   error  — true when the latest request failed
 */
export function usePublicLanding() {
  const [state, setState] = useState({ data: null, loaded: false, error: false })

  useEffect(() => {
    let cancelled = false
    let timer = null
    let controller = null

    const load = async () => {
      controller?.abort()
      controller = new AbortController()
      try {
        const res = await fetch('/api/public/landing', { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) setState({ data: json, loaded: true, error: false })
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return
        setState((prev) => ({ ...prev, loaded: true, error: true }))
      }
    }

    const tick = async () => {
      if (!document.hidden) await load()
      if (!cancelled) timer = setTimeout(tick, POLL_MS)
    }

    // Catch up immediately when the tab becomes visible again.
    const onVisibility = () => {
      if (document.hidden || cancelled) return
      clearTimeout(timer)
      tick()
    }

    tick()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return state
}
