import { useEffect, useState } from 'react'
import AuthShell from '../components/auth/AuthShell.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { getAuthErrorMessage, getLoginOutcome, requestStaffLogin, storeStaffSession } from '../auth/staffAuth.js'
import { checkSignInReadiness } from '../auth/signInReadiness.js'

function LoginPage({ onAuthenticated, onPasswordChangeRequired, onTotpRequired, onTotpEnrollmentRequired, securityReview = false }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('checking')
  const [connectionAttempt, setConnectionAttempt] = useState(0)

  useEffect(() => checkSignInReadiness(setConnectionStatus), [connectionAttempt])

  async function handleSubmit(event) {
    event.preventDefault()
    if (isSubmitting || connectionStatus !== 'ready') return
    setError('')
    setIsSubmitting(true)

    try {
      const credentials = { identifier: identifier.trim(), password }
      const data = await requestStaffLogin(credentials)
      const outcome = getLoginOutcome(data)

      if (outcome === 'password-change') {
        onPasswordChangeRequired(credentials)
      } else if (outcome === 'totp') {
        onTotpRequired(credentials)
      } else if (outcome === 'totp-enrollment') {
        onTotpEnrollmentRequired(data.totpSetupToken)
      } else {
        storeStaffSession(data)
        setPassword('')
        setIsAuthenticated(true)
        onAuthenticated(data.user)
      }
    } catch (requestError) {
      if (['API_UNREACHABLE', 'API_UNAVAILABLE'].includes(requestError.code) || (!requestError.code && [502, 503, 504].includes(requestError.status))) {
        setConnectionStatus('checking')
        setConnectionAttempt((attempt) => attempt + 1)
      } else {
        setError(getAuthErrorMessage(requestError))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell navigationLabel="Login navigation">
      <section className="w-full max-w-md" aria-labelledby="login-title">
        {isAuthenticated ? (
          <div className="text-center" aria-live="polite">
            <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-xl font-bold text-brand-green">✓</span>
            <h1 id="login-title" className="mt-5 text-2xl font-bold text-ink">Sign-in successful</h1>
            <p className="mt-3 text-base leading-7 text-muted-copy">Your secure staff session is ready.</p>
          </div>
        ) : (
          <>
            <div>
              <p className="ga-eyebrow">Authorized staff portal</p>
              <h1 id="login-title" className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{securityReview ? 'Review your account security' : 'Welcome back'}</h1>
              <p className="mt-3 text-base leading-7 text-muted-copy">{securityReview ? 'Sign in to continue to the account settings linked in your email.' : 'Use your official staff credentials to continue.'}</p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit} aria-busy={isSubmitting}>
              <div>
                <label htmlFor="identifier" className="ga-label">Username or Staff ID</label>
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck="false"
                  required
                  maxLength="30"
                  pattern="[A-Za-z0-9._-]+"
                  aria-describedby={error ? 'identifier-help login-error' : 'identifier-help'}
                  aria-invalid={Boolean(error)}
                  value={identifier}
                  onChange={(event) => { setIdentifier(event.target.value); setError('') }}
                  placeholder="Enter username or staff ID"
                  className="ga-input mt-2"
                />
                <p id="identifier-help" className="mt-2 text-xs leading-5 text-muted-copy"><strong className="text-ink">All staff:</strong> use the exact Staff ID issued by the administrator. Barangay Staff and System Administrators may also use their username.</p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="password" className="ga-label">Password</label>
                  <a href="/forgot-password" className="rounded text-sm font-bold text-brand-blue hover:text-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Forgot password?</a>
                </div>
                <div className="relative mt-2">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    minLength="8"
                    maxLength="128"
                    value={password}
                    onChange={(event) => { setPassword(event.target.value); setError('') }}
                    placeholder="Enter your password"
                    className="ga-input pr-20"
                  />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 min-w-16 rounded-r-lg px-4 text-sm font-bold text-brand-blue hover:bg-info-soft hover:text-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-brand-blue" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {error && <p id="login-error" role="alert" className="rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm leading-6 text-brand-red">{error}</p>}

              <div id="login-connection" role="status" aria-live="polite">
                {connectionStatus !== 'ready' && <p className="text-sm leading-6 text-muted-copy">
                  {connectionStatus === 'checking'
                    ? 'Connecting to the sign-in service…'
                    : 'The sign-in service is not available yet. This page will reconnect automatically.'}
                </p>}
              </div>

              <button type="submit" disabled={isSubmitting || connectionStatus !== 'ready'} aria-describedby={connectionStatus !== 'ready' ? 'login-connection' : undefined} className="ga-btn-primary w-full">
                {isSubmitting ? <LoadingLabel>Signing in...</LoadingLabel> : connectionStatus !== 'ready' ? <LoadingLabel>Connecting...</LoadingLabel> : 'Sign in securely'}
              </button>
            </form>
          </>
        )}

        <div className="mt-8 border-t border-line pt-5 text-sm leading-6 text-muted-copy">
          <p><strong className="text-ink">Need account help?</strong> Contact your designated System Administrator through the official support channel.</p>
        </div>
      </section>
    </AuthShell>
  )
}

export default LoginPage
