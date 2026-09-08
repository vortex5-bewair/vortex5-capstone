import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../hooks/useAuthContext'
import { useCachedFetch } from '../hooks/useCachedFetch'
import { Bell, AlertTriangle, History } from 'lucide-react'

const FIELD_LABELS = {
  Aqi: 'AQI',
  PM25: 'PM 2.5',
  PM10: 'PM 10',
  CO2: 'CO₂',
  TVOC: 'TVOC',
  Formaldehyde: 'HCHO',
}

// One reused formatter instead of `new Date(...).toLocaleString()` per row —
// that constructs a fresh Intl.DateTimeFormat internally every single call,
// which is the more expensive part of the operation, and the history list
// alone can be dozens of rows.
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const fmt = (date) => timeFormatter.format(new Date(date))

const AlertsAndNotifications = () => {
  const { user } = useAuthContext()
  const navigate = useNavigate()

  const [tab, setTab] = useState('current') // 'current' | 'history'

  const { data: currentData, loading: curLoading, error: curError } = useCachedFetch(
    user ? '/api/alerts/current' : null, user?.token, { pollInterval: 15000 }
  )
  // The 7-day history payload is the larger of the two, and only the
  // "History" tab ever shows it — fetching it unconditionally on mount used
  // to pull and parse it even for someone who never leaves the default
  // "Current" tab. `url` only becomes real once the tab is opened; the
  // module-level cache in useCachedFetch means switching back doesn't
  // re-fetch what's already been loaded.
  const { data: historyData, error: historyError } = useCachedFetch(
    tab === 'history' && user ? '/api/alerts/history?days=7' : null, user?.token, { pollInterval: 15000 }
  )

  const current = currentData || []
  const history = historyData || []

  // Only block on the very first visit while we have nothing to show.
  if (curLoading && !currentData) return <div className="dash-page dash-page-loading"><p>Loading alerts...</p></div>

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Alerts & Notifications</h1>
          <p className="dash-subtitle">
            Sensor readings that crossed your configured thresholds.
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="alerts-tabs">
        <button
          className={`alerts-tab ${tab === 'current' ? 'active' : ''}`}
          onClick={() => setTab('current')}
        >
          <Bell size={16} />
          Current
          {current.length > 0 && <span className="alerts-tab-badge">{current.length}</span>}
        </button>
        <button
          className={`alerts-tab ${tab === 'history' ? 'active' : ''}`}
          onClick={() => setTab('history')}
        >
          <History size={16} />
          History (last 7 days)
          <span className="alerts-tab-badge alerts-tab-badge-muted">{history.length}</span>
        </button>
      </div>

      {tab === 'current' && (
        <div className="dash-section">
          <div className="dash-section-head">
            <h2>Active Now</h2>
            <span className="dash-section-count">
              {current.length} {current.length === 1 ? 'alert' : 'alerts'}
            </span>
          </div>

          {current.length === 0 ? (
            curError ? (
              <div className="dash-empty" style={{ color: '#dc2626' }}>
                Could not load current alerts: {curError}
              </div>
            ) : (
              <div className="dash-empty dash-empty-ok">
                <span className="dash-ok-icon">✓</span>
                No active alerts. All readings are within thresholds.
              </div>
            )
          ) : (
            <div className="dash-alert-list">
              {current.map((a) => (
                <div
                  key={`${a.deviceId}-${a.field}-${a.at}`}
                  className={`dash-alert dash-alert-${a.severity} dash-alert-clickable`}
                  onClick={() => navigate(`/device/${a.deviceId}`)}
                >
                  <div className="dash-alert-head">
                    <strong>{a.name}</strong>
                    <span className="dash-alert-room">{a.room}</span>
                  </div>
                  <div className="dash-alert-detail">
                    <span className="dash-alert-field">{FIELD_LABELS[a.field] || a.field}</span>
                    <span className="dash-alert-value">
                      {a.value} <span className="dash-alert-limit">/ {a.limit}</span>
                    </span>
                  </div>
                  <div className="alerts-time">{fmt(a.at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="dash-section">
          <div className="dash-section-head">
            <h2>Alert History</h2>
            <span className="dash-section-count">
              {history.length} {history.length === 1 ? 'event' : 'events'} · last 7 days
            </span>
          </div>

          {history.length === 0 ? (
            historyError ? (
              <div className="dash-empty" style={{ color: '#dc2626' }}>
                Could not load alert history: {historyError}
              </div>
            ) : (
              <div className="dash-empty">
                No alerts in the last 7 days. Your air quality has stayed within thresholds.
              </div>
            )
          ) : (
            <div className="alerts-history-list">
              {history.map((a) => (
                <div
                  key={`${a.deviceId}-${a.field}-${a.at}`}
                  className="alerts-history-row"
                  onClick={() => navigate(`/device/${a.deviceId}`)}
                >
                  <div className="alerts-history-icon">
                    <AlertTriangle
                      size={20}
                      color={a.severity === 'high' ? '#dc2626' : '#f59e0b'}
                    />
                  </div>
                  <div className="alerts-history-content">
                    <div className="alerts-history-title">
                      <strong>{a.name}</strong>
                      <span className="dash-alert-room">{a.room}</span>
                    </div>
                    <div className="alerts-history-body">
                      <span className="dash-alert-field">{FIELD_LABELS[a.field] || a.field}</span>
                      {' reached '}
                      <span className="dash-alert-value">{a.value}</span>
                      {' (threshold '}{a.limit}{')'}
                    </div>
                    <div className="alerts-time">{fmt(a.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AlertsAndNotifications
