import { useId, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { aqiCategory, textSafeCategoryColor, airQualityCategories, CATEGORY_COLORS } from '../utils/airQualityGuidance'
import { SLOT_ORDER, FLOORS } from '../utils/floorPlan'

// ============================================================================
// PLAN GEOMETRY — all values in feet, drawn 1 SVG unit = 1 foot.
//
// A double-loaded corridor block, 123'-9" x 64'-0": four 27'-6" x 26'-6"
// classrooms on each side of an 8'-6" corridor, with a 10'-3" cross spine.
//
// This drawing is a CONSTANT — it stands in for the school's real floor plan.
// Only which room sits in which slot is data, which is why there is no
// drag/resize here: moving a wall would mean the drawing no longer matches the
// building. Slots are addressed a1..d1 along the top and a2..d2 along the
// bottom, matching the `slot` enum in backend/models/RoomModel.js.
// ============================================================================
const EXT = 0.75            // exterior wall thickness
const INT = 0.5             // interior wall thickness
const PLAN_W = 123.75
const PLAN_H = 64
const RW = 27.5             // classroom width
const RD = 26.5             // classroom depth
const TOP_Y = 0.75
const BOT_Y = 36.75
const CORR_Y = 27.75        // corridor top edge
const CORR_H = 8.5
const COL = [0.75, 28.75, 67.5, 95.5]
const SPINE_X = 56.75
const SPINE_W = 10.25

// `dx` is where that slot's door sits along the corridor wall.
const SLOTS = {
  a1: { x: COL[0], y: TOP_Y, door: 'S', dx: 24.0 },
  b1: { x: COL[1], y: TOP_Y, door: 'S', dx: 52.0 },
  c1: { x: COL[2], y: TOP_Y, door: 'S', dx: 68.75 },
  d1: { x: COL[3], y: TOP_Y, door: 'S', dx: 96.75 },
  a2: { x: COL[0], y: BOT_Y, door: 'N', dx: 24.0 },
  b2: { x: COL[1], y: BOT_Y, door: 'N', dx: 52.0 },
  c2: { x: COL[2], y: BOT_Y, door: 'N', dx: 68.75 },
  d2: { x: COL[3], y: BOT_Y, door: 'N', dx: 96.75 },
}
// Category names are long; the plan and legend have little room for them.
const SHORT_ON_PLAN = {
  'Unhealthy for Sensitive Groups': 'SENSITIVE',
  'Very Unhealthy': 'VERY UNHEALTHY',
  'Acutely Unhealthy': 'ACUTELY UNH.',
}
const SHORT_IN_LEGEND = {
  'Unhealthy for Sensitive Groups': 'Sensitive',
  'Acutely Unhealthy': 'Acutely Unh.',
}

// Room names are user-supplied and the drawing can't grow to fit them, so a
// long one is stepped down and then hard-clamped to the room's width rather
// than being allowed to run across the wall into the next room.
//
// The size has to go on `style`, not on a fontSize attribute: .fp-t-room sets
// font-size in CSS, and a CSS rule beats an SVG presentation attribute.
// `textLength` then guarantees the glyphs cannot exceed `width` no matter how
// long the name is; lengthAdjust squeezes spacing first, then the glyphs.
const MAX_NAME_CHARS = 34
function nameProps(name, width) {
  const clipped = name.length > MAX_NAME_CHARS ? `${name.slice(0, MAX_NAME_CHARS - 1)}…` : name
  if (clipped.length <= 16) return { text: clipped }
  return {
    text: clipped,
    style: { fontSize: clipped.length <= 22 ? 1.75 : 1.5 },
    textLength: width,
    lengthAdjust: 'spacingAndGlyphs',
  }
}

// A door: punches the opening through the wall, then draws the leaf and its
// swing arc. dx/dy give the direction the leaf swings.
function Door({ x, y, w, h, hingeX, hingeY, dx, dy, r, openFill }) {
  const sweep = dx * dy > 0 ? 0 : 1
  return (
    <>
      {openFill !== 'none' && <rect x={x} y={y} width={w} height={h} fill={openFill} />}
      <path
        className="fp-swing fp-swing-arc"
        d={`M ${hingeX} ${hingeY + r * dy} A ${r} ${r} 0 0 ${sweep} ${hingeX + r * dx} ${hingeY}`}
      />
      <line className="fp-swing fp-swing-leaf" x1={hingeX} y1={hingeY} x2={hingeX} y2={hingeY + r * dy} />
    </>
  )
}

// One classroom carved out of the wall mass. `room` is null for a slot no
// room has been placed in yet.
function PlanRoom({ slotKey, room, isDark, managing, isSelected, onActivate }) {
  const s = SLOTS[slotKey]
  const cx = s.x + RW / 2
  const category = room && room.avgAqi != null ? aqiCategory(room.avgAqi) : null

  // An empty slot is drawing furniture, not a control.
  if (!room) {
    return (
      <g className="fp-room">
        <rect x={s.x} y={s.y} width={RW} height={RD} fill="var(--fp-vacant)" />
        <rect x={s.x} y={s.y} width={RW} height={RD} fill="url(#fpVacantHatch)" />
        <rect x={cx - 6.5} y={s.y + RD / 2 - 2.2} width={13} height={3.6} fill="var(--fp-vacant)" />
        <text x={cx} y={s.y + RD / 2 + 0.5} textAnchor="middle" className="fp-t-meta">UNASSIGNED</text>
      </g>
    )
  }

  const label = managing
    ? `${room.room}. Select to edit.`
    : category
      ? `${room.room}, average AQI ${room.avgAqi}, ${category}. Open room.`
      : `${room.room}, no air quality data. Open room.`

  const activate = () => onActivate(room)
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate()
    }
  }

  return (
    <g
      className={`fp-room fp-room-live${isSelected ? ' is-selected' : ''}`}
      tabIndex={0}
      role="button"
      aria-label={label}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      {category ? (
        <>
          <rect
            x={s.x} y={s.y} width={RW} height={RD}
            fill={`color-mix(in srgb, ${CATEGORY_COLORS[category]} 20%, var(--fp-paper))`}
          />
          {/* Severity band along the corridor wall — state as form, not colour alone. */}
          <rect
            x={s.x} y={s.door === 'S' ? s.y + RD - 1.15 : s.y}
            width={RW} height={1.15}
            fill={CATEGORY_COLORS[category]}
          />
          {(({ text, ...rest }) => (
            <text x={cx} y={s.y + 8.0} textAnchor="middle" className="fp-t-room" {...rest}>{text.toUpperCase()}</text>
          ))(nameProps(room.room, RW - 4))}
          <text x={cx} y={s.y + 16.6} textAnchor="middle" className="fp-t-aqi" fill={textSafeCategoryColor(category, isDark)}>
            {room.avgAqi}
          </text>
          <text x={cx} y={s.y + 19.5} textAnchor="middle" className="fp-t-cat" fill={textSafeCategoryColor(category, isDark)}>
            {SHORT_ON_PLAN[category] || category.toUpperCase()}
          </text>
          <text x={cx} y={s.y + 22.2} textAnchor="middle" className="fp-t-meta">
            {room.devices.length} {room.devices.length === 1 ? 'SENSOR' : 'SENSORS'}
          </text>
        </>
      ) : (
        <>
          <rect x={s.x} y={s.y} width={RW} height={RD} fill="var(--fp-vacant)" />
          <rect x={s.x} y={s.y} width={RW} height={RD} fill="url(#fpVacantHatch)" />
          <rect x={s.x + 3.2} y={s.y + 8.8} width={RW - 6.4} height={9.0} fill="var(--fp-vacant)" />
          {/* narrower target: this label sits on the plaque, not the full room */}
          {(({ text, ...rest }) => (
            <text x={cx} y={s.y + 12.4} textAnchor="middle" className="fp-t-room" {...rest}>{text.toUpperCase()}</text>
          ))(nameProps(room.room, RW - 8))}
          <text x={cx} y={s.y + 16.0} textAnchor="middle" className="fp-t-meta">
            {room.devices.length ? 'SENSOR OFFLINE' : 'NO SENSOR'}
          </text>
        </>
      )}
      <rect x={s.x} y={s.y} width={RW} height={RD} className="fp-hit" fill="transparent" />
    </g>
  )
}

export default function FloorPlan({ rooms, isDark, isAdmin, onOpenRoom, onChanged, authHeader }) {
  const titleId = useId()
  const [floor, setFloor] = useState(1)
  const [managing, setManaging] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [nameDraft, setNameDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [panelError, setPanelError] = useState('')

  const onFloor = useMemo(() => rooms.filter((r) => r.floor === floor), [rooms, floor])
  const bySlot = useMemo(() => {
    const map = {}
    for (const r of onFloor) if (r.slot) map[r.slot] = r
    return map
  }, [onFloor])

  const selected = useMemo(
    () => (selectedId ? onFloor.find((r) => r.roomId === selectedId) || null : null),
    [onFloor, selectedId]
  )

  // Every device in the system, so a sensor can be pulled into this room from
  // anywhere — not just from the floor being viewed.
  const allDevices = useMemo(() => {
    const seen = new Map()
    for (const r of rooms) for (const d of r.devices) if (!seen.has(d.deviceId)) seen.set(d.deviceId, d)
    return [...seen.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [rooms])

  const unplaced = onFloor.filter((r) => !r.slot)
  const reporting = onFloor.filter((r) => r.avgAqi != null).length
  const sensorCount = onFloor.reduce((s, r) => s + r.devices.length, 0)

  const selectRoom = (room) => {
    setSelectedId(room.roomId)
    setNameDraft(room.room)
    setPanelError('')
  }

  const handleRoomActivate = (room) => {
    // In manage mode the plan is a picker; otherwise it opens the room.
    // A room that only exists because a device points at it has no id to
    // edit, so it stays a link even while managing.
    if (managing && room.roomId) selectRoom(room)
    else onOpenRoom(room.room)
  }

  const toggleManaging = () => {
    setManaging((m) => !m)
    setSelectedId(null)
    setPanelError('')
  }

  // Rename only — placement is set from the Add/Edit Room dialog, and the
  // backend keeps floor/slot as they were when they aren't sent.
  const saveName = async () => {
    const name = nameDraft.trim()
    if (!name || !selected) return
    setBusy(true)
    setPanelError('')
    try {
      const res = await fetch(`/api/room/${selected.roomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save room')
      await onChanged()
    } catch (err) {
      setPanelError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Assignment rides the same endpoint DeviceManagement uses. DeviceModel.room
  // is required, so "unassigned" is the literal room name the records page
  // already buckets room-less devices under, rather than an empty string.
  const toggleDevice = async (device, checked) => {
    if (!selected) return
    setBusy(true)
    setPanelError('')
    try {
      const res = await fetch(`/api/device/${device.deviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ room: checked ? selected.room : 'Unassigned' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to move sensor')
      await onChanged()
    } catch (err) {
      setPanelError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fp-panel">
      <div className="fp-panel-head">
        <div>
          <h2 className="fp-panel-title">Floor Plan</h2>
          <p className="fp-panel-sub">
            {onFloor.length} {onFloor.length === 1 ? 'room' : 'rooms'} · {reporting} reporting · {sensorCount}{' '}
            {sensorCount === 1 ? 'sensor' : 'sensors'}
          </p>
        </div>
        <div className="fp-floor-picker">
          <label htmlFor="fp-floor-select">Floor</label>
          <select
            id="fp-floor-select"
            className="fp-floor-select"
            value={floor}
            onChange={(e) => {
              setFloor(Number(e.target.value))
              setSelectedId(null)
            }}
          >
            {FLOORS.map((f) => (
              <option key={f.n} value={f.n}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="fp-toolbar">
        <div className="fp-legend">
          {airQualityCategories().map((c) => (
            <span className="fp-legend-item" key={c.name}>
              <span className="fp-legend-swatch" style={{ background: c.color }} />
              {SHORT_IN_LEGEND[c.name] || c.name}
            </span>
          ))}
          <span className="fp-legend-item">
            <span className="fp-legend-swatch" style={{ background: 'var(--fp-vacant)' }} />
            No sensor
          </span>
        </div>
        {isAdmin && (
          <button
            type="button"
            className={`fp-manage-btn${managing ? ' is-on' : ''}`}
            aria-pressed={managing}
            onClick={toggleManaging}
          >
            <Pencil size={15} /> {managing ? 'Done' : 'Manage rooms'}
          </button>
        )}
      </div>

      <div className="fp-body">
        <div className="fp-sheet">
          <div className="fp-scroll">
            <svg className="fp-svg" viewBox="-2.5 -2.5 128.75 69" role="img" aria-labelledby={titleId}>
              <title id={titleId}>
                Floor plan of {FLOORS.find((f) => f.n === floor)?.label || `floor ${floor}`}, showing each
                classroom and its average air quality index
              </title>
              <defs>
                <pattern id="fpVacantHatch" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="2.2" stroke="var(--fp-hatch)" strokeWidth="0.35" />
                </pattern>
              </defs>

              {/* Solid mass first — everything after this carves rooms out of
                  it, so wall junctions resolve themselves. */}
              <rect x={0} y={0} width={PLAN_W} height={PLAN_H} fill="var(--fp-wall)" />

              {/* Circulation: the corridor runs clear through both ends,
                  crossed by the central spine. */}
              <rect x={-2.5} y={CORR_Y} width={PLAN_W + 5} height={CORR_H} fill="var(--fp-corridor)" />
              <rect x={SPINE_X} y={EXT} width={SPINE_W} height={PLAN_H - EXT * 2} fill="var(--fp-corridor)" />

              {SLOT_ORDER.map((key) => (
                <PlanRoom
                  key={key}
                  slotKey={key}
                  room={bySlot[key] || null}
                  isDark={isDark}
                  managing={managing}
                  isSelected={!!bySlot[key] && bySlot[key].roomId === selectedId}
                  onActivate={handleRoomActivate}
                />
              ))}

              {/* Classroom doors onto the corridor. */}
              {SLOT_ORDER.map((key) => {
                const s = SLOTS[key]
                return s.door === 'S' ? (
                  <Door key={`d-${key}`} x={s.dx} y={s.y + RD} w={3} h={INT}
                    hingeX={s.dx} hingeY={s.y + RD + INT} dx={1} dy={1} r={3} openFill="var(--fp-corridor)" />
                ) : (
                  <Door key={`d-${key}`} x={s.dx} y={CORR_Y + CORR_H} w={3} h={INT}
                    hingeX={s.dx} hingeY={CORR_Y + CORR_H} dx={1} dy={-1} r={3} openFill="var(--fp-corridor)" />
                )
              })}

              {/* Two window bands per classroom in the exterior wall. The wall
                  line runs on through with the glazing drawn between it. */}
              {SLOT_ORDER.map((key) => {
                const s = SLOTS[key]
                const wy = s.door === 'S' ? 0 : PLAN_H - EXT
                return [0, 1].map((i) => {
                  const ww = 8.0
                  const gap = 3.83
                  const wx = s.x + gap + i * (ww + gap)
                  return (
                    <g key={`w-${key}-${i}`}>
                      <rect x={wx} y={wy} width={ww} height={EXT} fill="var(--fp-glass)" />
                      <line className="fp-wall-line" x1={wx} y1={wy} x2={wx + ww} y2={wy} />
                      <line className="fp-wall-line" x1={wx} y1={wy + EXT} x2={wx + ww} y2={wy + EXT} />
                      <line className="fp-mullion" x1={wx} y1={wy + EXT / 2} x2={wx + ww} y2={wy + EXT / 2} />
                    </g>
                  )
                })
              })}

              {/* Corridor egress doors at both ends. */}
              <Door x={0} y={0} w={0} h={0} hingeX={0.4} hingeY={CORR_Y + 0.3} dx={1} dy={1} r={3.4} openFill="none" />
              <Door x={0} y={0} w={0} h={0} hingeX={PLAN_W - 0.4} hingeY={CORR_Y + 0.3} dx={-1} dy={1} r={3.4} openFill="none" />
            </svg>
          </div>
        </div>

        {managing && isAdmin && (
          <aside className="fp-manage">
            {!selected ? (
              <>
                <h3 className="fp-manage-title">Manage rooms</h3>
                <p className="fp-manage-hint">
                  Pick a room on the plan to rename it or change which sensors report from it. The drawing itself
                  is fixed — it stands in for the school&rsquo;s floor plan.
                </p>
              </>
            ) : (
              <>
                <h3 className="fp-manage-title">{selected.room}</h3>
                <div className="fp-field">
                  <label htmlFor="fp-room-name">Room name</label>
                  <input
                    id="fp-room-name"
                    type="text"
                    value={nameDraft}
                    disabled={busy}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveName()}
                  />
                </div>

                <div className="fp-field">
                  <label id="fp-sensor-label">Sensors in this room</label>
                  <div className="fp-dev-list" role="group" aria-labelledby="fp-sensor-label">
                    {allDevices.length === 0 ? (
                      <p className="fp-manage-hint">No sensors registered yet.</p>
                    ) : (
                      allDevices.map((d) => {
                        const mine = (d.room || '').trim() === selected.room
                        return (
                          <label className="fp-dev-row" key={d.deviceId}>
                            <input
                              type="checkbox"
                              checked={mine}
                              disabled={busy}
                              onChange={(e) => toggleDevice(d, e.target.checked)}
                            />
                            <span className="fp-dev-main">
                              <span>{d.name}</span>
                              <span className="fp-dev-id">{d.deviceId}</span>
                            </span>
                            {!mine && <span className="fp-dev-where">in {d.room?.trim() || 'Unassigned'}</span>}
                          </label>
                        )
                      })
                    )}
                  </div>
                </div>

                {panelError && <div className="fp-manage-error">{panelError}</div>}

                <div className="fp-manage-actions">
                  <button type="button" className="profile-save-btn" disabled={busy} onClick={saveName}>
                    {busy ? 'Saving...' : 'Save name'}
                  </button>
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {unplaced.length > 0 && (
        <div className="fp-note">
          <b>Not on the drawing:</b> {unplaced.map((r) => r.room).join(', ')} — this plan has eight rooms per
          floor. Rooms beyond that still appear in the list below.
        </div>
      )}
    </div>
  )
}
