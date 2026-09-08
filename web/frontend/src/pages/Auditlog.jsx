import { useEffect, useState } from 'react'
import { useAuthContext } from '../hooks/useAuthContext'

const LOGS_PER_PAGE = 10

const AuditLogs = () => {
  const { user } = useAuthContext()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [sortModule, setSortModule] = useState('all')
  const [sortDate, setSortDate] = useState('latest')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      setLoading(false)
      return
    }
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/auditlog', {
          headers: { Authorization: `Bearer ${user.token}` }
        })
        const json = await res.json()
        if (res.ok) {
          setLogs(json)
        } else {
          setError(json.error || 'Failed to fetch audit logs')
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchLogs()
  }, [user])

  if (!user) return <p>Please log in.</p>
  if (user.role !== 'admin') return <p style={{ color: 'red' }}>Audit Logs is admin-only.</p>
  if (loading) return <p>Loading audit logs...</p>
  if (error) return <p style={{ color: 'red' }}>{error}</p>

  // FILTER
  const query = search.trim().toLowerCase()
  const fromTime = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null
  const toTime = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null

  const filteredLogs = logs.filter(log => {
    if (sortModule !== 'all' && log.module !== sortModule) return false

    if (query) {
      const haystack = `${log.module} ${log.action} ${log.user}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }

    if (fromTime != null || toTime != null) {
      const t = new Date(log.date).getTime()
      if (fromTime != null && t < fromTime) return false
      if (toTime != null && t > toTime) return false
    }

    return true
  })

  const filtersActive = query !== '' || fromDate !== '' || toDate !== '' || sortModule !== 'all'

  const clearFilters = () => {
    setSearch('')
    setFromDate('')
    setToDate('')
    setSortModule('all')
    setCurrentPage(1)
  }

  // SORT
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    if (sortDate === 'latest') return new Date(b.date) - new Date(a.date)
    return new Date(a.date) - new Date(b.date)
  })

  // PAGINATION
  const totalPages = Math.ceil(sortedLogs.length / LOGS_PER_PAGE)
  const indexOfLast = currentPage * LOGS_PER_PAGE
  const indexOfFirst = indexOfLast - LOGS_PER_PAGE
  const currentLogs = sortedLogs.slice(indexOfFirst, indexOfLast)

  return (
    <div className="audit-logs">
      <div className="section-header">
        <h2 className="page-title">Audit Logs</h2>
      </div>

      {/* FILTER / SORT */}
      <div className="table-controls" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input
          type="text"
          placeholder="Search module, action, or user..."
          aria-label="Search module, action, or user"
          value={search}
          onChange={e => {
            setSearch(e.target.value)
            setCurrentPage(1)
          }}
          className="search-input"
        />

        <div>
          <label htmlFor="auditlog-from">From:</label>
          <input
            id="auditlog-from"
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={e => {
              setFromDate(e.target.value)
              setCurrentPage(1)
            }}
            className="sort-select"
          />
        </div>

        <div>
          <label htmlFor="auditlog-to">To:</label>
          <input
            id="auditlog-to"
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={e => {
              setToDate(e.target.value)
              setCurrentPage(1)
            }}
            className="sort-select"
          />
        </div>

        <div>
          <label htmlFor="auditlog-module">Module:</label>
          <select
            id="auditlog-module"
            value={sortModule}
            onChange={e => {
              setSortModule(e.target.value)
              setCurrentPage(1)
            }}
            className="sort-select"
          >
            <option value="all">All</option>
            <option value="Bulletin Board">Bulletin Board</option>
            <option value="Classroom">Classroom</option>
            <option value="Configuration">Configuration</option>
            <option value="Advisory">Advisory</option>
            <option value="User">User</option>
          </select>
        </div>

        <div>
          <label htmlFor="auditlog-date">Date:</label>
          <select
            id="auditlog-date"
            value={sortDate}
            onChange={e => {
              setSortDate(e.target.value)
              setCurrentPage(1)
            }}
            className="sort-select"
          >
            <option value="latest">Latest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        {filtersActive && (
          <button type="button" className="btn btn-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {/* TABLE */}
      <div className="table-card">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Action</th>
              <th>User</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {currentLogs.map(log => (
              <tr key={log._id}>
                <td>{log.module}</td>
                <td>{log.action}</td>
                <td>{log.user}</td>
                <td>{new Date(log.date).toLocaleString()}</td>
              </tr>
            ))}

            {currentLogs.length === 0 && (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '15px' }}>
                  No logs found
                </td>
              </tr>
            )}
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
    </div>
  )
}

export default AuditLogs