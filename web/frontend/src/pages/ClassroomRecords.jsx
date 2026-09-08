import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../hooks/useAuthContext'
import { useTheme } from '../hooks/useTheme'
import { School, ArrowLeft, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react'
import { aqiCategory, textSafeCategoryColor } from '../utils/airQualityGuidance'

const STATUS_LABELS = {
  active:    { label: 'Active',   color: '#16a34a', bg: '#dcfce7' },
  available: { label: 'No Data',  color: '#d97706', bg: '#fef3c7' },
  offline:   { label: 'Inactive', color: '#dc2626', bg: '#fee2e2' },
}

const ClassroomRecords = () => {
  const { user } = useAuthContext()
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const isAdmin = user && user.role === 'admin'

  const [devices, setDevices] = useState([])
  const [managedRooms, setManagedRooms] = useState([]) // [{ _id, name }]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedRoom, setSelectedRoom] = useState(null)

  // Room add/edit modal state
  const [roomModal, setRoomModal] = useState(null) // null | { mode:'add' } | { mode:'edit', id, name }
  const [roomName, setRoomName] = useState('')
  const [roomBusy, setRoomBusy] = useState(false)
  const [roomError, setRoomError] = useState('')
  const [toast, setToast] = useState('')

  const authHeader = { Authorization: `Bearer ${user?.token}` }

  const fetchRooms = async () => {
    const res = await fetch('/api/room', { headers: authHeader })
    if (res.ok) setManagedRooms(await res.json())
  }

  const fetchDevices = async () => {
    const res = await fetch('/api/dashboard/summary', { headers: authHeader })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load')
    setDevices(json.devices)
  }

  useEffect(() => {
    if (!user) return
    const fetchData = async () => {
      try {
        await Promise.all([fetchDevices(), fetchRooms()])
        setError('')
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Merge managed rooms with rooms inferred from devices.
  const rooms = useMemo(() => {
    const map = {}
    // Seed with managed rooms (so empty rooms still appear and are editable).
    for (const r of managedRooms) {
      map[r.name] = { room: r.name, roomId: r._id, devices: [], aqis: [], online: 0 }
    }
    // Add device-derived rooms.
    for (const d of devices) {
      const key = d.room?.trim() || 'Unassigned'
      if (!map[key]) {
        map[key] = { room: key, roomId: null, devices: [], aqis: [], online: 0 }
      }
      map[key].devices.push(d)
      if (d.aqi != null) map[key].aqis.push(d.aqi)
      if (d.status === 'active' || d.status === 'available') map[key].online += 1
    }
    return Object.values(map)
      .map(r => ({
        ...r,
        avgAqi: r.aqis.length > 0
          ? Math.round(r.aqis.reduce((s, v) => s + v, 0) / r.aqis.length)
          : null,
      }))
      .sort((a, b) => a.room.localeCompare(b.room))
  }, [devices, managedRooms])

  // ---------- Room CRUD ----------
  const openAdd = () => { setRoomName(''); setRoomError(''); setRoomModal({ mode: 'add' }) }
  const openEdit = (r) => { setRoomName(r.room); setRoomError(''); setRoomModal({ mode: 'edit', id: r.roomId, name: r.room }) }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const saveRoom = async () => {
    const name = roomName.trim()
    if (!name) { setRoomError('Room name is required'); return }
    setRoomBusy(true)
    setRoomError('')
    try {
      const isEdit = roomModal.mode === 'edit'
      const res = await fetch(isEdit ? `/api/room/${roomModal.id}` : '/api/room', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save room')
      // Refresh both rooms and devices: a rename cascades to devices on the
      // backend, so we must re-pull devices or the old name lingers in state.
      await Promise.all([fetchRooms(), fetchDevices()])
      setRoomModal(null)
      showToast(isEdit ? 'Room updated' : 'Room added')
    } catch (err) {
      setRoomError(err.message)
    } finally {
      setRoomBusy(false)
    }
  }

  const deleteRoom = async (r) => {
    if (!confirm(`Delete room "${r.room}"? Devices in it will become Unassigned in this view.`)) return
    try {
      const res = await fetch(`/api/room/${r.roomId}`, { method: 'DELETE', headers: authHeader })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete')
      await Promise.all([fetchRooms(), fetchDevices()])
      showToast('Room deleted')
    } catch (err) {
      showToast('Error: ' + err.message)
    }
  }

  if (loading) return <div className="dash-page"><p>Loading classroom records...</p></div>
  if (error) return <div className="dash-page"><p style={{ color: 'red' }}>{error}</p></div>

  // =============== ROOM DETAIL VIEW ===============
  if (selectedRoom) {
    const roomData = rooms.find(r => r.room === selectedRoom)
    if (!roomData) {
      setSelectedRoom(null)
      return null
    }
    return (
      <div className="dash-page">
        <button className="dash-back-btn" onClick={() => setSelectedRoom(null)}>
          <ArrowLeft size={18} /> All Rooms
        </button>
        <div className="dash-header" style={{ marginTop: 16 }}>
          <div>
            <h1 className="dash-title">{roomData.room}</h1>
            <p className="dash-subtitle">
              {roomData.devices.length} {roomData.devices.length === 1 ? 'device' : 'devices'} · {roomData.online} online
            </p>
          </div>
        </div>
        <div className="dash-section">
          {roomData.devices.length === 0 ? (
            <div className="dash-empty">No devices assigned to this room yet.</div>
          ) : (
            <div className="dash-device-grid">
              {roomData.devices.map(d => {
                const status = STATUS_LABELS[d.status] || STATUS_LABELS.offline
                const aqiColor = d.category ? textSafeCategoryColor(d.category, isDark) : 'var(--color-text-tertiary)'
                return (
                  <div
                    key={d.deviceId}
                    className="dash-device-card dash-device-card-clickable"
                    onClick={() => navigate(`/device/${d.deviceId}`)}
                  >
                    <div className="dash-device-head">
                      <div>
                        <div className="dash-device-name">{d.name}</div>
                        <div className="dash-device-room">{d.deviceId}</div>
                      </div>
                      <span className="dash-status-pill" style={{ background: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                    </div>
                    <div className="dash-aqi-big" style={{ color: aqiColor }}>
                      {d.aqi != null ? d.aqi : '--'}
                    </div>
                    <div className="dash-aqi-label" style={{ color: aqiColor }}>
                      {d.category || 'No data'}
                    </div>
                    <div className="dash-device-cta">View details →</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // =============== ROOM GRID VIEW ===============
  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Classroom Records</h1>
          <p className="dash-subtitle">Devices grouped by room. Click a room to see its sensors.</p>
        </div>
        {isAdmin && (
          <button className="profile-save-btn" onClick={openAdd}>
            <Plus size={16} /> Add Room
          </button>
        )}
      </div>

      {toast && <div className="profile-success">{toast}</div>}

      {rooms.length === 0 ? (
        <div className="dash-empty">
          No rooms yet. {isAdmin ? 'Tap "Add Room" to create one.' : 'Ask an admin to add rooms.'}
        </div>
      ) : (
        <div className="room-grid">
          {rooms.map(r => {
            const category = r.avgAqi != null ? aqiCategory(r.avgAqi) : null
            const accent = category ? textSafeCategoryColor(category, isDark) : 'var(--color-text-tertiary)'
            const isManaged = !!r.roomId
            return (
              <div
                key={r.room}
                className="room-tile"
                style={{ borderTopColor: accent }}
                onClick={() => setSelectedRoom(r.room)}
              >
                <div className="room-tile-head">
                  <div className="room-tile-icon" style={{ color: accent }}>
                    <School size={24} />
                  </div>
                  {isAdmin && isManaged ? (
                    <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <button className="room-icon-btn" title="Rename" onClick={() => openEdit(r)}>
                        <Pencil size={15} />
                      </button>
                      <button className="room-icon-btn room-icon-btn-danger" title="Delete" onClick={() => deleteRoom(r)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : (
                    <ChevronRight size={20} color="#94a3b8" />
                  )}
                </div>

                <div className="room-tile-name">{r.room}</div>
                <div className="room-tile-sub">
                  {r.devices.length} {r.devices.length === 1 ? 'device' : 'devices'} · {r.online} online
                </div>

                <div className="room-tile-aqi">
                  <div className="room-tile-aqi-value" style={{ color: accent }}>
                    {r.avgAqi != null ? r.avgAqi : '--'}
                  </div>
                  <div className="room-tile-aqi-label">
                    <span style={{ color: accent }}>{category || 'No data'}</span>
                    <span className="room-tile-aqi-meta">Avg AQI</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit room modal */}
      {roomModal && (
        <div className="dash-modal-overlay" onClick={() => !roomBusy && setRoomModal(null)}>
          <div className="dash-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal-head">
              <h2>{roomModal.mode === 'edit' ? 'Rename Room' : 'Add Room'}</h2>
            </div>
            <div className="dash-modal-body">
              <input
                className="profile-input"
                style={{ width: '100%' }}
                placeholder="Room name (e.g. Room 101)"
                aria-label="Room name"
                value={roomName}
                autoFocus
                onChange={(e) => setRoomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveRoom()}
              />
              {roomError && <div className="profile-error">{roomError}</div>}
              <div className="profile-actions">
                <button className="dash-action-btn" disabled={roomBusy} onClick={() => setRoomModal(null)}>Cancel</button>
                <button className="profile-save-btn" disabled={roomBusy} onClick={saveRoom}>
                  {roomBusy ? 'Saving...' : (roomModal.mode === 'edit' ? 'Save' : 'Add Room')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClassroomRecords
