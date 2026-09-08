import { useEffect, useState, useCallback } from 'react'

const STORAGE_KEY = 'bewair-theme'

function readInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* no-op */ }
  // Default to system preference; fall back to light.
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

// ----- Shared module-level state -----
// All useTheme() callers read from and subscribe to this single source of truth,
// so toggling the theme anywhere (e.g. the sidebar) updates every component that
// depends on it — including the Analytics page's MUI ThemeProvider — without a refresh.
let currentTheme = readInitialTheme()
const listeners = new Set()

// Apply the saved theme before React mounts to avoid a flash.
applyTheme(currentTheme)

function setGlobalTheme(next) {
  if (next !== 'light' && next !== 'dark') return
  currentTheme = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* no-op */ }
  applyTheme(next)
  listeners.forEach(fn => fn(next))
}

export function useTheme() {
  const [theme, setLocal] = useState(currentTheme)

  // Corrects any staleness between this component's initial render and its
  // mount effect running below (e.g. another already-mounted component's
  // toggle firing in between) — done here, during render, rather than as a
  // setState call inside the effect: React's own bail-out for a render-phase
  // setState re-renders once immediately without committing the stale value,
  // instead of committing-then-effect-then-correcting a frame later.
  if (theme !== currentTheme) {
    setLocal(currentTheme)
  }

  useEffect(() => {
    // Subscribe so this component re-renders whenever the global theme changes.
    const fn = (t) => setLocal(t)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])

  const setTheme = useCallback((next) => setGlobalTheme(next), [])
  const toggle = useCallback(() => setGlobalTheme(currentTheme === 'dark' ? 'light' : 'dark'), [])

  return { theme, setTheme, toggle, isDark: theme === 'dark' }
}
