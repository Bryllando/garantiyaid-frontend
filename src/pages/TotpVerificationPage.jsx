import { useState } from 'react'
import AuthShell from '../components/auth/AuthShell.jsx'
import { InputOTP, InputOTPGroup, InputOTPSlot, REGEXP_ONLY_DIGITS } from '../components/ui/input-otp.jsx'
import { getAuthErrorMessage, getLoginOutcome, requestStaffLogin, storeStaffSession } from '../auth/staffAuth.js'

function formatRecoveryCode(value) {
  return value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 16).replace(/(.{4})(?=.)/g, '$1-')
}

function TotpVerificationPage({ credentials, onBackToLogin, onVerified }) {
  const [method, setMethod] = useState('totp')
  const [code, setCode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const isRecovery = method === 'recovery'
  const canSubmit = isRecovery ? recoveryCode.length === 19 : code.length === 6

  function switchMethod(nextMethod) {
    setMethod(nextMethod)
    setCode('')
    setRecoveryCode('')
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const secondFactor = isRecovery ? { recoveryCode } : { totpCode: code }
      const data = await requestStaffLogin({ ...credentials, ...secondFactor })
      if (getLoginOutcome(data) !== 'authenticated') throw new Error('Your identity could not be verified. Please try again.')
      storeStaffSession(data)
      setCode('')
      setRecoveryCode('')
      setIsVerified(true)
      onVerified(data.user)
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell navigationLabel="Verification navigation">
      <section className="w-full max-w-lg" aria-labelledby="verification-title">
        {isVerified ? (
          <div className="text-center" aria-live="polite">
            <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-xl font-bold text-brand-green">✓</span>
            <h1 id="verification-title" className="mt-5 text-2xl font-bold text-ink">Verification complete</h1>
            <p className="mt-3 text-base leading-7 text-muted-copy">Your secure staff session is ready.</p>
          </div>
        ) : !credentials ? (
          <div className="text-center">
            <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft font-bold text-brand-amber">!</span>
            <h1 id="verification-title" className="mt-5 text-2xl font-bold text-ink">Sign-in expired</h1>
            <p className="mt-3 text-base leading-7 text-muted-copy">Return to Staff Login to start a new secure sign-in.</p>
            <button type="button" onClick={onBackToLogin} className="ga-btn-primary mt-6">Back to Staff Login</button>
          </div>
        ) : (
          <>
            <div>
              <p className="ga-eyebrow">Identity verification</p>
              <h1 id="verification-title" className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{isRecovery ? 'Use a recovery code' : 'Enter your authenticator code'}</h1>
              <p className="mt-3 text-base leading-7 text-muted-copy">{isRecovery ? 'Enter one unused recovery code saved during authenticator setup.' : 'Open your authenticator app and enter the current six-digit code.'}</p>
              <p className="mt-5 rounded-lg border border-line bg-slate-50 px-4 py-3 text-sm text-copy">Signing in as <strong className="text-ink">{credentials.identifier}</strong></p>
            </div>

            <form className="mt-7 space-y-6" onSubmit={handleSubmit} aria-busy={isSubmitting}>
              {isRecovery ? (
                <div>
                  <label htmlFor="recovery-code" className="ga-label">Recovery code</label>
                  <input id="recovery-code" name="recoveryCode" type="text" autoComplete="off" autoCapitalize="characters" spellCheck="false" required autoFocus maxLength="19" value={recoveryCode} onChange={(event) => { setRecoveryCode(formatRecoveryCode(event.target.value)); setError('') }} placeholder="XXXX-XXXX-XXXX-XXXX" aria-describedby="recovery-code-hint" aria-invalid={Boolean(error)} className="ga-input mt-2 text-center font-mono font-bold tracking-[0.08em]" />
                  <p id="recovery-code-hint" className="mt-2 text-sm leading-6 text-muted-copy">Each recovery code can be used once.</p>
                </div>
              ) : (
                <div className="text-center">
                  <label htmlFor="verification-code" className="ga-label text-center">Six-digit code</label>
                  <InputOTP id="verification-code" name="code" maxLength={6} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric" autoComplete="one-time-code" aria-describedby="verification-code-hint" aria-invalid={Boolean(error)} required autoFocus value={code} onChange={(value) => { setCode(value); setError('') }} containerClassName="mt-3">
                    <InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} invalid={Boolean(error)} />)}</InputOTPGroup>
                  </InputOTP>
                  <p id="verification-code-hint" className="mt-2 text-sm leading-6 text-muted-copy">You can type or paste the code. It refreshes every 30 seconds.</p>
                </div>
              )}

              {error && <p role="alert" className="rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm leading-6 text-brand-red">{error}</p>}

              <button type="submit" disabled={isSubmitting || !canSubmit} className="ga-btn-primary w-full">{isSubmitting ? 'Verifying…' : 'Verify and continue'}</button>
              {isRecovery && <button type="button" onClick={() => switchMethod('totp')} className="min-h-11 w-full text-sm font-bold text-brand-blue hover:text-brand-blue-hover">Use authenticator app instead</button>}
              <button type="button" onClick={onBackToLogin} className="min-h-11 w-full text-sm font-bold text-muted-copy hover:text-brand-blue">Use a different account</button>
            </form>

            <details className="mt-6 rounded-xl border border-line bg-slate-50 px-4 py-3">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Lost access to your authenticator?</summary>
              <div className="border-t border-line pt-4 text-sm leading-6 text-copy">
                {!isRecovery && <button type="button" onClick={() => switchMethod('recovery')} className="min-h-11 font-bold text-brand-blue hover:text-brand-blue-hover">Use a recovery code</button>}
                <p className={isRecovery ? '' : 'mt-2'}>If no recovery code is available, contact the System Administrator through the official support channel. Identity verification is required before an authenticator reset.</p>
              </div>
            </details>
          </>
        )}

        <p className="mt-7 border-t border-line pt-5 text-sm leading-6 text-muted-copy">Never share authentication or recovery codes with anyone.</p>
      </section>
    </AuthShell>
  )
}

export default TotpVerificationPage
