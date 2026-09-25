import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, ChevronLeft, ChevronRight } from 'lucide-react'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'

const AnimationViewer = () => {
  const [media, setMedia] = useState([])
  const [index, setIndex] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const stageRef = useRef(null)
  const videoRef = useRef(null)

  useEffect(() => {
    const fetchMedia = async () => {
      try {
        const res = await fetch('/api/media')
        const json = await res.json()
        // Warning videos only play on the kiosk when the AQI reaches their
        // category — they don't belong in this always-on rotation.
        if (res.ok) setMedia(json.filter((m) => m.videoType !== 'Warning'))
      } catch (err) {
        console.error('Failed to load media:', err)
      }
    }
    fetchMedia()
  }, [])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      stageRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  const goPrev = () => setIndex(i => (i - 1 + media.length) % media.length)
  const goNext = () => setIndex(i => (i + 1) % media.length)

  const current = media[index]
  const hasMultiple = media.length > 1

  if (media.length === 0) {
    return (
      <div className="dash-page">
        <h1 className="dash-title">Animation Viewer</h1>
        <div className="dash-empty">No animations have been uploaded yet.</div>
      </div>
    )
  }

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Animation Viewer</h1>
          <p className="dash-subtitle">
            {current?.title || 'Untitled'}
            {hasMultiple && ` · ${index + 1} of ${media.length}`}
          </p>
        </div>
        <button className="dash-action-btn" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>

      <div className={`anim-stage ${isFullscreen ? 'anim-stage-fs' : ''}`} ref={stageRef}>
        {current && (
          <video
            key={current._id}
            ref={videoRef}
            src={resolveMediaUrl(current.videoUrl)}
            className="anim-video"
            controls
            autoPlay
            playsInline
          />
        )}

        {hasMultiple && (
          <>
            <button className="anim-nav anim-nav-prev" onClick={goPrev} aria-label="Previous">
              <ChevronLeft size={28} />
            </button>
            <button className="anim-nav anim-nav-next" onClick={goNext} aria-label="Next">
              <ChevronRight size={28} />
            </button>
          </>
        )}

        {isFullscreen && (
          <button className="kiosk-exit-fs" onClick={toggleFullscreen}>
            <Minimize2 size={16} /> Exit Fullscreen
          </button>
        )}
      </div>
    </div>
  )
}

export default AnimationViewer
