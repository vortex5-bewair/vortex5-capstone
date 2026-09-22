import { CalendarDays, Pin } from 'lucide-react'
import { announcementColor } from '../utils/announcementColors'
import { readableInsightColor } from '../utils/airQualityGuidance'

// One announcement row — shared by the kiosk bulletin board (BulletinBoard.jsx)
// and the public landing page's read-only mirror of it, so the two can never
// drift apart visually. Category colour drives a left accent bar and a
// matching pill; a pinned row also carries a pin glyph.
const AnnouncementRow = ({ a, pinned = false, dateFallback }) => {
  const color = announcementColor(a.category)
  // The pill's own background is a light tint of `color` itself — a couple
  // of these (amber Events, coral Reminders) only manage 1.98:1 / 3.29:1 as
  // text on that self-tint. Both call sites are light-mode-only surfaces
  // (kiosk signage, landing page), so no isDark toggle to thread through;
  // 0x1a/0xff matches the background tint below.
  const textColor = readableInsightColor(color, false, 0x1a / 0xff)
  return (
    <div className="kiosk-news-row" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="kiosk-news-date">
        <CalendarDays size={14} />
        <span>{a.date || dateFallback}</span>
      </div>
      <div className="kiosk-news-body">
        <div className="kiosk-news-tags">
          {a.category && (
            <span
              className="kiosk-news-cat"
              style={{ color: textColor, borderColor: color, background: `${textColor}1a` }}
            >
              {a.category}
            </span>
          )}
          {pinned && (
            <span className="kiosk-news-pin">
              <Pin size={11} /> Pinned
            </span>
          )}
        </div>
        <div className="kiosk-news-title">{a.title}</div>
        {a.description && (
          <div className="kiosk-news-desc">{a.description}</div>
        )}
        {a.time && <div className="kiosk-news-time">{a.time}</div>}
      </div>
    </div>
  )
}

export default AnnouncementRow
