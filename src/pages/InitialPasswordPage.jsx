import { useState } from 'react'
import AuthShell from '../components/auth/AuthShell.jsx'
import PasswordStrengthField from '../components/auth/PasswordStrengthField.jsx'
import { useMotionEntry } from '../components/ui/use-motion-entry.js'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { getAuthErrorMessage, getLoginOutcome, requestStaffLogin, storeStaffSession } from '../auth/staffAuth.js'

function PasswordRequirement({ children, met }) {
  return (
    <li className={`flex items-center gap-2.5 text-sm font-semibold ${met ? 'text-brand-green' : 'text-muted-copy'}`}>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5 shrink-0">
        <circle cx="10" cy="10" r="8" className={met ? 'fill-brand-green' : 'stroke-slate-300'} strokeWidth="1.5" />
        {met && <path d="m6.5 10 2.2 2.2 4.8-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <span><span className="sr-only">{met ? 'Met: ' : 'Required: '}</span>{children}</span>
    </li>
  )
}

function InitialPasswordPage({ credentials, onAuthenticated, onBackToLogin, onTotpEnrollmentRequired, onTotpRequired }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const panelRef = useMotionEntry('initial-password')
  const passwordIsLongEnough = newPassword.length >= 12
  const passwordIsDifferent = Boolean(credentials?.password && newPassword && newPassword !== credentials.password)
  const passwordsMatch = Boolean(confirmation && newPassword === confirmation)
  const canSubmit = passwordIsLongEnough && passwordIsDifferent && passwordsMatch

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit || !credentials) return
    setError('')
    setIsSubmitting(true)

    try {
      const nextCredentials = { ...credentials, password: newPassword }
      const data = await requestStaffLogin({ ...credentials, newPassword })
      const outcome = getLoginOutcome(data)

      if (outcome === 'totp-enrollment') {
        onTotpEnrollmentRequired(data.totpSetupToken)
      } else if (outcome === 'totp') {
        onTotpRequired(nextCredentials)
      } else if (outcome === 'authenticated') {
        storeStaffSession(data)
        onAuthenticated(data.user)
      } else {
        throw new Error('The password was changed, but the next security step could not be started. Sign in again.')
      }
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!credentials) {
    return (
      <AuthShell navigationLabel="Password setup navigation">
        <section className="w-full max-w-lg text-center" aria-labelledby="password-title">
          <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft font-bold text-brand-amber">!</span>
          <h1 id="password-title" className="mt-5 text-2xl font-bold text-ink">Password setup expired</h1>
          <p className="mt-3 text-base leading-7 text-muted-copy">Sign in again using the temporary password provided by your administrator.</p>
          <button type="button" onClick={onBackToLogin} className="ga-btn-primary mt-6">Back to Staff Login</button>
        </section>
      </AuthShell>
    )
  }

  return (
    <AuthShell navigationLabel="Password setup navigation">
      <section ref={panelRef} className="w-full max-w-lg" aria-labelledby="password-title">
        <div>
          <p className="ga-eyebrow">First sign-in · Step 1 of 3</p>
          <h1 id="password-title" className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Create your private password</h1>
          <p className="mt-3 text-base leading-7 text-muted-copy">The password from your administrator is temporary. Replace it before connecting your authenticator.</p>
          <p className="mt-5 rounded-lg border border-line bg-slate-50 px-4 py-3 text-sm text-copy">Signed in as <strong className="text-ink">{credentials.identifier}</strong></p>
        </div>

        <form className="mt-7 space-y-5" onSubmit={handleSubmit} aria-busy={isSubmitting}>
          <PasswordStrengthField
            id="new-password"
            name="newPassword"
            label="New password"
            value={newPassword}
            onChange={(value) => { setNewPassword(value); setError('') }}
            revealed={showPassword}
            onRevealChange={setShowPassword}
            describedBy="password-rules"
          />

          <div>
            <label htmlFor="confirm-password" className="ga-label">Confirm new password</label>
            <input
              id="confirm-password"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength="12"
              maxLength="72"
              required
              value={confirmation}
              onChange={(event) => { setConfirmation(event.target.value); setError('') }}
              aria-invalid={Boolean(confirmation && !passwordsMatch)}
              aria-describedby="confirm-password-status"
              className={`ga-input mt-2 ${confirmation ? (passwordsMatch ? 'border-emerald-400 focus:border-brand-green focus:ring-emerald-100' : 'border-red-400 focus:border-brand-red focus:ring-red-100') : ''}`}
            />
            <p id="confirm-password-status" aria-live="polite" className={`mt-2 text-xs font-semibold leading-5 ${confirmation ? (passwordsMatch ? 'text-brand-green' : 'text-brand-red') : 'text-muted-copy'}`}>
              {confirmation ? (passwordsMatch ? 'Passwords match.' : 'Passwords do not match yet.') : 'Re-enter your new password exactly.'}
            </p>
          </div>

          <div id="password-rules" className="rounded-xl border border-line bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-copy">Before you continue</p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2" aria-label="Password requirements">
              <PasswordRequirement met={passwordIsDifferent}>Different from temporary password</PasswordRequirement>
              <PasswordRequirement met={passwordsMatch}>Both password fields match</PasswordRequirement>
            </ul>
          </div>

          {error && <p role="alert" className="rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm leading-6 text-brand-red">{error}</p>}

          <button type="submit" disabled={isSubmitting || !canSubmit} className="ga-btn-primary w-full">
            {isSubmitting ? <LoadingLabel>Securing password...</LoadingLabel> : 'Save password and continue'}
          </button>
          <button type="button" onClick={onBackToLogin} className="min-h-11 w-full text-sm font-bold text-muted-copy hover:text-brand-blue">Cancel and return to Staff Login</button>
        </form>

        <p className="mt-6 border-t border-line pt-5 text-sm leading-6 text-muted-copy">Your administrator cannot view this password. Next, you will connect an authenticator app and save recovery codes.</p>
      </section>
    </AuthShell>
  )
}

export default InitialPasswordPage
