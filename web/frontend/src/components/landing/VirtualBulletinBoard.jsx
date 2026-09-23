import { useEffect, useRef, useState } from 'react'
import { Newspaper, Pin, Maximize2, Minimize2 } from 'lucide-react'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useAutoScrollList } from '../../hooks/useAutoScrollList'
import AnnouncementRow from '../AnnouncementRow'
import AqiPreview from '../AqiPreview'
import { ANNOUNCEMENT_CATEGORY_COLORS } from '../../utils/announcementColors'
import { aqiAdvisory, readableInsightColor } from '../../utils/airQualityGuidance'
import { PARTNER_SCHOOL } from '../../utils/partnerSchool'
import { resolveMediaUrl } from '../../utils/resolveMediaUrl'
import bewAirLogo from '../../assets/bewair_logo_black.png'

// A miniature, read-only replica of the real bulletin board kiosk
// (pages/BulletinBoard.jsx) — the same header, video stage, AQI panel,
// announcements list and bottom ticker, reusing its exact classes and shared
// sub-components (AqiPreview, AnnouncementRow) so the two can never drift
// apart visually. .landing-board-panel only bounds it to a fixed size for a
// page section instead of the kiosk's full-screen layout.
//
// No admin chrome — no play/pause, no video picker, no "new post" — this is
// a live preview of the real thing, not the console itself. The one control
// it does offer is fullscreen, same pattern as the staff kiosk and the
// Animation Viewer: request/exit fullscreen on the panel itself and track it
// via the browser's own fullscreenchange event.
//
// `data`/`loaded`/`error` are the shared GET /api/public/landing poll
// (lifted to LandingPage so the hero card, the rooms list and this AQI panel
// can never disagree about the same reading).
const VirtualBulletinBoard = ({ data, loaded, error }) => {
  const headline = data?.summary?.headline ?? null

  const [isFullscreen, setIsFullscreen] = useState(false)
  const panelRef = useRef(null)
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      panelRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  // ---------- Announcements (same public endpoint + auto-scroll as the kiosk) ----------
  const { data: announcementsData, loading: annLoading, error: annError } =
    useCachedFetch('/api/announcements', null, { pollInterval: 60 * 1000 })
  const list = Array.isArray(announcementsData) ? announcementsData : []
  const pinned = list.filter((a) => a.pinned)
  const others = list.filter((a) => !a.pinned)
  const listRef = useRef(null)
  useAutoScrollList(listRef, [announcementsData])

  // ---------- Video stage (same public /api/media the kiosk and Educational
  // Videos section use; autoplaying preview, no manual controls) ----------
  const [videos, setVideos] = useState([])
  const [videoIndex, setVideoIndex] = useState(0)
  useEffect(() => {
    const fetchMedia = async () => {
      try {
        const res = await fetch('/api/media')
        const json = await res.json()
        if (res.ok && Array.isArray(json)) setVideos(json)
      } catch (err) {
        console.error('media:', err)
      }
    }
    fetchMedia()
  }, [])
  const hasVideos = videos.length > 0
  const currentVideo = hasVideos ? videos[videoIndex] : null
  const handleVideoEnded = () => setVideoIndex((i) => (i + 1) % videos.length)

  // ---------- Clock (same format as the kiosk header) ----------
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  const formatTime = () => now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const formatDate = () => now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // AqiPreview expects the authenticated /api/aqi shape ({aqiInstant, ageMs} /
  // {Aqi}); adapt the sanitized public headline (aqi/category/ageS) into it so
  // the exact same component renders both the kiosk and this preview.
  const liveForPreview = headline?.live
    ? { aqiInstant: headline.live.aqi, ageMs: (headline.live.ageS ?? 0) * 1000 }
    : null
  const reportedForPreview = headline?.average ? { Aqi: headline.average.aqi } : null

  // Ticker — same AQI-advisory scroller as the kiosk, same colour source.
  const tickerAqi = headline?.live?.aqi ?? headline?.average?.aqi ?? null
  const tickerAdvisory = aqiAdvisory(tickerAqi)
  const tickerColor = tickerAdvisory?.color || '#94a3b8'
  const tickerTextColor = tickerAdvisory
    ? readableInsightColor(tickerAdvisory.color, false, 0x22 / 0xff)
    : '#475569'
  const tickerSegments = []
  if (tickerAdvisory) {
    tickerSegments.push(`Air quality: AQI ${tickerAqi} (${tickerAdvisory.category})`)
    tickerAdvisory.actions.forEach((a) => tickerSegments.push(a))
  }
  if (tickerSegments.length === 0) tickerSegments.push('Welcome to BewAir — School Air Quality Monitor')
  const tickerText = tickerSegments.join('  •  ') + '  •  '

  return (
    <>
      <p className="landing-eyebrow-blue">{PARTNER_SCHOOL.name}</p>
      <h2 className="landing-section-title">
        Virtual<br /><em>Bulletin Board</em>
      </h2>

      <div
        className={`kiosk-root landing-board-panel ${isFullscreen ? 'kiosk-fullscreen' : ''}`}
        ref={panelRef}
      >
        <div className="kiosk-header">
          <div className="kiosk-brand">
            <img src={bewAirLogo} alt="BewAir" width={40} height={40} />
            <span>BewAir</span>
          </div>
          <div className="kiosk-clock">
            <div className="kiosk-time">{formatTime()}</div>
            <div className="kiosk-date">{formatDate()}</div>
          </div>
        </div>

        <div className="kiosk-main">
          <div className="kiosk-stage">
            <button
              className="anim-fullscreen-btn"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            {hasVideos ? (
              <>
                <video
                  key={currentVideo._id}
                  src={resolveMediaUrl(currentVideo.videoUrl)}
                  className="kiosk-video"
                  autoPlay
                  muted
                  playsInline
                  loop={videos.length <= 1}
                  onEnded={videos.length > 1 ? handleVideoEnded : undefined}
                />
                {currentVideo.title && (
                  <div className="kiosk-video-caption">{currentVideo.title}</div>
                )}
              </>
            ) : (
              <div className="kiosk-stage-placeholder">
                <img src={bewAirLogo} alt="" width={96} height={96} />
                <p>No animations available</p>
              </div>
            )}
          </div>

          <aside className="kiosk-sidebar">
            <div className="kiosk-section kiosk-combined">
              <div className="kiosk-combined-block kiosk-combined-aqi">
                <div className="kiosk-combined-label kiosk-combined-label-aqi">Air Quality Index</div>
                {headline ? (
                  <AqiPreview live={liveForPreview} reported={reportedForPreview} />
                ) : (
                  <div className="kiosk-empty">
                    {!loaded
                      ? 'Loading…'
                      : error
                        ? 'Live data is temporarily unavailable.'
                        : 'Waiting for sensor data...'}
                  </div>
                )}
              </div>

              <div className="kiosk-combined-divider" />

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
                  {annLoading && !announcementsData ? (
                    <div className="kiosk-empty">Loading announcements…</div>
                  ) : annError && !announcementsData ? (
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
                          {pinned.map((a) => (
                            <AnnouncementRow key={a._id} a={a} pinned dateFallback={formatDate()} />
                          ))}
                        </>
                      )}

                      {others.length > 0 && (
                        <>
                          {pinned.length > 0 && (
                            <div className="kiosk-news-group-label">Other Announcements</div>
                          )}
                          {others.map((a) => (
                            <AnnouncementRow key={a._id} a={a} dateFallback={formatDate()} />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div
          className="kiosk-ticker"
          style={{ background: `${tickerColor}22`, borderTopColor: tickerColor }}
        >
          <div className="kiosk-ticker-track" key={tickerText}>
            <span className="kiosk-ticker-text" style={{ color: tickerTextColor }}>
              {tickerText.repeat(3)}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

export default VirtualBulletinBoard
