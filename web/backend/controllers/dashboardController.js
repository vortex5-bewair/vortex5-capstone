const Device = require('../models/DeviceModel')
const User = require('../models/userModel')
const getVisibleDeviceIds = require('../utils/visibleDevices')
const { isDeviceOnline, latestReadingsByDevice } = require('../utils/deviceStatus')
const { resolveLimits } = require('../utils/thresholdLimits')
const { evaluateReading } = require('../utils/alertEvaluator')
const { categoryFor } = require('../config/airQualityBands')

// Categories, limits and the alert rule all come from config/airQualityBands.js
// via the shared helpers. This file used to carry its own copy of each, so the
// alert cards here could disagree with /api/alerts/current about the same room.
const aqiCategory = categoryFor

// Admin-only: bundled dashboard data — KPIs, device cards, current alerts.
const getDashboardSummary = async (req, res) => {
  try {
    const userDeviceIds = await getVisibleDeviceIds(req.user)

    // 1. User count
    const userCount = await User.countDocuments({ status: 'active' })

    // 2. Devices the admin owns, with their latest reading
    const devices = await Device.find({ deviceId: { $in: userDeviceIds } }).lean()

    const readingMap = await latestReadingsByDevice(userDeviceIds)

    // Derive online/offline status (lastSeen < 30s = online — the rule lives in
    // utils/deviceStatus.js, shared with the public landing endpoint).
    // When offline, null out reading-derived fields so the UI shows "--" instead of stale data.
    const now = Date.now()
    const enrichedDevices = devices.map(d => {
      const isOnline = isDeviceOnline(d, now)
      const reading = isOnline ? readingMap[d.deviceId] : null
      const aqi = reading?.Aqi
      return {
        deviceId: d.deviceId,
        name: d.name,
        room: d.room,
        status: isOnline ? (reading ? 'active' : 'available') : 'offline',
        lastSeen: d.lastSeen,
        aqi: aqi ?? null,
        category: aqi != null ? aqiCategory(aqi) : null,
        pm25: reading?.PM25 ?? null,
        co2: reading?.CO2 ?? null,
        temp: reading?.Temperature ?? null,
      }
    })

    const onlineCount = enrichedDevices.filter(d => d.status === 'active' || d.status === 'available').length
    const offlineCount = enrichedDevices.length - onlineCount

    // 3. Average AQI across all online devices right now.
    // null (not 0) when nothing is reporting — 0 would read as a real
    // "Good" measurement instead of "no data available".
    const activeReadings = enrichedDevices.filter(d => d.aqi != null).map(d => d.aqi)
    const avgAqi = activeReadings.length > 0
      ? Math.round(activeReadings.reduce((s, v) => s + v, 0) / activeReadings.length)
      : null

    // 4. Current alerts: the limits in force are the active threshold row
    //    merged over the canonical bands.
    const { limits } = await resolveLimits()

    const alerts = []
    for (const d of enrichedDevices) {
      // Skip offline devices — stale readings must not trigger active alerts.
      if (d.status === 'offline') continue
      const r = readingMap[d.deviceId]
      if (!r) continue
      // NOTE: this card list grades the LATEST row, not the 5-minute dwell mean
      // that /api/alerts/current uses, because the dashboard is a live status
      // panel rather than a notification feed. Same limits, same rule, shorter
      // window — so a number here can lead the alerts page by a few minutes.
      for (const hit of evaluateReading(r, limits)) {
        alerts.push({
          deviceId: d.deviceId,
          name: d.name,
          room: d.room,
          ...hit,
          at: r.createdAt,
        })
      }
    }

    // sort by severity then magnitude. Two-sided fields can alert for being
    // too LOW, where value/limit is below 1 — invert those so a room at 15 °C
    // sorts as badly as one at 38 °C instead of falling to the bottom.
    const magnitude = (a) => (a.direction === 'below' ? a.limit / a.value : a.value / a.limit)
    alerts.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1
      return magnitude(b) - magnitude(a)
    })

    res.status(200).json({
      kpis: {
        totalDevices: enrichedDevices.length,
        onlineDevices: onlineCount,
        offlineDevices: offlineCount,
        userCount,
        activeAlerts: alerts.length,
        avgAqi,
        avgCategory: avgAqi != null ? aqiCategory(avgAqi) : null,
      },
      devices: enrichedDevices,
      alerts,
    })
  } catch (error) {
    console.error('[dashboard] error:', error)
    res.status(500).json({ error: error.message })
  }
}

module.exports = { getDashboardSummary }
