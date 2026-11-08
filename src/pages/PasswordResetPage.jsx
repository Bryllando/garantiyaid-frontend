import { useEffect, useRef, useState } from 'react'
import AuthShell from '../components/auth/AuthShell.jsx'
import PasswordStrengthField from '../components/auth/PasswordStrengthField.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { clearStaffSession, completeStaffPasswordReset, getAuthErrorMessage, requestPasswordReset } from '../auth/staffAuth.js'

const genericRequestMessage = 'If the account is eligible, a password-reset link will be sent to its registered email address.'
const textLink = 'inline-flex min-h-11 items-center text-sm font-semibold text-brand-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue'

function RecoveryNotice({ title, icon, children, action }) {
  const headingRef = useRef(null)
  useEffect(() => { headingRef.current?.focus() }, [])
  return <>
    <Icon name={icon} className="size-7 text-brand-blue" />
    <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-semibold text-ink outline-none sm:text-3xl">{title}</h1>
    <div className="mt-3 space-y-4 text-base leading-7 text-copy">{children}</div>
    <div className="mt-7 space-y-2">{action}</div>
  </>
}

function ResetError({ message }) {
  const errorRef = useRef(null)
  useEffect(() => { if (message) errorRef.current?.focus() }, [message])
  return message ? <p ref={errorRef} tabIndex={-1} role="alert" className="border-l-4 border-brand-red bg-danger-soft px-4 py-3 text-sm leading-6 text-brand-red outline-none">{message}</p> : null
}

function RequestReset() {
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (!account.trim()) return setError('Enter your Staff ID, username, or registered email address.')
    setBusy(true)
    setError('')
    try {
      await requestPasswordReset(account.trim())
      setSent(true)
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally { setBusy(false) }
  }

  if (sent) return <RecoveryNotice title="Check your email" icon="email" action={<>
    <a href="/login" className="ga-btn-primary w-full">Return to sign in</a>
    <button type="button" className={textLink} onClick={() => { setSent(false); requestAnimationFrame(() => document.getElementById('password-reset-account')?.focus()) }}>Check or change account details</button>
  </>}>
    <p>{genericRequestMessage}</p>
    <ul className="list-disc space-y-2 pl-5 text-sm leading-6">
      <li>Check your Inbox and Spam folders for an email from GarantiyAid.</li>
      <li>Use the link in the newest email. It expires and can only be used once.</li>
    </ul>
    <p className="border-t border-line pt-4 text-sm leading-6">Still no email, or no access to that mailbox? Contact your office’s System Administrator.</p>
  </RecoveryNotice>

  return <>
    <p className="text-sm font-semibold text-copy">Staff account recovery</p>
    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Reset your password</h1>
    <p className="mt-3 text-base leading-7 text-copy">Enter your Staff ID, username, or the email address registered to your account.</p>
    <form className="mt-6 space-y-5" onSubmit={submit} aria-busy={busy}>
      <ResetError message={error} />
      <div>
        <label htmlFor="password-reset-account" className="ga-label">Staff ID, username, or email</label>
        <input id="password-reset-account" name="account" type="text" autoComplete="username" autoCapitalize="none" spellCheck="false" required disabled={busy} maxLength="150" value={account} onChange={(event) => { setAccount(event.target.value); setError('') }} className="ga-input mt-2" aria-describedby="password-reset-account-help" />
        <p id="password-reset-account-help" className="mt-2 text-sm leading-6 text-copy">We send the link to the email already on your staff record.</p>
      </div>
      <button type="submit" disabled={busy} className="ga-btn-primary w-full">{busy ? <LoadingLabel>Requesting reset link…</LoadingLabel> : 'Send reset link'}</button>
    </form>
    <a href="/login" className={`${textLink} mt-3`}>Back to sign in</a>
    <p className="mt-5 border-t border-line pt-4 text-sm leading-6 text-copy">If you cannot access your registered email, contact your office’s System Administrator.</p>
  </>
}

function CompleteReset() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [confirmationTouched, setConfirmationTouched] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [linkRejected, setLinkRejected] = useState(false)
  const [error, setError] = useState('')
  const mismatch = confirmationTouched && confirmation !== password

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (password !== confirmation) {
      setConfirmationTouched(true)
      document.getElementById('reset-password-confirmation')?.focus()
      return
    }
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
      if (requestError.code === 'INVALID_OR_EXPIRED_PASSWORD_RESET_TOKEN') {
        setPassword(''); setConfirmation(''); setLinkRejected(true)
        window.history.replaceState({}, '', '/reset-password')
      } else setError(getAuthErrorMessage(requestError))
    } finally { setBusy(false) }
  }

  if (complete) return <RecoveryNotice title="Password updated" icon="check" action={<a href="/login" className="ga-btn-primary w-full">Sign in with your new password</a>}>
    <p>Your new password is ready. All previous staff sessions have been signed out.</p>
    <p className="text-sm leading-6">Your authenticator has not changed. Use it, or a recovery code, when you sign in.</p>
  </RecoveryNotice>

  if (linkRejected || !/^[A-Za-z0-9_-]{43,200}$/.test(token)) return <RecoveryNotice title="Reset link unavailable" icon="info" action={<>
    <a href="/forgot-password" className="ga-btn-primary w-full">Request a new link</a>
    <a href="/login" className={textLink}>Back to sign in</a>
  </>}>
    <p>{linkRejected ? 'This link has expired, has already been used, or is no longer valid. Request a new link to continue.' : 'Open the complete reset link from your email, or request a new one below.'}</p>
    <p className="text-sm leading-6">If you requested more than one email, use the newest link.</p>
  </RecoveryNotice>

  return <>
    <p className="text-sm font-semibold text-copy">Staff account recovery</p>
    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Create a new password</h1>
    <p className="mt-3 text-base leading-7 text-copy">Choose a password you have not used for this account.</p>
    <form className="mt-6 space-y-5" onSubmit={submit} aria-busy={busy}>
      <ResetError message={error} />
      <PasswordStrengthField compact disabled={busy} id="reset-new-password" name="newPassword" label="New password" value={password} onChange={(value) => { setPassword(value); setError('') }} revealed={revealed} onRevealChange={setRevealed} />
      <div>
        <label htmlFor="reset-password-confirmation" className="ga-label">Confirm new password</label>
        <input id="reset-password-confirmation" name="confirmPassword" type={revealed ? 'text' : 'password'} autoComplete="new-password" required disabled={busy} minLength="12" maxLength="72" value={confirmation} onBlur={() => setConfirmationTouched(true)} onChange={(event) => { setConfirmation(event.target.value); setError('') }} className="ga-input mt-2" aria-invalid={mismatch} aria-describedby="reset-password-match" />
        <p id="reset-password-match" className={`mt-2 text-sm leading-6 ${mismatch ? 'text-brand-red' : 'text-copy'}`}>{mismatch ? 'The passwords do not match. Enter the same password in both fields.' : 'Enter your new password again.'}</p>
      </div>
      <button type="submit" disabled={busy} className="ga-btn-primary w-full">{busy ? <LoadingLabel>Updating password…</LoadingLabel> : 'Reset password'}</button>
    </form>
    <p className="mt-5 border-t border-line pt-4 text-sm leading-6 text-copy">Resetting your password signs out all staff sessions. Your authenticator stays active.</p>
    <a href="/login" className={`${textLink} mt-2`}>Back to sign in</a>
  </>
}

export default function PasswordResetPage({ mode }) {
  return <AuthShell compact navigationLabel="Account recovery navigation">
    <section className="w-full">{mode === 'complete' ? <CompleteReset /> : <RequestReset />}</section>
  </AuthShell>
}
