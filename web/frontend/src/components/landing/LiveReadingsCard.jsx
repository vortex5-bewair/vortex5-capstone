import ReadingChips from './ReadingChips'
import AqiPill from './AqiPill'
import { formatClock } from '../../utils/landingFormat'

// The hero's "Live readings" card. `headline` is summary.headline from
// GET /api/public/landing: the freshest live room, else an online room's stored
// 12-hour average, else null — in which case we say so rather than show a number.
const LiveReadingsCard = ({ headline, loaded, error }) => {
  if (!loaded) {
    return (
      <div className="landing-live-card">
        <div className="landing-live-empty" role="status">Loading live readings…</div>
      </div>
    )
  }

  if (!headline) {
    return (
      <div className="landing-live-card">
        <div className="landing-live-label">Live readings</div>
        <div className="landing-live-empty" role="status">
          {error
            ? 'Live readings are temporarily unavailable.'
            : 'No live readings right now — sensors appear here as soon as they report.'}
        </div>
      </div>
    )
  }

  const isLive = !!headline.live
  const primary = headline.live || headline.average

  return (
    <div className="landing-live-card">
      <div className="landing-live-label">
        {isLive ? 'Live readings' : '12-hour average'} · {headline.room}
      </div>
      <div className="landing-live-row">
        <ReadingChips metrics={headline.metrics} />
        <AqiPill aqi={primary.aqi} category={primary.category} />
      </div>
      <div className="landing-live-foot">
        {isLive && headline.average && (
          <span>12-hour average AQI {headline.average.aqi} · {headline.average.category}</span>
        )}
        {headline.readingAt && <span>as of {formatClock(headline.readingAt)}</span>}
        {error && <span>update failed — showing the last reading</span>}
      </div>
    </div>
  )
}

export default LiveReadingsCard
