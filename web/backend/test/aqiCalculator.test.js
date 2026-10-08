const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { aqiFromConcentration, computeAqi } = require('../utils/aqiCalculator')
const { PM25_BREAKS, PM10_BREAKS } = require('../config/airQualityBands')

describe('aqiFromConcentration — no gaps', () => {
  test('PM2.5: every 0.01 step from 0 up past the top of the chart returns a number, never undefined/NaN', () => {
    for (let v = 0; v <= 210; v = Math.round((v + 0.01) * 100) / 100) {
      const idx = aqiFromConcentration(v, PM25_BREAKS)
      assert.ok(Number.isFinite(idx), `PM25=${v} returned ${idx}`)
    }
  })

  test('PM10: every 0.01 step from 0 up past the top of the chart returns a number, never undefined/NaN', () => {
    for (let v = 0; v <= 510; v = Math.round((v + 0.01) * 100) / 100) {
      const idx = aqiFromConcentration(v, PM10_BREAKS)
      assert.ok(Number.isFinite(idx), `PM10=${v} returned ${idx}`)
    }
  })

  // Not "never 500 below the exact top" — interpolation legitimately rounds
  // up to 500 in the last fraction of a unit before the official top (e.g.
  // PM2.5 199.73 rounds to 500 on its own real formula, nothing to do with
  // the gap bug). The actual regression this guards is a GAP causing a
  // moderate value to silently fall through — checked well clear of that
  // legitimate rounding zone.
  test('PM2.5: no gap-induced 500 well below the top of the chart', () => {
    for (let v = 0; v < 198; v = Math.round((v + 0.01) * 100) / 100) {
      const idx = aqiFromConcentration(v, PM25_BREAKS)
      assert.notEqual(idx, 500, `PM25=${v} incorrectly hit the off-the-chart fallback`)
    }
  })

  test('PM10: no gap-induced 500 well below the top of the chart', () => {
    for (let v = 0; v < 502; v = Math.round((v + 0.01) * 100) / 100) {
      const idx = aqiFromConcentration(v, PM10_BREAKS)
      assert.notEqual(idx, 500, `PM10=${v} incorrectly hit the off-the-chart fallback`)
    }
  })

  test('PM2.5: the old gap at 90.05-90.95 now resolves to a sensible, non-500 number', () => {
    for (const v of [90.1, 90.5, 90.9]) {
      const idx = aqiFromConcentration(v, PM25_BREAKS)
      assert.ok(idx > 280 && idx < 310, `PM25=${v} -> ${idx}, expected roughly 280-310`)
    }
  })

  test('PM10: the old gaps at 54.05-54.95 and 154.05-154.95 now resolve to sensible numbers', () => {
    const a = aqiFromConcentration(54.5, PM10_BREAKS)
    assert.ok(a > 45 && a < 55, `PM10=54.5 -> ${a}, expected roughly 45-55`)
    const b = aqiFromConcentration(154.5, PM10_BREAKS)
    assert.ok(b > 95 && b < 105, `PM10=154.5 -> ${b}, expected roughly 95-105`)
  })
})

describe('aqiFromConcentration — the exact values from the bug report', () => {
  // Reproduced live and confirmed none of these individually landed in a gap
  // even before the fix — they are here as a fixed baseline so a future
  // change to the breakpoint table can't silently move them. The actual
  // field incident (AQI 500 with "moderate" PM2.5) is covered separately
  // below, via computeAqi() with a PM10 value landing in one of PM10's gaps.
  const pm25Cases = [
    [45.5, 153], [46, 155], [46.5, 158], [47, 160],
    [70.5, 245], [71, 246], [72.5, 250],
  ]
  for (const [v, expected] of pm25Cases) {
    test(`PM25=${v} -> ${expected}`, () => {
      assert.equal(aqiFromConcentration(v, PM25_BREAKS), expected)
    })
  }

  const pm10Cases = [
    [51.5, 48], [52, 48], [53, 49], [54, 50],
    [76.5, 62], [79.5, 63],
  ]
  for (const [v, expected] of pm10Cases) {
    test(`PM10=${v} -> ${expected}`, () => {
      assert.equal(aqiFromConcentration(v, PM10_BREAKS), expected)
    })
  }

  test('none of the given PM2.5/PM10 test values is 500', () => {
    for (const [v] of pm25Cases) assert.notEqual(aqiFromConcentration(v, PM25_BREAKS), 500)
    for (const [v] of pm10Cases) assert.notEqual(aqiFromConcentration(v, PM10_BREAKS), 500)
  })
})

describe('computeAqi — reproduces the actual field incident', () => {
  test('moderate PM2.5 (~46) with a PM10 that used to land in a gap no longer pins AQI at 500', () => {
    const aqi = computeAqi({ PM25: 46, PM10: 54.5 }) // 54.5 was inside the old PM10 gap
    assert.notEqual(aqi, 500)
    assert.ok(aqi < 200, `expected a moderate AQI, got ${aqi}`)
  })

  test('moderate PM2.5 (~71) with a PM10 that used to land in the other gap no longer pins AQI at 500', () => {
    const aqi = computeAqi({ PM25: 71, PM10: 154.5 }) // 154.5 was inside the old PM10 gap
    assert.notEqual(aqi, 500)
    assert.ok(aqi < 300, `expected a moderate-to-high AQI, got ${aqi}`)
  })

  test('AQI is the higher of the two sub-indexes', () => {
    assert.equal(computeAqi({ PM25: 10, PM10: 500 }), aqiFromConcentration(500, PM10_BREAKS))
    assert.equal(computeAqi({ PM25: 500, PM10: 10 }), aqiFromConcentration(500, PM25_BREAKS))
  })
})

describe('aqiFromConcentration — top end still correctly caps at 500', () => {
  test('PM2.5 exactly at the top of the published chart (200) is 500', () => {
    assert.equal(aqiFromConcentration(200, PM25_BREAKS), 500)
  })
  test('PM2.5 above the chart is 500', () => {
    assert.equal(aqiFromConcentration(200.1, PM25_BREAKS), 500)
    assert.equal(aqiFromConcentration(5000, PM25_BREAKS), 500)
  })
  test('PM10 exactly at the top of the published chart (504) is 500', () => {
    assert.equal(aqiFromConcentration(504, PM10_BREAKS), 500)
  })
  test('PM10 above the chart is 500', () => {
    assert.equal(aqiFromConcentration(504.1, PM10_BREAKS), 500)
    assert.equal(aqiFromConcentration(5000, PM10_BREAKS), 500)
  })
  test('negative concentration is 0, not an error and not 500', () => {
    assert.equal(aqiFromConcentration(-5, PM25_BREAKS), 0)
  })
  test('null/NaN concentration is 0', () => {
    assert.equal(aqiFromConcentration(null, PM25_BREAKS), 0)
    assert.equal(aqiFromConcentration(NaN, PM25_BREAKS), 0)
  })
})

describe('aqiFromConcentration — monotonic and continuous (no discontinuities introduced by the fix)', () => {
  test('PM2.5: index never decreases as concentration increases', () => {
    let prev = -1
    for (let v = 0; v <= 200; v = Math.round((v + 0.1) * 10) / 10) {
      const idx = aqiFromConcentration(v, PM25_BREAKS)
      assert.ok(idx >= prev, `PM25=${v} -> ${idx}, went down from ${prev}`)
      prev = idx
    }
  })
  test('PM10: index never decreases as concentration increases', () => {
    let prev = -1
    for (let v = 0; v <= 504; v = Math.round((v + 0.1) * 10) / 10) {
      const idx = aqiFromConcentration(v, PM10_BREAKS)
      assert.ok(idx >= prev, `PM10=${v} -> ${idx}, went down from ${prev}`)
      prev = idx
    }
  })
})
