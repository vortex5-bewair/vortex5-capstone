// Shared "is this device online" rule and "latest stored reading per device"
// query. dashboardController and publicLandingController both need the exact
// same answer, so the rule lives in one place — a number on the public landing
// page can then never disagree with the admin dashboard about the same room.

const AqiModel = require('../models/AqiModel')

// Heartbeat writes Device.lastSeen every ~10 s (services/mqttSubscriber.js).
// Nothing ever flips Device.status back to 'offline', so `status` alone means
// little — recency of lastSeen is what actually decides it.
const ONLINE_WINDOW_MS = 30 * 1000

function isDeviceOnline(device, now = Date.now()) {
  const lastSeen = device.lastSeen ? new Date(device.lastSeen).getTime() : 0
  return device.status === 'online' && (now - lastSeen) < ONLINE_WINDOW_MS
}

// Newest stored AqiModel row (30 s NowCast rows) per deviceId, as a plain
// { [deviceId]: row } map.
async function latestReadingsByDevice(deviceIds) {
  if (!deviceIds || deviceIds.length === 0) return {}
  const latest = await AqiModel.aggregate([
    { $match: { deviceId: { $in: deviceIds } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$deviceId', latest: { $first: '$$ROOT' } } },
  ])
  return Object.fromEntries(latest.map((r) => [r._id, r.latest]))
}

module.exports = { ONLINE_WINDOW_MS, isDeviceOnline, latestReadingsByDevice }
