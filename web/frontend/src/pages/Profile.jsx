import { useEffect, useRef, useState } from 'react'
import { useAuthContext } from '../hooks/useAuthContext'
import { useCachedFetch, invalidateCache } from '../hooks/useCachedFetch'
import Avatar from '../components/Avatar'
import { User, Mail, Shield, Calendar, Lock, Edit2, Check, X, Camera, Eye, EyeOff, Building2, Briefcase } from 'lucide-react'

// Same lists as the mobile app's Edit Profile form and the web Signup form —
// kept identical so Department/Staff Type stay consistent data regardless of
// which app someone edits their profile from.
const DEPARTMENTS = [
  'Science Department',
  'Mathematics Department',
  'English Department',
  'Social Studies Department',
  'ICT Department',
]

const STAFF_TYPES = ['Teacher', 'Student Teacher']

const Profile = () => {
  const { user } = useAuthContext()

  // Cached fetch — shows previous profile instantly on revisit, refreshes in bg.
  const { data: profile, loading, error: fetchError, refetch } =
    useCachedFetch(user ? '/api/user/me' : null, user?.token)

  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Profile picture upload state
  const [pictureUrl, setPictureUrl] = useState('')
  const [uploadingPicture, setUploadingPicture] = useState(false)
  const fileInputRef = useRef(null)

  // Profile edit state
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', department: '', staffType: '' })
  const [saving, setSaving] = useState(false)

  // Password change state
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdShow, setPwdShow] = useState({ current: false, next: false, confirm: false })

  const pwdToggle = (key) => (
    <button
      type="button"
      className="pw-toggle"
      tabIndex={-1}
      aria-label={pwdShow[key] ? 'Hide password' : 'Show password'}
      onClick={() => setPwdShow(v => ({ ...v, [key]: !v[key] }))}
    >
      {pwdShow[key] ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  )

  // Initialize the edit form whenever profile data becomes available.
  useEffect(() => {
    if (profile) {
      setForm({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        email: profile.email || '',
        department: profile.department || '',
        staffType: profile.staffType || '',
      })
      setPictureUrl(profile.pictureUrl || '')
    }
  }, [profile])

  // Surface fetch errors to the same error slot the edit form uses.
  useEffect(() => {
    if (fetchError) setError(fetchError)
  }, [fetchError])

  const handleSaveProfile = async () => {
    setError('')
    setSuccessMessage('')

    // Client-side guard rails. Staff type and department must stay set to a
    // real option — the "Select..." placeholder is not a valid value to save.
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError('First name, last name and email are required.')
      return
    }
    if (!form.staffType) {
      setError('Please select a staff type.')
      return
    }
    if (!form.department) {
      setError('Please select a department.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update profile')

      // The cached-fetch hook owns `profile`; invalidating alone won't update
      // what's on screen. Re-fetch so the display card immediately reflects
      // the saved values (this also refreshes the module cache). refetch()
      // handles its own errors and resolves to null rather than throwing.
      invalidateCache('/api/user/me')
      await refetch()

      setEditing(false)
      setSuccessMessage('Profile updated successfully')

      // Update the auth context's stored user too (name shows in header/navbar)
      const stored = JSON.parse(localStorage.getItem('user') || '{}')
      const updated = {
        ...stored,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        department: data.department,
        staffType: data.staffType,
      }
      localStorage.setItem('user', JSON.stringify(updated))

      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handlePictureChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again later
    if (!file) return

    setError('')
    setSuccessMessage('')
    setUploadingPicture(true)
    try {
      const body = new FormData()
      body.append('picture', file)
      const res = await fetch('/api/user/me/picture', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user.token}` },
        body,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update picture')

      invalidateCache('/api/user/me')
      await refetch()
      setPictureUrl(data.pictureUrl || '')
      setSuccessMessage('Profile picture updated')

      const stored = JSON.parse(localStorage.getItem('user') || '{}')
      localStorage.setItem('user', JSON.stringify({ ...stored, pictureUrl: data.pictureUrl }))

      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingPicture(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwdError('')
    setPwdSuccess('')
    setSuccessMessage('')

    const trimmedNewPassword = pwdForm.newPassword.trim()
    if (trimmedNewPassword !== pwdForm.confirmPassword.trim()) {
      setPwdError('New passwords do not match')
      return
    }
    if (trimmedNewPassword.length < 8) {
      setPwdError('New password must be at least 8 characters')
      return
    }

    setPwdSaving(true)
    try {
      const res = await fetch('/api/user/me/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          currentPassword: pwdForm.currentPassword,
          newPassword: trimmedNewPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to change password')

      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      // Shown both at the page top and inside the password card, so it's
      // visible whether or not the user has scrolled.
      setSuccessMessage('Password changed successfully')
      setPwdSuccess('Password changed successfully')
      setTimeout(() => {
        setSuccessMessage('')
        setPwdSuccess('')
      }, 4000)
    } catch (err) {
      setPwdError(err.message)
    } finally {
      setPwdSaving(false)
    }
  }

  // Only show the loading screen on the very first visit (no cached data yet).
  if (loading && !profile) return <div className="dash-page"><p>Loading profile...</p></div>
  if (!profile) return <div className="dash-page"><p style={{ color: 'red' }}>{error || 'Not signed in.'}</p></div>

  const joinedDate = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    : 'Unknown'

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Profile</h1>
          <p className="dash-subtitle">Manage your account details and password.</p>
        </div>
      </div>

      {successMessage && (
        <div className="profile-success">{successMessage}</div>
      )}
      {error && !editing && (
        <div className="profile-error">{error}</div>
      )}

      {/* Identity card */}
      <div className="dash-section">
        <div className="profile-identity">
          <button
            type="button"
            className="profile-avatar profile-avatar-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPicture}
            title="Change profile picture"
          >
            <Avatar
              src={pictureUrl}
              name={`${profile.firstName || ''} ${profile.lastName || ''}`}
              email={profile.email}
              size={80}
            />
            <span className="profile-avatar-overlay">
              {uploadingPicture ? '…' : <Camera size={18} />}
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handlePictureChange}
          />
          <div className="profile-identity-info">
            <h2>{profile.firstName} {profile.lastName}</h2>
            <p>{profile.email}</p>
            <div className="profile-badges">
              <span className={`profile-badge profile-badge-${profile.role}`}>
                <Shield size={12} />
                {profile.role}
              </span>
              <span className={`profile-badge profile-badge-status-${profile.status}`}>
                {profile.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Profile info card */}
      <div className="dash-section">
        <div className="dash-section-head">
          <h2>Account Information</h2>
          {!editing && (
            <button className="profile-edit-btn" onClick={() => setEditing(true)}>
              <Edit2 size={14} />
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="profile-form">
            <ProfileField icon={<User size={16} />} label="First name">
              <input
                type="text"
                value={form.firstName}
                onChange={e => setForm({ ...form, firstName: e.target.value })}
                className="profile-input"
              />
            </ProfileField>
            <ProfileField icon={<User size={16} />} label="Last name">
              <input
                type="text"
                value={form.lastName}
                onChange={e => setForm({ ...form, lastName: e.target.value })}
                className="profile-input"
              />
            </ProfileField>
            <ProfileField icon={<Mail size={16} />} label="Email">
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="profile-input"
              />
            </ProfileField>
            <ProfileField icon={<Briefcase size={16} />} label="Staff type">
              <select
                value={form.staffType}
                onChange={e => setForm({ ...form, staffType: e.target.value })}
                className="profile-input"
              >
                <option value="" disabled>Select staff type</option>
                {STAFF_TYPES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
                {form.staffType && !STAFF_TYPES.includes(form.staffType) && (
                  <option value={form.staffType}>{form.staffType}</option>
                )}
              </select>
            </ProfileField>
            <ProfileField icon={<Building2 size={16} />} label="Department">
              <select
                value={form.department}
                onChange={e => setForm({ ...form, department: e.target.value })}
                className="profile-input"
              >
                <option value="" disabled>Select department</option>
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
                {form.department && !DEPARTMENTS.includes(form.department) && (
                  <option value={form.department}>{form.department}</option>
                )}
              </select>
            </ProfileField>

            {error && <div className="profile-error">{error}</div>}

            <div className="profile-actions">
              <button
                className="dash-action-btn"
                disabled={saving}
                onClick={() => {
                  setEditing(false)
                  setError('')
                  setForm({
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                    email: profile.email,
                    department: profile.department || '',
                    staffType: profile.staffType || '',
                  })
                }}
              >
                <X size={16} />
                Cancel
              </button>
              <button
                className="profile-save-btn"
                disabled={saving}
                onClick={handleSaveProfile}
              >
                <Check size={16} />
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="profile-display">
            <ProfileRow icon={<User size={16} />}    label="First name" value={profile.firstName} />
            <ProfileRow icon={<User size={16} />}    label="Last name"  value={profile.lastName} />
            <ProfileRow icon={<Mail size={16} />}    label="Email"      value={profile.email} />
            <ProfileRow icon={<Briefcase size={16} />} label="Staff type" value={profile.staffType} />
            <ProfileRow icon={<Building2 size={16} />}  label="Department"  value={profile.department} />
            <ProfileRow icon={<Shield size={16} />}  label="Role"       value={profile.role} />
            <ProfileRow icon={<Calendar size={16} />} label="Joined"    value={joinedDate} />
          </div>
        )}
      </div>

      {/* Password change card */}
      <div className="dash-section">
        <div className="dash-section-head">
          <h2>Change Password</h2>
        </div>
        <form className="profile-form" onSubmit={handleChangePassword}>
          <ProfileField icon={<Lock size={16} />} label="Current password">
            <div className="pw-wrap">
              <input
                type={pwdShow.current ? 'text' : 'password'}
                value={pwdForm.currentPassword}
                onChange={e => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                className="profile-input"
                required
              />
              {pwdToggle('current')}
            </div>
          </ProfileField>
          <ProfileField icon={<Lock size={16} />} label="New password">
            <div className="pw-wrap">
              <input
                type={pwdShow.next ? 'text' : 'password'}
                value={pwdForm.newPassword}
                onChange={e => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                className="profile-input"
                required
                placeholder="Min 8 chars, mixed case, number, symbol"
              />
              {pwdToggle('next')}
            </div>
          </ProfileField>
          <ProfileField icon={<Lock size={16} />} label="Confirm new password">
            <div className="pw-wrap">
              <input
                type={pwdShow.confirm ? 'text' : 'password'}
                value={pwdForm.confirmPassword}
                onChange={e => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                className="profile-input"
                required
              />
              {pwdToggle('confirm')}
            </div>
          </ProfileField>

          {pwdError && <div className="profile-error">{pwdError}</div>}
          {pwdSuccess && <div className="profile-success">{pwdSuccess}</div>}

          <div className="profile-actions">
            <button
              type="submit"
              className="profile-save-btn"
              disabled={pwdSaving}
            >
              {pwdSaving ? 'Updating...' : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============ Sub-components ============
const ProfileRow = ({ icon, label, value }) => (
  <div className="profile-row">
    <div className="profile-row-label">
      <span className="profile-row-icon">{icon}</span>
      {label}
    </div>
    <div className="profile-row-value">{value || '—'}</div>
  </div>
)

const ProfileField = ({ icon, label, children }) => (
  <div className="profile-field">
    <label className="profile-row-label">
      <span className="profile-row-icon">{icon}</span>
      {label}
    </label>
    {children}
  </div>
)

export default Profile
