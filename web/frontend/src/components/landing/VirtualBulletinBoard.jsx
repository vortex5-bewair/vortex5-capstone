import { useRef } from 'react'
import { Newspaper, Pin } from 'lucide-react'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useAutoScrollList } from '../../hooks/useAutoScrollList'
import AnnouncementRow from '../AnnouncementRow'
import { ANNOUNCEMENT_CATEGORY_COLORS } from '../../utils/announcementColors'
import { PARTNER_SCHOOL } from '../../utils/partnerSchool'

// Read-only mirror of the real bulletin board kiosk (pages/BulletinBoard.jsx)
// — same panel (label, colour legend, pinned grouping, row styling, the
// self-scrolling list), reusing its exact classes and AnnouncementRow so the
// two can't drift apart visually. .landing-board-panel just gives it a
// smaller, page-appropriate size instead of the kiosk's full-screen sidebar.
// Deliberately no "new post" control — posting stays an admin action.
const VirtualBulletinBoard = () => {
  const { data, loading, error } = useCachedFetch('/api/announcements', null, { pollInterval: 60 * 1000 })
  const list = Array.isArray(data) ? data : []
  const pinned = list.filter((a) => a.pinned)
  const others = list.filter((a) => !a.pinned)

  const listRef = useRef(null)
  useAutoScrollList(listRef, [data])

  return (
    <>
      <p className="landing-eyebrow-blue">{PARTNER_SCHOOL.name}</p>
      <h2 className="landing-section-title">
        Virtual<br /><em>Bulletin Board</em>
      </h2>

      <div className="kiosk-section landing-board-panel">
        <div className="kiosk-combined-block kiosk-combined-news">
          <div className="kiosk-combined-label">
            <Newspaper size={14} />
            Announcements
          </div>

          <div className="kiosk-news-legend">
            {Object.entries(ANNOUNCEMENT_CATEGORY_COLORS).map(([name, c]) => (
              <span key={name} className="kiosk-legend-item">
                <span className="kiosk-legend-dot" style={{ background: c }} />
                {name}
              </span>
            ))}
          </div>

          <div className="kiosk-news-list" ref={listRef}>
            {loading && !data ? (
              <div className="kiosk-empty">Loading announcements…</div>
            ) : error && !data ? (
              <div className="kiosk-empty">Announcements are temporarily unavailable.</div>
            ) : list.length === 0 ? (
              <div className="kiosk-empty">No announcements yet</div>
            ) : (
              <>
                {pinned.length > 0 && (
                  <>
                    <div className="kiosk-news-group-label">
                      <Pin size={12} />
                      Important Announcements
                    </div>
                    {pinned.map((a) => <AnnouncementRow key={a._id} a={a} pinned />)}
                  </>
                )}

                {others.length > 0 && (
                  <>
                    {pinned.length > 0 && (
                      <div className="kiosk-news-group-label">Other Announcements</div>
                    )}
                    {others.map((a) => <AnnouncementRow key={a._id} a={a} />)}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default VirtualBulletinBoard
