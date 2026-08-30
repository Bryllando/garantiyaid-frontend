import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import AuthShell from '../components/auth/AuthShell.jsx'
import { InputOTP, InputOTPGroup, InputOTPSlot, REGEXP_ONLY_DIGITS } from '../components/ui/input-otp.jsx'
import { useMotionEntry } from '../components/ui/use-motion-entry.js'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { confirmTotpSetup, getAuthErrorMessage, requestTotpSetup, storeStaffSession } from '../auth/staffAuth.js'

function recoveryCodeDocument(codes) {
  return [
    'GARANTIYAID STAFF RECOVERY CODES',
    'Keep these codes private and offline. Each code can be used once.',
    '',
    ...codes,
    '',
    `Generated ${new Date().toLocaleString()}`,
  ].join('\n')
}

function TotpSetupPage({ onAuthenticated, onBackToLogin }) {
  const token = sessionStorage.getItem('garantiyaid.totpSetupToken')
  const [setup, setSetup] = useState(null)
  const [confirmedData, setConfirmedData] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [codesSaved, setCodesSaved] = useState(false)
  const [feedback, setFeedback] = useState('')
  const currentStep = confirmedData ? 3 : setup ? 2 : 1
  const panelRef = useMotionEntry(currentStep)

  useEffect(() => {
    if (!confirmedData || codesSaved) return undefined
    const protectUnsavedCodes = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectUnsavedCodes)
    return () => window.removeEventListener('beforeunload', protectUnsavedCodes)
  }, [confirmedData, codesSaved])

  async function startSetup() {
    setError('')
    setIsLoading(true)

    try {
      setSetup(await requestTotpSetup(token))
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleConfirm(event) {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const data = await confirmTotpSetup(token, code)
      sessionStorage.removeItem('garantiyaid.totpSetupToken')
      setCode('')
      setConfirmedData(data)
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }

  async function copyText(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value)
      setFeedback(successMessage)
    } catch {
      setFeedback('Copy is unavailable in this browser. Select the text and copy it manually.')
    }
  }

  function downloadRecoveryCodes() {
    const blob = new Blob([recoveryCodeDocument(confirmedData.recoveryCodes)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'garantiyaid-recovery-codes.txt'
    anchor.click()
    URL.revokeObjectURL(url)
    setFeedback('Recovery codes downloaded.')
  }

  function continueAfterRecoveryCodes() {
    storeStaffSession(confirmedData)
    onAuthenticated(confirmedData.user)
  }

  return (
    <AuthShell navigationLabel="Authenticator setup navigation">
      <section className="w-full max-w-3xl" aria-labelledby="setup-title">
        {!token && !confirmedData ? (
          <div className="text-center">
            <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft font-bold text-brand-amber">!</span>
            <h1 id="setup-title" className="mt-5 text-2xl font-bold text-ink">Setup session expired</h1>
            <p className="mt-3 text-base leading-7 text-muted-copy">Sign in again to receive a new authenticator setup session.</p>
            <button type="button" onClick={onBackToLogin} className="ga-btn-primary mt-6">Back to Staff Login</button>
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className="ga-eyebrow">Account protection · Steps 2–3 of 3</p>
              <h1 id="setup-title" className="mt-3 text-3xl font-bold tracking-tight text-ink">Protect your staff account</h1>
              <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-muted-copy">Connect an authenticator, verify one six-digit code, and save your emergency recovery codes.</p>
            </div>

            <ol className="mx-auto mt-7 grid max-w-2xl grid-cols-3 gap-2" aria-label={`Authenticator setup step ${currentStep} of 3`}>
              {['Password verified', 'Authenticator', 'Recovery codes'].map((label, index) => {
                const stepNumber = index + 1
                const isCurrent = stepNumber === currentStep
                const isPast = stepNumber < currentStep
                return (
                  <li key={label} className="text-center" aria-current={isCurrent ? 'step' : undefined}>
                    <span className={`mx-auto grid size-8 place-items-center rounded-full text-xs font-extrabold ${isPast ? 'bg-brand-green text-white' : isCurrent ? 'bg-brand-blue text-white' : 'bg-slate-100 text-muted-copy'}`} aria-hidden="true">
                      {isPast ? '✓' : stepNumber}
                    </span>
                    <span className={`mt-2 block text-xs font-bold ${isCurrent ? 'text-ink' : 'text-muted-copy'}`}>{label}</span>
                  </li>
                )
              })}
            </ol>

            <div ref={panelRef} className="mt-8">
              {confirmedData ? (
                <div aria-live="polite">
                  <div className="rounded-2xl border border-emerald-200 bg-success-soft p-5 text-center">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-green">Authenticator connected</p>
                    <h2 className="mt-2 text-2xl font-bold text-ink">Save your recovery codes</h2>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-copy">These replace the authenticator code only when your phone is unavailable. Each code works once and will not be shown again.</p>
                  </div>

                  <div data-recovery-print className="mt-5 rounded-2xl border border-amber-200 bg-warning-soft p-4 sm:p-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-bold text-brand-amber">Private, one-time recovery codes</p>
                        <p className="mt-1 text-sm leading-6 text-copy">Store offline, away from your password and work device.</p>
                      </div>
                      <span className="w-fit rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-bold text-brand-amber">8 codes</span>
                    </div>

                    <div className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Recovery codes">
                      {confirmedData.recoveryCodes.map((recoveryCode, index) => (
                        <code key={recoveryCode} className="flex min-h-12 items-center justify-center rounded-lg border border-amber-200 bg-white px-3 py-2 text-center text-sm font-bold tracking-[0.08em] text-ink">
                          <span className="sr-only">Recovery code {index + 1}: </span>{recoveryCode}
                        </code>
                      ))}
                    </div>

                    <div data-recovery-actions className="mt-5 grid gap-2 sm:grid-cols-3">
                      <button type="button" onClick={() => copyText(recoveryCodeDocument(confirmedData.recoveryCodes), 'All recovery codes copied.')} className="ga-btn-secondary min-h-11 px-3 text-sm">Copy all</button>
                      <button type="button" onClick={downloadRecoveryCodes} className="ga-btn-secondary min-h-11 px-3 text-sm">Download .txt</button>
                      <button type="button" onClick={() => window.print()} className="ga-btn-secondary min-h-11 px-3 text-sm">Print / Save PDF</button>
                    </div>
                    <p aria-live="polite" className="mt-3 min-h-6 text-center text-sm font-semibold text-brand-green">{feedback}</p>
                  </div>

                  <label className="mt-5 flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-4 text-sm leading-6 text-copy transition-colors hover:border-blue-200 hover:bg-info-soft">
                    <input type="checkbox" checked={codesSaved} onChange={(event) => setCodesSaved(event.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-blue" />
                    <span><strong className="text-ink">I saved these recovery codes securely.</strong><span className="mt-1 block text-muted-copy">I understand they cannot be displayed again after leaving this page.</span></span>
                  </label>
                  <button type="button" disabled={!codesSaved} onClick={continueAfterRecoveryCodes} className="ga-btn-primary mt-5 w-full">Continue to dashboard</button>
                </div>
              ) : !setup ? (
                <div className="mx-auto max-w-xl rounded-2xl border border-blue-200 bg-info-soft p-5 sm:p-6">
                  <p className="ga-eyebrow">Authenticator setup</p>
                  <h2 className="mt-2 text-xl font-bold text-ink">Have your phone ready</h2>
                  <p className="mt-2 text-sm leading-6 text-copy">Use Google Authenticator, Microsoft Authenticator, 1Password, or another app that supports TOTP.</p>
                  <ol className="mt-5 space-y-3 text-sm leading-6 text-copy">
                    <li><strong className="text-ink">1.</strong> Open the authenticator app.</li>
                    <li><strong className="text-ink">2.</strong> Choose the option to scan a QR code.</li>
                    <li><strong className="text-ink">3.</strong> Return here to enter the six-digit code.</li>
                  </ol>
                  {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm text-brand-red">{error}</p>}
                  <button type="button" onClick={startSetup} disabled={isLoading} className="ga-btn-primary mt-5 w-full">
                    {isLoading ? <LoadingLabel>Preparing setup...</LoadingLabel> : 'Show my QR code'}
                  </button>
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                  <div className="rounded-2xl border border-blue-200 bg-info-soft p-5 text-center sm:p-6">
                    <p className="ga-eyebrow">Step 2A · Scan</p>
                    <h2 className="mt-2 text-xl font-bold text-ink">Scan this QR code</h2>
                    <p className="mt-2 text-sm leading-6 text-copy">Keep this screen private while connecting your authenticator.</p>
                    <div className="mx-auto mt-5 w-fit rounded-2xl border border-blue-200 bg-white p-2 shadow-sm">
                      <QRCodeSVG value={setup.otpauthUri} size={200} level="M" marginSize={4} title="GarantiyAid authenticator setup QR code" className="h-auto w-[min(12.5rem,65vw)]" />
                    </div>
                    <a href={setup.otpauthUri} className="ga-btn-secondary mt-4 w-full min-h-11 px-4 text-sm">Open authenticator app</a>
                    <details className="mt-4 rounded-xl border border-blue-200 bg-white p-4 text-left">
                      <summary className="min-h-11 py-2 text-sm font-bold text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Cannot scan the QR code?</summary>
                      <p className="mt-3 text-sm leading-6 text-copy">Enter this setup key manually. Treat it like a password.</p>
                      <code className="mt-3 block break-all rounded-lg border border-line bg-slate-50 p-3 text-center text-sm font-bold tracking-[0.08em] text-ink">{setup.secret}</code>
                      <button type="button" onClick={() => copyText(setup.secret, 'Setup key copied.')} className="mt-3 min-h-11 w-full rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft">Copy setup key</button>
                    </details>
                  </div>

                  <form onSubmit={handleConfirm} aria-busy={isLoading} className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
                    <p className="ga-eyebrow">Step 2B · Verify</p>
                    <h2 className="mt-2 text-xl font-bold text-ink">Enter the six-digit code</h2>
                    <p className="mt-2 text-sm leading-6 text-copy">This confirms that your authenticator was connected correctly.</p>
                    <label htmlFor="setup-code" className="mt-6 block text-sm font-bold text-ink">Authentication code</label>
                    <InputOTP
                      id="setup-code"
                      name="code"
                      maxLength={6}
                      pattern={REGEXP_ONLY_DIGITS}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      aria-describedby="setup-code-hint"
                      aria-invalid={Boolean(error)}
                      required
                      autoFocus
                      value={code}
                      onChange={(value) => { setCode(value); setError('') }}
                      containerClassName="mt-3 justify-start"
                    >
                      <InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} invalid={Boolean(error)} />)}</InputOTPGroup>
                    </InputOTP>
                    <p id="setup-code-hint" className="mt-3 text-sm leading-6 text-muted-copy">Type or paste the current code. It changes every 30 seconds.</p>
                    {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm text-brand-red">{error}</p>}
                    <button type="submit" disabled={isLoading || code.length !== 6} className="ga-btn-primary mt-5 w-full">
                      {isLoading ? <LoadingLabel>Confirming...</LoadingLabel> : 'Confirm and activate'}
                    </button>
                  </form>
                  <p aria-live="polite" className="sr-only">{feedback}</p>
                </div>
              )}
            </div>

            {!confirmedData && <button type="button" onClick={onBackToLogin} className="mt-7 min-h-11 w-full text-sm font-bold text-muted-copy hover:text-brand-blue">Cancel and return to Staff Login</button>}
          </>
        )}
      </section>
    </AuthShell>
  )
}

export default TotpSetupPage
