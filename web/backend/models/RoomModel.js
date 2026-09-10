const mongoose = require('mongoose')

// The floor plan draws a fixed 8-slot double-loaded corridor per floor: four
// rooms along the top of the corridor (a1..d1) and four along the bottom
// (a2..d2). The geometry is a constant in the frontend (FloorPlan.jsx); only
// which room sits in which slot is data.
//
// `slot: null` is a normal state, not an error — it means a real room that has
// no place on the drawing (a 9th room on the floor, or one nobody has placed
// yet). Those rooms still appear in the room list under the plan.
const SLOTS = ['a1', 'b1', 'c1', 'd1', 'a2', 'b2', 'c2', 'd2']

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    floor: {
      type: Number,
      default: 1,
      min: 1,
      max: 5,
    },
    slot: {
      type: String,
      default: null,
      enum: [...SLOTS, null],
    },
  },
  { timestamps: true }
)

const Room = mongoose.model('Room', roomSchema)

// Exposed so roomController can validate against the same list rather than
// keeping a second copy of it.
Room.SLOTS = SLOTS

module.exports = Room
