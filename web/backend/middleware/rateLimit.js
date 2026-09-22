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
// snapshot). The payload is memoised for a few seconds, so a request is cheap
// and this only has to stop one client flooding the route. Deliberately
// generous: each open tab polls every 10 s (6/min), and the static site proxies
// /api to us, so many visitors can arrive from one shared address — a tight
// limit would start returning 429s to real people.
const publicReadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
})

module.exports = { emailCodeLimiter, publicReadLimiter }
