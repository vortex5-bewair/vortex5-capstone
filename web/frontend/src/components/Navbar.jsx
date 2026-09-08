import { NavLink } from 'react-router-dom'
import { useAuthContext } from '../hooks/useAuthContext'
import { useLogout } from "../hooks/useLogout"
import { useTheme } from "../hooks/useTheme"
import { useState } from 'react'
import { useLocation } from 'react-router-dom'

import {
  LayoutDashboard,
  BarChart3,
  School,
  Settings,
  Users,
  FileText,
  LogOut,
  Bell,
  Wifi,
  UserCircle,
  ClipboardList,
  Video,
  LogIn,
  UserPlus,
  Gauge,
  Megaphone,
  ChevronDown,
  Sun,
  Moon,
  Cpu,
} from 'lucide-react'

// Import both logo variants — the black-ink mark is invisible against the
// dark sidebar, so it has to swap with the theme.
import bewAirLogoBlack from '../assets/bewair_logo_black.png'
import bewAirLogoWhite from '../assets/bewair_logo_white.png'

const Navbar = () => {
  const { user } = useAuthContext()
  const { logout } = useLogout()
  const { isDark, toggle: toggleTheme } = useTheme()

  const handleLogout = () => {
        logout()
    }

  const location = useLocation()
  // Only highlight the Configuration parent when the user is actually on a
  // settings page (Thresholds). The Bulletin Board URL still lives under
  // /configuration/ for now but is a top-level sidebar item, so we exclude it.
  const isConfigActive = location.pathname.startsWith('/configuration/Thresholds')

  // Toggle state for the Configuration submenu.
  // Auto-opens when the user navigates onto a config sub-route, but doesn't
  // auto-close when they navigate away — the user may have opened it
  // manually and still expect it open. Adjusted during render rather than in
  // an effect (React's documented pattern for "derive state from a changing
  // prop, one directionally"): tracking the previous isConfigActive lets this
  // catch the false->true transition without an effect + extra post-paint
  // render, and without re-forcing it open on every render while already true.
  const [configOpen, setConfigOpen] = useState(isConfigActive)
  const [prevConfigActive, setPrevConfigActive] = useState(isConfigActive)
  if (isConfigActive !== prevConfigActive) {
    setPrevConfigActive(isConfigActive)
    if (isConfigActive) setConfigOpen(true)
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo-container">
          <img src={isDark ? bewAirLogoWhite : bewAirLogoBlack} alt="BewAir Logo" className="sidebar-logo" width={52} height={52} />
          <h2>BewAir</h2>
        </div>
      </div>

      <nav className="sidebar-links">
        {user && (
          <>
            {user.role === 'admin' && (
              <>
                <NavLink to="/" end>
                    <LayoutDashboard size={18} />
                    <span>Dashboard</span>
                    </NavLink>

                    <NavLink to="/analytics">
                    <BarChart3 size={18} />
                    <span>Analytics</span>
                    </NavLink>

                    <NavLink to="/classroomrecords">
                    <School size={18} />
                    <span>Classroom Records</span>
                    </NavLink>

                    <NavLink to="/configuration/WebBulletinBoard">
                      <Megaphone size={18} />
                      <span>Bulletin Board</span>
                    </NavLink>

                    <div className={`sidebar-group ${isConfigActive ? 'active-parent' : ''} ${configOpen ? 'open' : ''}`}>
                      <button
                        type="button"
                        className="sidebar-parent"
                        onClick={() => setConfigOpen(o => !o)}
                        aria-expanded={configOpen}
                      >
                        <Settings size={18} />
                        <span>Configuration</span>
                        <ChevronDown
                          size={16}
                          className="sidebar-chevron"
                        />
                      </button>

                      <div className="sidebar-submenu-wrapper">
                        <div className="sidebar-submenu">
                          <NavLink to="/configuration/Thresholds">
                            <Gauge size={16} />
                            <span>Thresholds</span>
                          </NavLink>
                        </div>
                      </div>
                    </div>

                    <NavLink to="/device-management">
                    <Cpu size={18} />
                    <span>Device Management</span>
                    </NavLink>

                    <NavLink to="/usermanagement">
                    <Users size={18} />
                    <span>User Management</span>
                    </NavLink>

                    <NavLink to="/auditlog">
                    <FileText size={18} />
                    <span>Audit Log</span>
                    </NavLink>

                    <NavLink to="/profile">
                    <UserCircle size={18} />
                    <span>Profile</span>
                    </NavLink>
              </>
            )}

            {user.role === 'staff' && (
              <>
                <NavLink to="/" end>
                  <LayoutDashboard size={18} />
                  <span>My Devices</span>
                </NavLink>

                <NavLink to="/alerts-and-notifications">
                  <Bell size={18} />
                  <span>Alerts</span>
                </NavLink>

                <NavLink to="/profile">
                  <UserCircle size={18} />
                  <span>Profile</span>
                </NavLink>

                <NavLink to="/bulletin-board">
                  <ClipboardList size={18} />
                  <span>Bulletin Board</span>
                </NavLink>

                <NavLink to="/animation-viewer">
                  <Video size={18} />
                  <span>Animation Viewer</span>
                </NavLink>
              </>
            )}
            
          
          
          </>
        )}

        {!user && (
          <>
            <NavLink to="/login">
              <LogIn size={18} />
              <span>Login</span>
            </NavLink>

            <NavLink to="/signup">
              <UserPlus size={18} />
              <span>Signup</span>
            </NavLink>
          </>
        )}
      </nav>

      <button
        onClick={toggleTheme}
        className="sidebar-theme-toggle"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
        <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
      </button>

      <button onClick={handleLogout} className="sidebar-logout">
        <LogOut size={18} />
        <span>Logout</span>
      </button>
    </div>
  )
}

export default Navbar