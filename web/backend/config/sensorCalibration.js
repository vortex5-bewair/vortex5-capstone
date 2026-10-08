// Per-device dust (PM2.5 / PM10) calibration offsets.
//
// The FS00905B's optical PM reading runs high by a roughly fixed amount, and
// that amount differs per physical node — so the correction is a table keyed
// by deviceId, not a single constant. Found by testing each node against a
// reference Sonoff SAWF-07P over a 26-hour window; subtracting the offset cut
// average error from ~22-37% to ~9-10% on held-out data.
//
// A config file rather than fields on the Device model: every other
// cross-cutting constant table in this backend (config/airQualityBands.js,
// config/schoolHours.js, config/mqtt.js) is a plain committed module, not
// database data, and this value changes about as often as those do — only
// when a node is physically added or re-tested. Putting it on Device would
// also mean mqttSubscriber.js has to read the Device collection on every
// decoded frame (roughly once a second per device) instead of a plain object
// lookup. The interface below (calibrate(), getCalibrationVersion()) is the
// only thing any caller touches, so moving this to the database later is a
// change to this one file, not to every call site.
//
// A device not in OFFSETS gets no correction — there is no reference
// measurement to base one on, and inventing a default would be worse than
// leaving it uncorrected. calibrate() logs that once per device, not once
// per reading, so an unregistered device doesn't spam the log.
//
// scripts/calibrateNode.js measures the offset for a new node from a BewAir
// export CSV and a matching Sonoff log.

const CALIBRATION_VERSION = 1

const OFFSETS = {
  'BewAir-94A5': { PM25: 5.35, PM10: 5.89 },
  'BewAir-D406': { PM25: 10.06, PM10: 10.76 },
}

const warnedDevices = new Set()

function warnUncalibratedOnce(deviceId) {
  if (warnedDevices.has(deviceId)) return
  warnedDevices.add(deviceId)
  console.warn(
    `[calibration] no PM offset for device "${deviceId}" — storing uncorrected PM2.5/PM10 ` +
    `(calibrationVersion: null). Add an entry to config/sensorCalibration.js once this node ` +
    `has been tested against a reference sensor.`
  )
}

/** CALIBRATION_VERSION if this device has an offset on file, else null. */
function getCalibrationVersion(deviceId) {
  return OFFSETS[deviceId] ? CALIBRATION_VERSION : null
}

/**
 * Apply this device's PM2.5/PM10 offset, if one exists.
 *
 * Only PM25 and PM10 are touched — PM1 has no reference measurement, and
 * every other field is untouched here entirely. Returns the decoded values
 * unchanged (plus rawPM25/rawPM10 mirroring them, and a null
 * calibrationVersion) for a device with no offset on file.
 *
 * @param {string} deviceId
 * @param {{PM25: number, PM10: number}} metrics - decoded, not yet corrected
 * @returns {{PM25: number, PM10: number, rawPM25: number, rawPM10: number, calibrationVersion: number|null}}
 */
function calibrate(deviceId, { PM25, PM10 }) {
  const offset = OFFSETS[deviceId]
  if (!offset) {
    warnUncalibratedOnce(deviceId)
    return { PM25, PM10, rawPM25: PM25, rawPM10: PM10, calibrationVersion: null }
  }
  return {
    PM25: Math.max(0, PM25 - offset.PM25),
    PM10: Math.max(0, PM10 - offset.PM10),
    rawPM25: PM25,
    rawPM10: PM10,
    calibrationVersion: CALIBRATION_VERSION,
  }
}

module.exports = { calibrate, getCalibrationVersion, CALIBRATION_VERSION, OFFSETS }
