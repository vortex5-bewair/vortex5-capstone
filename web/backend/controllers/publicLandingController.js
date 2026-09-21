// GET /api/public/landing — the logged-out landing page's live data.
//
// Public by design and deliberately narrow. It answers "which rooms are
// reporting and what is their air like right now" and nothing else: no
// deviceId (it is the MQTT topic id), no Mongo _id, no raw Device.status, no
// user data. Every number is derived with the same rules the authenticated
// screens use, so the landing page cannot disagree with them:
//   - online            → utils/deviceStatus (same rule as the admin dashboard)
//   - live figure       → aqiController.shapeLiveReading (same 15 s freshness
//                         as the kiosk / device detail)
//   - 12-hr average     → newest stored AqiModel row (NowCast), only while online
//   - category          → config/airQualityBands.categoryFor
// Only REGISTERED devices are listed — the in-memory live store also holds any
// unregistered id that happens to publish, which must never leak out here.

const Device = require('../models/DeviceModel')
const Room = require('../models/RoomModel')
const { shapeLiveReading } = require('./aqiController')
const { isDeviceOnline, latestReadingsByDevice } = require('../utils/deviceStatus')
const { categoryFor } = require('../config/airQualityBands')

// Many visitors, one payload: build it at most once per window, and share an
// in-flight build between concurrent requests so a burst costs one DB round trip.
const CACHE_TTL_MS = 5 * 1000
let cached = null // { at, payload }
let inflight = null

const pickMetrics = (m) => ({
  pm25: m.PM25 ?? null,
  co2: m.CO2 ?? null,
  tvoc: m.TVOC ?? null,
  temp: m.Temperature ?? null,
  humidity: m.Humidity ?? null,
})

const byRoomThenName = (a, b) =>
  a.room.localeCompare(b.room, undefined, { numeric: true }) ||
  a.name.localeCompare(b.name, undefined, { numeric: true })

async function buildPayload() {
  const [devices, rooms] = await Promise.all([Device.find({}).lean(), Room.find({}).lean()])
  const readingMap = await latestReadingsByDevice(devices.map((d) => d.deviceId))
  const floorByRoom = new Map(rooms.map((r) => [r.name, r.floor]))
  const now = Date.now()

  const entries = devices.map((d) => {
    const live = shapeLiveReading(d.deviceId)
    const liveFresh = live.available && !live.stale
    // A fresh live frame is proof of life even if the ~10 s heartbeat write to
    // Device.lastSeen has not landed yet.
    const online = liveFresh || isDeviceOnline(d, now)
    const stored = online ? readingMap[d.deviceId] : null

    let liveOut = null
    let metrics = null
    let readingAt = null
    let readingMs = 0
    if (liveFresh) {
      liveOut = {
        aqi: live.aqiInstant,
        category: categoryFor(live.aqiInstant),
        ageS: Math.round(live.ageMs / 1000),
      }
      metrics = pickMetrics(live.metrics)
      readingAt = live.receivedAt
      readingMs = new Date(live.receivedAt).getTime()
    } else if (stored) {
      metrics = pickMetrics(stored)
      readingAt = new Date(stored.createdAt).toISOString()
      readingMs = new Date(stored.createdAt).getTime()
    }

    const average = stored
      ? { aqi: stored.Aqi, category: categoryFor(stored.Aqi) }
      : null

    return {
      isLive: !!liveOut,
      readingMs,
      out: {
        name: d.name,
        room: d.room,
        floor: floorByRoom.get(d.room) ?? null,
        online,
        lastSeen: d.lastSeen ? new Date(d.lastSeen).toISOString() : null,
        readingAt,
        live: liveOut,
        average,
        metrics,
      },
    }
  })

  // Headline = the freshest live room (the kiosk's rule). With nothing live, an
  // online room's newest stored reading; with nothing online, no headline at
  // all — never a days-old number dressed up as current.
  const newest = (list) => list.reduce((a, b) => (b.readingMs > a.readingMs ? b : a))
  const liveEntries = entries.filter((e) => e.isLive)
  const storedEntries = entries.filter((e) => e.out.online && e.out.average)
  const pick = liveEntries.length ? newest(liveEntries) : storedEntries.length ? newest(storedEntries) : null
  const headline = pick
    ? {
        name: pick.out.name,
        room: pick.out.room,
        live: pick.out.live,
        average: pick.out.average,
        metrics: pick.out.metrics,
        readingAt: pick.out.readingAt,
      }
    : null

  const list = entries.map((e) => e.out).sort(byRoomThenName)

  return {
    generatedAt: new Date(now).toISOString(),
    summary: {
      totalDevices: list.length,
      onlineDevices: list.filter((d) => d.online).length,
      headline,
    },
    devices: list,
  }
}

function getLandingPayload() {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_TTL_MS) return Promise.resolve(cached.payload)
  if (!inflight) {
    inflight = buildPayload()
      .then((payload) => {
        cached = { at: Date.now(), payload }
        return payload
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

const getLanding = async (req, res) => {
  try {
    const payload = await getLandingPayload()
    // server.js blanket-sets `no-store` on /api; this endpoint is safe to share
    // for a few seconds, which is also what lets an edge cache absorb a burst.
    res.set('Cache-Control', 'public, max-age=5')
    res.status(200).json(payload)
  } catch (error) {
    console.error('[public-landing] error:', error)
    res.status(500).json({ error: 'Live data is temporarily unavailable.' })
  }
}

module.exports = { getLanding }
