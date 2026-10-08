// AQI calculation from PM2.5 / PM10 concentrations.
//
// Breakpoints come from config/airQualityBands.js — the Philippine national
// table (DENR Administrative Order 2020-14), NOT the US EPA one this file used
// to carry. Do not re-declare them here; the config is the single source of
// truth and both clients read the same table over the API.

const { PM25_BREAKS, PM10_BREAKS } = require('../config/airQualityBands')

function aqiFromConcentration(c, breaks) {
  if (c == null || Number.isNaN(c) || c < 0) return 0
  // Matched by upper bound only, ascending order — the same gap-free pattern
  // config/airQualityBands.js already uses for bandFor() ("value <= b.max",
  // no lower-bound check). The published DENR/EPA breakpoint tables leave
  // real gaps between a band's upper edge and the next band's lower edge:
  // PM2.5's own bands are written one-tenth apart (...55.1 -> 55, 55.1...)
  // which still misses every value strictly between, and PM10's bands sit on
  // bare adjacent integers (54 -> 55) with nothing in between at all. A value
  // landing in one of those gaps used to match no band and silently fall
  // through to the final "off the chart" 500 below — AQI pinned at its worst
  // possible reading for an entirely ordinary concentration.
  //
  // Checking only c <= bpH removes the gap by construction: every value from
  // 0 up to the top published breakpoint matches exactly one band.
  //
  // A value that falls strictly inside a gap (below the matched band's own
  // published bpL) is bridged as a straight line between two real points:
  // (floor, floorIndex) — exactly where the PREVIOUS band's own line ended —
  // and (bpL, iL) — exactly where this band's own line begins. That is the
  // only bridge that is guaranteed to meet both neighbours exactly, so the
  // index is continuous and never decreases as concentration rises, right
  // through what used to be a hole in the table.
  //
  // (Bridging from floor using the MATCHED band's own bpH/iH endpoint instead
  // — i.e. that band's real formula, just evaluated a bit early — was tried
  // first and rejected: band5 and band6 of PM2.5 have different slopes, so
  // that formula does not actually pass through band6's own real start point
  // (91, 301). The index climbed smoothly through the gap but then dropped
  // sharply the instant c reached the official bpL and the real formula took
  // over — a self-inflicted discontinuity at exactly the one point that used
  // to be a real, correct boundary.)
  //
  // A value actually inside a band's own published range is untouched: it
  // still gets that band's own real bpL/bpH/iL/iH, exactly as published.
  let floor = 0
  let floorIndex = 0
  for (const [bpL, bpH, iL, iH] of breaks) {
    if (c <= bpH) {
      if (c >= bpL) {
        return Math.round(((iH - iL) / (bpH - bpL)) * (c - bpL) + iL)
      }
      return Math.round(((iL - floorIndex) / (bpL - floor)) * (c - floor) + floorIndex)
    }
    floor = bpH
    floorIndex = iH
  }
  return 500 // genuinely beyond the top of the published chart
}

// Returns the higher of the two sub-indexes — standard AQI convention, kept
// from the previous implementation and required by the DENR table too.
function computeAqi({ PM25, PM10 }) {
  return Math.max(
    aqiFromConcentration(PM25, PM25_BREAKS),
    aqiFromConcentration(PM10, PM10_BREAKS)
  )
}

// Same as computeAqi but also names which pollutant produced the winning
// sub-index. The alerting code reports this as the AQI alert's `driver` so one
// dusty moment raises one alert that says what caused it, instead of three.
function computeAqiWithDriver({ PM25, PM10 }) {
  const pm25Index = aqiFromConcentration(PM25, PM25_BREAKS)
  const pm10Index = aqiFromConcentration(PM10, PM10_BREAKS)
  return {
    aqi: Math.max(pm25Index, pm10Index),
    driver: pm25Index >= pm10Index ? 'PM25' : 'PM10',
    subIndexes: { PM25: pm25Index, PM10: pm10Index },
  }
}

// ---------------------------------------------------------------------------
// NowCast
//
// The DENR breakpoints above are 24-HOUR values. Feeding them a 30-second
// average — which is what services/mqttSubscriber.js writes — reports a
// momentary puff of dust as if it were a day-long exposure, and was a large
// part of why this dashboard sat in the red.
//
// NowCast (US EPA, AirNow "Technical Information about Fire and Smoke Map
// NowCast") is the standard fix: a weighted mean of the last 12 hourly
// concentrations that weights recent hours more heavily when conditions are
// changing fast, and behaves like a long average when they are stable. It is
// what AirNow itself publishes as the "current" AQI against 24-hour
// breakpoints, so the pairing here is the intended one.
//
//   w* = min(c) / max(c)  over the available hours
//   w  = max(w*, 0.5)
//   NowCast = Σ wⁱ·cᵢ / Σ wⁱ        (i = 0 is the most recent hour)
//
// Requires at least 2 valid hours among the 3 most recent, per EPA. Returns
// null when there is not enough history — the caller then falls back to the
// instantaneous value and records that it did.
// ---------------------------------------------------------------------------
const NOWCAST_HOURS = 12

function nowcast(hourlyMeans) {
  if (!Array.isArray(hourlyMeans)) return null

  // Most recent first, capped at 12 hours.
  const hours = hourlyMeans.slice(0, NOWCAST_HOURS)

  const valid = hours.filter((c) => c != null && !Number.isNaN(c) && c >= 0)
  if (valid.length < 2) return null

  // EPA data-availability rule: 2 of the 3 most recent hours must be present.
  const recentValid = hours.slice(0, 3).filter((c) => c != null && !Number.isNaN(c) && c >= 0)
  if (recentValid.length < 2) return null

  const max = Math.max(...valid)
  const min = Math.min(...valid)

  // A flat zero series has no range to weight; it is already its own answer.
  if (max === 0) return 0

  const rateOfChange = min / max
  const weight = Math.max(rateOfChange, 0.5)

  let weightedSum = 0
  let weightSum = 0
  for (let i = 0; i < hours.length; i++) {
    const c = hours[i]
    if (c == null || Number.isNaN(c) || c < 0) continue
    const w = Math.pow(weight, i)
    weightedSum += w * c
    weightSum += w
  }

  if (weightSum === 0) return null
  return Math.round((weightedSum / weightSum) * 10) / 10
}

module.exports = {
  computeAqi,
  computeAqiWithDriver,
  aqiFromConcentration,
  nowcast,
  NOWCAST_HOURS,
}
