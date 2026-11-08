import { useEffect, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestNotificationSummary } from '../../auth/staffAuth.js'
import { LoadingLabel } from '../ui/spinner.jsx'

export default function EventOperationsStatus({ distribution, qrRemaining, token, onNavigate, onSessionExpired }) {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    requestNotificationSummary(token, { distributionId: distribution.distributionId, channel: 'SMS' })
      .then((result) => { if (active) setSummary(result) })
      .catch((issue) => { if (active) { if (isSessionExpiredError(issue)) onSessionExpired(); else setError(getAuthErrorMessage(issue)) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [distribution.distributionId, onSessionExpired, reload, token])
  const qrRequired = ['QR', 'QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC'].includes(distribution.verificationRequirement)
  const href = `/notifications?distribution=${encodeURIComponent(distribution.distributionId)}`
  const pushHref = `${href}&channel=push`
  return <section aria-labelledby="event-operations-status" className="overflow-hidden rounded-lg border border-line">
    <div className="border-b border-line bg-slate-50 px-4 py-3"><h4 id="event-operations-status" className="text-sm font-bold">Opening, credentials, and notices</h4><p className="mt-1 text-xs leading-5 text-muted-copy">Opening the event does not issue QR credentials or send messages.</p></div>
    <dl className="divide-y divide-line text-sm">
      <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr]"><dt className="text-muted-copy">Event</dt><dd><strong className="font-semibold">Open for operations</strong><p className="mt-1 text-copy">Sessions and assignments are locked.</p></dd></div>
      <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr]"><dt className="text-muted-copy">QR credentials</dt><dd><strong className="font-semibold">{!qrRequired ? 'Not required' : qrRemaining > 0 ? `${qrRemaining} ready to generate` : 'No schedules waiting for generation'}</strong><p className="mt-1 text-copy">{qrRequired ? 'Issuance does not confirm that the beneficiary received the credential.' : 'Barangay staff complete the configured face and signature checks.'}</p>{qrRequired && qrRemaining > 0 && <a href="#event-qr-credentials" className="ga-admin-link">Go to credential issuance</a>}</dd></div>
      <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr]"><dt className="text-muted-copy">SMS notices</dt><dd>{loading ? <span role="status"><LoadingLabel>Checking notice records...</LoadingLabel></span> : error ? <div role="alert"><p className="font-semibold">Notice status unavailable</p><p className="mt-1 text-copy">{error}</p></div> : <><strong className="font-semibold">{summary.total === 0 ? 'No SMS notice records' : `${summary.byStatus.SENT ?? 0} sent · ${summary.byStatus.PENDING ?? 0} queued · ${summary.byStatus.FAILED ?? 0} failed`}</strong><p className="mt-1 text-copy">Simulated messages only. Counts are message records, not confirmed recipients.</p></>}<div className="mt-1 flex flex-wrap gap-x-4"><a href={href} onClick={(event) => { event.preventDefault(); onNavigate(href) }} className="ga-admin-link">Review schedule notices</a><button type="button" disabled={loading} onClick={() => { setLoading(true); setError(''); setSummary(null); setReload((value) => value + 1) }} className="ga-admin-link">Refresh notices</button></div></dd></div>
      <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr]"><dt className="text-muted-copy">Push notices</dt><dd><strong className="font-semibold">Draft preparation available</strong><p className="mt-1 text-copy">Review recipients and prepare a notice. App delivery is not available yet.</p><a href={pushHref} onClick={(event) => { event.preventDefault(); onNavigate(pushHref) }} className="ga-admin-link">Prepare push notification</a></dd></div>
    </dl>
  </section>
}
