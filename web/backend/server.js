console.log("server START")

require('dotenv').config()

const express = require('express')
const mongoose = require('mongoose')
const healthRoutes = require('./routes/health')
const AqiRoutes = require('./routes/aqi')
const userRoutes = require('./routes/user')
const ThresholdRoutes = require('./routes/threshold')
const auditLogRoutes = require('./routes/auditLog')
const mediaRoutes = require('./routes/media')
const announcementRoutes = require('./routes/announcement')
const deviceRoutes = require('./routes/device')
const dashboardRoutes = require('./routes/dashboard')
const alertsRoutes = require('./routes/alerts')
const roomRoutes = require('./routes/room')
const airQualityRoutes = require('./routes/airQuality')

const mqttSubscriber = require('./services/mqttSubscriber')

// express app
const app = express()

// Render puts this app behind a reverse proxy, so every request Express sees
// arrives from that proxy's own connection, not the real client. Without
// this, req.ip (and anything keyed on it, like express-rate-limit) treats
// every visitor as the same IP — one person spamming an endpoint locks out
// everyone else too. Trusting the first hop makes req.ip read the real
// client IP from X-Forwarded-For instead.
app.set('trust proxy', 1)

// middleware
app.use(express.json())
app.use('/uploads', express.static('uploads'))

const cors = require('cors')

app.use(cors({
  origin: '*', // allow mobile app + web frontend from any origin
}))

// routes
// Public: Render's rolling-deploy health check polls this (no auth token to send).
app.use('/api/health',        healthRoutes)
app.use('/api/aqi',           AqiRoutes)
app.use('/api/user',          userRoutes)
app.use('/api/threshold',     ThresholdRoutes)
app.use('/api/auditlog',      auditLogRoutes)        // lowercase to match frontend
app.use('/api/media',         mediaRoutes)
app.use('/api/announcements', announcementRoutes)
app.use('/api/device',        deviceRoutes)
app.use('/api/dashboard',     dashboardRoutes)
app.use('/api/alerts',        alertsRoutes)
app.use('/api/room',          roomRoutes)
// Public: the canonical air-quality band table (no auth by design).
app.use('/api/air-quality',   airQualityRoutes)

// connect to db // mongoose
mongoose.connect(process.env.MONGO_URI)
.then(() => {
   const PORT = process.env.PORT || 4000
   app.listen(PORT, '0.0.0.0', () => {
     console.log('connected to DB and listening on port', PORT)
   })
   mqttSubscriber.start()
})
.catch((error) => {
   console.log(error)
})
