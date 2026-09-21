import { CATEGORY_COLORS, readableInsightColor } from '../../utils/airQualityGuidance'

// Non-breaking space (char code 160, spelled out so no invisible character
// lives in the source): sits before the dot so a wrapped pill breaks AFTER it.
const NBSP = String.fromCharCode(160)

// AQI figure + its DENR category as a coloured pill. The colour is the served
// category colour (the same one the kiosk, dashboards and mobile app use); the
// text is darkened only as far as needed to stay legible on its own tint.
const AqiPill = ({ aqi, category }) => {
  const color = CATEGORY_COLORS[category] || '#94a3b8'
  const text = readableInsightColor(color, false, 0x1a / 0xff)
  return (
    <span
      className="landing-aqi-pill"
      style={{ color: text, borderColor: color, background: `${text}1a` }}
    >
      {`AQI ${aqi}${NBSP}·`} {category || 'No data'}
    </span>
  )
}

export default AqiPill
