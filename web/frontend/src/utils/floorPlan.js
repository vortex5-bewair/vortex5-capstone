// Shared vocabulary for the floor plan, kept out of components/FloorPlan.jsx
// so both it and the Classroom Records page can import without tripping
// react-refresh's "components only" rule.
//
// SLOT_ORDER must stay in step with the `slot` enum in
// backend/models/RoomModel.js — the backend validates against its own copy.
// The drawing coordinates for each slot live in FloorPlan.jsx, which is the
// only place that cares where a slot physically sits.

export const SLOT_ORDER = ['a1', 'b1', 'c1', 'd1', 'a2', 'b2', 'c2', 'd2']

export const FLOORS = [
  { n: 1, label: 'Ground Floor' },
  { n: 2, label: '2nd Floor' },
  { n: 3, label: '3rd Floor' },
  { n: 4, label: '4th Floor' },
  { n: 5, label: '5th Floor' },
]
