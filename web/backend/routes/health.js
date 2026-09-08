const express = require('express')
const mongoose = require('mongoose')
const { isConnected: isMqttConnected } = require('../services/mqttSubscriber')

const router = express.Router()

// No requireAuth — Render's health checker has no token to send, and this
// leaks nothing but the readiness of two internal dependencies.
//
// Only Mongo being down fails the check (503). Nearly every route reads or
// writes Mongo, so if it's down the app is genuinely non-functional and a
// rolling deploy should not cut traffic to this instance. MQTT is a
// live-sensor-stream input only — the rest of the app (auth, thresholds,
// announcements, alerts, history) works fine without it, matching the
// degrade-rather-than-fail pattern airQualityController already uses for its
// own DB lookups. A momentary MQTT reconnect (the client's own 'reconnect'
// handler treats this as routine) still reports 200, just as 'degraded'.
router.get('/', (req, res) => {
  const mongoUp = mongoose.connection.readyState === 1
  const mqttUp = isMqttConnected()

  res.status(mongoUp ? 200 : 503).json({
    status: mongoUp ? (mqttUp ? 'ok' : 'degraded') : 'down',
    mongo: mongoUp ? 'up' : 'down',
    mqtt: mqttUp ? 'up' : 'down',
    timestamp: new Date().toISOString(),
  })
})

module.exports = router
