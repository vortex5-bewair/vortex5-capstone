// BulletinBoard.jsx — kiosk-style display: animation in the middle,
// news/announcements + AQI preview on the right, scrolling ticker at the bottom.
import { useEffect, useState, useRef } from 'react'
import { useAuthContext } from '../hooks/useAuthContext'
import { useLiveReadings } from '../hooks/useLiveReadings'
import { Maximize2, Minimize2, Pause, Play, CalendarDays, Newspaper, ChevronLeft, ChevronRight } from 'lucide-react'
import bewAirLogo from '../assets/bewair_logo_black.png'
import { CATEGORY_COLORS, aqiCategory } from '../utils/airQualityGuidance'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'

// Freshest non-stale device from the live list — same "most recently
// reported wins" selection today's stored-data poll already uses below,
// just applied to the live source instead.
const pickFreshestLive = (data) => {
  if (!Array.isArray(data)) return null
  const candidates = data.filter((d) => d.available && !d.stale)
  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => (new Date(b.receivedAt) > new Date(a.receivedAt) ? b : a))
}

const BulletinBoard = () => {
  const { user } = useAuthContext()

  const [mediaList, setMediaList] = useState([])
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const videoRef = useRef(null)
  const boardRef = useRef(null)

  const [announcements, setAnnouncements] = useState([])
  const [aqiData, setAqiData] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Live (smoothed) reading, pushed over the stream — mounted once here at
  // the page level. The kiosk's calm figure comes from reading `smoothed`
  // rather than `aqiInstant`, not from polling less often; fallbackPollMs
  // only governs the rare case where the stream itself can't connect.
  const { data: liveList } = useLiveReadings({ fallbackPollMs: 5000 })
  const freshestLive = pickFreshestLive(liveList)

  // ---------- Fetch media ----------
  useEffect(() => {
    const fetchMedia = async () => {
      try {
        const headers = {}
        if (user?.token) headers.Authorization = `Bearer ${user.token}`
        const res = await fetch('/api/media', { headers })
        const json = await res.json()
        if (res.ok && json.length > 0) setMediaList(json)
      } catch (err) { console.error('media:', err) }
    }
    fetchMedia()
  }, [user])

  // ---------- Fetch announcements ----------
  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const res = await fetch('/api/announcements')
        const json = await res.json()
        if (res.ok) setAnnouncements(json)
      } catch (err) { console.error('announcements:', err) }
    }
    fetchAnnouncements()
    const interval = setInterval(fetchAnnouncements, 60000)
    return () => clearInterval(interval)
  }, [])

  // ---------- Fetch latest AQI ----------
  useEffect(() => {
    if (!user) return
    const fetchAqi = async () => {
      try {
        const res = await fetch('/api/aqi/latest', {
          headers: { Authorization: `Bearer ${user.token}` }
        })
        const json = await res.json()
        if (res.ok && Array.isArray(json) && json.length > 0) {
          // Pick the most recently created reading
          const latest = json.reduce((a, b) =>
            new Date(b.createdAt) > new Date(a.createdAt) ? b : a
          )
          setAqiData(latest)
        }
      } catch (err) { console.error('aqi:', err) }
    }
    fetchAqi()
    const interval = setInterval(fetchAqi, 15000)
    return () => clearInterval(interval)
  }, [user])

  // ---------- Tick clock ----------
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // ---------- Fullscreen ----------
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      boardRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  // ---------- Video controls ----------
  const handleVideoEnded = () => {
    if (mediaList.length > 0 && isPlaying) {
      setCurrentVideoIndex(i => (i + 1) % mediaList.length)
    }
  }
  const togglePlay = () => {
    setIsPlaying(p => {
      const next = !p
      if (videoRef.current) {
        next ? videoRef.current.play() : videoRef.current.pause()
      }
      return next
    })
  }
  const goPrev = () => {
    if (mediaList.length === 0) return
    setCurrentVideoIndex(i => (i - 1 + mediaList.length) % mediaList.length)
  }
  const goNext = () => {
    if (mediaList.length === 0) return
    setCurrentVideoIndex(i => (i + 1) % mediaList.length)
  }
  const selectVideo = (index) => {
    if (index < 0 || index >= mediaList.length) return
    setCurrentVideoIndex(index)
  }

  // ---------- Helpers ----------
  const formatTime = () => currentTime.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  })
  const formatDate = () => currentTime.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })
  const hasVideos = mediaList.length > 0
  const currentVideo = hasVideos ? mediaList[currentVideoIndex] : null

  // Build the ticker text from announcements + a live AQI snippet.
  const tickerSegments = []
  if (aqiData) {
    const cat = aqiCategory(aqiData.Aqi)
    tickerSegments.push(`Air quality: AQI ${aqiData.Aqi} (${cat})`)
  }
  announcements.forEach(a => {
    if (a?.title) tickerSegments.push(a.title)
  })
  if (tickerSegments.length === 0) {
    tickerSegments.push('Welcome to BewAir — School Air Quality Monitor')
  }
  const tickerText = tickerSegments.join('  •  ') + '  •  '

  return (
    <div className={`kiosk-root ${isFullscreen ? 'kiosk-fullscreen' : ''}`} ref={boardRef}>
      {/* Mini control bar — only visible when NOT fullscreen */}
      {!isFullscreen && (
        <div className="kiosk-controls">
          <button className="kiosk-ctrl-btn" onClick={togglePlay}>
            {isPlaying ? <><Pause size={14}/> Pause</> : <><Play size={14}/> Play</>}
          </button>
          <button className="kiosk-ctrl-btn" onClick={toggleFullscreen}>
            <Maximize2 size={14}/> Fullscreen
          </button>

          {mediaList.length > 1 && (
            <>
              <select
                className="kiosk-ctrl-select"
                value={currentVideoIndex}
                onChange={(e) => selectVideo(Number(e.target.value))}
                aria-label="Choose video"
              >
                {mediaList.map((m, i) => (
                  <option key={m._id || i} value={i}>
                    {i + 1}. {m.title || 'Untitled'}
                  </option>
                ))}
              </select>
              <button className="kiosk-ctrl-btn" onClick={goPrev} aria-label="Previous video">
                <ChevronLeft size={14}/>
              </button>
              <button className="kiosk-ctrl-btn" onClick={goNext} aria-label="Next video">
                <ChevronRight size={14}/>
              </button>
            </>
          )}

          {hasVideos && (
            <span className="kiosk-ctrl-status">
              Video {currentVideoIndex + 1} of {mediaList.length}
            </span>
          )}
        </div>
      )}

      {isFullscreen && (
        <button className="kiosk-exit-fs" onClick={toggleFullscreen}>
          <Minimize2 size={16}/> Exit Fullscreen
        </button>
      )}

      {/* === Top header bar === */}
      <div className="kiosk-header">
        <div className="kiosk-brand">
          <img src={bewAirLogo} alt="BewAir" />
          <span>BewAir</span>
        </div>
        <div className="kiosk-clock">
          <div className="kiosk-time">{formatTime()}</div>
          <div className="kiosk-date">{formatDate()}</div>
        </div>
      </div>

      {/* === Main area === */}
      <div className="kiosk-main">
        {/* LEFT: animation */}
        <div className="kiosk-stage">
          {hasVideos ? (
            <>
              <video
                key={currentVideo._id}
                ref={videoRef}
                src={resolveMediaUrl(currentVideo.videoUrl)}
                className="kiosk-video"
                autoPlay={isPlaying}
                onEnded={handleVideoEnded}
                playsInline
                muted
              />
              {currentVideo.title && (
                <div className="kiosk-video-caption">{currentVideo.title}</div>
              )}
            </>
          ) : (
            <div className="kiosk-stage-placeholder">
              <img src={bewAirLogo} alt="" />
              <p>No animations available</p>
            </div>
          )}
        </div>

        {/* RIGHT: single tile containing News + AQI */}
        <aside className="kiosk-sidebar">
          <div className="kiosk-section kiosk-combined">
            {/* Air quality block on top — quick glance */}
            <div className="kiosk-combined-block kiosk-combined-aqi">
              <div className="kiosk-combined-label">Air Quality</div>
              {(freshestLive || aqiData) ? (
                <AqiPreview live={freshestLive} reported={aqiData} />
              ) : (
                <div className="kiosk-empty">Waiting for sensor data...</div>
              )}
            </div>

            <div className="kiosk-combined-divider" />

            {/* News list below */}
            <div className="kiosk-combined-block kiosk-combined-news">
              <div className="kiosk-combined-label">
                <Newspaper size={14} />
                News &amp; Events
              </div>
              <div className="kiosk-news-list">
                {announcements.length === 0 ? (
                  <div className="kiosk-empty">No announcements yet</div>
                ) : (
                  announcements.slice(0, 4).map((a, i) => (
                    <div key={a._id || i} className="kiosk-news-row">
                      <div className="kiosk-news-date">
                        <CalendarDays size={14} />
                        <span>{a.date || formatDate()}</span>
                      </div>
                      <div className="kiosk-news-body">
                        <div className="kiosk-news-title">{a.title}</div>
                        {a.description && (
                          <div className="kiosk-news-desc">{a.description}</div>
                        )}
                        {a.time && <div className="kiosk-news-time">{a.time}</div>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* === Bottom ticker === */}
      <div className="kiosk-ticker">
        <div className="kiosk-ticker-track" key={tickerText}>
          <span className="kiosk-ticker-text">{tickerText.repeat(3)}</span>
        </div>
      </div>
    </div>
  )
}

// ===== AQI Preview (right sidebar bottom) =====
// Live (instant) figure is primary — the raw per-frame reading, same as
// DeviceDetail's diagnostic view. The reported NowCast sits beneath in its
// own smaller, separately labelled line, since it will disagree with the
// live figure by design (a single frame vs. a 12-hour average) and an
// unlabelled disagreement reads as a bug.
//
// When there is no usable live frame — the common case for a staff kiosk
// scoped to a single device that has gone quiet, or whose last frame is
// already stale — the reported 12-hour figure is promoted to the primary
// readout instead of hiding air quality behind "Waiting for a live
// reading...". The live panel still wins whenever live data is present.
const AqiPreview = ({ live, reported }) => {
  const category = live ? aqiCategory(live.aqiInstant) : null
  const color = category ? CATEGORY_COLORS[category] : '#94a3b8'
  const metrics = live?.metrics
  const ageS = live ? Math.round((live.ageMs ?? 0) / 1000) : null

  const reportedCategory = reported ? aqiCategory(reported.Aqi) : null
  const reportedColor = CATEGORY_COLORS[reportedCategory] || '#94a3b8'

  return (
    <div className="kiosk-aqi-body">
      {live ? (
        <>
          <div className="kiosk-aqi-live-status">Live · {ageS}s ago</div>
          <div className="kiosk-aqi-number" style={{ color }}>{live.aqiInstant}</div>
          <div className="kiosk-aqi-cat" style={{ color }}>{category || 'No data'}</div>
          <div className="kiosk-aqi-metrics">
            <div className="kiosk-aqi-metric">
              <span>PM 2.5</span>
              <strong>{metrics?.PM25 ?? '--'} <small>µg/m³</small></strong>
            </div>
            <div className="kiosk-aqi-metric">
              <span>CO₂</span>
              <strong>{metrics?.CO2 ?? '--'} <small>ppm</small></strong>
            </div>
            <div className="kiosk-aqi-metric">
              <span>Temp</span>
              <strong>
                {metrics?.Temperature != null ? metrics.Temperature.toFixed(1) : '--'}
                <small>°C</small>
              </strong>
            </div>
            <div className="kiosk-aqi-metric">
              <span>Humidity</span>
              <strong>
                {metrics?.Humidity != null ? metrics.Humidity.toFixed(1) : '--'}
                <small>%</small>
              </strong>
            </div>
          </div>
        </>
      ) : reported ? (
        <>
          <div className="kiosk-aqi-live-status">Latest reported</div>
          <div className="kiosk-aqi-number" style={{ color: reportedColor }}>{reported.Aqi}</div>
          <div className="kiosk-aqi-cat" style={{ color: reportedColor }}>
            {reportedCategory || 'No data'}
          </div>
        </>
      ) : (
        <div className="kiosk-empty">Waiting for a live reading...</div>
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

export default BulletinBoard
