const express = require('express')
const router = express.Router()
const { requireAuth, requireAdmin } = require('../middleware/requireAuth')

const {
  getMedia,
  createMedia,
  updateMedia,
  deleteMedia
} = require('../controllers/mediaController')

const upload = require('../middleware/upload')

// Wrap multer to convert its errors into clean JSON responses
const uploadVideo = (req, res, next) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      console.error('[upload] multer error:', err.message)
      return res.status(400).json({ error: err.message })
    }
    next()
  })
}

router.get('/',       getMedia)
router.post('/',      requireAuth, requireAdmin, uploadVideo, createMedia)
router.put('/:id',    requireAuth, requireAdmin, updateMedia)
router.delete('/:id', requireAuth, requireAdmin, deleteMedia)

module.exports = router