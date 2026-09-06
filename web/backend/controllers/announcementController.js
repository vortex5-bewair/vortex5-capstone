const Announcement = require('../models/AnnouncementModel')
const { TZ } = require('../config/appTime')

// Server-side "now" split into the date/time strings the schema stores, in the
// school's timezone. Clients no longer send date/time — they're stamped here so
// every announcement is dated consistently regardless of the poster's clock
// (matches the mobile app, which now also leaves this to the server).
function nowInZone() {
  const now = new Date()
  return {
    // en-CA renders YYYY-MM-DD
    date: new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now),
    // en-GB renders HH:MM in 24-hour form
    time: new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(now),
  }
}

// get all
const getAnnouncements = async (req, res) => {
  const announcements = await Announcement.find({}).sort({ createdAt: -1 })
  res.status(200).json(announcements)
}

// create
const inputAnnouncement = async (req, res) => {
  const { title, description, date, time, category, pinned } = req.body

  try {
    const auto = nowInZone()
    const announcement = await Announcement.create({
      title,
      description,
      // Fall back to the server clock when the client omits these (web +
      // mobile both do now); an explicit value is still honoured if sent.
      date: date || auto.date,
      time: time || auto.time,
      category: category || 'General',
      pinned: pinned === true,
    })

    res.status(200).json(announcement)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// delete
const deleteAnnouncement = async (req, res) => {
  const { id } = req.params

  const announcement = await Announcement.findByIdAndDelete(id)

  if (!announcement) {
    return res.status(404).json({ error: 'No such announcement' })
  }

  res.status(200).json(announcement)
}

// update — partial: only the fields the client sends are changed (the web
// edit form sends title/description/category/pinned; the pin toggle sends
// just `pinned`). date/time are never edited, so a blank value can't wipe
// the required `date`.
const updateAnnouncement = async (req, res) => {
  const { id } = req.params
  const { title, description, category, pinned } = req.body

  const updates = {}
  if (title !== undefined) updates.title = title
  if (description !== undefined) updates.description = description
  if (category !== undefined) updates.category = category
  if (pinned !== undefined) updates.pinned = pinned === true

  try {
    const announcement = await Announcement.findByIdAndUpdate(id, updates, { new: true })

    if (!announcement) {
      return res.status(404).json({ error: 'No such announcement' })
    }

    res.status(200).json(announcement)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

module.exports = {
  inputAnnouncement,
  getAnnouncements,
  deleteAnnouncement,
  updateAnnouncement
}