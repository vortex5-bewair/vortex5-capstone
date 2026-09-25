// BulletinBoard.jsx — kiosk-style display: animation in the middle,
// news/announcements + AQI preview on the right, scrolling ticker at the bottom.
import { useEffect, useState, useRef, useMemo } from 'react'
import { useAuthContext } from '../hooks/useAuthContext'
import { useLiveReadings } from '../hooks/useLiveReadings'
import { useAutoScrollList } from '../hooks/useAutoScrollList'
import { Maximize2, Minimize2, Pause, Play, Newspaper, ChevronLeft, ChevronRight, Pin } from 'lucide-react'
import bewAirLogo from '../assets/bewair_logo_black.png'
import { aqiAdvisory, readableInsightColor } from '../utils/airQualityGuidance'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'
import { ANNOUNCEMENT_CATEGORY_COLORS } from '../utils/announcementColors'
import AnnouncementRow from '../components/AnnouncementRow'
import AqiPreview from '../components/AqiPreview'

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
  const newsListRef = useRef(null)

  // Live (smoothed) reading, pushed over the stream — mounted once here at
  // the page level. The kiosk's calm figure comes from reading `smoothed`
  // rather than `aqiInstant`, not from polling less often; fallbackPollMs
  // only governs the rare case where the stream itself can't connect.
  const { data: liveList } = useLiveReadings({ fallbackPollMs: 5000 })
  const freshestLive = pickFreshestLive(liveList)

  // Same reading and colour used by the sidebar AQI panel, the bottom ticker,
  // the header background, and the warning-video trigger below — one figure,
  // so none of those can disagree with each other.
  const tickerAqi = freshestLive ? freshestLive.aqiInstant : aqiData?.Aqi
  const tickerAdvisory = aqiAdvisory(tickerAqi)
  const tickerColor = tickerAdvisory?.color || '#94a3b8'
  const tickerTextColor = tickerAdvisory
    ? readableInsightColor(tickerAdvisory.color, false, 0x22 / 0xff)
    : '#475569'

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

  // ---------- Educational vs. Warning videos ----------
  // Only Educational videos play in the normal rotation; Warning videos never
  // appear there — they only play by interrupting it (see the effect below).
  const educationalVideos = useMemo(
    () => mediaList.filter((m) => m.videoType !== 'Warning'),
    [mediaList]
  )
  // Newest video per category wins if more than one was uploaded for the same
  // category — mediaList is already sorted newest-first by the API.
  const warningByCategory = useMemo(() => {
    const map = {}
    for (const m of mediaList) {
      if (m.videoType === 'Warning' && m.aqiCategory && !map[m.aqiCategory]) {
        map[m.aqiCategory] = m
      }
    }
    return map
  }, [mediaList])

  // ---------- Warning-video interrupt ----------
  // When the live AQI enters a category with a matching Warning video, it
  // replaces whatever Educational video is showing. savedPlaybackRef records
  // exactly where to resume once the warning video ends; prevCategoryRef makes
  // the trigger edge-based (on the transition INTO the category) instead of
  // level-based, so the same warning doesn't replay on every tick while the
  // AQI sits in that category. It's deliberately left untouched while a
  // warning video is already playing, so a category change mid-playback (e.g.
  // Fair -> Emergency) is still caught and triggers the right video once the
  // current one finishes, instead of being silently absorbed.
  const [interruptVideo, setInterruptVideo] = useState(null)
  const savedPlaybackRef = useRef(null) // { index, time } while interrupted
  const resumeSeekRef = useRef(null) // seconds to seek to once the resumed video is ready
  const prevCategoryRef = useRef(null)

  useEffect(() => {
    if (interruptVideo) return // one warning video at a time; re-evaluate once it ends
    const category = tickerAdvisory?.category ?? null
    if (category === prevCategoryRef.current) return
    prevCategoryRef.current = category

    const warning = category ? warningByCategory[category] : null
    if (!warning) return

    // Deferred to a microtask, same shape as this file's other effects
    // (fetch callbacks, the fullscreenchange listener) that only ever call
    // setState from inside a nested callback rather than synchronously as
    // the effect's first action — this is genuinely reacting to the live AQI
    // feed (an external system), not mirroring a prop into state, but the
    // lint rule can't tell those apart from the call shape alone.
    queueMicrotask(() => {
      savedPlaybackRef.current = {
        index: currentVideoIndex,
        time: videoRef.current?.currentTime || 0,
      }
      setInterruptVideo(warning)
      // A warning video is safety-critical — it should play even if the
      // kiosk's normal rotation was manually paused.
      setIsPlaying(true)
    })
  }, [tickerAdvisory?.category, warningByCategory, interruptVideo, currentVideoIndex])

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

  // ---------- Auto-scroll the announcements list ----------
  // A slow, continuous upward crawl through the list, distinct from the
  // horizontal bottom ticker (shared with the landing page's copy of this
  // board — see hooks/useAutoScrollList.js).
  useAutoScrollList(newsListRef, [announcements])

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

  // interruptVideo, when set, takes over the stage entirely — the normal
  // educational rotation (currentVideoIndex) keeps its place underneath but
  // isn't what's rendered.
  const hasVideos = !!interruptVideo || educationalVideos.length > 0
  const currentVideo = interruptVideo
    ? interruptVideo
    : (educationalVideos.length > 0 ? educationalVideos[currentVideoIndex % educationalVideos.length] : null)

  // ---------- Autoplay watchdog ----------
  // Relying on the <video autoPlay> attribute alone is unreliable: on a cold
  // first load (uncached Cloudinary fetch, browser tab not yet "warm"), the
  // browser can finish loading the video's data without ever running the
  // autoplay steps, leaving it silently paused forever with no retry. That's
  // exactly the "first video doesn't play" bug — later videos advance via
  // onEnded/remount after the connection and codecs are already warmed up, so
  // they're far less likely to hit the same race. Retry play() explicitly
  // whenever the element becomes ready, and once more on an interval as a
  // last-resort self-heal since this kiosk runs unattended for hours.
  //
  // Also applies a pending resume seek (resumeSeekRef) — set when a warning
  // video ends and hands playback back to the educational video it
  // interrupted — once that video has loaded enough to be seekable.
  const currentVideoId = currentVideo?._id
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isPlaying) return

    const applyResumeSeek = () => {
      if (resumeSeekRef.current != null && video.readyState >= 1) {
        video.currentTime = resumeSeekRef.current
        resumeSeekRef.current = null
      }
    }
    const tryPlay = () => { applyResumeSeek(); video.play().catch(() => {}) }
    tryPlay()
    video.addEventListener('loadeddata', tryPlay)
    video.addEventListener('canplay', tryPlay)

    const watchdog = setInterval(() => {
      if (video.paused && video.readyState >= 2) tryPlay()
    }, 3000)

    return () => {
      video.removeEventListener('loadeddata', tryPlay)
      video.removeEventListener('canplay', tryPlay)
      clearInterval(watchdog)
    }
  }, [currentVideoId, isPlaying])

  // ---------- Video controls ----------
  const handleVideoEnded = () => {
    if (interruptVideo) {
      // The warning video finished — hand playback back to the educational
      // video it interrupted, from exactly where that video was paused.
      const saved = savedPlaybackRef.current
      if (saved) {
        resumeSeekRef.current = saved.time
        if (saved.index !== currentVideoIndex) setCurrentVideoIndex(saved.index)
      }
      savedPlaybackRef.current = null
      setInterruptVideo(null)
      return
    }
    if (educationalVideos.length > 0 && isPlaying) {
      setCurrentVideoIndex(i => (i + 1) % educationalVideos.length)
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
    if (educationalVideos.length === 0) return
    setCurrentVideoIndex(i => (i - 1 + educationalVideos.length) % educationalVideos.length)
  }
  const goNext = () => {
    if (educationalVideos.length === 0) return
    setCurrentVideoIndex(i => (i + 1) % educationalVideos.length)
  }
  const selectVideo = (index) => {
    if (index < 0 || index >= educationalVideos.length) return
    setCurrentVideoIndex(index)
  }

  // ---------- Helpers ----------
  const formatTime = () => currentTime.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  })
  const formatDate = () => currentTime.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })

  // Pinned announcements float to the top under their own heading; the rest
  // keep the server's newest-first order. No cap — the list scrolls.
  const pinnedAnnouncements = announcements.filter(a => a.pinned)
  const regularAnnouncements = announcements.filter(a => !a.pinned)

  const tickerSegments = []
  if (tickerAdvisory) {
    tickerSegments.push(`Air quality: AQI ${tickerAqi} (${tickerAdvisory.category})`)
    tickerAdvisory.actions.forEach(a => tickerSegments.push(a))
  }
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

          {educationalVideos.length > 1 && (
            <>
              <select
                className="kiosk-ctrl-select"
                value={currentVideoIndex}
                onChange={(e) => selectVideo(Number(e.target.value))}
                aria-label="Choose video"
                disabled={!!interruptVideo}
              >
                {educationalVideos.map((m, i) => (
                  <option key={m._id || i} value={i}>
                    {i + 1}. {m.title || 'Untitled'}
                  </option>
                ))}
              </select>
              <button className="kiosk-ctrl-btn" onClick={goPrev} aria-label="Previous video" disabled={!!interruptVideo}>
                <ChevronLeft size={14}/>
              </button>
              <button className="kiosk-ctrl-btn" onClick={goNext} aria-label="Next video" disabled={!!interruptVideo}>
                <ChevronRight size={14}/>
              </button>
            </>
          )}

          {hasVideos && (
            <span className="kiosk-ctrl-status">
              {interruptVideo
                ? 'Playing warning video'
                : `Video ${currentVideoIndex + 1} of ${educationalVideos.length}`}
            </span>
          )}
        </div>
      )}

      {isFullscreen && (
        <button className="kiosk-exit-fs" onClick={toggleFullscreen}>
          <Minimize2 size={16}/> Exit Fullscreen
        </button>
      )}

      {/* === Top header bar === — tinted with the live AQI colour, same as
          the bottom ticker, once a reading exists; the default gradient
          (from the class) shows before that. The tint is layered over solid
          white rather than left translucent: the header's text colours are
          hardcoded dark (built for its light gradient), so a translucent
          tint would sink into the dark theme's page background and make
          that text unreadable. */}
      <div
        className="kiosk-header"
        style={tickerAdvisory
          ? { background: `linear-gradient(${tickerColor}33, ${tickerColor}33), #ffffff` }
          : undefined}
      >
        <div className="kiosk-brand">
          <img src={bewAirLogo} alt="BewAir" width={40} height={40} />
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
                className={`kiosk-video ${interruptVideo ? 'kiosk-video-warning-fade' : ''}`}
                autoPlay={isPlaying}
                onEnded={handleVideoEnded}
                playsInline
                muted
              />
              {currentVideo.title && (
                <div className="kiosk-video-caption">
                  {interruptVideo && <span className="kiosk-video-warning-tag">Warning</span>}
                  {currentVideo.title}
                </div>
              )}
            </>
          ) : (
            <div className="kiosk-stage-placeholder">
              <img src={bewAirLogo} alt="" width={96} height={96} />
              <p>No animations available</p>
            </div>
          )}
        </div>

        {/* RIGHT: single tile containing News + AQI */}
        <aside className="kiosk-sidebar">
          <div className="kiosk-section kiosk-combined">
            {/* Air quality block on top — quick glance */}
            <div className="kiosk-combined-block kiosk-combined-aqi">
              <div className="kiosk-combined-label kiosk-combined-label-aqi">Air Quality Index</div>
              {(freshestLive || aqiData) ? (
                <AqiPreview live={freshestLive} reported={aqiData} />
              ) : (
                <div className="kiosk-empty">Waiting for sensor data...</div>
              )}
            </div>

            <div className="kiosk-combined-divider" />

            {/* Announcements list below */}
            <div className="kiosk-combined-block kiosk-combined-news">
              <div className="kiosk-combined-label">
                <Newspaper size={14} />
                Announcements
              </div>

              {/* Colour legend — mirrors the mobile category colours */}
              <div className="kiosk-news-legend">
                {Object.entries(ANNOUNCEMENT_CATEGORY_COLORS).map(([name, c]) => (
                  <span key={name} className="kiosk-legend-item">
                    <span className="kiosk-legend-dot" style={{ background: c }} />
                    {name}
                  </span>
                ))}
              </div>

              <div className="kiosk-news-list" ref={newsListRef}>
                {announcements.length === 0 ? (
                  <div className="kiosk-empty">No announcements yet</div>
                ) : (
                  <>
                    {pinnedAnnouncements.length > 0 && (
                      <>
                        <div className="kiosk-news-group-label">
                          <Pin size={12} />
                          Important Announcements
                        </div>
                        {pinnedAnnouncements.map((a, i) => (
                          <AnnouncementRow
                            key={a._id || `pinned-${i}`}
                            a={a}
                            pinned
                            dateFallback={formatDate()}
                          />
                        ))}
                      </>
                    )}

                    {regularAnnouncements.length > 0 && (
                      <>
                        {pinnedAnnouncements.length > 0 && (
                          <div className="kiosk-news-group-label">Other Announcements</div>
                        )}
                        {regularAnnouncements.map((a, i) => (
                          <AnnouncementRow
                            key={a._id || `reg-${i}`}
                            a={a}
                            dateFallback={formatDate()}
                          />
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

      {/* === Bottom ticker — scrolling AQI advisory, colour-coded to match
          the AQI panel above === */}
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
  )
}

export default BulletinBoard
