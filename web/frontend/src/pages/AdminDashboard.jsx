import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../hooks/useAuthContext'
import { useLiveReadings, findLiveReading } from '../hooks/useLiveReadings'
import LivenessIndicator from '../components/LivenessIndicator'
import { Activity, AlertTriangle, Cpu, Users, X } from 'lucide-react'
import { CATEGORY_COLORS } from '../utils/airQualityGuidance'

// Handles Enter/Space activation for elements that act like buttons but
// aren't real <button>s (cards, rows) — keeps them reachable by keyboard.
const activateOnKey = (onActivate) => (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    onActivate()
  }
}

const STATUS_LABELS = {
  active:    { label: 'Active',   color: '#16a34a', bg: '#dcfce7' },
  available: { label: 'No Data',  color: '#d97706', bg: '#fef3c7' },
  offline:   { label: 'Inactive', color: '#dc2626', bg: '#fee2e2' },
}

const AdminDashboard = () => {
  const { user } = useAuthContext()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  // Which modal (if any) is open
  const [modal, setModal] = useState(null) // 'devices' | 'alerts' | null

  // Liveness only (no live figure on this scanning screen) — mounted once
  // here at the page level, never inside a device card.
  const { data: liveList } = useLiveReadings()

  useEffect(() => {
    if (!user) return

    const fetchData = async (isInitial = false) => {
      if (isInitial) setLoading(true)
      try {
        const res = await fetch('/api/dashboard/summary', {
          headers: { Authorization: `Bearer ${user.token}` }
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load dashboard')
        setData(json)
        setLastUpdated(new Date())
        setError('')
      } catch (err) {
        setError(err.message)
      } finally {
        if (isInitial) setLoading(false)
      }
    }

    fetchData(true)
    const interval = setInterval(() => fetchData(false), 10000)
    return () => clearInterval(interval)
  }, [user])

  if (loading) {
    return <div className="dash-page"><p>Loading dashboard...</p></div>
  }
  // Only take over the whole page when there's no data to fall back on
  // (first-load failure). Once real data has loaded, a later transient
  // poll failure shouldn't wipe out an otherwise-working dashboard.
  if (error && !data) {
    return <div className="dash-page"><p style={{ color: 'red' }}>{error}</p></div>
  }
  if (!data) return null

  const { kpis, devices, alerts } = data

  return (
    <div className="dash-page">
      {error && (
        <p style={{ color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          {error} — showing last loaded data.
        </p>
      )}
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">
            Welcome back, {user.firstName}. Here's what's happening with your sensors.
          </p>
        </div>
        {lastUpdated && (
          <div className="dash-live">
            <span className="dash-live-dot" />
            Live · Updated {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* KPI Strip */}
      <div className="dash-kpis">
        <KpiTile
          icon={<Cpu size={20} />}
          label="Devices Online"
          value={`${kpis.onlineDevices} / ${kpis.totalDevices}`}
          accent={kpis.offlineDevices > 0 ? '#dc2626' : '#16a34a'}
          onClick={() => setModal('devices')}
        />
        <KpiTile
          icon={<Users size={20} />}
          label="Users"
          value={kpis.userCount}
          accent="#2563eb"
          onClick={() => navigate('/usermanagement')}
        />
        <KpiTile
          icon={<AlertTriangle size={20} />}
          label="Active Alerts"
          value={kpis.activeAlerts}
          accent={kpis.activeAlerts > 0 ? '#dc2626' : '#94a3b8'}
          onClick={() => setModal('alerts')}
        />
        <KpiTile
          icon={<Activity size={20} />}
          label="Average AQI"
          value={kpis.avgAqi != null ? kpis.avgAqi : '--'}
          sub={`${kpis.avgCategory || 'No data'} · 12-hr average`}
          subTitle="NowCast, DENR AO 2020-14"
          accent={kpis.avgCategory ? (CATEGORY_COLORS[kpis.avgCategory] || '#94a3b8') : '#94a3b8'}
        />
      </div>

      {/* Devices section (full width — alerts panel is now in a modal) */}
      <div className="dash-section">
        <div className="dash-section-head">
          <h2>Devices</h2>
          <span className="dash-section-count">{devices.length} total</span>
        </div>

        {devices.length === 0 ? (
          <div className="dash-empty">
            No devices yet. Use the BewAir mobile app to provision a new sensor.
          </div>
        ) : (
          <div className="dash-device-grid">
            {devices.map(d => {
              const status = STATUS_LABELS[d.status] || STATUS_LABELS.offline
              const aqiColor = d.category
                ? CATEGORY_COLORS[d.category]
                : '#94a3b8'
              const live = findLiveReading(liveList, d.deviceId)
              return (
                <div
                  key={d.deviceId}
                  className="dash-device-card dash-device-card-clickable"
                  onClick={() => navigate(`/device/${d.deviceId}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={activateOnKey(() => navigate(`/device/${d.deviceId}`))}
                >
                  <div className="dash-device-head">
                    <div>
                      <div className="dash-device-name">{d.name}</div>
                      <div className="dash-device-room">{d.room}</div>
                    </div>
                    <span
                      className="dash-status-pill"
                      style={{ background: status.bg, color: status.color }}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="dash-aqi-big" style={{ color: aqiColor }}>
                    {d.aqi != null ? d.aqi : '--'}
                  </div>
                  <div className="dash-aqi-label" style={{ color: aqiColor }} title="NowCast, DENR AO 2020-14">
                    {d.category || 'No data'} · 12-hr average
                  </div>
                  <LivenessIndicator live={live} />

                  <div className="dash-device-metrics">
                    <Metric label="PM2.5" value={d.pm25 != null ? `${d.pm25} µg/m³` : '--'} />
                    <Metric label="CO₂"   value={d.co2  != null ? `${d.co2} ppm` : '--'} />
                    <Metric label="Temp"  value={d.temp != null ? `${d.temp.toFixed(1)}°C` : '--'} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ============ Modals ============ */}
      {modal === 'devices' && (
        <DevicesModal devices={devices} onClose={() => setModal(null)} onSelect={(id) => {
          setModal(null)
          navigate(`/device/${id}`)
        }} />
      )}

      {modal === 'alerts' && (
        <AlertsModal alerts={alerts} onClose={() => setModal(null)} onSelect={(id) => {
          setModal(null)
          navigate(`/device/${id}`)
        }} />
      )}
    </div>
  )
}

// ============ Sub-components ============
const KpiTile = ({ icon, label, value, sub, subTitle, accent, onClick }) => (
  <div
    className={`dash-kpi ${onClick ? 'dash-kpi-clickable' : ''}`}
    style={{ borderTopColor: accent }}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? activateOnKey(onClick) : undefined}
  >
    <div className="dash-kpi-icon" style={{ color: accent }}>{icon}</div>
    <div className="dash-kpi-label">{label}</div>
    <div className="dash-kpi-value" style={{ color: accent }}>{value}</div>
    {sub && <div className="dash-kpi-sub" title={subTitle}>{sub}</div>}
  </div>
)

const Metric = ({ label, value }) => (
  <div className="dash-metric">
    <div className="dash-metric-label">{label}</div>
    <div className="dash-metric-value">{value}</div>
  </div>
)

const DevicesModal = ({ devices, onClose, onSelect }) => {
  const online = devices.filter(d => d.status === 'active' || d.status === 'available')
  const offline = devices.filter(d => d.status === 'offline')

  return (
    <ModalShell title="All Devices" onClose={onClose}>
      <div className="dash-modal-section">
        <div className="dash-modal-section-head">
          <span className="dash-modal-dot" style={{ background: '#16a34a' }} />
          Online ({online.length})
        </div>
        {online.length === 0 ? (
          <p className="dash-modal-empty">No devices online.</p>
        ) : (
          <div className="dash-modal-list">
            {online.map(d => (
              <DeviceRow key={d.deviceId} device={d} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>

      <div className="dash-modal-section">
        <div className="dash-modal-section-head">
          <span className="dash-modal-dot" style={{ background: '#dc2626' }} />
          Inactive ({offline.length})
        </div>
        {offline.length === 0 ? (
          <p className="dash-modal-empty">All devices are reporting.</p>
        ) : (
          <div className="dash-modal-list">
            {offline.map(d => (
              <DeviceRow key={d.deviceId} device={d} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  )
}

const DeviceRow = ({ device, onSelect }) => {
  const status = STATUS_LABELS[device.status] || STATUS_LABELS.offline
  return (
    <div
      className="dash-modal-row"
      onClick={() => onSelect(device.deviceId)}
      role="button"
      tabIndex={0}
      onKeyDown={activateOnKey(() => onSelect(device.deviceId))}
    >
      <div>
        <strong>{device.name}</strong>
        <div className="dash-modal-row-sub">{device.room} · {device.deviceId}</div>
      </div>
      <span className="dash-status-pill" style={{ background: status.bg, color: status.color }}>
        {status.label}
      </span>
    </div>
  )
}

const AlertsModal = ({ alerts, onClose, onSelect }) => {
  return (
    <ModalShell title="Active Alerts" onClose={onClose}>
      {alerts.length === 0 ? (
        <div className="dash-empty dash-empty-ok">
          <span className="dash-ok-icon">✓</span>
          All sensors within thresholds.
        </div>
      ) : (
        <div className="dash-alert-list">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`dash-alert dash-alert-${a.severity} dash-alert-clickable`}
              onClick={() => onSelect(a.deviceId)}
              role="button"
              tabIndex={0}
              onKeyDown={activateOnKey(() => onSelect(a.deviceId))}
            >
              <div className="dash-alert-head">
                <strong>{a.name}</strong>
                <span className="dash-alert-room">{a.room}</span>
              </div>
              <div className="dash-alert-detail">
                <span className="dash-alert-field">{labelFor(a.field)}</span>
                <span className="dash-alert-value">
                  {a.value} <span className="dash-alert-limit">/ {a.limit}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  )
}

const ModalShell = ({ title, onClose, children }) => (
  <div className="dash-modal-overlay" onClick={onClose}>
    <div className="dash-modal" onClick={(e) => e.stopPropagation()}>
      <div className="dash-modal-head">
        <h2>{title}</h2>
        <button className="dash-modal-close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="dash-modal-body">{children}</div>
    </div>
  </div>
)

const labelFor = (field) => ({
  Aqi:          'AQI',
  PM25:         'PM 2.5',
  PM10:         'PM 10',
  CO2:          'CO₂',
  TVOC:         'TVOC',
  Formaldehyde: 'HCHO',
}[field] || field)

export default AdminDashboard
