import { useId, useState } from 'react'
import { isMobileAuthenticatorDevice } from './authenticator-device.js'

export default function AuthenticatorSetupOptions({ uri, secret }) {
  const [attempted, setAttempted] = useState(false)
  const [feedback, setFeedback] = useState('')
  const hintId = useId()
  const mobile = isMobileAuthenticatorDevice(navigator)
  const canOpen = mobile && /^otpauth:\/\/totp\//i.test(uri || '')

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(secret)
      setFeedback('Setup key copied.')
    } catch {
      setFeedback('Copy is unavailable. Select and copy the setup key manually.')
    }
  }

  return (
    <div className="text-center">
      {canOpen && <>
        <a href={uri} onClick={() => setAttempted(true)} aria-describedby={hintId} className="ga-btn-secondary min-h-11 px-4 text-sm">Open authenticator app <span aria-hidden="true">↗</span></a>
        <p id={hintId} className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-copy">{attempted ? 'After adding the account, return here and enter its six-digit code.' : 'Opens a compatible app on this device. Your phone may ask which app to use.'}</p>
      </>}
      <details className="group mx-auto mt-2 max-w-sm text-left">
        <summary className="mx-auto flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue [&::-webkit-details-marker]:hidden">
          {attempted ? 'App didn’t open? Enter key manually' : 'Enter setup key manually'}
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </summary>
        <div className="mt-2 rounded-xl border border-blue-200 bg-info-soft p-4">
          <p className="text-sm leading-6 text-copy">In your authenticator, choose Add account, enter this key, and select Time based (TOTP). Keep the key private.</p>
          <code className="mt-3 block break-all rounded-lg border border-line bg-white p-3 text-center text-sm font-bold tracking-[0.08em] text-ink">{secret}</code>
          <button type="button" onClick={copyKey} className="ga-btn-secondary mt-3 min-h-11 w-full text-sm">Copy setup key</button>
          <p role="status" className="mt-2 text-xs leading-5 text-copy">{feedback}</p>
        </div>
      </details>
    </div>
  )
}
