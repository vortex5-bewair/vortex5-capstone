import { CalendarDays, Wrench, Trophy, Bell, Megaphone, Pin } from 'lucide-react'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { ANNOUNCEMENT_CATEGORY_COLORS, announcementColor } from '../../utils/announcementColors'
import { readableInsightColor } from '../../utils/airQualityGuidance'
import { PARTNER_SCHOOL } from '../../utils/partnerSchool'

const CATEGORY_ICONS = {
  'Events': CalendarDays,
  'System Updates': Wrench,
  'Achievements': Trophy,
  'Reminders': Bell,
}

const Post = ({ a, pinned = false }) => {
  const color = announcementColor(a.category)
  // The tag's own background is a light tint of `color`; darken the text only as
  // far as needed to stay legible on it (same treatment as the kiosk's pills).
  const textColor = readableInsightColor(color, false, 0x1a / 0xff)
  const Icon = CATEGORY_ICONS[a.category] || Megaphone
  return (
    <article className="landing-post" style={{ '--post-color': color }}>
      <div className="landing-post-icon" aria-hidden="true"><Icon size={22} /></div>
      <div className="landing-post-body">
        <div className="landing-post-tags">
          {a.category && (
            <span className="landing-post-tag" style={{ color: textColor, background: `${textColor}1a` }}>
              {a.category}
            </span>
          )}
          {pinned && (
            <span className="landing-post-tag is-pinned"><Pin size={12} /> Pinned</span>
          )}
        </div>
        <h3 className="landing-post-title">{a.title}</h3>
        {a.description && <p className="landing-post-desc">{a.description}</p>}
        <div className="landing-post-meta">{[a.date, a.time].filter(Boolean).join(' · ')}</div>
      </div>
    </article>
  )
}

// Read-only mirror of the real bulletin board: the same public
// GET /api/announcements the kiosk uses, same category colours, pinned first.
// Deliberately no "new post" control — posting stays an admin action.
const VirtualBulletinBoard = () => {
  const { data, loading, error } = useCachedFetch('/api/announcements', null, { pollInterval: 60 * 1000 })
  const list = Array.isArray(data) ? data : []
  const pinned = list.filter((a) => a.pinned)
  const others = list.filter((a) => !a.pinned)

  return (
    <>
      <p className="landing-eyebrow-blue">{PARTNER_SCHOOL.name}</p>
      <h2 className="landing-section-title">
        Virtual<br /><em>Bulletin Board</em>
      </h2>

      <div className="landing-board-legend">
        {Object.entries(ANNOUNCEMENT_CATEGORY_COLORS).map(([name, c]) => (
          <span key={name} className="landing-legend-pill" style={{ '--dot': c }}>
            <i aria-hidden="true" />
            {name}
          </span>
        ))}
      </div>

      {loading && !data ? (
        <div className="landing-board-empty" role="status">Loading announcements…</div>
      ) : error && !data ? (
        <div className="landing-board-empty" role="status">Announcements are temporarily unavailable.</div>
      ) : list.length === 0 ? (
        <div className="landing-board-empty" role="status">No announcements yet.</div>
      ) : (
        <div className="landing-board-list" tabIndex={0} role="region" aria-label="Announcements">
          {pinned.length > 0 && (
            <>
              <div className="landing-board-label"><Pin size={14} /> Pinned</div>
              {pinned.map((a) => <Post key={a._id} a={a} pinned />)}
            </>
          )}
          {others.length > 0 && (
            <>
              <div className="landing-board-label">
                {pinned.length > 0 ? 'Other announcements' : 'Announcements'}
              </div>
              {others.map((a) => <Post key={a._id} a={a} />)}
            </>
          )}
        </div>
      )}
    </>
  )
}

export default VirtualBulletinBoard
