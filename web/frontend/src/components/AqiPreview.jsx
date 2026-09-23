import { CATEGORY_COLORS, aqiCategory, aqiAdvisory } from '../utils/airQualityGuidance'

// AQI readout — shared by the kiosk bulletin board (BulletinBoard.jsx) and the
// public landing page's miniature copy of it, so the two can't drift apart
// visually. Live (instant) figure is primary — the raw per-frame reading;
// the reported NowCast sits beneath in its own smaller, separately labelled
// line, since it will disagree with the live figure by design (a single
// frame vs. a 12-hour average) and an unlabelled disagreement reads as a bug.
//
// When there is no usable live frame, the reported 12-hour figure is
// promoted to the primary readout instead of hiding air quality behind
// "Waiting for a live reading...". The live panel still wins whenever live
// data is present.
//
// @param {{aqiInstant:number, ageMs:number}|null} live
// @param {{Aqi:number}|null} reported
const AqiPreview = ({ live, reported }) => {
  const category = live ? aqiCategory(live.aqiInstant) : null
  const color = category ? CATEGORY_COLORS[category] : '#94a3b8'
  const ageS = live ? Math.round((live.ageMs ?? 0) / 1000) : null

  const reportedCategory = reported ? aqiCategory(reported.Aqi) : null
  const reportedColor = CATEGORY_COLORS[reportedCategory] || '#94a3b8'

  // Whichever AQI drives the headline figure above (live when present, else
  // the 12-hour reported figure) also drives the advisory below it.
  const advisory = aqiAdvisory(live ? live.aqiInstant : reported?.Aqi)

  return (
    <div className="kiosk-aqi-body">
      {live ? (
        <>
          <div className="kiosk-aqi-live-status">Live · {ageS}s ago</div>
          <div className="kiosk-aqi-number" style={{ color }}>{live.aqiInstant}</div>
          <div className="kiosk-aqi-cat" style={{ color }}>{category || 'No data'}</div>
        </>
      ) : reported ? (
        <>
          <div className="kiosk-aqi-number" style={{ color: reportedColor }}>{reported.Aqi}</div>
          <div className="kiosk-aqi-cat" style={{ color: reportedColor }}>
            {reportedCategory || 'No data'}
          </div>
        </>
      ) : (
        <div className="kiosk-empty">Waiting for a live reading...</div>
      )}

      {advisory && (
        <div className="kiosk-aqi-advisory" style={{ borderLeftColor: advisory.color }}>
          <div className="kiosk-aqi-advisory-label">Advisory</div>
          <ul className="kiosk-aqi-advisory-list">
            {advisory.actions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      {live && reported && (
        <div className="kiosk-aqi-reported" title="NowCast, DENR AO 2020-14">
          Average AQI for 12 hours — {' '}
          <strong style={{ color: reportedColor }}>{reported.Aqi}</strong>
          {' '}· {reportedCategory || 'No data'}
        </div>
      )}
    </div>
  )
}

export default AqiPreview
