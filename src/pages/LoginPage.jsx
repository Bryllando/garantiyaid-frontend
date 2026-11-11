import { useEffect, useRef, useState } from 'react'
import AuthShell from '../components/auth/AuthShell.jsx'
import { Icon } from '../components/ui/icon.jsx'
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
  const submittingRef = useRef(false)

  useEffect(() => checkSignInReadiness(setConnectionStatus), [connectionAttempt])

  async function handleSubmit(event) {
    event.preventDefault()
    if (submittingRef.current || connectionStatus !== 'ready') return
    submittingRef.current = true
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
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell navigationLabel="Login navigation">
      <section className="w-full max-w-md px-2 sm:px-0" aria-labelledby="login-title">
        {isAuthenticated ? (
          <div className="text-center" aria-live="polite">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-brand-green"><Icon name="check" className="size-6" /></span>
            <h1 id="login-title" className="mt-5 text-2xl font-bold text-ink">Sign-in successful</h1>
            <p className="mt-3 text-base leading-7 text-muted-copy">Your secure staff session is ready.</p>
          </div>
        ) : (
          <>
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-brand-blue"><Icon name="lock" className="size-4" />Staff sign in</p>
              <h1 id="login-title" className="mt-3 text-3xl font-bold tracking-tight text-ink">{securityReview ? 'Review your account security' : 'Welcome back'}</h1>
              <p className="mt-2 text-base leading-6 text-muted-copy">{securityReview ? 'Sign in to continue to the account settings linked in your email.' : 'Sign in to continue to your staff workspace.'}</p>
            </div>

            <form className="mt-7" onSubmit={handleSubmit} aria-label="Staff sign in" aria-busy={isSubmitting}>
              <div className="space-y-5">
                <div>
                  <label htmlFor="identifier" className="ga-label">Username</label>
                  <div className="relative mt-2">
                    <Icon name="profile" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-copy" />
                    <input
                      id="identifier"
                      name="identifier"
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck="false"
                      required
                      disabled={isSubmitting}
                      maxLength="30"
                      pattern={'[A-Za-z0-9._\\-]+'}
                      title="Use letters, numbers, periods, underscores, or hyphens."
                      aria-describedby={error ? 'login-error' : undefined}
                      aria-invalid={Boolean(error)}
                      value={identifier}
                      onChange={(event) => { setIdentifier(event.target.value); setError('') }}
                      placeholder="Enter your username"
                      className="ga-input h-12 pl-11 placeholder:text-slate-500 aria-invalid:border-brand-red"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-4">
                    <label htmlFor="password" className="ga-label">Password</label>
                    <a href="/forgot-password" className="inline-flex min-h-6 items-center rounded text-sm font-semibold text-brand-blue hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Forgot password?</a>
                  </div>
                  <div className="relative mt-2">
                    <Icon name="lock" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-copy" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      disabled={isSubmitting}
                      minLength="8"
                      maxLength="128"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? 'login-error' : undefined}
                      value={password}
                      onChange={(event) => { setPassword(event.target.value); setError('') }}
                      placeholder="Enter your password"
                      className="ga-input h-12 pl-11 pr-14 placeholder:text-slate-500 aria-invalid:border-brand-red"
                    />
                    <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-lg text-muted-copy transition-colors hover:bg-info-soft hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-brand-blue" aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} aria-controls="password" aria-pressed={showPassword}>
                      <Icon name={showPassword ? 'eyeOff' : 'eye'} className="size-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="min-h-16 pt-3">
                <p id="login-error" role="alert" aria-atomic="true" className="flex items-start gap-2 text-sm leading-5 text-brand-red">{error && <><Icon name="info" className="mt-0.5 size-4 shrink-0" /><span>{error}</span></>}</p>
                <div id="login-connection" role="status" className={connectionStatus === 'ready' ? 'sr-only' : 'flex items-start gap-2 text-sm leading-5 text-copy'}>
                  {connectionStatus !== 'ready' && <><Icon name="reset" className="mt-0.5 size-4 shrink-0" /><p>
                  {connectionStatus === 'checking'
                    ? 'Connecting to the sign-in service…'
                    : 'The sign-in service is not available. Reconnecting automatically.'}
                  </p></>}
                </div>
              </div>

              <button type="submit" disabled={isSubmitting || connectionStatus !== 'ready'} aria-describedby={connectionStatus !== 'ready' ? 'login-connection' : undefined} className="ga-btn-primary w-full shadow-none hover:shadow-none">
                {isSubmitting ? <LoadingLabel>Signing in...</LoadingLabel> : connectionStatus !== 'ready' ? <LoadingLabel>Connecting...</LoadingLabel> : <>Sign in securely<Icon name="arrowRight" className="size-4" /></>}
              </button>
            </form>
          </>
        )}

        <div className="mt-6 flex items-start gap-2.5 border-t border-line pt-5 text-sm leading-6 text-muted-copy">
          <Icon name="helpCases" className="mt-1 size-4 shrink-0" /><p><strong className="font-semibold text-copy">Need account help?</strong><br />Contact your office’s System Administrator.</p>
        </div>
      </section>
    </AuthShell>
  )
}

export default LoginPage
