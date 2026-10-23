const mongoose = require('mongoose')
const { AQI_CATEGORIES } = require('../config/airQualityBands')

// Every category except "Good" — a warning video for "Good" air makes no
// sense, since there's nothing to warn about. Derived from the canonical
// table rather than hand-listed, so it can't drift if a category is ever
// renamed there.
const WARNING_CATEGORIES = AQI_CATEGORIES.filter((c) => c.name !== 'Good').map((c) => c.name)

const mediaSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  videoUrl: {
    type: String,
    required: true
  },
  // Cloudinary's public_id for videoUrl — needed to delete the video from
  // Cloudinary when this record is deleted.
  publicId: {
    type: String,
    default: ''
  },
  // "Educational" videos are the normal rotation on the bulletin board.
  // "Warning" videos interrupt that rotation when the parameter they're
  // assigned to (see warningParameter/aqiCategory below) reaches an
  // unhealthy level, then hand playback back to the educational video that
  // was paused.
  videoType: {
    type: String,
    enum: ['Educational', 'Warning'],
    default: 'Educational'
  },
  // Only meaningful for Warning videos — which reading triggers this one.
  // AQI still picks a specific category (see aqiCategory); Humidity and
  // Temperature are a single generic "unhealthy" trigger each, since they
  // don't need Fair-vs-Emergency-style severity levels the way AQI does.
  // Defaults to 'AQI' so Warning videos created before this field existed
  // (which all had an aqiCategory) keep working without a migration —
  // Mongoose applies schema defaults when reading a document missing the
  // field, same as it would for a brand-new one.
  warningParameter: {
    type: String,
    enum: ['AQI', 'Humidity', 'Temperature'],
    default: 'AQI'
  },
  // Required, and only meaningful, when warningParameter is 'AQI' — which
  // AQI category triggers this one. Null otherwise.
  aqiCategory: {
    type: String,
    enum: WARNING_CATEGORIES,
    default: null
  }
}, { timestamps: true })

module.exports = mongoose.model('Media', mediaSchema)