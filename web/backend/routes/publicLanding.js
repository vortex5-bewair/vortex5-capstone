const express = require('express')
const { getLanding } = require('../controllers/publicLandingController')
const { publicReadLimiter } = require('../middleware/rateLimit')

const router = express.Router()

// No requireAuth: this feeds the logged-out landing page. It returns a
// sanitized snapshot only (see the controller for exactly what is exposed) and
// is rate-limited and briefly cached because anyone can call it.
router.get('/landing', publicReadLimiter, getLanding)

module.exports = router
