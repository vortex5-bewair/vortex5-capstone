import { memo, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../hooks/useAuthContext'
import { useCachedFetch } from '../hooks/useCachedFetch'
import { useLiveReadings, findLiveReading } from '../hooks/useLiveReadings'
import { useTheme } from '../hooks/useTheme'
import LivenessIndicator from '../components/LivenessIndicator'
import { aqiCategory, textSafeCategoryColor } from '../utils/airQualityGuidance'

const STATUS_LABELS = {
  active:    { label: 'Active',   color: 'var(--color-success-strong)', bg: 'var(--color-success-soft)' },
  available: { label: 'No Data',  color: 'var(--color-warning-strong)', bg: 'var(--color-warning-soft)' },
  offline:   { label: 'Inactive', color: 'var(--color-danger-strong)',  bg: 'var(--color-danger-soft)' },
}

// How often the "is this device still online" clock advances. Reading the
// wall clock directly during render — even from inside a useMemo callback,
// which still runs as part of the render phase — makes the render
// non-deterministic; that's what a bare `Date.now()` inside this page's old
// device .map() tripped the react-hooks/purity rule on. Ticking a plain
// number in state from an interval, and only ever reading that state during
// render, keeps render pure while keeping "online" accurate to within one tick.
const ONLINE_CHECK_TICK_MS = 5000

// Everything about a card except its liveness badge — name, room, the AQI
// figure, category, status pill. These only change when `devices`/`readings`
// actually change (see the `rows` useMemo below), but without this boundary
// the whole card still re-rendered on every liveness tick from
// useLiveReadings, because `live` was just another prop on the same
// component. Splitting it out means that tick only touches
// <LivenessIndicator>, not the parts of the card that didn't change.
const DeviceCardBody = memo(function DeviceCardBody({ device, aqi, category, aqiColor, status }) {
  return (
    <>
      <div className="dash-device-head">
        <div>
          <div className="dash-device-name">{device.name}</div>
          <div className="dash-device-room">{device.room}</div>
        </div>
        <span
          className="dash-status-pill"
          style={{ background: status.bg, color: status.color }}
        >
          {status.label}
        </span>
      </div>

      <div className="dash-aqi-big" style={{ color: aqiColor }}>
        {aqi != null ? aqi : '--'}
      </div>
      <div className="dash-aqi-label" style={{ color: aqiColor }} title="NowCast, DENR AO 2020-14">
        {category || 'No data'} · 12-hr average
      </div>
    </>
  )
})

const StaffDeviceList = () => {
  const { user } = useAuthContext()
  const navigate = useNavigate()
  const { isDark } = useTheme()

  const { data: devices, loading: devLoading } = useCachedFetch(
    user ? '/api/device' : null, user?.token, { pollInterval: 10000 }
  )
  const { data: readingsList } = useCachedFetch(
    user ? '/api/aqi/latest' : null, user?.token, { pollInterval: 10000 }
  )
  // Liveness only (no live figure on this scanning screen) — mounted once
  // here at the page level, never inside a device card.
  const { dataByDevice: liveByDevice } = useLiveReadings()

  // Starts at 0 rather than Date.now(): a synchronous setState right in the
  // effect body (as opposed to inside a callback) triggers
  // react-hooks/set-state-in-effect, so the real value has to come from a
  // callback, not the effect setup itself. A zero-delay timeout gets it in
  // essentially immediately rather than waiting for the first interval tick.
  const [now, setNow] = useState(0)
  useEffect(() => {
    const initial = setTimeout(() => setNow(Date.now()), 0)
    const id = setInterval(() => setNow(Date.now()), ONLINE_CHECK_TICK_MS)
    return () => { clearTimeout(initial); clearInterval(id) }
  }, [])

  const readings = useMemo(() => {
    const list = readingsList || []
    return Object.fromEntries(list.map(r => [r.deviceId, r]))
  }, [readingsList])

  // One pass over the device list per relevant change (devices, readings, or
  // the clock tick), instead of recomputing status/category/colour inline in
  // JSX on every render — which used to include every liveness tick from
  // useLiveReadings, even though none of these values depend on liveness.
  const rows = useMemo(() => {
    return (devices || []).map(d => {
      const lastSeen = d.lastSeen ? new Date(d.lastSeen).getTime() : 0
      const isOnline = d.status === 'online' && (now - lastSeen) < 30 * 1000
      // Only use the reading if the device is online — stale data clears to "--"
      const r = isOnline ? readings[d.deviceId] : null
      const aqi = r?.Aqi
      const category = aqiCategory(aqi)
      const aqiColor = category ? textSafeCategoryColor(category, isDark) : 'var(--color-text-tertiary)'
      const statusKey = !isOnline ? 'offline' : (r ? 'active' : 'available')
      return { device: d, aqi, category, aqiColor, status: STATUS_LABELS[statusKey] }
    })
  }, [devices, readings, now, isDark])

  // Only show the loading screen on the very first visit, when there's no cached data.
  if (devLoading && !devices) return <div className="dash-page dash-page-loading"><p>Loading your devices...</p></div>

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">My Devices</h1>
          <p className="dash-subtitle">
            Welcome, {user.firstName}. Click a device to see live readings.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="dash-empty">
          You don't have any devices yet. Ask your admin to share a sensor with your account.
        </div>
      ) : (
        <div className="dash-device-grid">
          {rows.map(({ device: d, aqi, category, aqiColor, status }) => {
            const live = findLiveReading(liveByDevice, d.deviceId)

            return (
              <div
                key={d.deviceId}
                className="dash-device-card dash-device-card-clickable"
                onClick={() => navigate(`/device/${d.deviceId}`)}
              >
                <DeviceCardBody device={d} aqi={aqi} category={category} aqiColor={aqiColor} status={status} />
                <LivenessIndicator live={live} />

                <div className="dash-device-cta">View details →</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default StaffDeviceList
