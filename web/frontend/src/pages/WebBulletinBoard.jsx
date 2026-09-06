import { useEffect, useState } from 'react'
import { Pencil, Trash2, Pin } from 'lucide-react'
import { useAuthContext } from '../hooks/useAuthContext'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'

// Same category list the mobile app's announcement form uses — kept identical
// so the two apps produce consistent data. Date and time are no longer entered
// by hand on either side; the server stamps them on create.
const CATEGORIES = ['Events', 'System Updates', 'Achievements', 'Reminders']
const DEFAULT_CATEGORY = 'Events'

const WebBulletinBoard = () => {
  const { user } = useAuthContext()
  const isAdmin = user && user.role === 'admin'

 /* ------------------ EDUCATIONAL VIDEO -------------- */

  const [videoFile, setVideoFile] = useState(null)
  const [mediaList, setMediaList] = useState([])
  const [mediaError, setMediaError] = useState('')
  const [mediaDeleteTarget, setMediaDeleteTarget] = useState(null) // { id, title }
  const [mediaDeleting, setMediaDeleting] = useState(false)
  const [mediaUploading, setMediaUploading] = useState(false)

  useEffect(() => {
    const fetchMedia = async () => {
      const res = await fetch('/api/media', {
        headers: { Authorization: `Bearer ${user?.token}` }
      })
      const json = await res.json()
      if (res.ok) setMediaList(json)
    }

    fetchMedia()
  }, [user])

      const handleFileChange = (e) => {
      setVideoFile(e.target.files[0])
    }

    const handleUpload = async () => {
  // Guard against a second submit while the first request is still in flight —
  // a large video upload can take a while and the modal stays open until it
  // resolves, which otherwise invites repeat clicks and duplicate uploads.
  if (mediaUploading) return false

  if (!videoFile) {
    setMediaError('Please choose a video file first.')
    return false
  }

  const formData = new FormData()
  formData.append('title', videoFile.name)
  formData.append('video', videoFile)

  setMediaUploading(true)
  try {
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user?.token}` },
      body: formData
    })

    const json = await res.json()

    if (res.ok) {
      setMediaList(prev => [json, ...prev])
      setVideoFile(null)
      return true
    } else {
      setMediaError(json.error || 'Upload failed.')
      return false
    }
  } catch (err) {
    setMediaError(err.message || 'Upload failed.')
    return false
  } finally {
    setMediaUploading(false)
  }
}
const [showMediaModal, setShowMediaModal] = useState(false)

/* announcements */

const [showModal, setShowModal] = useState(false)
const [announcements, setAnnouncements] = useState([])

const [showEditModal, setShowEditModal] = useState(false)
const [selectedId, setSelectedId] = useState(null)
const [formError, setFormError] = useState('')
const [editError, setEditError] = useState('')
const [listError, setListError] = useState('')

const [submitting, setSubmitting] = useState(false)
const [updating, setUpdating] = useState(false)

const [editData, setEditData] = useState({
  title: '',
  description: '',
  category: DEFAULT_CATEGORY,
  pinned: false
})
const handleChange = (e) => {
  const { name, value, type, checked } = e.target
  setFormData({
    ...formData,
    [name]: type === 'checkbox' ? checked : value
  })
}

const handleSubmit = async (e) => {
  e.preventDefault()
  setFormError('')

  if (!formData.title) {
    setFormError('Title is required.')
    return
  }
  if (submitting) return
  setSubmitting(true)

  try {
    const res = await fetch('/api/announcements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user?.token}`
      },
      body: JSON.stringify(formData)
    })

    const json = await res.json()

    if (res.ok) {
      setAnnouncements(prev => [json, ...prev])
      setShowModal(false)
      setFormData({
        title: '',
        description: '',
        category: DEFAULT_CATEGORY,
        pinned: false
      })
    } else {
      setFormError(json.error || 'Failed to add announcement.')
    }
  } catch (err) {
    setFormError(err.message || 'Failed to add announcement.')
  } finally {
    setSubmitting(false)
  }
}
const [formData, setFormData] = useState({
  title: '',
  description: '',
  category: DEFAULT_CATEGORY,
  pinned: false
})
useEffect(() => {
  const fetchAnnouncements = async () => {
    const res = await fetch('/api/announcements')
    const json = await res.json()
    if (res.ok) setAnnouncements(json)
  }

  fetchAnnouncements()
}, [])

const handleDelete = async (id) => {
  setListError('')
  const res = await fetch(`/api/announcements/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${user?.token}` }
  })

  if (res.ok) {
    setAnnouncements(prev => prev.filter(a => a._id !== id))
  } else {
    const json = await res.json().catch(() => ({}))
    setListError(json.error || 'Failed to delete announcement.')
  }
}
const handleEdit = (a) => {
  setSelectedId(a._id)
  setEditData({
    title: a.title || '',
    description: a.description || '',
    category: a.category || DEFAULT_CATEGORY,
    pinned: a.pinned === true
  })
  setEditError('')
  setShowEditModal(true)
}

const handleEditChange = (e) => {
  const { name, value, type, checked } = e.target
  setEditData(prev => ({
    ...prev,
    [name]: type === 'checkbox' ? checked : value
  }))
}

const handleUpdate = async () => {
  setEditError('')
  if (updating) return
  setUpdating(true)

  try {
    const res = await fetch(`/api/announcements/${selectedId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user?.token}`
      },
      body: JSON.stringify(editData)
    })

    const json = await res.json()

    if (res.ok) {
      setAnnouncements(prev =>
        prev.map(a => (a._id === selectedId ? json : a))
      )
      setShowEditModal(false)
      setSelectedId(null)
    } else {
      setEditError(json.error || 'Failed to update announcement.')
    }
  } catch (err) {
    setEditError(err.message || 'Failed to update announcement.')
  } finally {
    setUpdating(false)
  }
}

    return(
<div className="configuration">
<div className="section-header">
      <h2 className="page-title">Virtual Bulletin Board</h2>
    </div>

<div className="section-header">
  <h2 className="page-title">Announcements</h2>
  {isAdmin && (
    <button className="add-btn" onClick={() => { setFormError(''); setShowModal(true) }}>
      + Add Announcement
    </button>
  )}
</div>

{listError && <p style={{ color: 'red', marginTop: 10 }}>{listError}</p>}

{showModal && isAdmin && (
  <div className="modal-overlay">
    <div className="modal-card">
      <form onSubmit={handleSubmit}>

        <div className="modal-header">
          <h3>Create Announcement</h3>
        </div>

        <div className="modal-body">
          <div className="label-row">
            <label>Title</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              className="search-input"
            />
          </div>

          <div className="label-row">
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="search-input"
              rows={3}
            />
          </div>

          <div className="label-row">
            <label>Category</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="search-input"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="label-row">
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="pinned"
                checked={formData.pinned}
                onChange={handleChange}
              />
              Pin this announcement
            </label>
          </div>

          {formError && <p style={{ color: 'red', marginTop: 10 }}>{formError}</p>}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowModal(false)}
            disabled={submitting}
          >
            Cancel
          </button>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add Announcement'}
          </button>
        </div>

      </form>
    </div>
  </div>
)}

{showEditModal && isAdmin && (
  <div className="modal-overlay">
    <div className="modal-card">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleUpdate()
        }}
      >

        <div className="modal-header">
          <h3>Edit Announcement</h3>
        </div>

        <div className="modal-body">
          <div className="label-row">
            <label>Title</label>
            <input
              type="text"
              name="title"
              value={editData.title}
              onChange={handleEditChange}
              required
              className="search-input"
            />
          </div>

          <div className="label-row">
            <label>Description</label>
            <textarea
              name="description"
              value={editData.description}
              onChange={handleEditChange}
              className="search-input"
              rows={3}
            />
          </div>

          <div className="label-row">
            <label>Category</label>
            <select
              name="category"
              value={editData.category}
              onChange={handleEditChange}
              className="search-input"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
              {editData.category && !CATEGORIES.includes(editData.category) && (
                <option value={editData.category}>{editData.category}</option>
              )}
            </select>
          </div>

          <div className="label-row">
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="pinned"
                checked={editData.pinned}
                onChange={handleEditChange}
              />
              Pin this announcement
            </label>
          </div>

          {editError && <p style={{ color: 'red', marginTop: 10 }}>{editError}</p>}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowEditModal(false)}
            disabled={updating}
          >
            Cancel
          </button>
          <button className="btn btn-primary" disabled={updating}>
            {updating ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

      </form>
    </div>
  </div>
)}

<hr />

<h3>Existing Announcements</h3>

<div className="table-card">
  <table className="modern-table">
    <thead>
      <tr>
        <th>Title</th>
        <th>Category</th>
        {isAdmin && <th className="action-col">Status</th>}
      </tr>
    </thead>

    <tbody>
      {announcements.map(a => (
        <tr key={a._id}>
          <td>
            <span className="announcement-title-cell">
              {a.pinned && (
                <Pin size={14} className="pinned-icon" aria-label="Pinned" />
              )}
              {a.title}
            </span>
          </td>

          <td>{a.category || '—'}</td>

          {isAdmin && (
            <td>
              <div className="action-buttons">
                <button
                  className="icon-btn edit-btn"
                  onClick={() => handleEdit(a)}
                >
                  <Pencil size={18} />
                </button>

                <button
                  className="icon-btn danger-btn"
                  onClick={() => handleDelete(a._id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </td>
          )}
        </tr>
      ))}

      {announcements.length === 0 && (
        <tr>
          <td colSpan={isAdmin ? 3 : 2} style={{ textAlign: 'center', padding: '15px' }}>
            No announcements yet
          </td>
        </tr>
      )}
    </tbody>
  </table>
</div>

<div className="section-header">
  <h2 className="page-title">Educational Media Display</h2>

  {isAdmin && (
    <button className="add-btn" onClick={() => { setMediaError(''); setShowMediaModal(true) }}>
      + Upload Video
    </button>
  )}
</div>

{mediaError && <p style={{ color: 'red', marginTop: 10 }}>{mediaError}</p>}

{showMediaModal && isAdmin && (
  <div className="modal-overlay">
    <div className="modal-card">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (mediaUploading) return
          const ok = await handleUpload()
          if (ok) setShowMediaModal(false)
        }}
      >

        <div className="modal-header">
          <h3>Upload Video</h3>
        </div>

        <div className="modal-body">
          <div className="label-row">
            <label>Choose File *</label>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              required
              disabled={mediaUploading}
              className="search-input"
            />
          </div>

          {mediaUploading && (
            <p style={{ marginTop: 10 }}>Uploading video, please wait…</p>
          )}
          {mediaError && <p style={{ color: 'red', marginTop: 10 }}>{mediaError}</p>}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowMediaModal(false)}
            disabled={mediaUploading}
          >
            Cancel
          </button>
          <button className="btn btn-primary" disabled={mediaUploading}>
            {mediaUploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>

      </form>
    </div>
  </div>
)}

<div className="media-list">
  {mediaList.map(m => (
    <div key={m._id} className="media-card">
      <video width="250" controls>
        <source
          src={resolveMediaUrl(m.videoUrl)}
          type="video/mp4"
        />
      </video>

      {isAdmin && (
        <button
          className="danger-media-btn"
          onClick={() => { setMediaError(''); setMediaDeleteTarget({ id: m._id, title: m.title || 'Untitled' }) }}
        >
          Delete
        </button>
      )}
    </div>
  ))}
</div>

{mediaDeleteTarget && (
  <div className="modal-overlay">
    <div className="modal-card">
      <div className="modal-header">
        <h3>Delete Video</h3>
      </div>
      <div className="modal-body">
        <p>Are you sure you want to delete <strong>{mediaDeleteTarget.title}</strong>?</p>
        <p className="modal-warning">This cannot be undone.</p>
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setMediaDeleteTarget(null)}
          disabled={mediaDeleting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={mediaDeleting}
          onClick={async () => {
            setMediaDeleting(true)
            try {
              const res = await fetch(`/api/media/${mediaDeleteTarget.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${user?.token}` },
              })
              const json = await res.json()
              if (!res.ok) {
                setMediaError(json.error || 'Delete failed.')
              } else {
                setMediaList(prev => prev.filter(x => x._id !== mediaDeleteTarget.id))
              }
            } catch (err) {
              setMediaError(err.message || 'Delete failed.')
            } finally {
              setMediaDeleting(false)
              setMediaDeleteTarget(null)
            }
          }}
        >
          {mediaDeleting ? 'Deleting...' : 'Delete Video'}
        </button>
      </div>
    </div>
  </div>
)}
    </div>
    )
}
export default WebBulletinBoard