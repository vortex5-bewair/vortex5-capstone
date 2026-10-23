import { useEffect, useMemo, useRef, useState } from 'react'

// Shared by the staff kiosk (pages/BulletinBoard.jsx) and the landing page's
// mini board so the two play warning videos identically.
//
// Educational videos are the normal rotation. A Warning video is tied to one
// trigger: AQI reaching a specific category (e.g. "Fair"), or Humidity /
// Temperature reaching ANY unhealthy level (no sub-category for those two —
// just in or out of their healthy band). When the live reading ENTERS a
// tracked trigger, the matching video takes over the stage until it ends,
// then the educational video it interrupted resumes from the exact position
// it paused at.
//
//   mediaList              every video from /api/media (both types)
//   aqiCategory             the live AQI category name, or null with no reading
//   humidityUnhealthy       true when the live humidity reading is outside its
//                          healthy band (see utils/airQualityGuidance.componentInsight)
//   temperatureUnhealthy    same, for temperature
//   videoRef               ref on the <video> element, read to remember where
//                          the educational video was
//   currentVideoIndex      index into the educational videos
//   setCurrentVideoIndex
//   setIsPlaying            optional; called with true when a warning starts
//                          so it plays even if the rotation had been paused
//
// Returns { educationalVideos, currentVideo, hasVideos, isWarning, endWarning }.
// Call endWarning() from the video's onEnded: it returns true when the video
// that just ended was a warning (and playback has been handed back), false
// when the caller should advance the rotation as usual.
export function useWarningVideos({
  mediaList,
  aqiCategory,
  humidityUnhealthy = false,
  temperatureUnhealthy = false,
  videoRef,
  currentVideoIndex,
  setCurrentVideoIndex,
  setIsPlaying,
}) {
  const educationalVideos = useMemo(
    () => mediaList.filter((m) => m.videoType !== 'Warning'),
    [mediaList]
  )
  // One warning video per trigger: AQI keyed by its specific category,
  // Humidity/Temperature keyed by the parameter alone (no sub-category — see
  // header comment). Newest video for a given trigger wins if more than one
  // was uploaded for it — /api/media is already sorted newest-first.
  const warningByTrigger = useMemo(() => {
    const map = {}
    for (const m of mediaList) {
      if (m.videoType !== 'Warning') continue
      const param = m.warningParameter || 'AQI'
      const key = param === 'AQI' ? (m.aqiCategory ? `AQI:${m.aqiCategory}` : null) : param
      if (key && !map[key]) map[key] = m
    }
    return map
  }, [mediaList])

  // The three trigger values to watch, each paired with the key its matching
  // video would be stored under above. Checked in this order when more than
  // one changes in the same tick (a rare case: only the first match plays —
  // see the effect below).
  const triggers = [
    { param: 'AQI', key: aqiCategory ? `AQI:${aqiCategory}` : null },
    { param: 'Humidity', key: humidityUnhealthy ? 'Humidity' : null },
    { param: 'Temperature', key: temperatureUnhealthy ? 'Temperature' : null },
  ]

  const [interruptVideo, setInterruptVideo] = useState(null)
  const savedPlaybackRef = useRef(null) // { index, time } while interrupted
  const resumeSeekRef = useRef(null) // seconds to seek to once the resumed video is ready
  // Edge-trigger memory per parameter: a warning fires on the transition INTO
  // a trigger, not on every tick while it holds — so the same warning doesn't
  // replay repeatedly while a reading sits unhealthy. Deliberately left
  // untouched (for ALL three parameters) while a warning is already playing,
  // so a change mid-playback (AQI worsening, or humidity crossing while an
  // AQI warning plays) is still caught once the current one finishes, instead
  // of being silently absorbed.
  const prevTriggerKeysRef = useRef({ AQI: null, Humidity: null, Temperature: null })

  useEffect(() => {
    if (interruptVideo) return // one warning at a time; re-evaluate once it ends

    let toTrigger = null
    for (const { param, key } of triggers) {
      if (key === prevTriggerKeysRef.current[param]) continue
      // A trigger was already found earlier in this same pass (e.g. Humidity
      // and Temperature both went unhealthy in the same tick) — stop without
      // committing this parameter's new key. Leaving it stale means it still
      // reads as "changed" next time this effect runs (once the current
      // warning ends and interruptVideo clears), so it gets its own turn
      // instead of being silently marked "already handled" for a warning it
      // never actually got to play.
      if (toTrigger) break
      prevTriggerKeysRef.current[param] = key
      const warning = key ? warningByTrigger[key] : null
      if (warning) toTrigger = warning
    }
    if (!toTrigger) return

    // Deferred to a microtask, same shape as this file's other effects (and
    // the kiosk's own fetch effects) that only ever call setState from
    // inside a nested callback rather than synchronously as the effect's
    // first action — this is genuinely reacting to the live sensor feed, an
    // external system, but the lint rule can't tell that from the call shape.
    const warning = toTrigger
    queueMicrotask(() => {
      savedPlaybackRef.current = {
        index: currentVideoIndex,
        time: videoRef.current?.currentTime || 0,
      }
      setInterruptVideo(warning)
      // A warning is safety content — it plays even if the rotation was paused.
      setIsPlaying?.(true)
    })
    // triggers is a fresh array every render; comparing its contents (not
    // identity) is what the loop above already does via prevTriggerKeysRef,
    // so the three primitive values are what actually belong in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aqiCategory, humidityUnhealthy, temperatureUnhealthy, warningByTrigger, interruptVideo, currentVideoIndex, videoRef, setIsPlaying])

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
