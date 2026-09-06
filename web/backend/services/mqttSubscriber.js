const mqtt = require('mqtt')
const { EventEmitter } = require('events')
const AqiModel = require('../models/AqiModel')
const Device = require('../models/DeviceModel')
const { decodeFrame } = require('../utils/sensorDecoder')
const { computeAqi, nowcast, NOWCAST_HOURS } = require('../utils/aqiCalculator')

const HIVEMQ_URL = 'mqtts://1c097cff873e428286ffc57255b3a044.s1.eu.hivemq.cloud:8883'
const TOPIC      = 'bewair/+/telemetry'

let _client = null

// ---- write throttling ----
// The sensor pushes roughly one frame per second. Persisting every frame is
// ~86,000 documents per device per day, which fills a free-tier Atlas cluster
// in about two weeks. Instead we average the incoming frames and write one row
// per interval; only storage is reduced. Live values arrive at full rate via
// the in-memory `latest` store below, read by GET /api/aqi/live — this used to
// just be a comment with nothing behind it.
const WRITE_INTERVAL_MS = Number(process.env.AQI_WRITE_INTERVAL_SEC || 30) * 1000

// lastSeen must stay fresher than the 30s window dashboardController uses to
// decide a device is offline, so it updates on its own shorter cadence.
const LASTSEEN_INTERVAL_MS = 10 * 1000

// Window for the "smoothed" live value: long enough to calm raw per-frame
// jitter for a display like the kiosk, short enough to still be current.
// Unrelated to WRITE_INTERVAL_MS/NowCast — this never touches the DB.
const LIVE_SMOOTH_MS = Number(process.env.AQI_LIVE_SMOOTH_SEC || 15) * 1000

// Any deviceId publishing to the wildcard telemetry topic gets a `latest`
// slot, registered or not (mqttSubscriber deliberately never upserts
// devices — see the heartbeat block below). Sweep out entries nobody has
// heard from in a while so this can't grow without bound.
const LIVE_EVICT_MS = Number(process.env.AQI_LIVE_EVICT_SEC || 300) * 1000
const LIVE_EVICT_SWEEP_MS = 60 * 1000

// Cap on concurrent SSE clients per process. Purely in-memory and per-process
// on purpose — this backend runs single-instance (no render.yaml/PM2/cluster
// config in the repo).
const STREAM_MAX_CLIENTS = Number(process.env.AQI_STREAM_MAX_CLIENTS || 50)
let streamClientCount = 0

const METRIC_FIELDS = ['PM1', 'PM25', 'PM10', 'TVOC', 'CO2', 'Formaldehyde', 'Temperature', 'Humidity']
const DECIMAL_FIELDS = new Set(['Temperature', 'Humidity'])

// deviceId -> { sums, count, lastWrite, lastSeenWrite }
const buffers = new Map()

// deviceId -> { metrics, aqiInstant, smoothedMetrics, smoothed, receivedAt, window }
// In-memory only, updated on every decoded frame. Never read from or written
// to the database — a process restart empties this, on purpose (see
// getLiveReading below: no DB fallback, ever). Entries are evicted after
// LIVE_EVICT_MS of silence (see the sweep below start()).
const latest = new Map()

// Fan-out for per-frame pushes to SSE handlers. Emits just the deviceId;
// listeners read back through getLiveReading() so there is exactly one
// definition of what a live reading looks like.
const liveEvents = new EventEmitter()
liveEvents.setMaxListeners(STREAM_MAX_CLIENTS + 5)

function zeroSums() {
  const sums = {}
  for (const f of METRIC_FIELDS) sums[f] = 0
  return sums
}

// Average a short window of raw frames the same way averageOf() averages a
// 30s buffer: per-field mean, rounded the same way. Used for the live
// "smoothed" value so a kiosk's number and its metric tiles come from the
// exact same window and can never disagree with each other.
function averageWindow(window) {
  const avg = {}
  for (const f of METRIC_FIELDS) {
    const sum = window.reduce((s, w) => s + w[f], 0)
    const v = sum / window.length
    avg[f] = DECIMAL_FIELDS.has(f) ? Math.round(v * 10) / 10 : Math.round(v)
  }
  return avg
}

// Average the buffered frames. AQI is recomputed from the averaged metrics
// rather than averaged itself, because the DENR AQI curve is piecewise linear
// and the mean of AQI values is not the AQI of the mean. (That invariant still
// holds for the NowCast path below, which also averages concentrations and
// converts once, never the other way round.)
function averageOf(buf) {
  const avg = {}
  for (const f of METRIC_FIELDS) {
    const v = buf.sums[f] / buf.count
    avg[f] = DECIMAL_FIELDS.has(f) ? Math.round(v * 10) / 10 : Math.round(v)
  }
  return avg
}

// ---------------------------------------------------------------------------
// NowCast input.
//
// The DENR breakpoints are 24-HOUR values, so converting a 30-second average
// through them reports a passing puff of dust as a day of exposure. NowCast
// (see utils/aqiCalculator.js) needs the last 12 HOURLY mean concentrations,
// which we read back out of the collection we are already writing.
//
// Cost is one aggregation per device per write interval (30 s) over at most
// 12 h of that device rows — a few hundred documents, served by the
// {deviceId, createdAt} compound index. Reading from the DB rather than an
// in-memory ring buffer means a backend restart does not reset the AQI to its
// instantaneous value for the next 12 hours.
//
// Gaps matter: NowCast weights by HOW MANY HOURS AGO a mean is, so a missing
// hour has to stay a null slot rather than letting later hours slide forward.
// ---------------------------------------------------------------------------
async function hourlyMeans(deviceId) {
  const hourMs = 3600 * 1000
  const since = new Date(Date.now() - NOWCAST_HOURS * hourMs)

  const rows = await AqiModel.aggregate([
    { $match: { deviceId, createdAt: { $gte: since } } },
    { $group: {
      _id: { $dateTrunc: { date: '$createdAt', unit: 'hour' } },
      PM25: { $avg: '$PM25' },
      PM10: { $avg: '$PM10' },
    }}
  ])

  const currentHour = Math.floor(Date.now() / hourMs) * hourMs
  const PM25 = new Array(NOWCAST_HOURS).fill(null)
  const PM10 = new Array(NOWCAST_HOURS).fill(null)

  for (const row of rows) {
    const hoursAgo = Math.round((currentHour - new Date(row._id).getTime()) / hourMs)
    if (hoursAgo < 0 || hoursAgo >= NOWCAST_HOURS) continue
    PM25[hoursAgo] = row.PM25
    PM10[hoursAgo] = row.PM10
  }

  return { PM25, PM10 }
}

function start() {
  if (!process.env.MQTT_USERNAME || !process.env.MQTT_PASSWORD) {
    console.error('[mqtt] MQTT_USERNAME / MQTT_PASSWORD missing in .env — subscriber disabled')
    return
  }

  _client = mqtt.connect(HIVEMQ_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: 'bewair-backend-' + Math.random().toString(16).slice(2, 8),
    reconnectPeriod: 5000,
    keepalive: 60
  })

  _client.on('connect', () => {
    console.log('[mqtt] connected to HiveMQ')
    _client.subscribe(TOPIC, (err) => {
      if (err) console.error('[mqtt] subscribe failed:', err.message)
      else     console.log('[mqtt] subscribed to', TOPIC)
    })
  })

  _client.on('error',     (err) => console.error('[mqtt] error:', err.message))
  _client.on('reconnect', ()    => console.log('[mqtt] reconnecting...'))
  _client.on('close',     ()    => console.log('[mqtt] connection closed'))

  // Evict live entries nobody has reported into recently — any deviceId can
  // publish to the wildcard topic, registered or not, so this store must not
  // grow unbounded.
  setInterval(() => {
    const now = Date.now()
    for (const [deviceId, live] of latest) {
      if (now - live.receivedAt > LIVE_EVICT_MS) latest.delete(deviceId)
    }
  }, LIVE_EVICT_SWEEP_MS)

  _client.on('message', async (topic, payload) => {
    const parts = topic.split('/')
    if (parts.length !== 3 || parts[0] !== 'bewair' || parts[2] !== 'telemetry') return
    const deviceId = parts[1]

    let metrics
    try {
      metrics = decodeFrame(payload.toString('utf8'))
    } catch (err) {
      console.warn(`[mqtt] decode failed for ${deviceId}: ${err.message}`)
      return
    }

    const now = Date.now()
    let buf = buffers.get(deviceId)
    if (!buf) {
      buf = { sums: zeroSums(), count: 0, lastWrite: now, lastSeenWrite: 0 }
      buffers.set(deviceId, buf)
    }

    for (const f of METRIC_FIELDS) buf.sums[f] += Number(metrics[f]) || 0
    buf.count++

    // Live store: updated on every frame, independent of the 30s write
    // interval above. aqiInstant is this single frame's AQI (jitter and all —
    // that's the point for a diagnostic view); smoothed is computeAqi() over
    // the rolling window, for a display that needs the calm number instead.
    // Never computes NowCast — that needs hours of persisted history and
    // barely moves second to second, so it stays only in the 30s path above.
    let live = latest.get(deviceId)
    if (!live) {
      live = { window: [] }
      latest.set(deviceId, live)
    }
    const frame = {}
    for (const f of METRIC_FIELDS) frame[f] = Number(metrics[f]) || 0
    live.window.push({ t: now, ...frame })
    live.window = live.window.filter((w) => now - w.t <= LIVE_SMOOTH_MS)

    live.metrics = frame
    live.aqiInstant = computeAqi({ PM25: frame.PM25, PM10: frame.PM10 })
    live.smoothedMetrics = averageWindow(live.window)
    live.smoothed = computeAqi({ PM25: live.smoothedMetrics.PM25, PM10: live.smoothedMetrics.PM10 })
    live.receivedAt = now

    liveEvents.emit('frame', deviceId)

    // Heartbeat: keep the device marked online between stored readings.
    if (now - buf.lastSeenWrite >= LASTSEEN_INTERVAL_MS) {
      buf.lastSeenWrite = now
      Device.updateOne(
        { deviceId },
        { $set: { status: 'online', lastSeen: new Date() } }
        // do NOT upsert — only update devices the user has registered
      ).catch((err) => console.error(`[mqtt] device update failed for ${deviceId}: ${err.message}`))
    }

    // Persist one averaged reading per interval.
    if (now - buf.lastWrite >= WRITE_INTERVAL_MS) {
      const avg = averageOf(buf)
      const samples = buf.count
      buf.sums = zeroSums()
      buf.count = 0
      buf.lastWrite = now

      try {
        // TODO(pm-humidity-correction): correct PM2.5/PM10 for humidity
        // inflation HERE, before either AQI is computed. The optical sensor
        // counts swollen hygroscopic particles, so at the 60-80 %RH a
        // naturally ventilated PH classroom sits at, reported PM runs high.
        // Keep the raw optical value in a separate field when this lands, so
        // rows written before and after the change stay distinguishable.
        // Deliberately out of scope for the threshold reset.

        // Instantaneous: what the room is doing in this 30-second window.
        const instant = computeAqi(avg)

        // Reported: NowCast over the last 12 hourly means, which is what makes
        // 24-hour breakpoints meaningful against sub-minute data. Falls back to
        // the instantaneous value when a device has under 2 usable hours of
        // history (freshly provisioned, or just back from a long outage), and
        // aqiBasis records which of the two this row actually used.
        let reported = instant
        let basis = 'instant'
        try {
          const means = await hourlyMeans(deviceId)
          const ncPM25 = nowcast(means.PM25)
          const ncPM10 = nowcast(means.PM10)
          if (ncPM25 != null || ncPM10 != null) {
            reported = computeAqi({
              PM25: ncPM25 != null ? ncPM25 : avg.PM25,
              PM10: ncPM10 != null ? ncPM10 : avg.PM10,
            })
            basis = 'nowcast'
          }
        } catch (err) {
          console.warn(`[mqtt] nowcast failed for ${deviceId}, using instantaneous AQI: ${err.message}`)
        }

        await AqiModel.create({
          deviceId,
          Aqi: reported,
          AqiInstant: instant,
          aqiBasis: basis,
          ...avg
        })
      } catch (err) {
        console.error(`[mqtt] db write failed for ${deviceId} (${samples} samples): ${err.message}`)
      }
    }
  })

  return _client
}

// A getter, not the Map — callers can't mutate the live store, and don't need
// to know it's a Map at all. Returns null when the device has never reported
// (including right after a process restart, when this store is empty).
function getLiveReading(deviceId) {
  const live = latest.get(deviceId)
  if (!live) return null
  return {
    metrics: live.metrics,
    aqiInstant: live.aqiInstant,
    smoothedMetrics: live.smoothedMetrics,
    smoothed: live.smoothed,
    receivedAt: live.receivedAt,
  }
}

function publishCommand(deviceId, command) {
  return new Promise((resolve, reject) => {
    if (!_client || !_client.connected) {
      return reject(new Error('MQTT client not connected'))
    }
    _client.publish(
      `bewair/${deviceId}/cmd`,
      command,
      { qos: 1, retain: false },
      (err) => (err ? reject(err) : resolve())
    )
  })
}

// Concurrent-connection cap for GET /api/aqi/stream. Returns false (and
// leaves the count unchanged) once at capacity, so the route can reject
// cleanly instead of degrading every open stream.
function acquireStreamSlot() {
  if (streamClientCount >= STREAM_MAX_CLIENTS) return false
  streamClientCount++
  return true
}

function releaseStreamSlot() {
  streamClientCount = Math.max(0, streamClientCount - 1)
}

module.exports = {
  start,
  publishCommand,
  getLiveReading,
  liveEvents,
  acquireStreamSlot,
  releaseStreamSlot,
}
