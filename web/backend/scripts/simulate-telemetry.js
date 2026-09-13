// STAGING / TESTING ONLY. Never run this against the production topic prefix.
//
// Publishes fake air-quality readings to <MQTT_TOPIC_PREFIX>/<deviceId>/telemetry
// on the shared HiveMQ Cloud broker, in exactly the format the real ESP32 sends
// (firmware/bewair_node/bewair_node.ino, publishFrame): a raw FS00905B UART frame
// written out as an uppercase hex string, about once a second. A backend running
// with the same prefix — the staging service — decodes and stores these like any
// real reading, so the staging dashboard gets live-looking data with no hardware.
//
// It refuses to start with the production prefix (`bewair`), where fake frames
// would be stored as real classroom readings. It only talks to MQTT and never
// connects to MongoDB.
//
//   PowerShell, from web\backend:
//     $env:MQTT_TOPIC_PREFIX='bewair-staging'; npm run simulate:telemetry
//
//   Options (after `--` when run through npm):
//     --devices BewAir-SIM1,BewAir-SIM2   fake device ids (this is the default)
//     --interval 1000                     ms between frames, per device (default 1000)
//
// A fake device only shows up on the staging dashboard once it is registered
// there (Device Management > Add Device). The script also listens on each fake
// device's cmd topic and reacts the way the firmware does — "off" pauses that
// device, "on" resumes it, "reset" is logged — so the dashboard's power and
// reset buttons can be exercised end to end.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true })
const mqtt = require('mqtt')
const { decodeFrame } = require('../utils/sensorDecoder')

let topics
try {
  topics = require('../config/mqtt')
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
const { HIVEMQ_URL, PRODUCTION_PREFIX, TOPIC_PREFIX, telemetryTopic, commandTopic } = topics

// ---------- guards ----------

if (TOPIC_PREFIX === PRODUCTION_PREFIX) {
  console.error(`Refusing to run: MQTT_TOPIC_PREFIX is "${TOPIC_PREFIX}", the production prefix.`)
  console.error('Fake readings there would be stored as real classroom data.')
  console.error("Set a staging prefix first, e.g. in PowerShell:  $env:MQTT_TOPIC_PREFIX='bewair-staging'")
  process.exit(1)
}

if (!process.env.MQTT_USERNAME || !process.env.MQTT_PASSWORD) {
  console.error('MQTT_USERNAME / MQTT_PASSWORD are not set (web/backend/.env or the environment).')
  process.exit(1)
}

const argv = process.argv.slice(2)
const valueOf = (flag) => {
  const i = argv.indexOf(flag)
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

const DEVICE_IDS = (valueOf('--devices') || 'BewAir-SIM1,BewAir-SIM2')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const INTERVAL_MS = Number(valueOf('--interval') || 1000)

if (!DEVICE_IDS.length || DEVICE_IDS.some((id) => /[/+#\s]/.test(id))) {
  console.error('--devices must be a comma-separated list of ids with no spaces, "/", "+" or "#".')
  process.exit(1)
}
if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS < 200) {
  console.error('--interval must be a number of milliseconds, at least 200.')
  process.exit(1)
}

// ---------- readings ----------

// Plausible ranges for an air-conditioned classroom. Every frame nudges each
// value a little within its range, so charts look like a real room drifting
// rather than a flat line or pure noise. PM1 and PM10 follow PM2.5, the way
// they move together on the real optical sensor.
const PROFILE = {
  PM25:         { min: 8,   max: 45,   step: 1.5 },
  TVOC:         { min: 100, max: 450,  step: 8 },
  Temperature:  { min: 24,  max: 28,   step: 0.05 },
  Humidity:     { min: 50,  max: 65,   step: 0.2 },
  CO2:          { min: 450, max: 1200, step: 12 },
  Formaldehyde: { min: 10,  max: 40,   step: 0.8 },
}

const rand = (min, max) => min + Math.random() * (max - min)
const round1 = (v) => Math.round(v * 10) / 10

function initialState() {
  const s = {}
  for (const [field, p] of Object.entries(PROFILE)) s[field] = rand(p.min, p.max)
  return s
}

// One step of a random walk that bounces off the edges of its range.
function drift(state) {
  for (const [field, p] of Object.entries(PROFILE)) {
    let v = state[field] + (Math.random() * 2 - 1) * p.step
    if (v < p.min) v = p.min + (p.min - v)
    if (v > p.max) v = p.max - (v - p.max)
    state[field] = Math.min(p.max, Math.max(p.min, v))
  }
}

// Round to what the frame can actually carry — whole units, and tenths for
// temperature and humidity — so what we send is exactly what the backend decodes.
function toMetrics(state) {
  const PM25 = Math.round(state.PM25)
  return {
    PM1:          Math.round(PM25 * rand(0.65, 0.75)),
    PM25,
    PM10:         Math.round(PM25 * rand(1.3, 1.5)),
    TVOC:         Math.round(state.TVOC),
    Temperature:  round1(state.Temperature),
    Humidity:     round1(state.Humidity),
    CO2:          Math.round(state.CO2),
    Formaldehyde: Math.round(state.Formaldehyde),
  }
}

// ---------- frame encoding ----------

// Inverse of utils/sensorDecoder.js decodeFrame. FS00905B frame, 40 bytes:
//   [0..1]   header 0x42 0x4D
//   [2..3]   length, big-endian = 36 (17 data words + 2-byte checksum)
//   [4..37]  17 data words, big-endian uint16
//   [38..39] checksum, big-endian = sum of bytes [0..37]
const WORD_COUNT = 17
const LENGTH_FIELD = WORD_COUNT * 2 + 2
const FRAME_BYTES = 4 + LENGTH_FIELD

const toWord = (v) => Math.min(0xffff, Math.max(0, Math.round(v)))

function encodeFrame(m) {
  const w = new Array(WORD_COUNT).fill(0)
  // w1-3: "CF=1" standard-particle PM. The decoder skips these, and real units
  // often report 0 here, but a frame should still carry sensible numbers.
  w[0] = m.PM1
  w[1] = m.PM25
  w[2] = m.PM10
  // w4-6: atmospheric PM — the values the backend actually reads.
  w[3] = m.PM1
  w[4] = m.PM25
  w[5] = m.PM10
  // w7-12: particle counts per 0.1 L at >0.3, >0.5, >1, >2.5, >5 and >10 µm.
  // Skipped by the decoder; scaled off PM2.5 so the frame looks like a real one.
  w[6] = m.PM25 * 60
  w[7] = m.PM25 * 18
  w[8] = m.PM25 * 4
  w[9] = m.PM25 * 0.6
  w[10] = m.PM25 * 0.2
  w[11] = m.PM25 * 0.05
  w[12] = m.TVOC
  w[13] = m.Temperature * 10 + 450   // decoder: (word - 450) / 10
  w[14] = m.Humidity * 10            // decoder: word / 10
  w[15] = m.CO2
  w[16] = m.Formaldehyde

  const buf = Buffer.alloc(FRAME_BYTES)
  buf[0] = 0x42
  buf[1] = 0x4d
  buf.writeUInt16BE(LENGTH_FIELD, 2)
  w.forEach((v, i) => buf.writeUInt16BE(toWord(v), 4 + i * 2))
  let sum = 0
  for (let i = 0; i < FRAME_BYTES - 2; i++) sum += buf[i]
  buf.writeUInt16BE(sum, FRAME_BYTES - 2)
  return buf.toString('hex').toUpperCase()
}

// Run the real decoder over one encoded frame before publishing anything. If the
// frame format ever drifts from what the backend expects, fail here — not by
// silently feeding staging garbage readings.
function selfCheck() {
  const sample = { PM1: 12, PM25: 17, PM10: 24, TVOC: 210, Temperature: 26.4, Humidity: 58.3, CO2: 780, Formaldehyde: 22 }
  const decoded = decodeFrame(encodeFrame(sample))
  const bad = Object.keys(sample).filter((k) => decoded[k] !== sample[k])
  if (bad.length) {
    throw new Error(
      `frame self-check failed for ${bad.join(', ')}: sent ${JSON.stringify(sample)}, decoded ${JSON.stringify(decoded)}`
    )
  }
}

try {
  selfCheck()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}

// ---------- publishing ----------

const devices = new Map(
  DEVICE_IDS.map((id) => [id, { state: initialState(), paused: false, sent: 0, last: null }])
)

const client = mqtt.connect(HIVEMQ_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: 'bewair-sim-' + Math.random().toString(16).slice(2, 8),
  reconnectPeriod: 5000,
  keepalive: 60,
})

const timers = []

function startPublishing() {
  if (timers.length) return   // already running; this was a reconnect

  DEVICE_IDS.forEach((id, i) => {
    const dev = devices.get(id)
    // Stagger the devices so their frames don't all land on the same instant.
    setTimeout(() => {
      timers.push(setInterval(() => {
        if (dev.paused || !client.connected) return
        drift(dev.state)
        const metrics = toMetrics(dev.state)
        client.publish(telemetryTopic(id), encodeFrame(metrics), { qos: 0 })
        dev.sent++
        dev.last = metrics
      }, INTERVAL_MS))
    }, Math.round((INTERVAL_MS / DEVICE_IDS.length) * i))
  })

  timers.push(setInterval(() => {
    const parts = DEVICE_IDS.map((id) => {
      const d = devices.get(id)
      if (d.paused) return `${id}: paused (${d.sent} sent)`
      if (!d.last) return `${id}: starting`
      return `${id}: ${d.sent} sent, PM2.5 ${d.last.PM25}, ${d.last.Temperature} °C, ${d.last.Humidity} %RH`
    })
    console.log(`[sim] ${parts.join('  |  ')}`)
  }, 30 * 1000))
}

client.on('connect', () => {
  console.log(`[sim] connected to HiveMQ — prefix "${TOPIC_PREFIX}"`)
  for (const id of DEVICE_IDS) console.log(`[sim]   ${id} -> ${telemetryTopic(id)} every ${INTERVAL_MS} ms`)

  client.subscribe(DEVICE_IDS.map(commandTopic), { qos: 1 }, (err) => {
    if (err) console.error('[sim] command subscribe failed:', err.message)
  })
  startPublishing()
})

// Mirror the firmware's command handling (bewair_node.ino, onMqttMessage).
client.on('message', (topic, payload) => {
  const id = topic.split('/')[1]
  const dev = devices.get(id)
  if (!dev) return
  const cmd = payload.toString('utf8').trim()

  if (cmd === 'off') {
    dev.paused = true
    console.log(`[sim] ${id}: "off" received — pausing telemetry`)
  } else if (cmd === 'on') {
    dev.paused = false
    console.log(`[sim] ${id}: "on" received — resuming telemetry`)
  } else if (cmd === 'reset') {
    console.log(`[sim] ${id}: "reset" received — a real node would forget its Wi-Fi and reboot; nothing to do here`)
  } else {
    console.log(`[sim] ${id}: unknown command "${cmd}" — ignored`)
  }
})

client.on('reconnect', () => console.log('[sim] reconnecting...'))
client.on('error', (err) => {
  console.error('[sim] error:', err.message)
  // 4 = bad username/password, 5 = not authorised. Retrying won't fix either.
  if (err.code === 4 || err.code === 5) process.exit(1)
})

process.on('SIGINT', () => {
  console.log('\n[sim] stopping')
  timers.forEach((t) => clearInterval(t))
  client.end(false, () => process.exit(0))
})
