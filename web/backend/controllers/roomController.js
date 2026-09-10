const Room = require('../models/RoomModel')
const Device = require('../models/DeviceModel')
const logAudit = require('../utils/logAudit')

// ---------- floor / slot helpers ----------
//
// `floor` and `slot` place a room on the floor-plan drawing. Both are optional
// on the wire: a caller that only renames a room (the plan's "Manage rooms"
// panel) sends neither, and the room keeps whatever placement it had.

const FLOOR_MIN = 1
const FLOOR_MAX = 5

// Returns { value } on success or { error } on a bad input. `undefined` input
// means "not supplied" and yields { value: undefined } so callers can tell it
// apart from an explicit clear.
const parseFloor = (raw) => {
  if (raw === undefined) return { value: undefined }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < FLOOR_MIN || n > FLOOR_MAX) {
    return { error: `Floor must be a whole number between ${FLOOR_MIN} and ${FLOOR_MAX}` }
  }
  return { value: n }
}

// '' and null both mean "not on the drawing" and normalise to null.
const parseSlot = (raw) => {
  if (raw === undefined) return { value: undefined }
  if (raw === null || raw === '') return { value: null }
  const s = String(raw).trim().toLowerCase()
  if (!Room.SLOTS.includes(s)) {
    return { error: `Slot must be one of ${Room.SLOTS.join(', ')} (or empty for no place on the plan)` }
  }
  return { value: s }
}

// Only one room can sit in a given slot on a given floor. Enforced here rather
// than as a unique index because null slots are the common case and must stay
// free to repeat — many rooms legitimately have no place on the drawing.
const findSlotConflict = async (floor, slot, exceptId) => {
  if (!slot) return null
  const query = { floor, slot }
  if (exceptId) query._id = { $ne: exceptId }
  return Room.findOne(query)
}

// GET /api/room — list all rooms (any authenticated user; mobile uses this for the dropdown)
const getRooms = async (req, res) => {
  try {
    const rooms = await Room.find({}).sort({ name: 1 })
    res.status(200).json(rooms)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// POST /api/room — create a room (admin only)
const createRoom = async (req, res) => {
  const { name, floor, slot } = req.body
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Room name is required' })
  }

  const f = parseFloor(floor)
  if (f.error) return res.status(400).json({ error: f.error })
  const s = parseSlot(slot)
  if (s.error) return res.status(400).json({ error: s.error })

  const floorValue = f.value === undefined ? 1 : f.value
  const slotValue = s.value === undefined ? null : s.value

  try {
    const clash = await findSlotConflict(floorValue, slotValue)
    if (clash) {
      return res.status(400).json({
        error: `Slot ${slotValue.toUpperCase()} on floor ${floorValue} is already taken by "${clash.name}"`,
      })
    }

    const room = await Room.create({
      name: name.trim(),
      floor: floorValue,
      slot: slotValue,
    })
    logAudit({
      module: 'Classroom',
      action: `Room "${room.name}" was created by ${req.user.email}`,
      user: req.user.email,
    })
    res.status(201).json(room)
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'A room with that name already exists' })
    }
    res.status(400).json({ error: error.message })
  }
}

// PUT /api/room/:id — rename a room (admin only)
const updateRoom = async (req, res) => {
  const { id } = req.params
  const { name, floor, slot } = req.body
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Room name is required' })
  }

  const f = parseFloor(floor)
  if (f.error) return res.status(400).json({ error: f.error })
  const s = parseSlot(slot)
  if (s.error) return res.status(400).json({ error: s.error })

  try {
    // Capture the old name first so we can cascade the rename to devices,
    // which reference their room by name (not by id).
    const existing = await Room.findById(id)
    if (!existing) return res.status(404).json({ error: 'Room not found' })
    const oldName = existing.name
    const newName = name.trim()

    // Anything the caller left out keeps its current value — the plan's
    // "Manage rooms" panel only ever sends a name.
    const floorValue = f.value === undefined ? existing.floor : f.value
    const slotValue = s.value === undefined ? existing.slot : s.value

    const clash = await findSlotConflict(floorValue, slotValue, id)
    if (clash) {
      return res.status(400).json({
        error: `Slot ${slotValue.toUpperCase()} on floor ${floorValue} is already taken by "${clash.name}"`,
      })
    }

    const room = await Room.findByIdAndUpdate(
      id,
      { name: newName, floor: floorValue, slot: slotValue },
      { new: true, runValidators: true }
    )

    // Keep devices in sync: any device still pointing at the old room name
    // gets moved to the new name so it doesn't appear as a separate room.
    if (oldName !== newName) {
      await Device.updateMany({ room: oldName }, { room: newName })
    }

    // The panel can rename, re-place, or both — say which actually happened
    // rather than logging "renamed from X to X" for a pure move.
    const changes = []
    if (oldName !== newName) changes.push(`renamed from "${oldName}" to "${room.name}"`)
    if (existing.floor !== room.floor || existing.slot !== room.slot) {
      const where = room.slot ? `floor ${room.floor}, slot ${room.slot.toUpperCase()}` : 'no place on the plan'
      changes.push(`moved to ${where}`)
    }
    if (changes.length) {
      logAudit({
        module: 'Classroom',
        action: `Room "${room.name}" ${changes.join(' and ')} by ${req.user.email}`,
        user: req.user.email,
      })
    }
    res.status(200).json(room)
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'A room with that name already exists' })
    }
    res.status(400).json({ error: error.message })
  }
}

// DELETE /api/room/:id — remove a room (admin only)
const deleteRoom = async (req, res) => {
  const { id } = req.params
  try {
    const room = await Room.findByIdAndDelete(id)
    if (!room) return res.status(404).json({ error: 'Room not found' })
    logAudit({
      module: 'Classroom',
      action: `Room "${room.name}" was deleted by ${req.user.email}`,
      user: req.user.email,
    })
    res.status(200).json(room)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

module.exports = { getRooms, createRoom, updateRoom, deleteRoom }
