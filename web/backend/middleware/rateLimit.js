const rateLimit = require('express-rate-limit')

// Guards the endpoints that trigger an outbound email (signup verification
// code, password reset code). Without this, nothing stops a script from
// repeatedly hitting these routes to spam a real person's inbox with codes
// or burn through the app's Brevo sending quota. Limited per IP — this app
// runs as a single Render instance, so an in-memory store is sufficient.
const emailCodeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a few minutes and try again.' },
})

// Guards public, unauthenticated read endpoints (the landing page's live
// snapshot). The response is also cached server-side for a few seconds, so this
// only has to stop a single client hammering the route — set well above a few
// open tabs polling every 10 s, since a whole school can share one public IP.
const publicReadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
})

module.exports = { emailCodeLimiter, publicReadLimiter }
