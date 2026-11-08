import { useEffect, useState } from 'react'
import { closeDistribution, getAuthErrorMessage, isSessionExpiredError, requestClaimDisputes, requestDistributionClaims, requestDistributionReconciliation, requestDistributionSchedules } from '../../auth/staffAuth.js'
import { ConfirmationDialog } from '../ui/confirmation-dialog.jsx'
import { eventWorkRows } from '../../utils/eventOperations.js'
import { connectStaffRealtime } from '../../realtime/staffRealtime.js'
import { LoadingLabel } from '../ui/spinner.jsx'
import { Icon } from '../ui/icon.jsx'
import ReconciliationPanel from './ReconciliationPanel.jsx'

const time = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Manila' })

export default function EventOperationsReview({ distribution, token, onNavigate, onSessionExpired, onClosed }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [connected, setConnected] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState('')
  const id = distribution.distributionId
  useEffect(() => {
    let active = true
    Promise.all([
      requestDistributionSchedules(token, id, { page: 1, pageSize: 1 }),
      requestDistributionClaims(token, id, { page: 1, pageSize: 1 }),
      requestClaimDisputes(token, id, { page: 1, pageSize: 1 }),
      requestDistributionReconciliation(token, id),
    ]).then(([schedules, claims, disputes, result]) => {
      if (!active) return
      if (![schedules, claims, disputes].every((item) => item.summary?.countsByStatus) || !Array.isArray(result.reconciliation.exceptions)) throw new Error('The event review returned incomplete records. Refresh to try again.')
      setData({ schedules: schedules.summary.countsByStatus, claims: claims.summary.countsByStatus, disputes: disputes.summary.countsByStatus, reconciliation: result.reconciliation, checkedAt: new Date() })
      setError('')
    }).catch((issue) => { if (active) { if (isSessionExpiredError(issue)) return onSessionExpired(); setError(getAuthErrorMessage(issue)) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, onSessionExpired, reload, token])
  useEffect(() => {
    let active = true
    let timer
    const refresh = () => { if (active) setReload((value) => value + 1) }
    const disconnect = connectStaffRealtime(token, {
      onReady: () => { if (active) { setConnected(true); refresh() } },
      onUpdate: (_event, payload) => { if (payload?.distributionId === id) { clearTimeout(timer); timer = setTimeout(refresh, 400) } },
      onError: (issue) => { if (active) { setConnected(false); if (['AUTHENTICATION_REQUIRED', 'INVALID_TOKEN', 'INVALID_SESSION'].includes(issue?.data?.code)) onSessionExpired() } },
      onDisconnect: () => { if (active) setConnected(false) },
    })
    // shortcut: disputes publish no live event; poll until the API exposes one.
    const interval = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 60_000)
    return () => { active = false; clearTimeout(timer); clearInterval(interval); disconnect() }
  }, [id, onSessionExpired, token])
  const rows = data ? eventWorkRows(distribution, data.schedules, data.claims, data.disputes) : []
  const scope = `distribution=${encodeURIComponent(id)}`
  const ready = !loading && !error && data?.reconciliation.readyToClose && !['OPEN', 'UNDER_REVIEW', 'REFERRED'].some((status) => data.disputes[status] > 0)
  async function confirmClose(notes) {
    setCloseError('')
    try { onClosed(await closeDistribution(token, id, notes)) }
    catch (issue) {
      if (isSessionExpiredError(issue)) onSessionExpired()
      else { setCloseError(getAuthErrorMessage(issue)); setLoading(true); setReload((value) => value + 1) }
      throw issue
    }
  }
  return <div className="space-y-5" role="region" aria-label="Event operational review">
    <section className="overflow-hidden rounded-lg border border-line" aria-labelledby="event-work-heading">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-slate-50 p-4"><div><h3 id="event-work-heading" className="font-semibold text-ink">Work remaining</h3><p role="status" aria-atomic="true" className="mt-1 text-xs leading-5 text-muted-copy">{connected ? 'Live updates connected' : 'Automatic refresh every minute'}{data && ` · Checked ${time.format(data.checkedAt)} PHT`}</p></div><button type="button" disabled={loading} onClick={() => { setLoading(true); setReload((value) => value + 1) }} className="ga-btn-secondary min-h-11 text-sm">Refresh event review</button></header>
      {loading ? <p role="status" className="p-5 text-sm text-copy"><LoadingLabel>Checking queue, claims, and concerns...</LoadingLabel></p> : error ? <div role="alert" className="p-5"><p className="font-semibold text-ink">Event review unavailable</p><p className="mt-2 text-sm leading-6 text-copy">{error}</p><p className="mt-2 text-sm text-copy">Refresh the review to load current counts.</p></div> : <>
        <ul className="divide-y divide-line">{rows.map((row) => <li key={row.key}><a href={row.href} onClick={(event) => { event.preventDefault(); onNavigate(row.href) }} className="group grid min-h-20 grid-cols-[minmax(2.5rem,max-content)_minmax(0,1fr)_1rem] items-center gap-3 px-4 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-blue"><span className="text-right text-xl font-semibold tabular-nums text-ink">{row.count.toLocaleString('en-PH')}</span><div className="min-w-0"><p className="text-sm font-semibold text-ink group-hover:text-brand-blue">{row.label}</p><p className="mt-1 text-xs leading-5 text-muted-copy">{row.owner} · {row.detail}</p></div><Icon name="arrowRight" className="size-4 text-muted-copy" /></a></li>)}</ul>
        <div className="border-t border-line px-4 py-3"><a href={`/admin/schedules?${scope}`} onClick={(event) => { event.preventDefault(); onNavigate(`/admin/schedules?${scope}`) }} className="ga-admin-link">View all schedules ({Object.values(data.schedules).reduce((sum, count) => sum + count, 0)})</a><p className="text-xs leading-5 text-muted-copy">Includes checked-in and cancelled visits. Claim counts and attendance are separate records.</p></div>
      </>}
    </section>
    {!loading && !error && data && <ReconciliationPanel key={id} reconciliation={data.reconciliation} distributionId={id} token={token} onNavigate={onNavigate} onSessionExpired={onSessionExpired} />}
    {onClosed && distribution.status === 'OPEN' && <section className="border-t border-line pt-4" aria-labelledby="event-closure-heading"><h3 id="event-closure-heading" className="font-semibold text-ink">Close this event</h3><p id="event-closure-help" className="mt-2 text-sm leading-6 text-copy">{ready ? `${data.reconciliation.unvisitedScheduleCount ?? 0} unvisited appointments with ended time slots will be marked missed. Closing stops further verification and release; the original records stay available.` : 'Resolve the reconciliation findings and active disputes, then refresh event review. Future visits and unfinished claims prevent closure.'}</p><button type="button" disabled={!ready} aria-describedby="event-closure-help" onClick={() => { setCloseError(''); setClosing(true) }} className="ga-btn-primary mt-3">Close distribution event</button></section>}
    {closing && <ConfirmationDialog open title="Close this distribution event?" description={`${distribution.deliveryMode === 'PHYSICAL_GOODS' ? 'Compare package quantities with the signed release log and include the closing-sheet reference in your note. ' : ''}Confirm that event operations have ended and the records have been reviewed. Ended, unvisited appointments become missed; unused QR credentials are revoked. This event cannot reopen.`} actionLabel="Close event" reasonLabel="Closure note" error={closeError} confirmDisabled={!ready} onCancel={() => setClosing(false)} onConfirm={confirmClose} />}
    <nav aria-label="Continue event review" className="border-t border-line pt-4"><p className="text-sm leading-6 text-copy">Review beneficiary concerns alongside reconciliation, then prepare a report for this event.</p><div className="mt-2 flex flex-wrap gap-x-5">{[
      ['Review beneficiary concerns', `/claim-accountability?${scope}&view=disputes`],
      ['Review event ledger', `/dswd/ledger?${scope}`],
      ['Prepare event report', `/reports?${scope}`],
    ].map(([label, href]) => <a key={href} href={href} onClick={(event) => { event.preventDefault(); onNavigate(href) }} className="ga-admin-link">{label}</a>)}</div></nav>
  </div>
}
