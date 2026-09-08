import { useEffect, useState, useCallback } from 'react'
import { UserPlus, UserX, Users, Loader2, X } from 'lucide-react'
import Avatar from './Avatar'

// Manage which staff accounts can see a device. Used from both the device
// detail page and the admin Device Management table, so the whole
// share/unshare flow lives here instead of being duplicated in both places.
const ShareDeviceModal = ({ deviceId, deviceName, deviceRoom, token, onClose, onAccessChange }) => {
  const [sharedUsers,  setSharedUsers]  = useState([])
  const [shareEmail,   setShareEmail]   = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareMsg,     setShareMsg]     = useState({ text: '', type: '' })
  const [revokeTarget, setRevokeTarget] = useState(null)

  const loadSharedUsers = useCallback(async () => {
    try {
      const res = await fetch(`/api/device/${deviceId}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const users = await res.json()
        setSharedUsers(users)
        onAccessChange?.(users.length)
      }
    } catch (err) { console.error('loadSharedUsers:', err) }
  }, [deviceId, token, onAccessChange])

  useEffect(() => { loadSharedUsers() }, [loadSharedUsers])

  const handleShare = async (e) => {
    e.preventDefault()
    const email = shareEmail.trim()
    if (!email) return
    setShareLoading(true)
    setShareMsg({ text: '', type: '' })
    try {
      const res = await fetch(`/api/device/${deviceId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email })
      })
      const json = await res.json()
      if (res.ok) {
        setShareEmail('')
        setShareMsg({ text: json.message || 'Access granted.', type: 'ok' })
        await loadSharedUsers()
      } else {
        setShareMsg({ text: json.error || 'Failed to share.', type: 'err' })
      }
    } catch {
      setShareMsg({ text: 'Network error. Please try again.', type: 'err' })
    } finally {
      setShareLoading(false)
      setTimeout(() => setShareMsg({ text: '', type: '' }), 4000)
    }
  }

  const handleRevoke = async (email) => {
    setShareLoading(true)
    try {
      const res = await fetch(`/api/device/${deviceId}/unshare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email })
      })
      const json = await res.json()
      if (res.ok) {
        setShareMsg({ text: json.message || 'Access revoked.', type: 'ok' })
        setRevokeTarget(null)
        await loadSharedUsers()
      } else {
        setShareMsg({ text: json.error || 'Failed to revoke.', type: 'err' })
      }
    } catch {
      setShareMsg({ text: 'Network error. Please try again.', type: 'err' })
    } finally {
      setShareLoading(false)
      setTimeout(() => setShareMsg({ text: '', type: '' }), 4000)
    }
  }

  const close = () => { setRevokeTarget(null); onClose() }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="share-modal" onClick={e => e.stopPropagation()}>
        <div className="share-modal-head">
          <div>
            <h3 className="share-modal-title"><Users size={18} /> Device Access</h3>
            <p className="share-modal-sub">{deviceName} · {deviceRoom}</p>
          </div>
          <button className="share-modal-close" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="share-modal-note">
          Admins always have full access. Only staff members need to be shared.
        </div>
        {shareMsg.text && (
          <div className={`share-msg share-msg-${shareMsg.type}`}>{shareMsg.text}</div>
        )}
        <div className="share-modal-list">
          {sharedUsers.length === 0 ? (
            <div className="share-modal-empty">No staff members have been given access yet.</div>
          ) : (
            sharedUsers.map(u => (
              <div key={u._id} className="share-user-row">
                <Avatar
                  className="share-user-avatar"
                  src={u.pictureUrl}
                  name={u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : ''}
                  email={u.email}
                  size={36}
                />
                <div className="share-user-info">
                  <div className="share-user-name">
                    {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email}
                  </div>
                  <div className="share-user-email">{u.email}</div>
                </div>
                <span className="share-role-badge share-role-staff">Staff</span>
                {revokeTarget === u.email ? (
                  <div className="share-revoke-confirm">
                    <span>Remove?</span>
                    <button className="btn btn-danger share-confirm-yes"
                      onClick={() => handleRevoke(u.email)} disabled={shareLoading}>
                      {shareLoading ? <Loader2 size={13} className="share-spinner" /> : 'Yes'}
                    </button>
                    <button className="btn btn-secondary share-confirm-no"
                      onClick={() => setRevokeTarget(null)} disabled={shareLoading}>No</button>
                  </div>
                ) : (
                  <button className="icon-btn share-revoke-btn" title="Remove access"
                    onClick={() => setRevokeTarget(u.email)} disabled={shareLoading}>
                    <UserX size={16} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <div className="share-modal-footer">
          <form className="share-form" onSubmit={handleShare}>
            <input type="email" className="search-input share-email-input"
              placeholder="Staff email address..." aria-label="Staff email address" value={shareEmail}
              onChange={e => setShareEmail(e.target.value)} disabled={shareLoading} />
            <button type="submit" className="btn btn-primary share-btn"
              disabled={shareLoading || !shareEmail.trim()}>
              {shareLoading ? <Loader2 size={15} className="share-spinner" /> : <UserPlus size={15} />}
              Add
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ShareDeviceModal
