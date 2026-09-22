import { useEffect } from 'react'

const SPEED_PX_PER_SEC = 18
const DWELL_MS = 1800

/**
 * Slow, continuous auto-scroll crawl through a scrollable element — the
 * bulletin board's "reads itself" behaviour, shared by the kiosk display and
 * the public landing page's smaller copy of it. Pauses to let a reader settle
 * at the top and bottom, and pauses entirely on hover so a passer-by can stop
 * it to read. Restarts whenever an entry in `deps` changes (e.g. the list
 * content reloads).
 *
 * @param {import('react').RefObject<HTMLElement>} ref
 * @param {unknown[]} deps
 */
export function useAutoScrollList(ref, deps) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let rafId
    let hovering = false
    let phase = 'scrolling' // 'scrolling' | 'pausedAtBottom' | 'pausedAtTop'
    let phaseStart = performance.now()
    let lastTs = phaseStart
    // scrollTop only stores whole pixels, so a sub-pixel-per-frame speed
    // (a few tenths of a px at 60fps) would round back to the same integer
    // every frame and never move. Track the true position separately and
    // only round when writing it to the DOM.
    let pos = el.scrollTop

    const onEnter = () => { hovering = true }
    const onLeave = () => { hovering = false }
    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', onLeave)

    const step = (ts) => {
      const dt = ts - lastTs
      lastTs = ts
      const maxScroll = el.scrollHeight - el.clientHeight

      if (maxScroll > 1 && !hovering) {
        if (phase === 'scrolling') {
          pos += (SPEED_PX_PER_SEC * dt) / 1000
          if (pos >= maxScroll) {
            pos = maxScroll
            el.scrollTop = pos
            phase = 'pausedAtBottom'
            phaseStart = ts
          } else {
            el.scrollTop = pos
          }
        } else if (phase === 'pausedAtBottom' && ts - phaseStart >= DWELL_MS) {
          pos = 0
          el.scrollTop = pos
          phase = 'pausedAtTop'
          phaseStart = ts
        } else if (phase === 'pausedAtTop' && ts - phaseStart >= DWELL_MS) {
          phase = 'scrolling'
        }
      }

      rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(rafId)
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mouseleave', onLeave)
    }
    // `deps` is the caller's restart signal (e.g. [announcements]) — passed
    // straight through to useEffect's own dependency array by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
