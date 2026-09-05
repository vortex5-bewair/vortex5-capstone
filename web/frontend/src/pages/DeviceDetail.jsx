import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthContext } from '../hooks/useAuthContext'
import { useLiveReadings, findLiveReading } from '../hooks/useLiveReadings'
import { aqiCategory, CATEGORY_COLORS } from '../utils/airQualityGuidance'
import { ArrowLeft, Users, ChevronDown, ChevronUp, WifiOff, Power, Loader2 } from 'lucide-react'
import AqiDetails from '../components/AqiDetails'
import RecommendedActions from '../components/RecommendedActions'
import ShareDeviceModal from '../components/ShareDeviceModal'

// How long the live sparkline's window covers, client-side accumulated —
// the backend only keeps ~15s of history for smoothing, not a full minute.
const SPARKLINE_MS = 60 * 1000

// How long ago a reading can be and still be considered "live"
const STALE_MS = 2 * 60 * 1000 // 2 minutes

function timeAgo(dateStr) {
  if (!dateStr) return 'never'
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)  return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

const DeviceDetail = () => {
  const { deviceId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthContext()

  const [device,      setDevice]      = useState(null)
  const [reading,     setReading]     = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Recent readings table (diagnostic)
  const [recentReadings,     setRecentReadings]     = useState([])
  const [recentOpen,         setRecentOpen]         = useState(false)

  // Sharing state (admin only) — the modal itself owns the share/unshare
  // flow; this page just tracks whether it's open and the count for the badge.
  const [shareOpen,   setShareOpen]   = useState(false)
  const [sharedCount, setSharedCount] = useState(0)

  // Device controls (admin only) — reset + power, same endpoints Device
  // Management uses, surfaced here too so an admin doesn't have to leave
  // the live view to act on the device they're looking at.
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [resetting,        setResetting]        = useState(false)
  const [powerLoading,     setPowerLoading]      = useState(false)
  // Forgetting Wi-Fi is fire-and-forget over MQTT — there's no signal for
  // when the device actually finishes rebooting. Rather than guess with a
  // timer, remember when the command was confirmed and treat any reading
  // older than that moment as stale/gone — the page falls through to its
  // existing "no data" state immediately and only shows numbers again once
  // a genuinely new reading proves the device is back.
  const [resetAt, setResetAt] = useState(null)

  // ---------- Live reading (2s, in-memory, separate from the stored/reported
  // poll below) — mounted once at the page level, per useLiveReadings' own
  // contract, even though this page only ever shows one device. ----------
  const { data: liveData } = useLiveReadings()
  const live = findLiveReading(liveData, deviceId)

  // Client-side sparkline: the backend only keeps ~15s of window for
  // smoothing, so the ~60s history shown here is accumulated from what this
  // page has already polled, not fetched as history.
  const [sparkline, setSparkline] = useState([])
  useEffect(() => {
    if (!live?.available || live.receivedAt == null) return
    setSparkline((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.t === live.receivedAt) return prev // same frame, no new point
      const next = [...prev, { t: live.receivedAt, value: live.aqiInstant }]
      const cutoff = Date.now() - SPARKLINE_MS
      return next.filter((p) => new Date(p.t).getTime() >= cutoff)
    })
  }, [live?.receivedAt, live?.available, live?.aqiInstant])

  // ---------- Fetch device + latest AQI ----------
  const fetchData = useCallback(async (isInitial = false) => {
    if (!user) return
    try {
      const [devRes, aqiRes] = await Promise.all([
        fetch('/api/device',      { headers: { Authorization: `Bearer ${user.token}` } }),
        fetch('/api/aqi/latest',  { headers: { Authorization: `Bearer ${user.token}` } }),
      ])
      if (devRes.ok) {
        const devices = await devRes.json()
        setDevice(devices.find(x => x.deviceId === deviceId) || null)
      }
      if (aqiRes.ok) {
        const readings = await aqiRes.json()
        setReading(readings.find(x => x.deviceId === deviceId) || null)
      }
      setLastUpdated(new Date())
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [user, deviceId])

  useEffect(() => {
    fetchData(true)
    const iv = setInterval(() => fetchData(false), 10000)
    return () => clearInterval(iv)
  }, [fetchData])

  // ---------- Reset ----------
  const confirmReset = async () => {
    setResetting(true)
    try {
      const res = await fetch(`/api/device/${deviceId}/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` }
      })
      if (res.ok) setResetAt(new Date())
    } finally {
      setResetting(false)
      setResetConfirmOpen(false)
    }
  }

  // ---------- Power ----------
  const togglePower = async () => {
    setPowerLoading(true)
    try {
      const res = await fetch(`/api/device/${deviceId}/power`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ on: !device.enabled })
      })
      if (res.ok) await fetchData()
    } finally {
      setPowerLoading(false)
    }
  }

  // ---------- Fetch recent readings (diagnostic table) ----------
  const fetchRecent = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(`/api/aqi/device/${deviceId}?limit=20`, {
        headers: { Authorization: `Bearer ${user.token}` }
      })
      if (res.ok) setRecentReadings(await res.json())
    } catch (err) { console.error('recent readings:', err) }
  }, [user, deviceId])

  useEffect(() => {
    fetchRecent()
    const iv = setInterval(fetchRecent, 15000)
    return () => clearInterval(iv)
  }, [fetchRecent])

  // ---------- Render guards ----------
  if (loading) return <div className="dash-page"><p>Loading...</p></div>

  if (!device) {
    return (
      <div className="dash-page">
        <button className="dash-back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={18} /> Back
        </button>
        <p style={{ marginTop: 16 }}>Device not found, or you don't have access to it.</p>
      </div>
    )
  }

  // A reading from before the last "Forget Wi-Fi" isn't trustworthy — treat
  // it as if it doesn't exist until a genuinely new one arrives.
  const effectiveReading =
    resetAt && reading && new Date(reading.createdAt) < resetAt ? null : reading

  // Determine freshness of the last reading
  const lastReadingAt = effectiveReading?.createdAt
  const isStale = !lastReadingAt || (Date.now() - new Date(lastReadingAt).getTime()) > STALE_MS
  const isOnline = device.status === 'online' && !isStale

  // Always show last known data — just mark it visually if stale
  const displayReading = effectiveReading || null

  return (
    <div className="dash-page">
      <button className="dash-back-btn" onClick={() => navigate('/')}>
        <ArrowLeft size={18} /> Back to devices
      </button>

      {/* ── Header ── */}
      <div className="dash-header" style={{ marginTop: 16 }}>
        <div>
          <h1 className="dash-title">{device.name}</h1>
          <p className="dash-subtitle">
            {device.room}
            {isStale && (
              <span style={{
                marginLeft: 12, padding: '3px 10px',
                background: '#fef3c7', color: '#d97706',
                borderRadius: 999, fontSize: 12, fontWeight: 700,
              }}>
                {lastReadingAt ? `Last reading ${timeAgo(lastReadingAt)}` : 'No data yet'}
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user?.role === 'admin' && (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setResetConfirmOpen(true)}
                title="Forget Wi-Fi"
              >
                <WifiOff size={15} />
                Forget Wi-Fi
              </button>

              <button
                className="btn btn-secondary"
                onClick={togglePower}
                disabled={powerLoading}
                title={device.enabled ? 'Turn off' : 'Turn on'}
              >
                {powerLoading ? <Loader2 size={15} className="share-spinner" /> : <Power size={15} />}
                {device.enabled ? 'Turn Off' : 'Turn On'}
              </button>

              <button
                className="btn btn-secondary share-header-btn"
                onClick={() => setShareOpen(true)}
              >
                <Users size={15} />
                Share
                {sharedCount > 0 && (
                  <span className="share-header-count">{sharedCount}</span>
                )}
              </button>
            </>
          )}

          {lastUpdated && (
            <div className="dash-live">
              <span
                className="dash-live-dot"
                style={!isOnline ? { background: '#94a3b8', animation: 'none', boxShadow: 'none' } : undefined}
              />
              {isOnline ? 'Live · ' : 'Paused · '}
              Updated {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* ── Live (2s, in-memory) — separate figure from the stored/reported
          one below; the raw instant value on purpose, jitter included, since
          proving the sensor is reading right now is the point here. ── */}
      <LiveReadingCard live={live} sparkline={sparkline} />

      {/* ── Data (always shown; stale readings remain visible) ── */}
      <AqiDetails
        aqi={displayReading || {
          Aqi: null, Temperature: null, Humidity: null,
          PM1: null, PM25: null, PM10: null,
          TVOC: null, CO2: null, Formaldehyde: null,
        }}
      />

      {isOnline && <RecommendedActions reading={displayReading} />}

      {!isOnline && lastReadingAt && (
        <div className="dash-empty" style={{ marginTop: 16, borderColor: 'var(--color-warning)', color: 'var(--color-warning-strong)', background: 'var(--color-warning-soft)' }}>
          Showing last known reading from {new Date(lastReadingAt).toLocaleString()}.
          Live data will resume when the device reconnects.
        </div>
      )}

      {/* ── Recent Readings (diagnostic) ── */}
      <div className="recent-readings-section">
        <button
          className="recent-readings-toggle"
          onClick={() => setRecentOpen(o => !o)}
        >
          <span>Recent Readings</span>
          <span className="recent-readings-meta">
            {recentReadings.length > 0
              ? `${recentReadings.length} records · last ${timeAgo(recentReadings[0]?.createdAt)}`
              : 'No records yet'}
          </span>
          {recentOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {recentOpen && (
          <div className="recent-readings-body">
            {recentReadings.length === 0 ? (
              <p className="recent-readings-empty">
                No readings recorded yet. Check that the device is connected to MQTT.
              </p>
            ) : (
              <div className="recent-readings-scroll">
                <table className="recent-readings-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>AQI</th>
                      <th>PM2.5</th>
                      <th>PM10</th>
                      <th>CO₂</th>
                      <th>TVOC</th>
                      <th>HCHO</th>
                      <th>Temp</th>
                      <th>Humidity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentReadings.map((r, i) => {
                      // Highlight row if values are identical to the one above it
                      const prev = recentReadings[i - 1]
                      const frozen = prev &&
                        r.PM25 === prev.PM25 &&
                        r.CO2  === prev.CO2  &&
                        r.Temperature === prev.Temperature
                      return (
                        <tr key={r._id} className={frozen ? 'reading-frozen' : ''}>
                          <td className="reading-time">
                            {new Date(r.createdAt).toLocaleTimeString()}
                          </td>
                          <td>{r.Aqi ?? '—'}</td>
                          <td>{r.PM25 ?? '—'}</td>
                          <td>{r.PM10 ?? '—'}</td>
                          <td>{r.CO2 ?? '—'}</td>
                          <td>{r.TVOC ?? '—'}</td>
                          <td>{r.Formaldehyde ?? '—'}</td>
                          <td>{r.Temperature != null ? r.Temperature.toFixed(1) : '—'}</td>
                          <td>{r.Humidity != null ? r.Humidity.toFixed(1) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="recent-readings-hint">
              Rows highlighted in yellow have the same PM2.5, CO₂ and Temperature as the row above — possible frozen/repeated sensor data.
            </p>
          </div>
        )}
      </div>

      {/* ══ Forget Wi-Fi Confirm Modal ══ */}
      {resetConfirmOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Forget Wi-Fi?</h3>
            </div>
            <div className="modal-body">
              <p>Erase the saved Wi-Fi password on <strong>{device.name}</strong>?</p>
              <p className="modal-warning">
                It will take the device offline and it will need to be re-provisioned
                with a network before it reports data again.
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setResetConfirmOpen(false)} disabled={resetting}>
                Cancel
              </button>
              <button className="btn btn-warning" onClick={confirmReset} disabled={resetting}>
                {resetting ? 'Sending...' : 'Forget Wi-Fi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Share Modal ══ */}
      {shareOpen && (
        <ShareDeviceModal
          deviceId={deviceId}
          deviceName={device.name}
          deviceRoom={device.room}
          token={user.token}
          onClose={() => setShareOpen(false)}
          onAccessChange={setSharedCount}
        />
      )}
    </div>
  )
}

// Its own card, deliberately separate from AqiDetails below — two AQI
// figures that disagree (by design: one is a single frame, the other a
// 12-hour NowCast) need to look like two different things, not two numbers
// competing inside one component.
const LiveReadingCard = ({ live, sparkline }) => {
  const available = live?.available
  const stale = live?.stale
  const category = available ? aqiCategory(live.aqiInstant) : null
  const color = category ? CATEGORY_COLORS[category] : '#94a3b8'
  const ageS = available ? Math.round((live.ageMs ?? 0) / 1000) : null

  const statusText = !available
    ? 'No live data yet'
    : stale
      ? 'Reconnecting…'
      : `Live · ${ageS}s ago`

  let points = null
  if (sparkline.length > 1) {
    const vals = sparkline.map((p) => p.value)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const range = max - min || 1
    const w = 120
    const h = 32
    points = sparkline
      .map((p, i) => {
        const x = (i / (sparkline.length - 1)) * w
        const y = h - ((p.value - min) / range) * h
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }

  return (
    <div className="dash-section live-reading-card">
      <div className="live-reading-head">
        <span className={`live-reading-dot ${available && !stale ? 'live-reading-dot-active' : 'live-reading-dot-idle'}`} />
        <span className="live-reading-status">{statusText}</span>
      </div>
      <div className="live-reading-body">
        <div>
          <div className="live-reading-number" style={{ color }}>
            {available ? live.aqiInstant : '—'}
          </div>
          <div className="live-reading-category" style={{ color }}>
            {category || (available ? 'No data' : ' ')}
          </div>
        </div>
        {points && (
          <svg className="live-reading-sparkline" viewBox="0 0 120 32" preserveAspectRatio="none">
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" />
          </svg>
        )}
      </div>
    </div>
  )
}

export default DeviceDetail
