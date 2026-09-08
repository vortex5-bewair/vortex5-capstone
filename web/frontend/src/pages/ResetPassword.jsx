import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useResetPassword } from '../hooks/useResetPassword'
import { useForgotPassword } from '../hooks/useForgotPassword'
import PasswordRequirements from '../components/PasswordRequirements'
import { isStrongPassword } from '../utils/validators'
import bewairLogoWhite from '../assets/bewair_logo_white.png'

const ResetPassword = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const email = location.state?.email || ''

  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [localError, setLocalError] = useState(null)

  const { resetPassword, error, isLoading, success } = useResetPassword()
  const { forgotPassword, isLoading: resending } = useForgotPassword()

  useEffect(() => {
    if (!email) {
      navigate('/forgot-password')
    }
  }, [email, navigate])

  useEffect(() => {
    if (success) {
      navigate('/login')
    }
  }, [success, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError(null)

    if (!isStrongPassword(newPassword)) {
      setLocalError('Password does not meet the requirements below.')
      return
    }

    if (newPassword !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    await resetPassword(email, code, newPassword)
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
          <h2 className="auth-heading">Reset Password</h2>
          <p className="auth-subheading">
            We sent a 6-digit code to {email}. Enter it below along with your new password.
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
                onClick={() => forgotPassword(email)}
                disabled={resending}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }}
              >
                {resending ? 'Resending…' : 'Resend code'}
              </button>
            </p>

            <div className="auth-field">
              <label className="auth-label">New Password</label>
              <div className="auth-pw-wrap">
                <input
                  className="auth-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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

            {newPassword && <PasswordRequirements password={newPassword} />}

            <div className="auth-field">
              <label className="auth-label">Confirm New Password</label>
              <input
                className="auth-input"
                type={showPw ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {(localError || error) && <div className="auth-error">{localError || error}</div>}

            <button className="auth-submit" disabled={isLoading}>
              {isLoading ? 'Resetting…' : 'Reset Password'}
            </button>
          </form>

          <p className="auth-switch">
            Remembered your password?{' '}
            <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>

    </div>
  )
}

export default ResetPassword
