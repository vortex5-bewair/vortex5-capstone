import { ShieldCheck, Info } from 'lucide-react'
import { aqiAdvisory, flaggedComponents, airQualitySource, textSafeCategoryColor, readableInsightColor } from '../utils/airQualityGuidance'
import { useTheme } from '../hooks/useTheme'

// Shows recommended actions for the current reading, with every number and
// every line of advice coming from the canonical band table the backend serves
// (GET /api/air-quality/bands) rather than from a second copy kept here:
//  - overall AQI advisory for the DENR category
//  - per-component actions for any component currently outside its range
const RecommendedActions = ({ reading }) => {
  const { isDark } = useTheme()
  const aqi = reading?.Aqi
  const advisory = aqiAdvisory(aqi)
  const flagged = flaggedComponents(reading)
  // advisory.color / c.color below are the served, chip-tuned colors — fine
  // for the decorative left-border/dot, but three of the six AQI categories
  // (light mode) and several per-component band colors (dark mode) fail
  // WCAG AA as text on this card's background. See textSafeCategoryColor /
  // readableInsightColor in airQualityGuidance.js.
  const advisoryTextColor = advisory ? textSafeCategoryColor(advisory.category, isDark) : null

  if (!advisory) {
    return (
      <div className="rec-card">
        <div className="rec-head"><Info size={18} /> Recommended Actions</div>
        <p className="rec-empty">No live reading available. Recommendations appear when the device is online.</p>
      </div>
    )
  }

  return (
    <div className="rec-card">
      <div className="rec-head">
        <ShieldCheck size={18} /> Recommended Actions
      </div>

      {/* Overall AQI advisory */}
      <div className="rec-aqi" style={{ borderLeftColor: advisory.color }}>
        <div className="rec-aqi-cat" style={{ color: advisoryTextColor }}>
          {advisory.category}
        </div>
        <ul className="rec-list">
          {advisory.actions.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </div>

      {/* Per-component flags */}
      {flagged.length > 0 && (
        <div className="rec-components">
          <div className="rec-sub">Components needing attention</div>
          {flagged.map((c) => (
            <div className="rec-comp-row" key={c.label}>
              <span className="rec-comp-dot" style={{ background: c.color }} />
              <div className="rec-comp-text">
                <div className="rec-comp-name">
                  {c.label} <span className="rec-comp-level" style={{ color: readableInsightColor(c.color, isDark) }}>· {c.level}</span>
                  {/* Simulated by the sensor from its VOC element, not measured. */}
                  {c.derived && <span className="rec-comp-derived"> · derived value</span>}
                </div>
                <div className="rec-comp-advice">{c.advice}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {flagged.length === 0 && (
        <div className="rec-allgood">
          <ShieldCheck size={16} /> All individual components are within healthy ranges.
        </div>
      )}

      <div className="rec-source">
        Guidance: {airQualitySource()}
      </div>
    </div>
  )
}

export default RecommendedActions
