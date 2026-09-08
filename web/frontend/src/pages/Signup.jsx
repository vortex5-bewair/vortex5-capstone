import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useSendSignupCode } from '../hooks/useSendSignupCode'
import PasswordRequirements from '../components/PasswordRequirements'
import { isStrongPassword } from '../utils/validators'
import bewairLogoWhite from '../assets/bewair_logo_white.png'

// Same lists as the mobile app's registration form — kept identical so
// Department/Staff Type stay consistent data regardless of which app
// someone signs up from.
const DEPARTMENTS = [
  'Science Department',
  'Mathematics Department',
  'English Department',
  'Social Studies Department',
  'ICT Department',
]

const STAFF_TYPES = ['Teacher', 'Student Teacher']

const Signup = () => {
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [department, setDepartment] = useState('')
  const [staffType, setStaffType] = useState('')
  const [password,  setPassword]  = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [localError, setLocalError] = useState(null)
  const { sendSignupCode, error, isLoading, success } = useSendSignupCode()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError(null)

    if (!firstName || !lastName || !email || !teacherId || !department || !staffType) {
      setLocalError('Please fill out all fields.')
      return
    }

    if (!isStrongPassword(password)) {
      setLocalError('Password does not meet the requirements below.')
      return
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    await sendSignupCode(email)
  }

  useEffect(() => {
    if (success) {
      navigate('/verify-signup', {
        state: { email, password, firstName, lastName, teacherId, department, staffType }
      })
    }
  }, [success, email, password, firstName, lastName, teacherId, department, staffType, navigate])

  return (
    <div className="auth-page">

      {/* ── Left branded panel ── */}
      <div className="auth-panel-left">
        <div className="auth-brand-panel">
          <img src={bewairLogoWhite} alt="BewAir" className="auth-panel-logo" width={240} height={240} />
          <div className="auth-panel-name">BewAir</div>
          <p className="auth-panel-tagline">
            Real-time air quality monitoring for healthier learning environments.
          </p>
          <div className="auth-panel-divider" />
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="auth-panel-right">
        <div className="auth-form-wrap">
          <h2 className="auth-heading">Create account</h2>
          <p className="auth-subheading">
            Join your school's air quality monitoring platform.
          </p>
          <div className="auth-form-divider" />

          <form onSubmit={handleSubmit} className="auth-form">

            <div className="auth-row">
              <div className="auth-field">
                <label className="auth-label" htmlFor="signup-first-name">First name</label>
                <input
                  id="signup-first-name"
                  className="auth-input"
                  type="text"
                  placeholder="Juan"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="signup-last-name">Last name</label>
                <input
                  id="signup-last-name"
                  className="auth-input"
                  type="text"
                  placeholder="Dela Cruz"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                className="auth-input"
                type="email"
                placeholder="teacher@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="signup-teacher-id">Teacher ID</label>
              <input
                id="signup-teacher-id"
                className="auth-input"
                type="text"
                placeholder="TCHR-2026-001"
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
              />
            </div>

            <div className="auth-row">
              <div className="auth-field">
                <label className="auth-label" htmlFor="signup-department">Department</label>
                <select
                  id="signup-department"
                  className="auth-input"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  <option value="" disabled>Select department</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="signup-staff-type">Staff type</label>
                <select
                  id="signup-staff-type"
                  className="auth-input"
                  value={staffType}
                  onChange={(e) => setStaffType(e.target.value)}
                >
                  <option value="" disabled>Select staff type</option>
                  {STAFF_TYPES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="signup-password">Password</label>
              <div className="auth-pw-wrap">
                <input
                  id="signup-password"
                  className="auth-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="auth-pw-toggle"
                  onClick={() => setShowPw(v => !v)}
                  tabIndex={-1}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {password && <PasswordRequirements password={password} />}

            <div className="auth-field">
              <label className="auth-label" htmlFor="signup-confirm-password">Confirm password</label>
              <input
                id="signup-confirm-password"
                className="auth-input"
                type={showPw ? 'text' : 'password'}
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {(localError || error) && <div className="auth-error">{localError || error}</div>}

            <button className="auth-submit" disabled={isLoading}>
              {isLoading ? 'Sending code…' : 'Continue'}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account?{' '}
            <Link to="/login">Log in</Link>
          </p>
          <p className="auth-back-link">
            <Link to="/">← Back to Landing Page</Link>
          </p>
        </div>
      </div>

    </div>
  )
}

export default Signup
