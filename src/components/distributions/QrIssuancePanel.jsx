import { useEffect, useState } from 'react'
import { generateDistributionQrTokens, getAuthErrorMessage, isSessionExpiredError, requestDistributionQrTokens, requestQrEligibleSchedules } from '../../auth/staffAuth.js'
import { Icon } from '../ui/icon.jsx'
import { SkeletonRows } from '../ui/skeleton.jsx'
import QrCredentialIssuance from './QrCredentialIssuance.jsx'
import QrCredentialsDialog from './QrCredentialsDialog.jsx'

export default function QrIssuancePanel({ distribution, accessToken, onSessionExpired, claimId, onBusyChange }) {
  const [open, setOpen] = useState(false)
  const [reload, setReload] = useState(0)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState('')
  const [rawTokens, setRawTokens] = useState(null)
  const loadKey = [accessToken, distribution.distributionId, reload, claimId].join(':')
  const loading = result?.key !== loadKey
  const data = result?.data
  const error = !loading && result?.error
  useEffect(() => {
    if (!open) return undefined
    let active = true
    Promise.all([requestDistributionQrTokens(accessToken, distribution.distributionId), requestQrEligibleSchedules(accessToken, distribution.distributionId)])
      .then(([tokens, eligible]) => { if (active) setResult({ key: loadKey, data: { tokens, eligible } }) })
      .catch(issue => { if (active) { if (isSessionExpiredError(issue)) onSessionExpired(); setResult({ key: loadKey, error: getAuthErrorMessage(issue) }) } })
    return () => { active = false }
  }, [accessToken, distribution.distributionId, loadKey, onSessionExpired, open])

  async function generate() {
    setBusy('qr')
    onBusyChange(true)
    try {
      const result = await generateDistributionQrTokens(accessToken, distribution.distributionId)
      setRawTokens(result.qrTokens)
      setReload(value => value + 1)
    } finally { setBusy(''); onBusyChange(false) }
  }

  return <>
    <details onToggle={event => setOpen(event.currentTarget.open)} className="ga-disclosure mt-5">
      <summary><span className="flex items-center gap-3"><Icon name="qr" className="size-5 shrink-0 text-brand-blue" />Issue beneficiary QR cards</span><Icon name="chevronDown" className="size-4 shrink-0" /></summary>
      <div className="space-y-4 border-t border-line p-4 sm:p-5">
        <p className="text-sm leading-6 text-copy">Generate cards for this event’s eligible appointments, then save or print them for the beneficiaries. Issuing a card does not verify identity or record assistance as released.</p>
        {error ? <div role="alert" className="rounded-lg border border-red-200 bg-danger-soft p-4 text-sm text-brand-red"><p>{error}</p><button type="button" onClick={() => setReload(value => value + 1)} className="ga-btn-secondary mt-3 text-sm">Refresh QR availability</button></div> : data ? <QrCredentialIssuance distribution={distribution} accessToken={accessToken} data={data.tokens} readyCount={data.eligible.summary.qrEligibleScheduleCount} eligibility={data.eligible.summary} busy={busy || (loading ? 'loading' : '')} onGenerate={generate} onSessionExpired={onSessionExpired} /> : <SkeletonRows label="Loading QR availability" rows={2} />}
      </div>
    </details>
    {rawTokens && <QrCredentialsDialog distribution={distribution} tokens={rawTokens} onClose={() => setRawTokens(null)} />}
  </>
}
