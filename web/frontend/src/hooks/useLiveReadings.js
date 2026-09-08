import { useEffect, useMemo, useState } from 'react'
import { useAuthContext } from './useAuthContext'

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000

// How long to let the SSE connection attempt run before also starting the
// polling fallback. On a normal connection the stream's response headers
// come back well inside this window, so the fallback timer gets cleared and
// /api/aqi/live is never hit at all -- it used to fire unconditionally on
// every single mount "just in case," even when the stream was about to
// succeed anyway.
const FALLBACK_GRACE_MS = 800

// How often stale/age state re-publishes with no new data (see the ticker
// below). Any value keeps the "Xs ago" labels moving; it is a trade
// between how live that feels and how much work every mounted device card
// redoes -- 1s made the whole grid recompute every device's staleness and
// category once a second, work that scales with device count for no
// visible benefit between ticks.
const FRESHNESS_TICK_MS = 3000

// Matches the backend's default AQI_LIVE_STALE_SEC. A display-only heuristic
// (when to say "Reconnecting..." instead of a climbing age), not a data
// threshold, so it's fine as its own constant here rather than served state.
const LIVE_STALE_MS = 15000

// The server stamps `ageMs`/`stale` once, when a payload is shaped — if no
// further payload arrives (a dropped connection, a slow reconnect), that
// snapshot would otherwise sit frozen forever and keep reading as current.
// Recomputing both from the payload's own `receivedAt` against the current
// clock, on every tick, keeps the displayed age counting up — and `stale`
// flipping on time alone — even with no new data.
function withLiveFreshness(reading) {
  if (!reading.available) return reading
  const ageMs = Date.now() - new Date(reading.receivedAt).getTime()
  return { ...reading, ageMs, stale: ageMs > LIVE_STALE_MS }
}

/**
 * Consumes GET /api/aqi/stream — Server-Sent Events pushed on every decoded
 * MQTT frame, not a poll interval. Browsers' EventSource can't set an
 * Authorization header, so this reads the stream manually via fetch() +
 * ReadableStream, and handles reconnection (with backoff) itself instead of
 * relying on EventSource's automatic retry.
 *
 * Falls back to polling GET /api/aqi/live (single-shot) whenever the stream
 * can't be established or while backing off after a drop, so the UI never
 * goes blank just because a connection hiccuped. Only ever replaces `data`
 * wholesale on a successful update (never resets it in between), so the last
 * good value holds steady with no skeleton flash or layout jump.
 *
 * Mount this ONCE per page, not inside a repeated card component — each call
 * opens its own independent connection. Build a lookup from the returned
 * array and pass each device's own entry down as a prop instead.
 *
 * @param {object} opts
 * @param {number} opts.fallbackPollMs - Poll interval used ONLY while the
 *   stream is down. Has no effect on stream cadence, which is push-based.
 */
export function useLiveReadings({ fallbackPollMs = 5000 } = {}) {
  const { user } = useAuthContext()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return undefined

    let cancelled = false
    let abortController = null
    let reconnectTimer = null
    let fallbackTimer = null
    let fallbackGraceTimer = null
    let reconnectDelay = RECONNECT_BASE_MS
    const byDevice = new Map()

    const publish = () => {
      if (!cancelled) setData(Array.from(byDevice.values(), withLiveFreshness))
    }

    // Re-publish every second even with no new data, so a reading's age keeps
    // counting up — and flips to stale — purely from time passing.
    const freshnessTicker = setInterval(publish, FRESHNESS_TICK_MS)

    const stopFallback = () => {
      if (fallbackTimer) clearInterval(fallbackTimer)
      fallbackTimer = null
    }

    const startFallback = () => {
      if (fallbackTimer) return
      const poll = async () => {
        try {
          const res = await fetch('/api/aqi/live', {
            headers: { Authorization: `Bearer ${user.token}` },
          })
          const json = await res.json()
          if (!res.ok) throw new Error(json.error || 'Failed to load live readings')
          if (cancelled) return
          byDevice.clear()
          for (const r of json) byDevice.set(r.deviceId, r)
          publish()
          setError('')
        } catch (err) {
          if (!cancelled) setError(err.message)
        }
      }
      poll()
      fallbackTimer = setInterval(poll, fallbackPollMs)
    }

    const scheduleReconnect = () => {
      if (cancelled || document.hidden) return
      const delay = reconnectDelay
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
      reconnectTimer = setTimeout(connect, delay)
    }

    const connect = async () => {
      if (cancelled || document.hidden) return
      fallbackGraceTimer = setTimeout(startFallback, FALLBACK_GRACE_MS)

      abortController = new AbortController()
      try {
        const res = await fetch('/api/aqi/stream', {
          headers: { Authorization: `Bearer ${user.token}` },
          signal: abortController.signal,
        })
        if (!res.ok || !res.body) throw new Error(`Stream failed (${res.status})`)

        clearTimeout(fallbackGraceTimer)
        reconnectDelay = RECONNECT_BASE_MS // connected — reset backoff
        stopFallback()
        setError('')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let sepIndex
          while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sepIndex)
            buffer = buffer.slice(sepIndex + 2)

            const dataLines = rawEvent
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
            if (dataLines.length === 0) continue // heartbeat comment or blank

            const msg = JSON.parse(dataLines.join(''))
            if (msg.type === 'snapshot') {
              byDevice.clear()
              for (const r of msg.readings) byDevice.set(r.deviceId, r)
            } else if (msg.type === 'update') {
              byDevice.set(msg.reading.deviceId, msg.reading)
            }
            publish()
          }
        }
        throw new Error('Live stream closed') // falls into reconnect below
      } catch (err) {
        clearTimeout(fallbackGraceTimer)
        if (cancelled || err.name === 'AbortError') return
        startFallback()
        scheduleReconnect()
      }
    }

    const onVisibilityChange = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (document.hidden) {
        abortController?.abort()
        stopFallback()
        clearTimeout(fallbackGraceTimer)
      } else {
        reconnectDelay = RECONNECT_BASE_MS
        connect()
      }
    }

    if (!document.hidden) connect()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      abortController?.abort()
      stopFallback()
      clearInterval(freshnessTicker)
      clearTimeout(fallbackGraceTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [user, fallbackPollMs])

  // A per-device Map, rebuilt only when `data` itself changes — not on every
  // render. Callers that look up one device per row (Dashboard, My Devices,
  // Device Detail) used to do a linear `.find()` over the whole array once
  // per device, per render: O(devices) work repeated for every device, i.e.
  // O(devices²) for the page. `.get()` here is O(1).
  const dataByDevice = useMemo(() => {
    if (!data) return null
    const map = new Map()
    for (const r of data) map.set(r.deviceId, r)
    return map
  }, [data])

  return { data, dataByDevice, error }
}

/** Find one device's entry in the Map returned by useLiveReadings as `dataByDevice`. */
export function findLiveReading(dataByDevice, deviceId) {
  return dataByDevice?.get(deviceId) || null
}
