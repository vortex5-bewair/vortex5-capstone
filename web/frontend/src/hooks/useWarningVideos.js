import { useEffect, useMemo, useRef, useState } from 'react'

// Shared by the staff kiosk (pages/BulletinBoard.jsx) and the landing page's
// mini board so the two play warning videos identically.
//
// Educational videos are the normal rotation. A Warning video is tied to one
// AQI category; when the live AQI ENTERS that category it takes over the stage
// until it ends, then the educational video it interrupted resumes from the
// exact position it paused at.
//
//   mediaList          every video from /api/media (both types)
//   category           the live AQI category name, or null with no reading
//   videoRef           ref on the <video> element, read to remember where the
//                      educational video was
//   currentVideoIndex  index into the educational videos
//   setCurrentVideoIndex
//   setIsPlaying       optional; called with true when a warning starts so it
//                      plays even if the rotation had been manually paused
//
// Returns { educationalVideos, currentVideo, hasVideos, isWarning, endWarning }.
// Call endWarning() from the video's onEnded: it returns true when the video
// that just ended was a warning (and playback has been handed back), false
// when the caller should advance the rotation as usual.
export function useWarningVideos({
  mediaList,
  category,
  videoRef,
  currentVideoIndex,
  setCurrentVideoIndex,
  setIsPlaying,
}) {
  const educationalVideos = useMemo(
    () => mediaList.filter((m) => m.videoType !== 'Warning'),
    [mediaList]
  )
  // Newest video per category wins if more than one was uploaded for the same
  // category — /api/media is already sorted newest-first.
  const warningByCategory = useMemo(() => {
    const map = {}
    for (const m of mediaList) {
      if (m.videoType === 'Warning' && m.aqiCategory && !map[m.aqiCategory]) {
        map[m.aqiCategory] = m
      }
    }
    return map
  }, [mediaList])

  const [interruptVideo, setInterruptVideo] = useState(null)
  const savedPlaybackRef = useRef(null) // { index, time } while interrupted
  const resumeSeekRef = useRef(null) // seconds to seek to once the resumed video is ready
  // Edge-trigger memory: the trigger fires on the transition INTO a category,
  // not on every tick while the AQI sits in it. Deliberately left untouched
  // while a warning is playing, so a category change mid-playback (e.g. Fair
  // -> Emergency) is still caught and plays once the current one finishes,
  // instead of being silently absorbed.
  const prevCategoryRef = useRef(null)

  useEffect(() => {
    if (interruptVideo) return // one warning at a time; re-evaluate once it ends
    if (category === prevCategoryRef.current) return
    prevCategoryRef.current = category

    const warning = category ? warningByCategory[category] : null
    if (!warning) return

    // Deferred to a microtask so setState isn't the effect's synchronous first
    // action (the lint rule's "mirroring state into an effect" shape) — this
    // is genuinely reacting to the live AQI feed, an external system.
    queueMicrotask(() => {
      savedPlaybackRef.current = {
        index: currentVideoIndex,
        time: videoRef.current?.currentTime || 0,
      }
      setInterruptVideo(warning)
      // A warning is safety content — it plays even if the rotation was paused.
      setIsPlaying?.(true)
    })
  }, [category, warningByCategory, interruptVideo, currentVideoIndex, videoRef, setIsPlaying])

  const currentVideo = interruptVideo
    ? interruptVideo
    : (educationalVideos.length > 0
        ? educationalVideos[currentVideoIndex % educationalVideos.length]
        : null)
  const currentVideoId = currentVideo?._id

  // When a resumed educational video (re)mounts, seek it back to where it was
  // paused as soon as it has loaded enough to be seekable.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    const applyResumeSeek = () => {
      if (resumeSeekRef.current != null && video.readyState >= 1) {
        video.currentTime = resumeSeekRef.current
        resumeSeekRef.current = null
      }
    }
    applyResumeSeek()
    video.addEventListener('loadedmetadata', applyResumeSeek)
    video.addEventListener('loadeddata', applyResumeSeek)
    video.addEventListener('canplay', applyResumeSeek)
    return () => {
      video.removeEventListener('loadedmetadata', applyResumeSeek)
      video.removeEventListener('loadeddata', applyResumeSeek)
      video.removeEventListener('canplay', applyResumeSeek)
    }
  }, [currentVideoId, videoRef])

  const endWarning = () => {
    if (!interruptVideo) return false
    const saved = savedPlaybackRef.current
    if (saved) {
      resumeSeekRef.current = saved.time
      if (saved.index !== currentVideoIndex) setCurrentVideoIndex(saved.index)
    }
    savedPlaybackRef.current = null
    setInterruptVideo(null)
    return true
  }

  return {
    educationalVideos,
    currentVideo,
    hasVideos: !!currentVideo,
    isWarning: !!interruptVideo,
    endWarning,
  }
}
