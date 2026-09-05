import { useEffect, useRef, useState } from 'react'
import { useAuthContext } from './useAuthContext'

/**
 * Polls GET /api/aqi/live on a short interval — the in-memory, per-frame
 * reading, never the database. Pauses while the tab is hidden and resumes on
 * focus, and only ever replaces `data` wholesale on a successful poll (never
 * resets it in between), so the last good value holds steady with no
 * skeleton flash or layout jump between refreshes.
 *
 * Mount this ONCE per page, not inside a repeated card component — each call
 * runs its own independent interval, so calling it once per device card would
 * poll once per card instead of once per page. Build a lookup from the
 * returned array and pass each device's own entry down as a prop instead.
 *
 * @param {object} opts
 * @param {number} opts.intervalMs - Poll interval. DeviceDetail wants this
 *   fast (2s default); a kiosk should pass a slower one (e.g. 5000) since it
 *   doesn't need — and shouldn't visually reflect — the same cadence.
 */
export function useLiveReadings({ intervalMs = 2000 } = {}) {
  const { user } = useAuthContext()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (!user) return undefined

    let timer = null

    const poll = async () => {
      try {
        const res = await fetch('/api/aqi/live', {
          headers: { Authorization: `Bearer ${user.token}` },
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load live readings')
        if (mountedRef.current) {
          setData(json)
          setError('')
        }
      } catch (err) {
        if (mountedRef.current) setError(err.message)
      }
    }

    const start = () => {
      poll()
      timer = setInterval(poll, intervalMs)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const onVisibilityChange = () => {
      if (document.hidden) stop()
      else start()
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      mountedRef.current = false
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [user, intervalMs])

  return { data, error }
}

/** Find one device's entry in the array returned by useLiveReadings. */
export function findLiveReading(data, deviceId) {
  return data?.find((d) => d.deviceId === deviceId) || null
}
