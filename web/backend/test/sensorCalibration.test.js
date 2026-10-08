const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { calibrate, getCalibrationVersion, CALIBRATION_VERSION, OFFSETS } = require('../config/sensorCalibration')

describe('sensorCalibration.calibrate', () => {
  test('subtracts the known offset for BewAir-94A5', () => {
    const out = calibrate('BewAir-94A5', { PM25: 50, PM10: 50 })
    assert.equal(out.PM25, 50 - OFFSETS['BewAir-94A5'].PM25)
    assert.equal(out.PM10, 50 - OFFSETS['BewAir-94A5'].PM10)
    assert.equal(out.calibrationVersion, CALIBRATION_VERSION)
  })

  test('subtracts the known offset for BewAir-D406', () => {
    const out = calibrate('BewAir-D406', { PM25: 50, PM10: 50 })
    assert.equal(out.PM25, 50 - OFFSETS['BewAir-D406'].PM25)
    assert.equal(out.PM10, 50 - OFFSETS['BewAir-D406'].PM10)
    assert.equal(out.calibrationVersion, CALIBRATION_VERSION)
  })

  test('the two devices have different offsets (sanity check on the table itself)', () => {
    assert.notDeepEqual(OFFSETS['BewAir-94A5'], OFFSETS['BewAir-D406'])
  })

  test('clamps PM2.5 to a minimum of 0 rather than going negative', () => {
    const out = calibrate('BewAir-94A5', { PM25: 1, PM10: 50 })
    assert.equal(out.PM25, 0) // 1 - 5.35 would be negative
  })

  test('clamps PM10 to a minimum of 0 rather than going negative', () => {
    const out = calibrate('BewAir-D406', { PM25: 50, PM10: 2 })
    assert.equal(out.PM10, 0) // 2 - 10.76 would be negative
  })

  test('clamps exactly at 0, not below', () => {
    const out = calibrate('BewAir-94A5', { PM25: 5.35, PM10: 5.89 })
    assert.equal(out.PM25, 0)
    assert.equal(out.PM10, 0)
  })

  test('an unknown device is left completely uncorrected', () => {
    const out = calibrate('BewAir-UNKNOWN', { PM25: 42, PM10: 77 })
    assert.equal(out.PM25, 42)
    assert.equal(out.PM10, 77)
    assert.equal(out.calibrationVersion, null)
  })

  test('getCalibrationVersion matches calibrate() for a known and an unknown device', () => {
    assert.equal(getCalibrationVersion('BewAir-94A5'), CALIBRATION_VERSION)
    assert.equal(getCalibrationVersion('BewAir-D406'), CALIBRATION_VERSION)
    assert.equal(getCalibrationVersion('BewAir-NOPE'), null)
  })

  test('rawPM25/rawPM10 always carry the original, pre-correction values', () => {
    const known = calibrate('BewAir-94A5', { PM25: 50, PM10: 60 })
    assert.equal(known.rawPM25, 50)
    assert.equal(known.rawPM10, 60)

    const unknown = calibrate('BewAir-UNKNOWN', { PM25: 50, PM10: 60 })
    assert.equal(unknown.rawPM25, 50)
    assert.equal(unknown.rawPM10, 60)
  })

  test('calibrate() only returns PM25/PM10/rawPM25/rawPM10/calibrationVersion — nothing else is touched', () => {
    // calibrate() is only ever called with {PM25, PM10}; this checks its
    // output shape doesn't silently grow a field some caller might confuse
    // for a correction on PM1/Temperature/Humidity/etc.
    const out = calibrate('BewAir-94A5', { PM25: 50, PM10: 50 })
    assert.deepEqual(
      Object.keys(out).sort(),
      ['PM10', 'PM25', 'calibrationVersion', 'rawPM10', 'rawPM25'].sort()
    )
  })

  test('a full decoded-frame-shaped object passes through with PM1/TVOC/CO2/Formaldehyde/Temperature/Humidity untouched', () => {
    // Mirrors what services/mqttSubscriber.js actually passes: the whole
    // decoded frame, not just {PM25, PM10}. calibrate() destructures only
    // PM25/PM10 off it, so every other field must survive identically on the
    // original object — this is what mqttSubscriber.js relies on when it
    // only overwrites metrics.PM25/PM10/rawPM25/rawPM10 afterward.
    const decodedFrame = {
      PM1: 12,
      PM25: 50,
      PM10: 50,
      TVOC: 210,
      CO2: 780,
      Formaldehyde: 22,
      Temperature: 26.4,
      Humidity: 58.3,
    }
    const untouched = { ...decodedFrame }
    calibrate('BewAir-94A5', decodedFrame)
    assert.deepEqual(decodedFrame, untouched) // calibrate() must not mutate its input
  })
})
