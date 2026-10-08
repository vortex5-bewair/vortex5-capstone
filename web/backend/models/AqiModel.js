const mongoose = require('mongoose')

const Schema = mongoose.Schema

const AqiSchema = new Schema({
    deviceId:     { type: String, required: true, index: true },
    // Reported AQI: NowCast over the last 12 hourly PM means, converted through
    // the DENR breakpoints. Those breakpoints are 24-hour values, so this is
    // the only figure that may be presented as "the AQI".
    Aqi:          { type: Number, required: true },
    // The same conversion applied to this row 30-second average — the "current
    // reading" the dashboard can show beside the reported AQI. Optional so
    // documents written before NowCast landed still validate.
    AqiInstant:   { type: Number },
    // Which of the two Aqi actually is: 'nowcast' once a device has enough
    // history, 'instant' before that. Lets the UI avoid claiming a NowCast it
    // does not have.
    aqiBasis:     { type: String, enum: ['nowcast', 'instant'] },
    PM1:          { type: Number, required: true },
    // Corrected values (config/sensorCalibration.js subtracted off, clamped
    // to 0). rawPM25/rawPM10 are the values exactly as decoded, kept so the
    // correction can be re-derived or revised later. Both optional: rows
    // written before per-device calibration landed have neither.
    PM25:         { type: Number, required: true },
    PM10:         { type: Number, required: true },
    rawPM25:      { type: Number },
    rawPM10:      { type: Number },
    // CALIBRATION_VERSION from config/sensorCalibration.js if this row's
    // device had an offset on file when it was written, else null — a device
    // with no reference measurement yet, or a row from before calibration
    // existed at all (same null, can't be told apart from the flag alone).
    calibrationVersion: { type: Number, default: null },
    TVOC:         { type: Number, required: true }, // µg/m³
    CO2:          { type: Number, required: true }, // ppm
    Formaldehyde: { type: Number, required: true }, // µg/m³
    Temperature:  { type: Number, required: true }, // °C
    Humidity:     { type: Number, required: true }  // %RH
}, { timestamps: true })

// Compound index so getLatestPerDevice sorts only within each device,
// not across the entire collection.
AqiSchema.index({ deviceId: 1, createdAt: -1 })

// Auto-delete readings older than the retention window, so the collection
// cannot grow without bound. MongoDB sweeps expired documents in the
// background roughly once a minute.
//
// NOTE: MongoDB will not change expireAfterSeconds on an index that already
// exists. To adjust the window later, drop the index first:
//   db.aqis.dropIndex('createdAt_1')
const RETENTION_DAYS = Number(process.env.AQI_RETENTION_DAYS || 60)
AqiSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 })

module.exports = mongoose.model('AQI', AqiSchema)
