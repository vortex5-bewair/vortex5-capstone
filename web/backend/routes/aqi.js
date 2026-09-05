const express = require('express')
const { requireAuth, requireAdmin } = require('../middleware/requireAuth')
const {
    getAqi,
    getLatestPerDevice,
    getLiveReadings,
    getAnalytics,
    getDeviceReadings
} = require('../controllers/aqiController')

const router = express.Router()

router.use(requireAuth)

// latest reading per device
router.get('/latest', getLatestPerDevice)

// in-memory live (per-frame) reading per device — never the database
router.get('/live', getLiveReadings)

// recent readings for one specific device (device detail diagnostic table)
router.get('/device/:deviceId', getDeviceReadings)

// admin-only descriptive analytics (KPIs, buckets, categories, etc.)
router.get('/analytics', requireAdmin, getAnalytics)

// all recent readings
router.get('/', getAqi)

module.exports = router
