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
  // "Warning" videos interrupt that rotation when the live AQI reaches the
  // category they're assigned to (see aqiCategory below), then hand playback
  // back to the educational video that was paused.
  videoType: {
    type: String,
    enum: ['Educational', 'Warning'],
    default: 'Educational'
  },
  // Required, and only meaningful, for Warning videos — which AQI category
  // triggers this one. Null for Educational videos.
  aqiCategory: {
    type: String,
    enum: WARNING_CATEGORIES,
    default: null
  }
}, { timestamps: true })

module.exports = mongoose.model('Media', mediaSchema)