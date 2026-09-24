import ReadingChips from './ReadingChips'
import AqiPill from './AqiPill'
import { CATEGORY_COLORS } from '../../utils/airQualityGuidance'
import { formatClock, formatDateTime } from '../../utils/landingFormat'

const OFFLINE_COLOR = '#94a3b8'

// The line under the room name, as separate parts (so it can wrap between them
// rather than mid-phrase), built only from fields the snapshot carries.
const rowSub = (d) => {
  const parts = []
  if (d.floor != null) parts.push(`Floor ${d.floor}`)
  if (!d.online) {
    parts.push(d.lastSeen ? `Offline · last seen ${formatDateTime(d.lastSeen)}` : 'Offline · not reporting yet')
  } else if (d.live) {
    parts.push(`Live · as of ${formatClock(d.readingAt)}`)
    if (d.average) parts.push(`12-hr avg ${d.average.aqi}`)
  } else {
    parts.push(d.readingAt ? `12-hour average · as of ${formatClock(d.readingAt)}` : '12-hour average')
  }
  return parts
}

// "Rooms at a glance": every REGISTERED device with its current readings, from
// GET /api/public/landing. Nothing here is typed in by hand — no room list, no
// student counts, no readings.
const RoomsAtAGlance = ({ data, loaded, error }) => {
  const devices = data?.devices ?? []
  const summary = data?.summary

  return (
    <>
      <div className="landing-rooms-head">
        <h2 className="landing-section-title">
          Rooms <em>at a glance</em>
        </h2>
        {summary && (
          <div className="landing-rooms-meta">
            {summary.onlineDevices} of {summary.totalDevices} sensors reporting
            {summary.onlineDevices > 0 ? ' · live' : ''}
          </div>
        )}
      </div>

      {!loaded ? (
        <ul className="landing-rooms" aria-hidden="true">
          {[0, 1, 2].map((i) => <li key={i} className="landing-room is-skeleton" />)}
        </ul>
      ) : devices.length === 0 ? (
        <div className="landing-rooms-empty" role="status">
          {error ? 'Room data is temporarily unavailable.' : 'No sensors are registered yet.'}
        </div>
      ) : (
        <ul className="landing-rooms">
          {devices.map((d, i) => {
            const primary = d.live || d.average
            const color = primary ? CATEGORY_COLORS[primary.category] || OFFLINE_COLOR : OFFLINE_COLOR
            return (
              <li
                key={`${d.room}-${d.name}-${i}`}
                className="landing-room"
                style={{ '--room-color': color }}
              >
                <div className="landing-room-id">
                  <div className="landing-room-name">{d.room} — {d.name}</div>
                  <div className="landing-room-sub">
                    {rowSub(d).map((part, j) => (
                      <span key={j}>
                        {j > 0 && ' · '}
                        <span className="landing-room-sub-part">{part}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <ReadingChips metrics={d.metrics} />
                <div className="landing-room-status">
                  {primary ? (
                    <AqiPill aqi={primary.aqi} category={primary.category} />
                  ) : (
                    <span className="landing-aqi-pill is-offline">{d.online ? 'No data' : 'Offline'}</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export default RoomsAtAGlance
