import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useLogin } from '../hooks/useLogin'
import bewairLogoWhite from '../assets/bewair_logo_white.png'

const Login = () => {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [localError, setLocalError] = useState(null)
  const { login, error, isLoading } = useLogin()
  const location = useLocation()
  const infoMessage = location.state?.message

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError(null)

    if (!email || !password) {
      setLocalError('Please enter your email and password.')
      return
    }

    await login(email, password)
  }

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
          <h2 className="auth-heading">Welcome back</h2>
          <p className="auth-subheading">
            Log in to check classroom air quality, alerts, and device status.
          </p>
          <div className="auth-form-divider" />

          <form onSubmit={handleSubmit} className="auth-form">
            {infoMessage && <div className="auth-success">{infoMessage}</div>}

            <div className="auth-field">
              <label className="auth-label">Email</label>
              <input
                className="auth-input"
                type="email"
                placeholder="teacher@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Password</label>
              <div className="auth-pw-wrap">
                <input
                  className="auth-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="auth-pw-toggle"
                  onClick={() => setShowPw(v => !v)}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <p className="auth-switch" style={{ marginTop: '-8px', textAlign: 'right' }}>
              <Link to="/forgot-password">Forgot password?</Link>
            </p>

            {(localError || error) && <div className="auth-error">{localError || error}</div>}

            <button className="auth-submit" disabled={isLoading}>
              {isLoading ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <p className="auth-switch">
            Don't have an account?{' '}
            <Link to="/signup">Create account</Link>
          </p>
          <p className="auth-back-link">
            <Link to="/">← Back to Landing Page</Link>
          </p>
        </div>
      </div>

    </div>
  )
}

export default Login
