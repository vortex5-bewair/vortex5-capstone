import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useSignup } from '../hooks/useSignup'
import { useSendSignupCode } from '../hooks/useSendSignupCode'
import bewairLogoWhite from '../assets/bewair_logo_white.png'

const VerifySignup = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { email, password, firstName, lastName, teacherId, department, staffType } = location.state || {}

  const [code, setCode] = useState('')

  const { signup, error, isLoading, success, message } = useSignup()
  const { sendSignupCode, isLoading: resending } = useSendSignupCode()

  useEffect(() => {
    if (!email || !password || !firstName || !lastName || !teacherId || !department || !staffType) {
      navigate('/signup')
    }
  }, [email, password, firstName, lastName, teacherId, department, staffType, navigate])

  useEffect(() => {
    if (success) {
      navigate('/login', { state: { message } })
    }
  }, [success, message, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    await signup(email, password, firstName, lastName, code, teacherId, department, staffType)
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
          <h2 className="auth-heading">Verify your email</h2>
          <p className="auth-subheading">
            We sent a 6-digit code to {email}. Enter it below to finish creating your account.
          </p>
          <div className="auth-form-divider" />

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label">Verification Code</label>
              <input
                className="auth-input"
                type="text"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>

            <p className="auth-switch" style={{ marginTop: '-8px', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => sendSignupCode(email)}
                disabled={resending}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }}
              >
                {resending ? 'Resending…' : 'Resend code'}
              </button>
            </p>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit" disabled={isLoading}>
              {isLoading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            Wrong email?{' '}
            <Link to="/signup">Start over</Link>
          </p>
        </div>
      </div>

    </div>
  )
}

export default VerifySignup
