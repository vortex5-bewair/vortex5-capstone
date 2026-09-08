import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../hooks/useAuthContext'
import { Pencil, Power, WifiOff, Trash2, Users, Loader2 } from 'lucide-react'
import ShareDeviceModal from '../components/ShareDeviceModal'

const DEVICES_PER_PAGE = 10

const DeviceManagement = () => {
  const { user } = useAuthContext()
  const navigate = useNavigate()

  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('alphabetical')
  const [currentPage, setCurrentPage] = useState(1)
  const [successMessage, setSuccessMessage] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ deviceId: '', name: '', room: '' })
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  const [editTarget, setEditTarget] = useState(null) // device object
  const [editForm, setEditForm] = useState({ name: '', room: '' })
  const [editError, setEditError] = useState('')
  const [editing, setEditing] = useState(false)

  const [resetTarget, setResetTarget] = useState(null) // { deviceId, name }
  const [resetting, setResetting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null) // deviceId
  const [deleting, setDeleting] = useState(false)

  const [powerLoading, setPowerLoading] = useState({}) // { [deviceId]: true }
  const [shareTarget, setShareTarget] = useState(null) // device object

  const isAdmin = user && user.role === 'admin'

  // ================= FETCH DEVICES =================
  const fetchDevices = async () => {
    if (!user) return
    try {
      const res = await fetch('/api/device', {
        headers: { Authorization: `Bearer ${user.token}` }
      })
      if (res.ok) setDevices(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDevices()
    const iv = setInterval(fetchDevices, 15000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const flashSuccess = (msg) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(''), 4000)
  }

  // ================= SEARCH + SORT =================
  const filteredDevices = devices.filter(d =>
    ((d.name || '') + ' ' + (d.room || '') + ' ' + (d.deviceId || ''))
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  const sortedDevices = [...filteredDevices].sort((a, b) => {
    if (sortBy === 'alphabetical') return (a.name || '').localeCompare(b.name || '')
    if (sortBy === 'room') return (a.room || '').localeCompare(b.room || '')
    if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '')
    if (sortBy === 'recent') return new Date(b.createdAt) - new Date(a.createdAt)
    return 0
  })

  const totalPages = Math.max(1, Math.ceil(sortedDevices.length / DEVICES_PER_PAGE))
  const currentDevices = sortedDevices.slice(
    (currentPage - 1) * DEVICES_PER_PAGE,
    currentPage * DEVICES_PER_PAGE
  )

  // ================= ADD DEVICE =================
  const handleAddDevice = async () => {
    setAddError('')
    if (!addForm.deviceId.trim() || !addForm.name.trim() || !addForm.room.trim()) {
      setAddError('All fields are required.')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify(addForm)
      })
      const json = await res.json()
      if (res.ok) {
        setAddOpen(false)
        setAddForm({ deviceId: '', name: '', room: '' })
        await fetchDevices()
        flashSuccess(`${json.name} registered.`)
      } else {
        setAddError(json.error || 'Failed to register device.')
      }
    } catch {
      setAddError('Network error. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  // ================= EDIT DEVICE =================
  const openEdit = (device) => {
    setEditTarget(device)
    setEditForm({ name: device.name, room: device.room })
    setEditError('')
  }

  const handleEditDevice = async () => {
    setEditError('')
    if (!editForm.name.trim() || !editForm.room.trim()) {
      setEditError('Name and room are required.')
      return
    }
    setEditing(true)
    try {
      const res = await fetch(`/api/device/${editTarget.deviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify(editForm)
      })
      const json = await res.json()
      if (res.ok) {
        setEditTarget(null)
        await fetchDevices()
        flashSuccess(`${json.name} updated.`)
      } else {
        setEditError(json.error || 'Failed to update device.')
      }
    } catch {
      setEditError('Network error. Please try again.')
    } finally {
      setEditing(false)
    }
  }

  // ================= FORGET WI-FI =================
  const confirmReset = async () => {
    setResetting(true)
    try {
      const res = await fetch(`/api/device/${resetTarget.deviceId}/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` }
      })
      const json = await res.json()
      setResetTarget(null)
      if (res.ok) flashSuccess(json.message || 'Forgetting Wi-Fi...')
    } finally {
      setResetting(false)
    }
  }

  // ================= POWER TOGGLE =================
  const togglePower = async (device) => {
    setPowerLoading(p => ({ ...p, [device.deviceId]: true }))
    try {
      const res = await fetch(`/api/device/${device.deviceId}/power`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ on: !device.enabled })
      })
      if (res.ok) await fetchDevices()
    } finally {
      setPowerLoading(p => ({ ...p, [device.deviceId]: false }))
    }
  }

  // ================= DELETE DEVICE =================
  const confirmDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/device/${deleteTarget}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user.token}` }
      })
      const json = await res.json()
      setDeleteTarget(null)
      if (res.ok) {
        await fetchDevices()
        flashSuccess(`${json.name} deleted.`)
      }
    } finally {
      setDeleting(false)
    }
  }

  if (!user) return <p>Please log in to view this page.</p>
  if (!isAdmin) return <p>Only admins can manage devices.</p>
  if (loading) return <div className="dash-page"><p>Loading devices...</p></div>

  return (
    <div className="device-management">
      <div className="section-header">
        <div>
          <h2 className="page-title">Device Management</h2>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
        <div className="table-controls">
          <input
            type="text"
            placeholder="Search devices..."
            aria-label="Search devices"
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
            className="search-input"
          />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="sort-select" aria-label="Sort devices">
            <option value="alphabetical">A–Z</option>
            <option value="room">Room</option>
            <option value="status">Status</option>
            <option value="recent">Recently Added</option>
          </select>
        </div>

        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setAddOpen(true)}>
          + Add Device
        </button>
      </div>

      {/* TABLE */}
      <div className="table-card">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Room</th>
              <th>Device ID</th>
              <th className="status-col">Status</th>
              <th>Access</th>
              <th className="actions-col">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentDevices.length === 0 ? (
              <tr><td colSpan={6}>No devices found.</td></tr>
            ) : currentDevices.map(d => (
              <tr key={d.deviceId}>
                <td className="user-name" style={{ cursor: 'pointer' }} onClick={() => navigate(`/device/${d.deviceId}`)}>
                  {d.name}
                </td>
                <td>{d.room}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{d.deviceId}</td>
                <td className="user-status">
                  <span className={`status-badge ${d.status === 'online' ? 'status-active' : 'status-deactivated'}`}>
                    {d.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                  {!d.enabled && (
                    <span className="status-badge status-pending" style={{ marginLeft: 6 }}>Powered off</span>
                  )}
                </td>
                <td>
                  <button className="icon-btn view-btn" title="Manage access" onClick={() => setShareTarget(d)}>
                    <Users size={16} />
                  </button>
                </td>
                <td>
                  <div className="action-buttons">
                    <button className="icon-btn view-btn" title="Edit device" onClick={() => openEdit(d)}>
                      <Pencil size={16} />
                    </button>
                    <button className="icon-btn deactivate-btn" title="Forget Wi-Fi" onClick={() => setResetTarget({ deviceId: d.deviceId, name: d.name })}>
                      <WifiOff size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      style={{ background: d.enabled ? '#10b981' : '#94a3b8', color: 'white' }}
                      title={d.enabled ? 'Turn off' : 'Turn on'}
                      onClick={() => togglePower(d)}
                      disabled={powerLoading[d.deviceId]}
                    >
                      {powerLoading[d.deviceId] ? <Loader2 size={16} className="share-spinner" /> : <Power size={16} />}
                    </button>
                    <button className="icon-btn delete-btn" title="Delete device" onClick={() => setDeleteTarget(d.deviceId)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Prev</button>
          {[...Array(totalPages)].map((_, i) => (
            <button key={i} className={currentPage === i + 1 ? 'active' : ''} onClick={() => setCurrentPage(i + 1)}>
              {i + 1}
            </button>
          ))}
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
        </div>
      )}

      {successMessage && (
        <p style={{ color: 'green', marginTop: '10px' }}>✅ {successMessage}</p>
      )}

      {/* ADD DEVICE MODAL */}
      {addOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header"><h3>Add Device</h3></div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: 10 }}>
                <input
                  type="text"
                  placeholder="Device ID (from the ESP32's provisioning)"
                  aria-label="Device ID"
                  value={addForm.deviceId}
                  onChange={e => setAddForm({ ...addForm, deviceId: e.target.value })}
                  className="search-input"
                />
                <input
                  type="text"
                  placeholder="Name (e.g. Room 301 Sensor)"
                  aria-label="Device name"
                  value={addForm.name}
                  onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                  className="search-input"
                />
                <input
                  type="text"
                  placeholder="Room"
                  aria-label="Room"
                  value={addForm.room}
                  onChange={e => setAddForm({ ...addForm, room: e.target.value })}
                  className="search-input"
                />
              </div>
              {addError && <p style={{ color: 'red', marginTop: 10 }}>{addError}</p>}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setAddOpen(false); setAddError('') }} disabled={adding}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAddDevice} disabled={adding}>
                {adding ? 'Adding...' : 'Add Device'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT DEVICE MODAL */}
      {editTarget && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header"><h3>Edit Device</h3></div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: 10 }}>
                <input
                  type="text"
                  placeholder="Name"
                  aria-label="Device name"
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="search-input"
                />
                <input
                  type="text"
                  placeholder="Room"
                  aria-label="Room"
                  value={editForm.room}
                  onChange={e => setEditForm({ ...editForm, room: e.target.value })}
                  className="search-input"
                />
              </div>
              {editError && <p style={{ color: 'red', marginTop: 10 }}>{editError}</p>}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setEditTarget(null)} disabled={editing}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleEditDevice} disabled={editing}>
                {editing ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORGET WI-FI CONFIRM MODAL */}
      {resetTarget && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header"><h3>Forget Wi-Fi?</h3></div>
            <div className="modal-body">
              <p>Erase the saved Wi-Fi password on <strong>{resetTarget.name}</strong>?</p>
              <p className="modal-warning">
                It will take the device offline and it will need to be re-provisioned
                with a network before it reports data again.
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setResetTarget(null)} disabled={resetting}>
                Cancel
              </button>
              <button className="btn btn-warning" onClick={confirmReset} disabled={resetting}>
                {resetting ? 'Sending...' : 'Forget Wi-Fi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header"><h3>Delete Device</h3></div>
            <div className="modal-body">
              <p>Are you sure you want to delete <strong>{deleteTarget}</strong>?</p>
              <p className="modal-warning">
                This removes the device and revokes everyone's access to it. This cannot be undone.
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete Device'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHARE / ACCESS MODAL */}
      {shareTarget && (
        <ShareDeviceModal
          deviceId={shareTarget.deviceId}
          deviceName={shareTarget.name}
          deviceRoom={shareTarget.room}
          token={user.token}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  )
}

export default DeviceManagement
