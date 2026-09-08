// Air-quality guidance, sourced from the backend.
//
// This file used to hardcode its own EPA/WHO/ASHRAE bands, which disagreed
// with the backend alert limits, with the admin threshold rows and with the
// mobile app. It now reads the canonical table from
// GET /api/air-quality/bands — the same table the alerting code uses — so the
// colour on a tile and the alert in the feed can no longer contradict.
//
// The exported functions stay SYNCHRONOUS on purpose: they are called during
// render by a dozen components. `initAirQualityBands()` hydrates a module-level
// cache once at startup (see src/main.jsx); until then, and whenever the fetch
// fails, the bundled fallback below answers. The fallback is generated —
// `node scripts/generateClientBands.js` in web/backend — so it cannot drift
// from the server table.

import FALLBACK_BANDS from './airQualityBands.fallback.json'

let BANDS = FALLBACK_BANDS

/** Category name -> hex. Mutated in place on hydration so imported references stay live. */
export const CATEGORY_COLORS = {}

// Adjusted variants of the served category colors, for use as TEXT on this
// dashboard's card backgrounds (white/--color-surface-2 in light mode,
// --color-surface-2/--color-surface in dark — AdminDashboard, StaffDeviceList,
// ClassroomRecords and DeviceDetail all render an AQI figure + category label
// this way). CATEGORY_COLORS itself is the served palette shared with charts,
// swatches and the mobile app — tuned to read as a color chip, not as body
// text — and WCAG AA's 4.5:1 pulls each theme's failures in opposite
// directions: in light mode the light/vivid colors fail (Good 3.30:1, Fair
// 2.15:1, USG 3.56:1) and need darkening; in dark mode it's the dark, heavily
// saturated ones that fail against a dark background (Very Unhealthy 3.35:1,
// Acutely Unhealthy 3.01:1, Emergency 1.62:1) and need lightening instead —
// while Good/Fair/USG are already fine as-is there (4.55–7.54:1). This table
// is local to the web dashboard and never written back to
// airQualityBands.fallback.json, which is generated from the backend's
// canonical table and shared with the mobile app against its own backgrounds.
const TEXT_SAFE_CATEGORY_COLORS_LIGHT = {
  Good: '#12843c',
  Fair: '#9e6506',
  'Unhealthy for Sensitive Groups': '#c3490a',
}
const TEXT_SAFE_CATEGORY_COLORS_DARK = {
  'Very Unhealthy': '#e55b5b',
  'Acutely Unhealthy': '#ae66ef',
  Emergency: '#db6060',
}
export const textSafeCategoryColor = (category, isDark) => {
  const table = isDark ? TEXT_SAFE_CATEGORY_COLORS_DARK : TEXT_SAFE_CATEGORY_COLORS_LIGHT
  return table[category] || CATEGORY_COLORS[category]
}

// componentInsight() below returns a band color per metric (PM2.5, CO2, etc)
// straight from the served table — there are more of these than the 6 AQI
// categories, and the set can change without a redeploy (it comes from the
// backend), so a hand-picked lookup table isn't practical the way it is for
// textSafeCategoryColor above. This adjusts any given color algorithmically:
// darkens it in light mode, lightens it in dark mode, in HSL space (keeping
// the hue so it still reads as "the same color", just legible) until it
// clears 4.5:1 against a representative surface color for that theme.
function relativeLuminance(hex) {
  const toLin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const r = toLin(parseInt(hex.slice(1, 3), 16) / 255)
  const g = toLin(parseInt(hex.slice(3, 5), 16) / 255)
  const b = toLin(parseInt(hex.slice(5, 7), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrastRatio(a, b) {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h * 360, s * 100, l * 100]
}
function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r, g, b
  if (s === 0) { r = g = b = l }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
// Representative card backgrounds — not exact for every site this is used
// from, but close enough that a color passing against these passes in
// practice everywhere it's actually placed (verified per call site).
const REFERENCE_BG_LIGHT = '#ffffff'
const REFERENCE_BG_DARK = '#161c24'
function blendOver(fgHex, alpha, bgHex) {
  const f = (i) => parseInt(fgHex.slice(i, i + 2), 16)
  const b = (i) => parseInt(bgHex.slice(i, i + 2), 16)
  const mix = (i) => Math.round(f(i) * alpha + b(i) * (1 - alpha))
  const toHex = (x) => x.toString(16).padStart(2, '0')
  return `#${toHex(mix(1))}${toHex(mix(3))}${toHex(mix(5))}`
}
/**
 * @param {string} hex - the served insight/band color.
 * @param {boolean} isDark
 * @param {number} [selfTintAlpha] - pass this when the color is ALSO used to
 *   derive its own translucent background (e.g. `background: color + '20'`,
 *   as AqiDetails' badges and the kiosk's announcement-category pills do).
 *   Solved so the text passes 4.5:1 against that self-composited tint, not
 *   just against the plain card surface — a fixed-reference check alone
 *   still let badges as low as 3.81:1 through.
 */
export function readableInsightColor(hex, isDark, selfTintAlpha) {
  if (!hex) return hex
  const surface = isDark ? REFERENCE_BG_DARK : REFERENCE_BG_LIGHT
  const effectiveBg = (candidate) =>
    selfTintAlpha ? blendOver(candidate, selfTintAlpha, surface) : surface
  if (contrastRatio(hex, effectiveBg(hex)) >= 4.5) return hex
  const [h, s, l] = hexToHsl(hex)
  const step = isDark ? 1 : -1
  for (let newL = l; newL >= 0 && newL <= 100; newL += step) {
    const candidate = hslToHex(h, s, newL)
    if (contrastRatio(candidate, effectiveBg(candidate)) >= 4.5) return candidate
  }
  return isDark ? '#ffffff' : '#000000'
}

/** Field key -> served definition. Rebuilt on hydration. */
let FIELD_MAP = {}

function applyBands(next) {
  BANDS = next

  for (const key of Object.keys(CATEGORY_COLORS)) delete CATEGORY_COLORS[key]
  for (const c of BANDS.categories) CATEGORY_COLORS[c.name] = c.color

  FIELD_MAP = Object.fromEntries(BANDS.fields.map((f) => [f.key, f]))
}

applyBands(FALLBACK_BANDS)

/**
 * Fetch the canonical bands and replace the cache. Call once at startup.
 * Never throws — a failure leaves the bundled fallback in place, which is a
 * degraded but correct table rather than a blank screen.
 */
export async function initAirQualityBands() {
  try {
    const res = await fetch('/api/air-quality/bands')
    if (!res.ok) throw new Error(`bands request failed (${res.status})`)
    const json = await res.json()
    if (!json?.categories?.length || !json?.fields?.length) throw new Error('bands payload malformed')
    applyBands(json)
    return json
  } catch (err) {
    console.warn('[air-quality] using bundled band table:', err.message)
    return null
  }
}

/** The limits currently in force (admin override merged over canonical). */
export function airQualityLimits() {
  return BANDS.limits
}

/** Where those limits came from: 'active' | 'newest' | 'canonical'. */
export function airQualityLimitsSource() {
  return BANDS.limitsSource
}

/** Attribution line for the standards behind the numbers. */
export function airQualitySource() {
  return BANDS.source
}

/**
 * The served AQI categories, with their bounds, colours and advice.
 * Analytics needs the bounds for chart bands and the advice for the health
 * note, both of which it used to hardcode against the old EPA names.
 */
export function airQualityCategories() {
  return BANDS.categories
}

/** The advice line for a category NAME, or '' when it is unknown. */
export function categoryNote(name) {
  return BANDS.categories.find((c) => c.name === name)?.actions?.[0] || ''
}

/** The served field definitions, in display order. */
export function airQualityFields() {
  return BANDS.fields
}

/**
 * The served display groups, each with the fields that belong to it.
 * Membership comes from each field's own `group` key, so adding a field to the
 * canonical table places it in a section without this page being touched.
 */
export function airQualityFieldGroups() {
  const groups = BANDS.groups ?? []
  return groups
    .map((g) => ({ ...g, fields: BANDS.fields.filter((f) => f.group === g.key) }))
    .filter((g) => g.fields.length > 0)
}

/**
 * The editable limit keys, flattened the way the thresholds collection stores
 * them: a scalar per one-sided field, Min/Max for the two-sided ones.
 * Returns [{ key, field, label, unit, alerting, bound }].
 */
export function airQualityLimitKeys() {
  const keys = []
  for (const f of BANDS.fields) {
    if (f.twoSided) {
      keys.push({ key: `${f.key}Min`, field: f.key, label: `${f.label} min`, unit: f.unit, alerting: f.alerting, bound: 'min' })
      keys.push({ key: `${f.key}Max`, field: f.key, label: `${f.label} max`, unit: f.unit, alerting: f.alerting, bound: 'max' })
    } else {
      keys.push({ key: f.key, field: f.key, label: f.label, unit: f.unit, alerting: f.alerting, bound: 'max' })
    }
  }
  return keys
}

// ---------------------------------------------------------------------------
// AQI
// ---------------------------------------------------------------------------

export function aqiCategory(aqi) {
  if (aqi == null) return null
  const cats = BANDS.categories
  for (const c of cats) {
    if (aqi <= c.max) return c.name
  }
  return cats[cats.length - 1].name
}

export function aqiAdvisory(aqi) {
  if (aqi == null) return null
  const cats = BANDS.categories
  const cat = cats.find((c) => aqi <= c.max) || cats[cats.length - 1]
  return {
    category: cat.name,
    color: cat.color,
    actions: cat.actions || [],
  }
}

// ---------------------------------------------------------------------------
// Per-component insights
// ---------------------------------------------------------------------------

// The UI addresses components by short lowercase keys; the canonical table uses
// the sensor field names, which are fixed by the MQTT contract.
const KEY_TO_FIELD = {
  pm1: 'PM1',
  pm25: 'PM25',
  pm10: 'PM10',
  co2: 'CO2',
  tvoc: 'TVOC',
  hcho: 'Formaldehyde',
  temp: 'Temperature',
  humidity: 'Humidity',
}

/** True when the value sits inside the field's acceptable range. */
function isOk(field, v) {
  if (field.twoSided) {
    if (field.alertLow != null && v < field.alertLow) return false
    if (field.alertHigh != null && v > field.alertHigh) return false
    return true
  }
  return field.alertHigh == null || v <= field.alertHigh
}

/**
 * Per-component qualitative reading + concrete action.
 * Returns { label, unit, level, color, advice, derived, ok } or null.
 *
 * `derived` marks CO2 and formaldehyde: the FS00905B simulates both from its
 * VOC element rather than measuring them, and the UI must say so.
 */
export function componentInsight(key, v) {
  if (v == null) return null

  const fieldKey = KEY_TO_FIELD[key]
  const field = fieldKey ? FIELD_MAP[fieldKey] : null
  if (!field) return null

  const band =
    field.bands.find((b) => b.max == null || v <= b.max) ||
    field.bands[field.bands.length - 1]

  return {
    label: field.label,
    unit: field.unit,
    level: band.level,
    color: band.color,
    advice: band.advice,
    derived: field.derived,
    ok: isOk(field, v),
  }
}

/** Build a list of component insights that need attention (not OK), from a reading. */
export function flaggedComponents(reading) {
  if (!reading) return []
  const map = [
    ['pm25', reading.PM25],
    ['pm10', reading.PM10],
    ['co2', reading.CO2],
    ['tvoc', reading.TVOC],
    ['hcho', reading.Formaldehyde],
    ['temp', reading.Temperature],
    ['humidity', reading.Humidity],
  ]
  return map
    .map(([k, v]) => componentInsight(k, v))
    .filter((c) => c && !c.ok)
}
