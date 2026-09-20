import { useState } from 'react'
import AuthShell from '../components/auth/AuthShell.jsx'
import PasswordStrengthField from '../components/auth/PasswordStrengthField.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { useMotionEntry } from '../components/ui/use-motion-entry.js'
import {
  clearStaffSession,
  completeStaffPasswordReset,
  getAuthErrorMessage,
  requestPasswordReset,
} from '../auth/staffAuth.js'

const genericRequestMessage = 'If the account is eligible, a password-reset link will be sent to its registered email address.'

function SuccessPanel({ children, title }) {
  return (
    <div className="text-center" role="status" aria-live="polite">
      <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-xl font-black text-brand-green">✓</span>
      <h1 className="mt-5 text-2xl font-extrabold text-ink">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-copy">{children}</p>
      <a href="/login" className="ga-btn-primary mt-7 inline-flex w-full justify-center">Return to staff login</a>
    </div>
  )
}

function RequestReset() {
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await requestPasswordReset(account.trim())
      setSent(true)
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  if (sent) return <SuccessPanel title="Check your registered email">{genericRequestMessage} The link is time-limited and can be used once.</SuccessPanel>

  return (
    <>
      <div>
        <p className="ga-eyebrow">Staff account recovery</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Reset your password</h1>
        <p className="mt-3 text-base leading-7 text-muted-copy">Enter one exact account identifier. For privacy, the confirmation is the same whether an account is found or not.</p>
      </div>
      <form className="mt-8 space-y-5" onSubmit={submit} aria-busy={busy}>
        <div>
          <label htmlFor="password-reset-account" className="ga-label">Staff ID, username, or official email</label>
          <input id="password-reset-account" name="account" type="text" autoComplete="username" autoCapitalize="none" spellCheck="false" required maxLength="150" value={account} onChange={(event) => { setAccount(event.target.value); setError('') }} className="ga-input mt-2" placeholder="Enter one account identifier" aria-describedby="password-reset-account-help" />
          <p id="password-reset-account-help" className="mt-2 text-xs leading-5 text-muted-copy">The reset link is delivered only to the registered staff email address.</p>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm leading-6 text-brand-red">{error}</p>}
        <button type="submit" disabled={busy} className="ga-btn-primary w-full">{busy ? <LoadingLabel>Submitting secure request...</LoadingLabel> : 'Send reset instructions'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-copy"><a href="/login" className="font-bold text-brand-blue hover:text-brand-blue-hover">Return to staff login</a></p>
    </>
  )
}

function CompleteReset() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (password !== confirmation) return setError('The new passwords do not match.')
    setBusy(true)
    setError('')
    try {
      await completeStaffPasswordReset(token, password)
      clearStaffSession()
      window.history.replaceState({}, '', '/reset-password')
      setPassword('')
      setConfirmation('')
      setComplete(true)
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  if (complete) return <SuccessPanel title="Password reset complete">All existing staff sessions were signed out. Sign in again with your new password and existing authenticator.</SuccessPanel>
  if (!/^[A-Za-z0-9_-]{43,200}$/.test(token)) {
    return (
      <div className="text-center">
        <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft text-xl font-black text-brand-amber">!</span>
        <h1 className="mt-5 text-2xl font-extrabold text-ink">Reset link unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-muted-copy">This page needs the complete link from your security email.</p>
        <a href="/forgot-password" className="ga-btn-primary mt-7 inline-flex w-full justify-center">Request a new link</a>
      </div>
    )
  }

  const passwordsMatch = confirmation.length > 0 && password === confirmation
  return (
    <>
      <div>
        <p className="ga-eyebrow">Verified recovery link</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Create a new password</h1>
        <p className="mt-3 text-base leading-7 text-muted-copy">This link works once. Completing the reset signs out every existing staff session.</p>
      </div>
      <form className="mt-8 space-y-5" onSubmit={submit} aria-busy={busy}>
        <PasswordStrengthField id="reset-new-password" name="newPassword" label="New password" value={password} onChange={(value) => { setPassword(value); setError('') }} revealed={revealed} onRevealChange={setRevealed} />
        <div>
          <label htmlFor="reset-password-confirmation" className="ga-label">Confirm new password</label>
          <input id="reset-password-confirmation" type={revealed ? 'text' : 'password'} autoComplete="new-password" required minLength="12" maxLength="72" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError('') }} className="ga-input mt-2" aria-invalid={Boolean(confirmation && !passwordsMatch)} aria-describedby="reset-password-match" />
          <p id="reset-password-match" className={`mt-2 text-xs font-semibold ${confirmation ? (passwordsMatch ? 'text-brand-green' : 'text-brand-red') : 'text-muted-copy'}`}>{confirmation ? (passwordsMatch ? 'Passwords match.' : 'Passwords do not match yet.') : 'Enter the new password again.'}</p>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm leading-6 text-brand-red">{error}</p>}
        <button type="submit" disabled={busy || password.length < 12 || !passwordsMatch} className="ga-btn-primary w-full">{busy ? <LoadingLabel>Securing account...</LoadingLabel> : 'Reset password and sign out sessions'}</button>
      </form>
      <p className="mt-6 rounded-lg border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">Authenticator protection remains active.</strong> You will still need your authenticator or a valid recovery code at sign-in.</p>
    </>
  )
}

export default function PasswordResetPage({ mode }) {
  const motionRef = useMotionEntry(mode)
  return (
    <AuthShell navigationLabel="Account recovery navigation">
      <section ref={motionRef} className="w-full max-w-md">
        {mode === 'complete' ? <CompleteReset /> : <RequestReset />}
      </section>
    </AuthShell>
  )
}
