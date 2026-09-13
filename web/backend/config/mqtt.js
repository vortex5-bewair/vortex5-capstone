// The MQTT broker and topic layout — one definition, shared by the backend
// subscriber (services/mqttSubscriber.js) and the staging telemetry simulator
// (scripts/simulate-telemetry.js), so the two can never disagree on topic format.
//
// Every topic is scoped by a per-environment prefix:
//
//   <prefix>/<deviceId>/telemetry   ESP32 -> backend, raw FS00905B frames as hex
//   <prefix>/<deviceId>/cmd         backend -> ESP32, "on" / "off" / "reset"
//
// Production uses `bewair`, and so does the ESP32 firmware — it hardcodes that
// prefix, so real devices can only ever be heard or commanded by an environment
// running with it. Staging shares the same HiveMQ Cloud broker and credentials
// but runs with MQTT_TOPIC_PREFIX=bewair-staging, which keeps it out of real
// classroom telemetry entirely.
//
//   MQTT_TOPIC_PREFIX   topic prefix for this environment (default: bewair)
//
// Read once at load, like the other env-driven config here. server.js loads
// dotenv before requiring anything that pulls this in.

const HIVEMQ_URL = 'mqtts://1c097cff873e428286ffc57255b3a044.s1.eu.hivemq.cloud:8883'

const PRODUCTION_PREFIX = 'bewair'

// A prefix must be exactly one topic level. A `/` would shift where the device
// id sits in the topic, and `+` or `#` would turn the subscription into a
// wildcard that also matches production's topics. Fail at startup instead:
// a staging deploy that crashes is caught by the health check, whereas one
// that quietly subscribed too widely would not be.
function parsePrefix(raw) {
  if (raw === undefined) return PRODUCTION_PREFIX
  const prefix = String(raw).trim()
  if (!prefix || /[/+#]/.test(prefix)) {
    throw new Error(
      `MQTT_TOPIC_PREFIX must be a single topic level with no "/", "+" or "#" (got ${JSON.stringify(raw)})`
    )
  }
  return prefix
}

const TOPIC_PREFIX = parsePrefix(process.env.MQTT_TOPIC_PREFIX)

const TELEMETRY_SUBSCRIPTION = `${TOPIC_PREFIX}/+/telemetry`

const telemetryTopic = (deviceId) => `${TOPIC_PREFIX}/${deviceId}/telemetry`
const commandTopic = (deviceId) => `${TOPIC_PREFIX}/${deviceId}/cmd`

// The device id from a telemetry topic under THIS environment's prefix, or null
// for anything else — including the other environment's traffic.
function parseTelemetryTopic(topic) {
  const parts = topic.split('/')
  if (parts.length !== 3 || parts[0] !== TOPIC_PREFIX || parts[2] !== 'telemetry') return null
  return parts[1] || null
}

module.exports = {
  HIVEMQ_URL,
  PRODUCTION_PREFIX,
  TOPIC_PREFIX,
  TELEMETRY_SUBSCRIPTION,
  telemetryTopic,
  commandTopic,
  parseTelemetryTopic,
}
