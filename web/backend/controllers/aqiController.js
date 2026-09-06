const AqiModel = require('../models/AqiModel')
const Device = require('../models/DeviceModel')
const {
  getLiveReading,
  liveEvents,
  acquireStreamSlot,
  releaseStreamSlot,
} = require('../services/mqttSubscriber')
const getVisibleDeviceIds = require('../utils/visibleDevices')
const { resolveLimits } = require('../utils/thresholdLimits')
const { AQI_CATEGORIES, categoryFor } = require('../config/airQualityBands')
const { evaluateReading } = require('../utils/alertEvaluator')
const { TZ } = require('../config/appTime')
const {
  SCHOOL_HOURS,
  describeSchoolHours,
  schoolHoursStages,
  expectedMinutes,
} = require('../config/schoolHours')

// Categories and limits come from config/airQualityBands.js. This file used to
// carry a private copy of both, which is how the API ended up emitting US EPA
// category names while the dashboard coloured DENR ones.
const aqiCategory = categoryFor

// all readings for user's devices, newest first
const getAqi = async (req, res) => {
  const userDeviceIds = await getVisibleDeviceIds(req.user)
  if (userDeviceIds.length === 0) return res.status(200).json([])
  const aqis = await AqiModel.find({ deviceId: { $in: userDeviceIds } })
    .sort({ createdAt: -1 })
    .limit(500)
  res.status(200).json(aqis)
}

// latest reading per device (only user's devices)
const getLatestPerDevice = async (req, res) => {
  try {
    const userDeviceIds = await getVisibleDeviceIds(req.user)
    if (userDeviceIds.length === 0) return res.status(200).json([])
    const latest = await AqiModel.aggregate([
      { $match: { deviceId: { $in: userDeviceIds } } },
      { $sort: { createdAt: -1 } },
      { $group: {
          _id: '$deviceId',
          doc: { $first: '$$ROOT' }
      }},
      { $replaceRoot: { newRoot: '$doc' } }
    ])
    res.status(200).json(latest)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// A live reading older than this is stale — shown as such rather than as a
// frozen number that looks current. Independent of AQI_WRITE_INTERVAL_SEC.
const LIVE_STALE_MS = Number(process.env.AQI_LIVE_STALE_SEC || 15) * 1000

// Shared by the single-shot endpoint and the SSE stream, so there is exactly
// one definition of what a live reading looks like on the wire. No
// category/colour is resolved here; every client already resolves AQI figures
// through the same served bands (aqiCategory/CATEGORY_COLORS on web,
// categoryFor on mobile), so leaving that to the caller is what keeps a live
// figure and a reported figure the same colour for the same category, rather
// than two implementations that could drift apart.
function shapeLiveReading(deviceId) {
  const live = getLiveReading(deviceId)
  if (!live) return { deviceId, available: false }
  const ageMs = Date.now() - live.receivedAt
  return {
    deviceId,
    available: true,
    stale: ageMs > LIVE_STALE_MS,
    receivedAt: new Date(live.receivedAt).toISOString(),
    ageMs,
    aqiInstant: live.aqiInstant,
    smoothed: live.smoothed,
    metrics: live.metrics,
    smoothedMetrics: live.smoothedMetrics,
  }
}

// Live (in-memory, per-frame) reading per device — never the database. Kept
// as a fallback for when GET /api/aqi/stream can't connect, and for mobile
// (Flutter SSE is more work than a fetch).
const getLiveReadings = async (req, res) => {
  try {
    const userDeviceIds = await getVisibleDeviceIds(req.user)
    res.status(200).json(userDeviceIds.map(shapeLiveReading))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// Server-Sent Events: pushes a reading the instant a device's frame decodes,
// instead of making the client wait out a poll interval. Devices visible to
// this connection are scoped once, at connect time, exactly like
// getLatestPerDevice — a connection never gains a device mid-stream.
const streamLiveReadings = async (req, res) => {
  if (!acquireStreamSlot()) {
    return res.status(503).json({ error: 'Too many live streams open right now — try again shortly.' })
  }

  const userDeviceIds = await getVisibleDeviceIds(req.user)
  const visible = new Set(userDeviceIds)

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`)

  // Initial snapshot so the client has something to render before the next frame.
  send({ type: 'snapshot', readings: userDeviceIds.map(shapeLiveReading) })

  const onFrame = (deviceId) => {
    if (!visible.has(deviceId)) return
    send({ type: 'update', reading: shapeLiveReading(deviceId) })
  }
  liveEvents.on('frame', onFrame)

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000)

  const cleanup = () => {
    clearInterval(heartbeat)
    liveEvents.off('frame', onFrame)
    releaseStreamSlot()
  }
  req.on('close', cleanup)
}

// Per-pollutant fields we compute statistics for.
const POLLUTANT_FIELDS = ['Aqi', 'PM1', 'PM25', 'PM10', 'TVOC', 'CO2', 'Formaldehyde', 'Temperature', 'Humidity']

// Fields the exceedance report covers. One-sided only: Temperature and Humidity
// are two-sided, so "hours over the limit" would be a different question with a
// different denominator. PM2.5 and PM10 stay even though they no longer raise
// their own alerts, because an exceedance REPORT against DENR is exactly where a
// school needs them.
const EXCEEDANCE_FIELDS = ['Aqi', 'PM25', 'PM10', 'CO2', 'TVOC', 'Formaldehyde']

// Build a $group spec computing avg/min/max/std and the 5th/95th percentiles
// for every pollutant field.
//
// Percentiles rather than min/max for the on-screen table: both extremes are
// single samples, so a lone sensor glitch sets them. $percentile needs MongoDB
// 7.0+ (deployment is 8.0), and 'approximate' is the only method the server
// offers as an accumulator.
function buildStatsGroup() {
  const spec = { _id: null, count: { $sum: 1 } }
  for (const f of POLLUTANT_FIELDS) {
    spec[f + '_avg'] = { $avg: '$' + f }
    spec[f + '_min'] = { $min: '$' + f }
    spec[f + '_max'] = { $max: '$' + f }
    spec[f + '_std'] = { $stdDevPop: '$' + f }
    spec[f + '_pct'] = { $percentile: { input: '$' + f, p: [0.05, 0.95], method: 'approximate' } }
  }
  return spec
}

// Convert a raw stats agg result into { field: {avg,min,max,std,p05,p95} }.
// min/max stay in the payload even though the table now shows percentiles —
// the compliance report and any future consumer may still want the extremes.
function shapeStats(row, hoursOverByField = {}) {
  const out = {}
  for (const f of POLLUTANT_FIELDS) {
    const pct = row?.[f + '_pct'] || []
    out[f] = {
      avg: round(row?.[f + '_avg']),
      min: round(row?.[f + '_min']),
      max: round(row?.[f + '_max']),
      std: round(row?.[f + '_std']),
      p05: round(pct[0]),
      p95: round(pct[1]),
      hoursOver: hoursOverByField[f] ?? null,
    }
  }
  return out
}

const round = (v, d = 1) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d

// Map a stored Aqi to its DENR category name inside an aggregation, using the
// canonical bounds rather than a second copy of the table.
function categoryExpr() {
  const last = AQI_CATEGORIES[AQI_CATEGORIES.length - 1]
  return {
    $switch: {
      branches: AQI_CATEGORIES.slice(0, -1).map((c) => ({
        case: { $lte: ['$Aqi', c.max] },
        then: c.name,
      })),
      default: last.name,
    },
  }
}

// Descriptive analytics — single bundled payload for the front-end. Admin-only.
//
// Every date operator carries the Asia/Manila timezone (config/appTime.js).
// Without it Mongo answers in UTC, which put a 10 AM classroom peak in the 2 AM
// heatmap cell and filed every reading after 4 PM under the previous day.
//
// Every pipeline also spreads the same school-hours stages, composed once. That
// is deliberate: a filter applied to some panels and not others is worse than no
// filter, because two panels then disagree without saying so.
const getAnalytics = async (req, res) => {
  const schoolActive = req.query.schoolHours !== 'false'
  const emptyMeta = {
    timezone: TZ,
    schoolHours: {
      active: schoolActive,
      label: describeSchoolHours(),
      days: SCHOOL_HOURS.days,
      startHour: SCHOOL_HOURS.startHour,
      endHour: SCHOOL_HOURS.endHour,
    },
  }
  const empty = {
    meta: emptyMeta,
    kpis: { avg: 0, max: 0, min: 0, count: 0, pctGood: 0, avgCategory: 'Good', coverage: 0 },
    coverage: { pct: 0, observedMinutes: 0, expectedMinutes: 0, low: true, perDevice: [] },
    basisMix: [], spansStandardChange: false,
    buckets: [], categories: [], categoriesByDay: [], byDevice: [], heatmap: [],
    heatmapDays: 0, recent: [], pollutantStats: {}, exceedances: [],
    comparison: null, rooms: { needsAttention: [], okCount: 0, okRooms: [] },
  }

  try {
    const userDeviceIds = await getVisibleDeviceIds(req.user)
    if (userDeviceIds.length === 0) return res.status(200).json(empty)

    // Device scope: `room` narrows to every device sharing that room (a room
    // can hold more than one device), `deviceId` narrows further to exactly
    // one — same "room, then device" relationship the Room/Device filters
    // present. Either can be used alone.
    let scopedDeviceIds = userDeviceIds
    if (req.query.room) {
      const roomDevices = await Device.find(
        { deviceId: { $in: userDeviceIds }, room: req.query.room },
        'deviceId'
      ).lean()
      scopedDeviceIds = roomDevices.map((d) => d.deviceId)
    }
    if (req.query.deviceId) {
      if (!scopedDeviceIds.includes(req.query.deviceId)) return res.status(200).json(empty)
      scopedDeviceIds = [req.query.deviceId]
    }
    if (scopedDeviceIds.length === 0) return res.status(200).json(empty)

    // Default range is 7 days, not 24 hours: with the school-hours filter on, a
    // single day holds at most ten usable hours and on a weekend holds none.
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 7 * 86400 * 1000)
    const to   = req.query.to   ? new Date(req.query.to)   : new Date()
    const rangeMs = to - from

    const deviceFilter = { deviceId: { $in: scopedDeviceIds } }
    const match = { ...deviceFilter, createdAt: { $gte: from, $lte: to } }

    const deviceCount = scopedDeviceIds.length

    // Composed ONCE and spread into every pipeline below.
    const sh = schoolHoursStages(schoolActive, TZ)
    const base = (m) => [{ $match: m }, ...sh]

    // ----- Trend bucket size -----
    const granularity = req.query.granularity
    const bucketMs = granularity === 'hour'  ? 3600 * 1000
                  : granularity === 'day'   ? 86400 * 1000
                  : granularity === 'week'  ? 7 * 86400 * 1000
                  : granularity === 'month' ? 30 * 86400 * 1000
                  : rangeMs <= 6 * 3600 * 1000  ? 5 * 60 * 1000
                  : rangeMs <= 24 * 3600 * 1000 ? 15 * 60 * 1000
                  : rangeMs <= 7 * 86400 * 1000 ? 3600 * 1000
                  : 6 * 3600 * 1000

    // Sub-day buckets can use epoch modulo: Asia/Manila is a whole-hour offset,
    // so 5/15/60-minute boundaries land identically in UTC and local time.
    // Day and larger MUST use $dateTrunc with the timezone, or a "day" runs
    // 08:00-08:00 Manila instead of midnight to midnight.
    const useDateTrunc = bucketMs >= 86400 * 1000
    const trunc = { day: 'day', week: 'week', month: 'month' }[granularity] || 'day'
    const bucketId = useDateTrunc
      ? { $dateTrunc: { date: '$createdAt', unit: trunc, timezone: TZ } }
      : { $toDate: { $subtract: [{ $toLong: '$createdAt' }, { $mod: [{ $toLong: '$createdAt' }, bucketMs] }] } }

    const prevFrom = new Date(from.getTime() - rangeMs)
    const prevMatch = { ...deviceFilter, createdAt: { $gte: prevFrom, $lt: from } }

    // Limits in force: the active threshold row merged over the canonical bands.
    const { limits } = await resolveLimits()

    const [
      statsAgg, prevStatsAgg, weekdayStatsAgg, weekendStatsAgg,
      bucketsAgg, byDeviceAgg, deviceHourlyAgg, heatmapAgg, hourlyAgg,
      categoryByDayAgg, deviceCategoryAgg, coverageAgg, basisAgg, recent,
    ] = await Promise.all([
      // Per-pollutant stats for the current range
      AqiModel.aggregate([...base(match), { $group: buildStatsGroup() }]),

      // Same stats for the previous equal-length window
      AqiModel.aggregate([...base(prevMatch), { $group: buildStatsGroup() }]),

      // Weekday-only (Mon-Fri) and weekend-only stats, in LOCAL time. Before the
      // timezone fix these split on UTC days, so every Manila evening reading
      // landed on the wrong side.
      AqiModel.aggregate([
        ...base(match),
        { $addFields: { dow: { $dayOfWeek: { date: '$createdAt', timezone: TZ } } } },
        { $match: { dow: { $gte: 2, $lte: 6 } } },
        { $group: buildStatsGroup() },
      ]),
      AqiModel.aggregate([
        ...base(match),
        { $addFields: { dow: { $dayOfWeek: { date: '$createdAt', timezone: TZ } } } },
        { $match: { $or: [{ dow: 1 }, { dow: 7 }] } },
        { $group: buildStatsGroup() },
      ]),

      // Trend buckets. avgAqi is what the chart plots; maxAqi is kept so the
      // true period peak can be marked separately rather than plotting a series
      // of maxima and calling its maximum the peak.
      AqiModel.aggregate([
        ...base(match),
        { $group: {
            _id: bucketId,
            avgAqi:  { $avg: '$Aqi' },
            maxAqi:  { $max: '$Aqi' },
            avgPM25: { $avg: '$PM25' },
            avgPM10: { $avg: '$PM10' },
            avgCO2:  { $avg: '$CO2' },
            avgTVOC: { $avg: '$TVOC' },
            avgHCHO: { $avg: '$Formaldehyde' },
            avgTemp: { $avg: '$Temperature' },
            avgHum:  { $avg: '$Humidity' },
            count:   { $sum: 1 },
            instantCount: { $sum: { $cond: [{ $eq: ['$aqiBasis', 'instant'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } }
      ]),

      // Per-device summary
      AqiModel.aggregate([
        ...base(match),
        { $group: { _id: '$deviceId', avgAqi: { $avg: '$Aqi' }, maxAqi: { $max: '$Aqi' }, count: { $sum: 1 } } },
        { $sort: { avgAqi: -1 } }
      ]),

      // Per-device hourly means. Fed to utils/alertEvaluator so the rooms list
      // uses the SAME rule as live alerting rather than a second evaluation path.
      AqiModel.aggregate([
        ...base(match),
        { $group: {
            _id: { deviceId: '$deviceId', hour: { $dateTrunc: { date: '$createdAt', unit: 'hour', timezone: TZ } } },
            Aqi:          { $avg: '$Aqi' },
            PM1:          { $avg: '$PM1' },
            PM25:         { $avg: '$PM25' },
            PM10:         { $avg: '$PM10' },
            CO2:          { $avg: '$CO2' },
            TVOC:         { $avg: '$TVOC' },
            Formaldehyde: { $avg: '$Formaldehyde' },
            Temperature:  { $avg: '$Temperature' },
            Humidity:     { $avg: '$Humidity' },
        }}
      ]),

      // Heatmap (hour x weekday) in LOCAL time, over the selected range rather
      // than a private 7-day window that silently disagreed with the picker.
      AqiModel.aggregate([
        ...base(match),
        { $group: {
            _id: {
              dow:  { $dayOfWeek: { date: '$createdAt', timezone: TZ } },
              hour: { $hour: { date: '$createdAt', timezone: TZ } },
            },
            avgAqi: { $avg: '$Aqi' }, count: { $sum: 1 }
        }}
      ]),

      // Hourly means for the exceedance report, truncated in LOCAL time.
      AqiModel.aggregate([
        ...base(match),
        { $group: {
            _id: { $dateTrunc: { date: '$createdAt', unit: 'hour', timezone: TZ } },
            Aqi:          { $avg: '$Aqi' },
            PM25:         { $avg: '$PM25' },
            PM10:         { $avg: '$PM10' },
            CO2:          { $avg: '$CO2' },
            TVOC:         { $avg: '$TVOC' },
            Formaldehyde: { $avg: '$Formaldehyde' },
        }}
      ]),

      // Category mix per local day. The overall distribution is rolled up from
      // this in Node, so it costs one aggregation rather than two.
      AqiModel.aggregate([
        ...base(match),
        { $group: {
            _id: {
              day: { $dateTrunc: { date: '$createdAt', unit: 'day', timezone: TZ } },
              category: categoryExpr(),
            },
            count: { $sum: 1 }
        }},
        { $sort: { '_id.day': 1 } }
      ]),

      // Category mix per room, for the compliance report.
      AqiModel.aggregate([
        ...base(match),
        { $group: { _id: { deviceId: '$deviceId', category: categoryExpr() }, count: { $sum: 1 } } },
      ]),

      // Coverage: distinct (device, minute) slots that hold at least one
      // reading. Counting ROWS would be wrong here — this deployment writes
      // several times per interval, which would report coverage above 100%.
      AqiModel.aggregate([
        ...base(match),
        { $group: { _id: { d: '$deviceId', m: { $dateTrunc: { date: '$createdAt', unit: 'minute' } } } } },
        { $group: { _id: '$_id.d', minutes: { $sum: 1 } } },
      ]),

      // Which AQI standard each reading was computed under.
      AqiModel.aggregate([
        ...base(match),
        { $group: { _id: '$aqiBasis', count: { $sum: 1 } } },
      ]),

      // Recent readings. An aggregation rather than find(), so it gets the same
      // school-hours treatment as every other panel.
      AqiModel.aggregate([...base(match), { $sort: { createdAt: -1 } }, { $limit: 100 }]),
    ])

    const statsRow = statsAgg[0] || {}
    const totalCount = statsRow.count || 0

    // ----- Category distribution, rolled up from the per-day mix -----
    const dayMap = new Map()
    const categoryTotals = Object.fromEntries(AQI_CATEGORIES.map((c) => [c.name, 0]))
    for (const row of categoryByDayAgg) {
      const day = row._id.day?.toISOString?.() ?? String(row._id.day)
      if (!dayMap.has(day)) dayMap.set(day, { day: row._id.day, counts: {}, total: 0 })
      const entry = dayMap.get(day)
      entry.counts[row._id.category] = (entry.counts[row._id.category] || 0) + row.count
      entry.total += row.count
      if (row._id.category in categoryTotals) categoryTotals[row._id.category] += row.count
    }
    const categoriesByDay = [...dayMap.values()]
    const categories = AQI_CATEGORIES.map((cat) => ({
      label: cat.name,
      count: categoryTotals[cat.name] || 0,
      pct: totalCount > 0 ? Math.round((categoryTotals[cat.name] / totalCount) * 100) : 0,
    }))

    // pctGood is the share in the first category, whatever it is called and
    // wherever its ceiling sits — not a hardcoded "Aqi <= 50".
    const goodCount = categoryTotals[AQI_CATEGORIES[0].name] || 0

    const avgAqi = Math.round(statsRow.Aqi_avg || 0)

    // ----- Coverage -----
    const expectedPerDevice = expectedMinutes(from, to, { active: schoolActive, tz: TZ })
    const observedByDevice = Object.fromEntries(coverageAgg.map((c) => [c._id, c.minutes]))
    const observedMinutes = coverageAgg.reduce((sum, c) => sum + c.minutes, 0)
    const expectedTotal = expectedPerDevice * deviceCount
    const coveragePct = expectedTotal > 0
      ? Math.min(100, Math.round((observedMinutes / expectedTotal) * 100))
      : 0

    // ----- Basis mix: which AQI standard the history was computed under -----
    const basisTotal = basisAgg.reduce((sum, b) => sum + b.count, 0)
    const basisMix = basisAgg.map((b) => ({
      // Rows written before the DENR reset have no aqiBasis at all.
      basis: b._id || 'legacy',
      count: b.count,
      pct: basisTotal > 0 ? Math.round((b.count / basisTotal) * 100) : 0,
    })).sort((a, b) => b.count - a.count)
    const legacyCount = basisMix.find((b) => b.basis === 'legacy')?.count || 0
    // Share of readings computed before the DENR reset. spansStandardChange is
    // narrower: it means the range MIXES standards. A range that is 100% legacy
    // sets legacyPct to 100 and spansStandardChange to false, and the page still
    // needs to say so — so the UI keys off legacyPct, not the flag.
    const legacyPct = basisTotal > 0 ? Math.round((legacyCount / basisTotal) * 100) : 0
    const spansStandardChange = legacyCount > 0 && legacyCount < basisTotal

    // ----- Exceedances -----
    // The denominator is EXPECTED hours in the range, not hours that happen to
    // hold data. A device online 3 of 24 hours that exceeded for 2 used to
    // report 67%, indistinguishable from full uptime.
    const expectedHours = Math.max(1, Math.round(expectedPerDevice / 60))
    const observedHours = hourlyAgg.length
    const hoursOverByField = {}
    const exceedances = EXCEEDANCE_FIELDS.map((f) => {
      const hours = hourlyAgg.filter((h) => h[f] != null && h[f] > limits[f]).length
      hoursOverByField[f] = hours
      return {
        field: f,
        limit: limits[f],
        hours,
        observedHours,
        expectedHours,
        totalHours: expectedHours, // kept as an alias so older callers still read
        pctTime: expectedHours > 0 ? Math.round((hours / expectedHours) * 100) : 0,
      }
    })

    // ----- Devices, coverage per device, and rooms needing attention -----
    const devices = await Device.find({ deviceId: { $in: userDeviceIds } }).lean()
    const deviceMap = Object.fromEntries(devices.map((d) => [d.deviceId, d]))
    const statsByDevice = Object.fromEntries(byDeviceAgg.map((d) => [d._id, d]))

    // Hours over limit per device, from the SAME evaluateReading the live alerts
    // use. Two evaluation paths would eventually disagree.
    const roomHours = {}
    for (const row of deviceHourlyAgg) {
      const id = row._id.deviceId
      if (!roomHours[id]) roomHours[id] = { total: 0, byField: {}, drivers: {} }
      roomHours[id].total++
      for (const hit of evaluateReading(row, limits)) {
        roomHours[id].byField[hit.field] = (roomHours[id].byField[hit.field] || 0) + 1
        if (hit.driver) roomHours[id].drivers[hit.driver] = (roomHours[id].drivers[hit.driver] || 0) + 1
      }
    }

    // deviceId -> { category: count }
    const categoryByDevice = {}
    for (const row of deviceCategoryAgg) {
      const id = row._id.deviceId
      if (!categoryByDevice[id]) categoryByDevice[id] = {}
      categoryByDevice[id][row._id.category] = row.count
    }

    const byDevice = scopedDeviceIds.map((id) => {
      const agg = statsByDevice[id]
      const hours = roomHours[id] || { byField: {}, drivers: {} }
      const fields = Object.entries(hours.byField).sort((a, b) => b[1] - a[1])
      const worst = fields[0] || null
      const driver = worst && worst[0] === 'Aqi'
        ? Object.entries(hours.drivers).sort((a, b) => b[1] - a[1])[0]?.[0] || null
        : null
      return {
        deviceId: id,
        name: deviceMap[id]?.name || id,
        room: deviceMap[id]?.room || '',
        avgAqi: agg ? Math.round(agg.avgAqi) : null,
        maxAqi: agg ? agg.maxAqi : null,
        count: agg ? agg.count : 0,
        coverage: expectedPerDevice > 0
          ? Math.min(100, Math.round(((observedByDevice[id] || 0) / expectedPerDevice) * 100))
          : 0,
        hoursOver: Object.fromEntries(fields),
        worstField: worst ? worst[0] : null,
        worstHours: worst ? worst[1] : 0,
        driver,
        // Share of this room readings in each DENR category, for the report.
        categoryPct: (() => {
          const counts = categoryByDevice[id] || {}
          const total = Object.values(counts).reduce((a, b) => a + b, 0)
          if (!total) return {}
          return Object.fromEntries(
            Object.entries(counts).map(([name, n]) => [name, Math.round((n / total) * 100)])
          )
        })(),
      }
    })

    const needsAttention = byDevice
      .filter((d) => d.count > 0 && d.worstHours > 0)
      .sort((a, b) => b.worstHours - a.worstHours)
    const okRooms = byDevice.filter((d) => d.count > 0 && d.worstHours === 0)
    // Reported no readings at all in this range. Without its own group a room
    // whose sensor is dead simply disappears from the page, which is the
    // opposite of what someone checking on it needs.
    const noDataRooms = byDevice.filter((d) => d.count === 0)

    // ----- Comparison -----
    // With the school-hours filter on, "weekend" is empty by definition, since
    // the window is Mon-Fri. Say so rather than reporting a meaningless zero.
    const weekendExcluded = schoolActive && !SCHOOL_HOURS.days.some((d) => d === 1 || d === 7)
    const comparison = {
      current:  { avgAqi: round(statsRow.Aqi_avg, 0), maxAqi: statsRow.Aqi_max || 0, count: totalCount },
      previous: {
        avgAqi: round(prevStatsAgg[0]?.Aqi_avg, 0),
        maxAqi: prevStatsAgg[0]?.Aqi_max || 0,
        count: prevStatsAgg[0]?.count || 0,
      },
      weekday: { avgAqi: round(weekdayStatsAgg[0]?.Aqi_avg, 0), count: weekdayStatsAgg[0]?.count || 0 },
      weekend: { avgAqi: round(weekendStatsAgg[0]?.Aqi_avg, 0), count: weekendStatsAgg[0]?.count || 0 },
      weekendExcluded,
    }

    // A heatmap needs several days before an hour-by-weekday pattern means
    // anything; below that the UI shows why instead of a near-empty grid.
    const heatmapDays = Math.round(rangeMs / 86400000)

    res.status(200).json({
      meta: {
        ...emptyMeta,
        from,
        to,
        deviceCount,
        bucketMs,
        rangeMs,
      },
      kpis: {
        avg: avgAqi,
        max: statsRow.Aqi_max || 0,
        min: statsRow.Aqi_min || 0,
        count: totalCount,
        pctGood: totalCount > 0 ? Math.round((goodCount / totalCount) * 100) : 0,
        avgCategory: aqiCategory(avgAqi),
        coverage: coveragePct,
      },
      coverage: {
        pct: coveragePct,
        observedMinutes,
        expectedMinutes: expectedTotal,
        expectedPerDevice,
        low: coveragePct < 70,
        perDevice: byDevice.map((d) => ({ deviceId: d.deviceId, name: d.name, room: d.room, coverage: d.coverage })),
      },
      basisMix,
      legacyPct,
      spansStandardChange,
      pollutantStats: shapeStats(statsRow, hoursOverByField),
      buckets: bucketsAgg.map((b) => ({
        time: b._id,
        aqi: Math.round(b.avgAqi),
        aqiMax: Math.round(b.maxAqi),
        count: b.count,
        instantCount: b.instantCount,
        pm25: round(b.avgPM25),
        pm10: round(b.avgPM10),
        co2: Math.round(b.avgCO2),
        tvoc: Math.round(b.avgTVOC),
        hcho: Math.round(b.avgHCHO),
        temp: round(b.avgTemp),
        humidity: round(b.avgHum),
      })),
      heatmap: heatmapAgg.map((h) => ({
        dow: h._id.dow, hour: h._id.hour, avgAqi: Math.round(h.avgAqi), count: h.count,
      })),
      heatmapDays,
      exceedances,
      comparison,
      categories,
      categoriesByDay,
      rooms: {
        needsAttention,
        okCount: okRooms.length,
        okRooms: okRooms.map((d) => d.room || d.name),
        noDataCount: noDataRooms.length,
        noDataRooms: noDataRooms.map((d) => d.room || d.name),
      },
      byDevice,
      recent: recent.map((r) => ({ ...r, category: aqiCategory(r.Aqi) })),
    })
  } catch (error) {
    console.error('[analytics] error:', error)
    res.status(500).json({ error: error.message })
  }
}

// GET /api/aqi/device/:deviceId?limit=20  — recent readings for one device
// Used by the device detail page for the "Recent Readings" diagnostic table.
const getDeviceReadings = async (req, res) => {
  try {
    const { deviceId } = req.params
    const userDeviceIds = await getVisibleDeviceIds(req.user)
    if (!userDeviceIds.includes(deviceId)) {
      return res.status(403).json({ error: 'Access denied' })
    }
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const readings = await AqiModel.find({ deviceId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
    res.status(200).json(readings)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

module.exports = { getAqi, getLatestPerDevice, getLiveReadings, streamLiveReadings, getAnalytics, getDeviceReadings }
