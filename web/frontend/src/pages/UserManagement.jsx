import { useEffect, useState } from "react"
import { useAuthContext } from "../hooks/useAuthContext"
import { Shield, UserCheck, Eye, EyeOff, Power, Clock, CheckCircle, Trash2 } from "lucide-react"
import Avatar from "../components/Avatar"

const USERS_PER_PAGE = 10

const UserManagement = () => {
    const { user } = useAuthContext()

    const [users, setUsers] = useState([])
    const [search, setSearch] = useState('')
    const [sortBy, setSortBy] = useState('alphabetical')
    const [currentPage, setCurrentPage] = useState(1)
    const [deactivateTarget, setDeactivateTarget] = useState(null)
    const [deleteTarget, setDeleteTarget] = useState(null)
    const [pendingRoles, setPendingRoles] = useState({})
    const [successMessage, setSuccessMessage] = useState('')
    const isAdmin = user && user.role === 'admin'
    const selectedUser = users.find(u => u._id === deactivateTarget)
    const deleteSelectedUser = users.find(u => u._id === deleteTarget)
    const [confirmChangesModal, setConfirmChangesModal] = useState(false)
    const [viewUser, setViewUser] = useState(null)
    const [createOpen, setCreateOpen] = useState(false)
    const [createForm, setCreateForm] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        role: 'staff',
    })
    const [createError, setCreateError] = useState('')
    const [creating, setCreating] = useState(false)
    const [showCreatePw, setShowCreatePw] = useState(false)

    // ================= FETCH USERS (ADMIN / STAFF ONLY) =================
    useEffect(() => {
        if (!user || user.role === 'patient') return

        const fetchUsers = async () => {
            const res = await fetch('/api/user', {
                headers: {
                    'Authorization': `Bearer ${user.token}`
                }
            })
            const data = await res.json()
            if (res.ok) setUsers(data)
        }

        fetchUsers()
    }, [user])

    // ================= SEARCH =================
    const filteredUsers = users.filter(u =>
        ((u.firstName || '') + ' ' + (u.lastName || '') + ' ' + (u.email || ''))
            .toLowerCase()
            .includes(search.toLowerCase())
    )

    // ================= SORT =================
    const sortedUsers = [...filteredUsers].sort((a, b) => {
        if (sortBy === 'alphabetical') {
            const nameA = (a.firstName || '') + ' ' + (a.lastName || '')
            const nameB = (b.firstName || '') + ' ' + (b.lastName || '')
            return nameA.localeCompare(nameB)
        }

        if (sortBy === 'recent') {
            return a._id < b._id ? 1 : -1
        }

        if (sortBy === 'role') {
            return (a.role || '').localeCompare(b.role || '')
        }

        if (sortBy === 'status') {
            return (a.status || 'active').localeCompare(b.status || 'active')
        }

        return 0
    })

    // ================= PAGINATION =================
    const indexOfLast = currentPage * USERS_PER_PAGE
    const indexOfFirst = indexOfLast - USERS_PER_PAGE
    const currentUsers = sortedUsers.slice(indexOfFirst, indexOfLast)
    const totalPages = Math.ceil(sortedUsers.length / USERS_PER_PAGE)

    // ================= DEACTIVATE USER =================
    const confirmDeactivate = async () => {
        const res = await fetch(`/api/user/${deactivateTarget}/deactivate`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ 
                performedBy: user.email  // Send admin's email to backend
            })
        })

        if (res.ok) {
            setUsers(users.map(u => 
                u._id === deactivateTarget ? { ...u, status: 'deactivated', deactivatedAt: new Date() } : u
            ))
            setDeactivateTarget(null)
            setSuccessMessage('User deactivated successfully')
            setTimeout(() => setSuccessMessage(''), 2000)
        } else {
            const error = await res.json()
            setSuccessMessage('Error: ' + error.error)
            setTimeout(() => setSuccessMessage(''), 2000)
        }
    }

    // ================= DELETE USER =================
    const confirmDelete = async () => {
        const res = await fetch(`/api/user/${deleteTarget}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${user.token}`
            }
        })

        if (res.ok) {
            setUsers(users.filter(u => u._id !== deleteTarget))
            setDeleteTarget(null)
            setViewUser(null)
            setSuccessMessage('User deleted successfully')
            setTimeout(() => setSuccessMessage(''), 2000)
        } else {
            const error = await res.json()
            setSuccessMessage('Error: ' + error.error)
            setTimeout(() => setSuccessMessage(''), 2000)
        }
    }

    // ================= REACTIVATE USER =================
    const confirmReactivate = async (userId) => {
        const res = await fetch(`/api/user/${userId}/reactivate`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ 
                performedBy: user.email  // Send admin's email to backend
            })
        })

        if (res.ok) {
            setUsers(users.map(u => 
                u._id === userId ? { ...u, status: 'active', deactivatedAt: null } : u
            ))
            setViewUser(null)
            setSuccessMessage('User reactivated successfully')
            setTimeout(() => setSuccessMessage(''), 2000)
        } else {
            const error = await res.json()
            setSuccessMessage('Error: ' + error.error)
            setTimeout(() => setSuccessMessage(''), 2000)
        }
    }

    // ================= APPROVE USER =================
    const confirmApprove = async (userId) => {
        const res = await fetch(`/api/user/${userId}/approve`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            }
        })

        if (res.ok) {
            setUsers(users.map(u =>
                u._id === userId ? { ...u, status: 'active' } : u
            ))
            setViewUser(null)
            setSuccessMessage('User approved successfully')
            setTimeout(() => setSuccessMessage(''), 2000)
        } else {
            const error = await res.json()
            setSuccessMessage('Error: ' + error.error)
            setTimeout(() => setSuccessMessage(''), 2000)
        }
    }

    // ================= CONFIRM ROLE CHANGES =================
    const confirmRoleChanges = async () => {
        const succeeded = {}
        const failed = []

        for (const userId in pendingRoles) {
            const userToUpdate = users.find(u => u._id === userId)
            const newRole = pendingRoles[userId]

            try {
                const res = await fetch(`/api/user/${userId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${user.token}`
                    },
                    body: JSON.stringify({
                        role: newRole,
                        performedBy: user.email  // Send admin's email to backend
                    })
                })
                if (res.ok) {
                    succeeded[userId] = newRole
                } else {
                    failed.push(userToUpdate?.email || userId)
                }
            } catch {
                failed.push(userToUpdate?.email || userId)
            }
        }

        // Only merge the changes that actually succeeded — a failed PATCH
        // (e.g. blocked self-role-change, or a race with another admin)
        // should not silently look like it worked.
        setUsers(users.map(u =>
            succeeded[u._id] ? { ...u, role: succeeded[u._id] } : u
        ))

        setPendingRoles({})
        setSuccessMessage(
            failed.length === 0
                ? 'Changes applied'
                : `Some changes failed: ${failed.join(', ')}`
        )
        setTimeout(() => setSuccessMessage(''), failed.length === 0 ? 2000 : 4000)
    }

    // ================= CREATE USER (ADMIN) =================
    const handleCreateUser = async () => {
        const { firstName, lastName, email, password, role } = createForm
        if (!firstName || !lastName || !email || !password) {
            setCreateError('All fields are required.')
            return
        }
        setCreating(true)
        setCreateError('')

        const res = await fetch('/api/user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ firstName, lastName, email, password, role })
        })

        const data = await res.json()
        setCreating(false)

        if (!res.ok) {
            setCreateError(data.error || 'Failed to create user.')
            return
        }

        setUsers(prev => [data, ...prev])
        setCreateOpen(false)
        setShowCreatePw(false)
        setCreateForm({ firstName: '', lastName: '', email: '', password: '', role: 'staff' })
        const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
        setSuccessMessage(`${roleLabel} account created for ${data.email}`)
        setTimeout(() => setSuccessMessage(''), 3000)
    }

    // ================= RENDER =================
    if (!user) {
        return <p>Please log in to view this page.</p>
    }

    return (
        <div className="user-management">

            {/* ================= USER MANAGEMENT (ADMIN / STAFF) ================= */}
            {user.role !== 'patient' && (
                <>
                    <div className="section-header">
                        <div>
                           <h2 className="page-title">User Management</h2>
                        </div>
                    </div>

                    {/* SEARCH AND FILTERS */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            marginBottom: '15px'
                        }}
                    >

                        <div className="table-controls">
                            <input
                                type="text"
                                placeholder="Search users..."
                                aria-label="Search users"
                                value={search}
                                onChange={e => {
                                setSearch(e.target.value)
                                setCurrentPage(1)
                                }}
                                className="search-input"
                            />

                            <select
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value)}
                                className="sort-select"
                                aria-label="Sort users"
                            >
                                <option value="alphabetical">A–Z</option>
                                <option value="recent">Recent</option>
                                <option value="role">Role</option>
                                <option value="status">Status</option>
                            </select>
                        </div>

                        {isAdmin && (
                            <button
                                className="btn btn-primary"
                                style={{ marginLeft: 'auto' }}
                                onClick={() => setCreateOpen(true)}
                            >
                                + Create User
                            </button>
                        )}
                    </div>

                    {/* TABLE */}
                    <div className="table-card">
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th className="status-col">Status</th>
                                    {isAdmin && <th className="actions-col">Action</th>}
                                </tr>
                            </thead>

                            <tbody>
                            {currentUsers.map(u => (
                                <tr
                                    key={u._id}
                                    className={`${pendingRoles[u._id] ? "row-edited" : ""} ${u.status === 'deactivated' ? "row-deactivated" : ""}`}
                                >
                                    <td className="user-name">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <Avatar
                                                src={u.pictureUrl}
                                                name={`${u.firstName || ''} ${u.lastName || ''}`}
                                                email={u.email}
                                                size={32}
                                            />
                                            <span>{u.firstName} {u.lastName}</span>
                                        </span>
                                    </td>

                                    <td className="user-email">{u.email}</td>

                                    <td>
                                        {isAdmin && u._id !== user._id ? (
                                            <select
                                                value={pendingRoles[u._id] ?? u.role}
                                                onChange={e => {
                                                    const newRole = e.target.value
                                                    if (newRole === u.role) {
                                                        // Reverting to original — clear pending
                                                        const next = { ...pendingRoles }
                                                        delete next[u._id]
                                                        setPendingRoles(next)
                                                    } else {
                                                        setPendingRoles({ ...pendingRoles, [u._id]: newRole })
                                                    }
                                                }}
                                                className="sort-select"
                                                aria-label={`Role for ${u.firstName} ${u.lastName}`}
                                            >
                                                <option value="staff">staff</option>
                                                <option value="admin">admin</option>
                                            </select>
                                        ) : (
                                            <span>
                                                {u.role}
                                                {u.role === 'admin' && <Shield size={14} style={{ marginLeft: 4 }} />}
                                                {u.role === 'staff' && <UserCheck size={14} style={{ marginLeft: 4 }} />}
                                            </span>
                                        )}
                                    </td>

                                    <td className="user-status">
                                        <span className={`status-badge status-${u.status || 'active'}`}>
                                            {u.status === 'pending' && <Clock size={12} style={{ marginRight: 4 }} />}
                                            {u.status || 'active'}
                                        </span>
                                    </td>

                                    {isAdmin && (
                                        <td>
                                            <div className="action-buttons">
                                                <button
                                                    className="icon-btn view-btn"
                                                    onClick={() => setViewUser(u)}
                                                    title="View User"
                                                >
                                                    <Eye size={16} />
                                                </button>

                                                {u.status === 'pending' && (
                                                    <button
                                                        className="icon-btn approve-btn"
                                                        onClick={() => confirmApprove(u._id)}
                                                        title="Approve User"
                                                    >
                                                        <CheckCircle size={16} />
                                                    </button>
                                                )}

                                                {u.status === 'active' && (
                                                    <button
                                                        className="icon-btn deactivate-btn"
                                                        onClick={() => setDeactivateTarget(u._id)}
                                                        title="Deactivate User"
                                                    >
                                                        <Power size={16} />
                                                    </button>
                                                )}

                                                {u._id !== user._id && (
                                                    <button
                                                        className="icon-btn delete-btn"
                                                        onClick={() => setDeleteTarget(u._id)}
                                                        title="Delete User"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    {/* PAGINATION */}
                    <div className="pagination">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => p - 1)}
                        >
                            Prev
                        </button>

                        {[...Array(totalPages)].map((_, i) => {
                            const page = i + 1;

                            if (page <= 4 || page === totalPages) {
                            return (
                                <button
                                key={i}
                                className={currentPage === page ? 'active' : ''}
                                onClick={() => setCurrentPage(page)}
                                >
                                {page}
                                </button>
                            );
                            }

                            if (page === 5) {
                            return <span key={i} className="dots">…</span>;
                            }

                            return null;
                        })}

                        <button
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(p => p + 1)}
                        >
                            Next
                        </button>
                    </div>

                    {/* ROLE CONFIRMATION */}
                    {Object.keys(pendingRoles).length > 0 && (
                        <div style={{ marginTop: '10px' }}>
                            <p style={{ color: 'orange' }}>
                            ⚠ Role changes detected
                            </p>
                            <button
                            className="btn btn-primary"
                            onClick={() => setConfirmChangesModal(true)}
                            >
                            Confirm Changes
                            </button>
                        </div>
                    )}

                    {/* CONFIRM CHANGES MODAL */}
                    {confirmChangesModal && (
                        <div className="modal-overlay">
                            <div className="modal-card">
                            <div className="modal-header">
                                <h3>Confirm Role Changes</h3>
                            </div>

                            <div className="modal-body">
                                <p>You are about to apply the following changes:</p>
                                <ul>
                                {Object.entries(pendingRoles).map(([userId, newRole]) => {
                                    const userObj = users.find(u => u._id === userId)
                                    if (!userObj) return null
                                    return (
                                    <li key={userId}>
                                        <strong>{userObj.firstName} {userObj.lastName}</strong>: {userObj.role} → {newRole}
                                    </li>
                                    )
                                })}
                                </ul>
                            </div>

                            <div className="modal-actions">
                                <button
                                className="btn btn-secondary"
                                onClick={() => setConfirmChangesModal(false)}
                                >
                                Cancel
                                </button>

                                <button
                                className="btn btn-primary"
                                onClick={() => {
                                    confirmRoleChanges()
                                    setConfirmChangesModal(false)
                                }}
                                >
                                Apply Changes
                                </button>
                            </div>
                            </div>
                        </div>
                    )}

                    {/* SUCCESS MESSAGE */}
                    {successMessage && (
                        <p style={{ color: 'green', marginTop: '10px' }}>
                            ✅ {successMessage}
                        </p>
                    )}

                    {/* DEACTIVATE MODAL */}
                    {deactivateTarget && (
                        <div className="modal-overlay">
                            <div className="modal-card">
                            
                            <div className="modal-header">
                                <h3>Deactivate User</h3>
                            </div>

                            <div className="modal-body">
                                <p>
                                    Are you sure you want to deactivate{" "}
                                    <strong>
                                        {selectedUser?.firstName} {selectedUser?.lastName}
                                    </strong>?
                                </p>
                                <p className="modal-warning">
                                    Deactivated users will not be able to log in.
                                </p>
                            </div>

                            <div className="modal-actions">
                                <button
                                className="btn btn-secondary"
                                onClick={() => setDeactivateTarget(null)}
                                >
                                Cancel
                                </button>

                                <button
                                className="btn btn-warning"
                                onClick={confirmDeactivate}
                                >
                                Deactivate User
                                </button>
                            </div>

                            </div>
                        </div>
                    )}

                    {/* DELETE MODAL */}
                    {deleteTarget && (
                        <div className="modal-overlay">
                            <div className="modal-card">

                            <div className="modal-header">
                                <h3>Delete User</h3>
                            </div>

                            <div className="modal-body">
                                <p>
                                    Are you sure you want to delete{" "}
                                    <strong>
                                        {deleteSelectedUser?.firstName} {deleteSelectedUser?.lastName}
                                    </strong>?
                                </p>
                                <p className="modal-warning">
                                    This will permanently delete this account and cannot be undone.
                                </p>
                            </div>

                            <div className="modal-actions">
                                <button
                                className="btn btn-secondary"
                                onClick={() => setDeleteTarget(null)}
                                >
                                Cancel
                                </button>

                                <button
                                className="btn btn-warning"
                                onClick={confirmDelete}
                                >
                                Delete User
                                </button>
                            </div>

                            </div>
                        </div>
                    )}

                    {/* VIEW USER MODAL with Reactivate button inside */}
                    {viewUser && (
                        <div className="modal-overlay">
                            <div className="modal-card">
                            
                            <div className="modal-header">
                                <h3>User Details</h3>
                            </div>

                            <div className="modal-body">
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                                    <Avatar
                                        src={viewUser.pictureUrl}
                                        name={`${viewUser.firstName || ''} ${viewUser.lastName || ''}`}
                                        email={viewUser.email}
                                        size={72}
                                    />
                                </div>
                                <p><strong>Name:</strong> {viewUser.firstName} {viewUser.lastName}</p>
                                <p><strong>Email:</strong> {viewUser.email}</p>
                                <p><strong>Status:</strong> {viewUser.status || 'active'}</p>
                                <p>
                                    <strong>Role:</strong> {viewUser.role}
                                    {" "}
                                    {viewUser.role === "admin" && <Shield size={14} />}
                                    {viewUser.role === "staff" && <UserCheck size={14} />}
                                </p>
                                {viewUser.teacherId && (
                                    <p><strong>Teacher ID:</strong> {viewUser.teacherId}</p>
                                )}
                                {viewUser.department && (
                                    <p><strong>Department:</strong> {viewUser.department}</p>
                                )}
                                {viewUser.staffType && (
                                    <p><strong>Staff Type:</strong> {viewUser.staffType}</p>
                                )}
                                <p>
                                    <strong>Date Joined:</strong>{" "}
                                    {viewUser.createdAt 
                                        ? new Date(viewUser.createdAt).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                          })
                                        : 'N/A'}
                                </p>
                                
                                {viewUser.status === 'deactivated' && (
                                    <p>
                                        <strong>Deactivated On:</strong>{" "}
                                        {viewUser.deactivatedAt 
                                            ? new Date(viewUser.deactivatedAt).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                              })
                                            : 'Date not recorded'}
                                    </p>
                                )}
                            </div>

                            <div className="modal-actions">
                                {viewUser.status === 'deactivated' && (
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => confirmReactivate(viewUser._id)}
                                    >
                                        Reactivate User
                                    </button>
                                )}
                                {viewUser.status === 'pending' && (
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => confirmApprove(viewUser._id)}
                                    >
                                        Approve User
                                    </button>
                                )}
                                {viewUser._id !== user._id && (
                                    <button
                                        className="btn btn-warning"
                                        onClick={() => setDeleteTarget(viewUser._id)}
                                    >
                                        Delete User
                                    </button>
                                )}
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setViewUser(null)}
                                >
                                    Close
                                </button>
                            </div>

                            </div>
                        </div>
                    )}
                    {/* CREATE USER MODAL */}
                    {createOpen && (
                        <div className="modal-overlay">
                            <div className="modal-card">
                                <div className="modal-header">
                                    <h3>Create New User</h3>
                                </div>

                                <div className="modal-body">
                                    <div style={{ display: 'grid', gap: 10 }}>
                                        <input
                                            type="text"
                                            placeholder="First name"
                                            aria-label="First name"
                                            value={createForm.firstName}
                                            onChange={e => setCreateForm({ ...createForm, firstName: e.target.value })}
                                            className="search-input"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Last name"
                                            aria-label="Last name"
                                            value={createForm.lastName}
                                            onChange={e => setCreateForm({ ...createForm, lastName: e.target.value })}
                                            className="search-input"
                                        />
                                        <input
                                            type="email"
                                            placeholder="Email"
                                            aria-label="Email"
                                            value={createForm.email}
                                            onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                                            className="search-input"
                                        />
                                        <div className="pw-wrap">
                                            <input
                                                type={showCreatePw ? 'text' : 'password'}
                                                placeholder="Password (min 8, mixed case, number, symbol)"
                                                aria-label="Password"
                                                value={createForm.password}
                                                onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                                                className="search-input"
                                            />
                                            <button
                                                type="button"
                                                className="pw-toggle"
                                                tabIndex={-1}
                                                aria-label={showCreatePw ? 'Hide password' : 'Show password'}
                                                onClick={() => setShowCreatePw(v => !v)}
                                            >
                                                {showCreatePw ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                        <select
                                            value={createForm.role}
                                            onChange={e => setCreateForm({ ...createForm, role: e.target.value })}
                                            className="sort-select"
                                            aria-label="Role"
                                        >
                                            <option value="staff">Staff (teacher)</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </div>
                                    {createError && (
                                        <p style={{ color: 'red', marginTop: 10 }}>{createError}</p>
                                    )}
                                </div>

                                <div className="modal-actions">
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => {
                                            setCreateOpen(false)
                                            setCreateError('')
                                            setShowCreatePw(false)
                                        }}
                                        disabled={creating}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleCreateUser}
                                        disabled={creating}
                                    >
                                        {creating ? 'Creating...' : 'Create User'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export default UserManagement