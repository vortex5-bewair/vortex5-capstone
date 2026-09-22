import { chipsFor } from '../../utils/landingFormat'

// PM2.5 / CO₂ / TVOC / TEMP / RH for one room. Units and colours come from the
// system's own band table (see utils/landingFormat.js).
const ReadingChips = ({ metrics }) => {
  // No current reading (offline / nothing reported yet): say so once instead of
  // five rows of dashes.
  if (!metrics) return <div className="landing-chips-empty">No current readings</div>

  return (
    <div className="landing-chips">
      {chipsFor(metrics).map((c) => (
        <span key={c.key} className="landing-chip">
          <span className="landing-chip-label">{c.label}</span>
          <span className="landing-chip-value" style={c.color ? { color: c.color } : undefined}>
            {c.value}
          </span>
          <span className="landing-chip-unit">{c.unit}</span>
        </span>
      ))}
    </div>
  )
}

export default ReadingChips
