const express = require('express')
const { requireAuth, requireAdmin } = require('../middleware/requireAuth')
const {
    getAqi,
    getLatestPerDevice,
    getLiveReadings,
    streamLiveReadings,
    getAnalytics,
    getDeviceReadings
} = require('../controllers/aqiController')

const router = express.Router()

router.use(requireAuth)

// latest reading per device
router.get('/latest', getLatestPerDevice)

// live (per-frame) readings pushed over Server-Sent Events — never the
// database. Primary transport for the live figure.
router.get('/stream', streamLiveReadings)

// single-shot in-memory live (per-frame) reading per device — never the
// database. Fallback for when /stream can't connect, and for mobile.
router.get('/live', getLiveReadings)

// recent readings for one specific device (device detail diagnostic table)
router.get('/device/:deviceId', getDeviceReadings)

// admin-only descriptive analytics (KPIs, buckets, categories, etc.)
router.get('/analytics', requireAdmin, getAnalytics)

// all recent readings
router.get('/', getAqi)

module.exports = router
