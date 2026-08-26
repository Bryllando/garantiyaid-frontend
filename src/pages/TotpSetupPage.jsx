import { useState } from 'react'
import AuthShell from '../components/auth/AuthShell.jsx'
import { InputOTP, InputOTPGroup, InputOTPSlot, REGEXP_ONLY_DIGITS } from '../components/ui/input-otp.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { confirmTotpSetup, getAuthErrorMessage, requestTotpSetup, storeStaffSession } from '../auth/staffAuth.js'

function TotpSetupPage({ onAuthenticated, onBackToLogin }) {
  const token = sessionStorage.getItem('garantiyaid.totpSetupToken')
  const [setup, setSetup] = useState(null)
  const [confirmedData, setConfirmedData] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [codesSaved, setCodesSaved] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const currentStep = confirmedData ? 3 : setup ? 2 : 1

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
      storeStaffSession(data)
      sessionStorage.removeItem('garantiyaid.totpSetupToken')
      setCode('')
      setConfirmedData(data)
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }

  function continueAfterRecoveryCodes() {
    setIsComplete(true)
    onAuthenticated(confirmedData.user)
  }

  return (
    <AuthShell navigationLabel="Authenticator setup navigation">
      <section className="w-full max-w-2xl" aria-labelledby="setup-title">
        {isComplete ? (
          <div className="text-center" aria-live="polite">
            <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-xl font-bold text-brand-green">&#10003;</span>
            <h1 id="setup-title" className="mt-5 text-2xl font-bold text-ink">Authenticator connected</h1>
            <p className="mt-3 text-base leading-7 text-muted-copy">TOTP verification is active and your secure staff session is ready.</p>
          </div>
        ) : confirmedData ? (
          <div aria-live="polite">
            <div className="text-center">
              <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-xl font-bold text-brand-green">&#10003;</span>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-brand-green">Authenticator connected</p>
              <h1 id="setup-title" className="mt-3 text-3xl font-bold tracking-tight text-ink">Save your recovery codes</h1>
              <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-muted-copy">These one-time codes can sign you in if your phone is unavailable. They will not be shown again.</p>
            </div>

            <div className="mt-7 rounded-xl border border-amber-200 bg-warning-soft p-5">
              <p className="text-sm font-bold text-brand-amber">Keep these codes private and offline.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {confirmedData.recoveryCodes.map((recoveryCode) => (
                  <code key={recoveryCode} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-center text-sm font-bold tracking-[0.08em] text-ink">{recoveryCode}</code>
                ))}
              </div>
              <button type="button" onClick={() => window.print()} className="ga-btn-secondary mt-4 w-full border-amber-300 text-brand-amber hover:bg-white">Print or save as PDF</button>
            </div>

            <label className="mt-5 flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-line p-4 text-sm leading-6 text-copy">
              <input type="checkbox" checked={codesSaved} onChange={(event) => setCodesSaved(event.target.checked)} className="mt-1 size-4 accent-brand-blue" />
              <span>I saved these recovery codes in a secure place.</span>
            </label>
            <button
              type="button"
              disabled={!codesSaved}
              onClick={continueAfterRecoveryCodes}
              className="ga-btn-primary mt-5 w-full"
            >
              Continue securely
            </button>
          </div>
        ) : !token ? (
          <div className="text-center">
            <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft font-bold text-brand-amber">!</span>
            <h1 id="setup-title" className="mt-5 text-2xl font-bold text-ink">Setup session expired</h1>
            <p className="mt-3 text-base leading-7 text-muted-copy">Sign in again to receive a new authenticator setup session.</p>
            <button type="button" onClick={onBackToLogin} className="ga-btn-primary mt-6">Back to Staff Login</button>
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-blue">Required account protection</p>
              <h1 id="setup-title" className="mt-3 text-3xl font-bold tracking-tight text-ink">Set up your authenticator</h1>
              <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-muted-copy">Connect an authenticator app, confirm its code, then save your recovery codes.</p>
            </div>

            <ol className="mt-7 grid grid-cols-3 gap-2" aria-label={`Authenticator setup step ${currentStep} of 3`}>
              {['Connect app', 'Verify code', 'Save recovery'].map((label, index) => {
                const stepNumber = index + 1
                const isCurrent = stepNumber === currentStep
                const isPast = stepNumber < currentStep
                return (
                  <li key={label} className="text-center">
                    <span className={`mx-auto grid size-8 place-items-center rounded-full text-xs font-extrabold ${isPast ? 'bg-brand-green text-white' : isCurrent ? 'bg-brand-blue text-white' : 'bg-slate-100 text-muted-copy'}`} aria-hidden="true">
                      {isPast ? '\u2713' : stepNumber}
                    </span>
                    <span className={`mt-2 block text-xs font-bold ${isCurrent ? 'text-ink' : 'text-muted-copy'}`}>{label}</span>
                  </li>
                )
              })}
            </ol>

            {!setup ? (
              <div className="mt-8 rounded-xl border border-blue-200 bg-info-soft p-5">
                <h2 className="font-bold text-ink">Before you begin</h2>
                <p className="mt-2 text-sm leading-6 text-copy">Use an authenticator app such as Google Authenticator, Microsoft Authenticator, or 1Password.</p>
                {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm text-brand-red">{error}</p>}
                <button
                  type="button"
                  onClick={startSetup}
                  disabled={isLoading}
                  className="ga-btn-primary mt-5 w-full"
                >
                  {isLoading ? <LoadingLabel>Preparing setup...</LoadingLabel> : 'Start authenticator setup'}
                </button>
              </div>
            ) : (
              <div className="mt-8 grid gap-7 md:grid-cols-[1fr_1.15fr]">
                <div className="space-y-4">
                  <div className="rounded-xl border border-blue-200 bg-info-soft p-5">
                    <p className="ga-eyebrow">Step 1</p>
                    <h2 className="mt-2 font-bold text-ink">Add GarantiyAid</h2>
                    <p className="mt-2 text-sm leading-6 text-copy">Open your authenticator app using the button below, or enter the setup key manually.</p>
                    <a href={setup.otpauthUri} className="ga-btn-primary mt-4 min-h-11 px-4 text-sm">Open authenticator app</a>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-copy">Manual setup key</p>
                    <code className="mt-2 block break-all rounded-lg border border-line bg-slate-50 p-3 text-sm font-bold tracking-[0.08em] text-ink">{setup.secret}</code>
                    <p className="mt-2 text-sm leading-6 text-muted-copy">Keep this key private. Anyone with it can generate your codes.</p>
                  </div>
                </div>

                <form onSubmit={handleConfirm} aria-busy={isLoading}>
                  <p className="ga-eyebrow">Step 2</p>
                  <h2 className="mt-2 font-bold text-ink">Confirm your code</h2>
                  <p className="mt-2 text-sm leading-6 text-copy">Enter the current six-digit code shown in your authenticator app.</p>
                  <label htmlFor="setup-code" className="mt-5 block text-sm font-bold text-ink">Authentication code</label>
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
                    onChange={(value) => {
                      setCode(value)
                      setError('')
                    }}
                    containerClassName="mt-3 justify-start"
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} invalid={Boolean(error)} />)}
                    </InputOTPGroup>
                  </InputOTP>
                  <p id="setup-code-hint" className="mt-3 text-sm leading-6 text-muted-copy">Type or paste the current code from your authenticator app.</p>
                  {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm text-brand-red">{error}</p>}
                  <button
                    type="submit"
                    disabled={isLoading || code.length !== 6}
                    className="mt-5 inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-lg bg-brand-green px-5 text-base font-bold text-white shadow-sm hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLoading ? <LoadingLabel>Confirming...</LoadingLabel> : 'Confirm and activate'}
                  </button>
                </form>
              </div>
            )}

            <button type="button" onClick={onBackToLogin} className="mt-7 min-h-11 w-full text-sm font-bold text-muted-copy hover:text-brand-blue">Cancel and return to Staff Login</button>
          </>
        )}
      </section>
    </AuthShell>
  )
}

export default TotpSetupPage
