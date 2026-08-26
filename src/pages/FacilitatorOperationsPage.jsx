import { useEffect, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import {
  getAuthErrorMessage,
  isSessionExpiredError,
  requestDistributionQueue,
  requestOpenDistributions,
  verifyDistributionQrClaim,
} from '../auth/staffAuth.js'

const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const timeFormatter = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
const queueStatuses = ['', 'SCHEDULED', 'CHECKED_IN', 'MISSED', 'CANCELLED']

const statusStyles = {
  SCHEDULED: 'border-amber-200 bg-warning-soft text-brand-amber',
  CHECKED_IN: 'border-emerald-200 bg-success-soft text-brand-green',
  MISSED: 'border-line bg-slate-100 text-copy',
  CANCELLED: 'border-line bg-slate-100 text-muted-copy',
}

function beneficiaryName(beneficiary) {
  return [beneficiary?.firstName, beneficiary?.middleName, beneficiary?.lastName].filter(Boolean).join(' ')
}

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[status] ?? statusStyles.CANCELLED}`}>{status.replace('_', ' ')}</span>
}

function DistributionSelector({ distributions, selectedId, onChange }) {
  return (
    <div>
      <label htmlFor="distribution-event" className="block text-sm font-bold text-ink">Distribution event</label>
      <select
        id="distribution-event"
        value={selectedId}
        onChange={(event) => onChange(event.target.value)}
        className="ga-input mt-2 cursor-pointer font-semibold"
      >
        {distributions.map((distribution) => (
          <option key={distribution.distributionId} value={distribution.distributionId}>
            {distribution.title} · {dateFormatter.format(new Date(distribution.distributionDate))}
          </option>
        ))}
      </select>
    </div>
  )
}

function QueueSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading beneficiary queue" aria-busy="true">
      <span className="sr-only">Loading beneficiary queue…</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-lg border border-line p-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-48 max-w-full" /><Skeleton className="h-3 w-64 max-w-full" /></div>
          <Skeleton className="hidden h-8 w-24 sm:block" />
        </div>
      ))}
    </div>
  )
}

function AccessDenied({ session, onLogout, onNavigate }) {
  return (
    <DashboardShell breadcrumbs={['Operations', 'Facilitator access']} currentPath={window.location.pathname} onLogout={onLogout} onNavigate={onNavigate} pageTitle="Facilitator operations" user={session.user}>
      <section className="ga-card mx-auto max-w-lg p-7 text-center">
        <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft font-black text-brand-amber">!</span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">Barangay Facilitator access required</h1>
        <p className="mt-3 text-sm leading-6 text-muted-copy">Queue operations and QR claim verification are limited to assigned Barangay Facilitators.</p>
        <button type="button" onClick={() => onNavigate('/dashboard')} className="ga-btn-primary mt-6">Return to dashboard</button>
      </section>
    </DashboardShell>
  )
}

function FacilitatorOperationsPage({ view, session, onLogout, onNavigate, onSessionExpired }) {
  const [distributions, setDistributions] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [distributionError, setDistributionError] = useState('')
  const [isLoadingDistributions, setIsLoadingDistributions] = useState(true)
  const [distributionReload, setDistributionReload] = useState(0)

  const [queue, setQueue] = useState(null)
  const [queueError, setQueueError] = useState('')
  const [isLoadingQueue, setIsLoadingQueue] = useState(view === 'queue')
  const [queueReload, setQueueReload] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const [qrToken, setQrToken] = useState('')
  const [verificationError, setVerificationError] = useState(null)
  const [verificationResult, setVerificationResult] = useState(null)
  const [pendingAttempt, setPendingAttempt] = useState(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const isFacilitator = session.user.role === 'BARANGAY_FACILITATOR'
  const selectedDistribution = distributions.find((distribution) => distribution.distributionId === selectedId)
  const currentPath = view === 'queue' ? '/facilitator/queue' : '/facilitator/qr-verification'
  const pageTitle = view === 'queue' ? 'Queue & schedules' : 'QR claim verification'

  useEffect(() => {
    let active = true
    requestOpenDistributions(session.accessToken)
      .then((items) => {
        if (!active) return
        setDistributions(items)
        setSelectedId((current) => current || items[0]?.distributionId || '')
        if (items.length === 0) setIsLoadingQueue(false)
      })
      .catch((error) => {
        if (!active) return
        if (isSessionExpiredError(error)) return onSessionExpired()
        setDistributionError(getAuthErrorMessage(error))
      })
      .finally(() => { if (active) setIsLoadingDistributions(false) })
    return () => { active = false }
  }, [distributionReload, onSessionExpired, session.accessToken])

  useEffect(() => {
    if (view !== 'queue' || !selectedId) return undefined
    let active = true
    requestDistributionQueue(session.accessToken, selectedId, { page, search, status })
      .then((data) => { if (active) setQueue(data) })
      .catch((error) => {
        if (!active) return
        if (isSessionExpiredError(error)) return onSessionExpired()
        setQueueError(getAuthErrorMessage(error))
      })
      .finally(() => { if (active) setIsLoadingQueue(false) })
    return () => { active = false }
  }, [onSessionExpired, page, queueReload, search, selectedId, session.accessToken, status, view])

  function selectDistribution(distributionId) {
    setSelectedId(distributionId)
    setQueue(null)
    setQueueError('')
    setPage(1)
    setIsLoadingQueue(view === 'queue')
    setQrToken('')
    setVerificationError(null)
    setVerificationResult(null)
    setPendingAttempt(null)
  }

  function filterQueue(event) {
    event.preventDefault()
    setQueueError('')
    setPage(1)
    setIsLoadingQueue(true)
    setSearch(searchInput.trim())
    setQueueReload((count) => count + 1)
  }

  function changeQueueStatus(nextStatus) {
    setStatus(nextStatus)
    setPage(1)
    setQueueError('')
    setIsLoadingQueue(true)
  }

  async function verifyQr(event) {
    event.preventDefault()
    const submittedToken = qrToken.trim()
    setVerificationResult(null)

    if (!submittedToken) {
      setVerificationError({ message: 'Scan or enter a QR claim token before verification.', code: 'TOKEN_REQUIRED' })
      return
    }

    const reusableAttempt = pendingAttempt?.distributionId === selectedId && pendingAttempt.qrToken === submittedToken
    const idempotencyKey = reusableAttempt ? pendingAttempt.idempotencyKey : crypto.randomUUID()
    setPendingAttempt({ distributionId: selectedId, qrToken: submittedToken, idempotencyKey })
    setVerificationError(null)
    setIsVerifying(true)

    try {
      const result = await verifyDistributionQrClaim(session.accessToken, selectedId, submittedToken, idempotencyKey)
      setVerificationResult(result)
      setPendingAttempt(null)
      setQrToken('')
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      setVerificationError({ message: getAuthErrorMessage(error), code: error.code })
      if (!(error instanceof TypeError) && error.code !== 'QR_CLAIM_CONCURRENT_CHANGE') setPendingAttempt(null)
    } finally {
      setIsVerifying(false)
    }
  }

  if (!isFacilitator) return <AccessDenied session={session} onLogout={onLogout} onNavigate={onNavigate} />

  return (
    <DashboardShell breadcrumbs={['Operations', 'Barangay Facilitator', pageTitle]} currentPath={currentPath} onLogout={onLogout} onNavigate={onNavigate} pageTitle={pageTitle} user={session.user}>
      <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="ga-eyebrow">Assigned barangay operations</p>
          <h1 className="ga-page-title mt-2">{pageTitle}</h1>
          <p className="ga-page-copy">
            {view === 'queue' ? 'Track scheduled beneficiaries and current check-in status for an open distribution event.' : 'Validate a single-use claim token against the selected open distribution event.'}
          </p>
        </div>
        <button type="button" onClick={() => onNavigate(view === 'queue' ? '/facilitator/qr-verification' : '/facilitator/queue')} className="ga-btn-primary shrink-0">
          {view === 'queue' ? 'Open QR verification' : 'View beneficiary queue'}
        </button>
      </header>

      {isLoadingDistributions ? (
        <div className="ga-card mt-7 p-6"><Skeleton className="h-4 w-40" /><Skeleton className="mt-3 h-12 w-full" /></div>
      ) : distributionError ? (
        <section className="mt-7 rounded-xl border border-amber-200 bg-white p-6" role="alert">
          <h2 className="font-extrabold text-ink">Unable to load distribution events</h2>
          <p className="mt-2 text-sm leading-6 text-muted-copy">{distributionError}</p>
          <button type="button" onClick={() => { setDistributionError(''); setIsLoadingDistributions(true); setDistributionReload((count) => count + 1) }} className="ga-btn-primary mt-4">Try again</button>
        </section>
      ) : distributions.length === 0 ? (
        <section className="mt-7 rounded-xl border border-dashed border-line bg-white p-8 text-center" aria-labelledby="no-distributions-title">
          <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span>
          <h2 id="no-distributions-title" className="mt-4 text-xl font-extrabold text-ink">No open distribution event</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-copy">Queue viewing and QR claim verification become available when an authorized distribution event for your assigned barangay is open.</p>
        </section>
      ) : (
        <>
          <section className="ga-card mt-7 grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)] md:items-end sm:p-6" aria-label="Selected distribution event">
            <DistributionSelector distributions={distributions} selectedId={selectedId} onChange={selectDistribution} />
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
              <div><dt className="text-xs font-semibold text-muted-copy">Location</dt><dd className="mt-1 font-bold text-ink">{selectedDistribution?.location}</dd></div>
              <div><dt className="text-xs font-semibold text-muted-copy">Event time</dt><dd className="mt-1 font-bold text-ink">{selectedDistribution?.startTime}–{selectedDistribution?.endTime}</dd></div>
            </dl>
          </section>

          {view === 'queue' ? (
            <QueueView
              queue={queue}
              queueError={queueError}
              isLoading={isLoadingQueue}
              page={page}
              searchInput={searchInput}
              setSearchInput={setSearchInput}
              status={status}
              onFilter={filterQueue}
              onStatusChange={changeQueueStatus}
              onPageChange={(nextPage) => { setPage(nextPage); setIsLoadingQueue(true) }}
              onRetry={() => { setQueueError(''); setIsLoadingQueue(true); setQueueReload((count) => count + 1) }}
            />
          ) : (
            <QrVerificationView
              distribution={selectedDistribution}
              qrToken={qrToken}
              setQrToken={(value) => { setQrToken(value); setVerificationError(null); setVerificationResult(null); if (pendingAttempt?.qrToken !== value.trim()) setPendingAttempt(null) }}
              error={verificationError}
              result={verificationResult}
              isVerifying={isVerifying}
              onSubmit={verifyQr}
            />
          )}
        </>
      )}
    </DashboardShell>
  )
}

function QueueView({ queue, queueError, isLoading, page, searchInput, setSearchInput, status, onFilter, onStatusChange, onPageChange, onRetry }) {
  const counts = queue?.summary.countsByStatus ?? {}
  return (
    <section className="mt-6" aria-labelledby="queue-heading">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Scheduled', counts.SCHEDULED ?? 0, 'pending'],
          ['Checked in', counts.CHECKED_IN ?? 0, 'success'],
          ['Missed', counts.MISSED ?? 0, 'neutral'],
          ['Cancelled', counts.CANCELLED ?? 0, 'neutral'],
        ].map(([label, value, tone]) => (
          <article key={label} className="ga-card p-4">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-copy">{label}</p>
            <p className={`mt-2 text-3xl font-black ${tone === 'success' ? 'text-brand-green' : tone === 'pending' ? 'text-brand-amber' : 'text-ink'}`}>{value}</p>
          </article>
        ))}
      </div>

      <div className="ga-card mt-6 overflow-hidden">
        <div className="border-b border-line p-5 sm:p-6">
          <h2 id="queue-heading" className="text-xl font-extrabold text-ink">Beneficiary queue</h2>
          <form onSubmit={onFilter} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_auto]">
            <div><label htmlFor="queue-search" className="sr-only">Search beneficiary or queue number</label><input id="queue-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength="100" placeholder="Search name or queue number" className="ga-input" /></div>
            <div><label htmlFor="queue-status" className="sr-only">Filter by queue status</label><select id="queue-status" value={status} onChange={(event) => onStatusChange(event.target.value)} className="ga-input cursor-pointer font-semibold">{queueStatuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? value.replace('_', ' ') : 'All statuses'}</option>)}</select></div>
            <button type="submit" className="ga-btn-primary">Search</button>
          </form>
        </div>

        <div className="p-4 sm:p-6">
          {isLoading ? <QueueSkeleton /> : queueError ? (
            <div className="rounded-lg border border-amber-200 bg-warning-soft p-5" role="alert"><p className="font-bold text-ink">Unable to load the queue</p><p className="mt-2 text-sm text-muted-copy">{queueError}</p><button type="button" onClick={onRetry} className="ga-btn-primary mt-4">Try again</button></div>
          ) : queue?.schedules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-slate-50 p-8 text-center"><p className="font-extrabold text-ink">No queue entries found</p><p className="mt-2 text-sm text-muted-copy">Try a different name, queue number, or status filter.</p></div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Beneficiary distribution queue</caption>
                  <thead><tr className="border-b border-line text-xs uppercase tracking-[0.08em] text-muted-copy"><th scope="col" className="px-3 py-3">Queue</th><th scope="col" className="px-3 py-3">Beneficiary</th><th scope="col" className="px-3 py-3">Time slot</th><th scope="col" className="px-3 py-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-line">{queue.schedules.map((schedule) => <tr key={schedule.scheduleId}><td className="px-3 py-4 text-lg font-black text-brand-navy">#{schedule.queueNumber}</td><td className="px-3 py-4"><p className="font-bold text-ink">{beneficiaryName(schedule.beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">{schedule.beneficiary.barangay?.barangayName}</p></td><td className="px-3 py-4 text-copy">{timeFormatter.format(new Date(schedule.slot.slotStart))}–{timeFormatter.format(new Date(schedule.slot.slotEnd))}</td><td className="px-3 py-4"><StatusBadge status={schedule.status} /></td></tr>)}</tbody>
                </table>
              </div>
              <ul className="space-y-3 md:hidden">{queue.schedules.map((schedule) => <li key={schedule.scheduleId} className="rounded-lg border border-line p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black text-brand-navy">Queue #{schedule.queueNumber}</p><p className="mt-1 font-bold text-ink">{beneficiaryName(schedule.beneficiary)}</p></div><StatusBadge status={schedule.status} /></div><p className="mt-3 text-sm text-muted-copy">{timeFormatter.format(new Date(schedule.slot.slotStart))}–{timeFormatter.format(new Date(schedule.slot.slotEnd))}</p></li>)}</ul>
              <div className="mt-5 flex items-center justify-between border-t border-line pt-4"><p className="text-xs font-semibold text-muted-copy">Page {queue.pagination.page} of {Math.max(queue.pagination.totalPages, 1)}</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Previous</button><button type="button" disabled={page >= queue.pagination.totalPages} onClick={() => onPageChange(page + 1)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Next</button></div></div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function QrVerificationView({ distribution, qrToken, setQrToken, error, result, isVerifying, onSubmit }) {
  const duplicateError = ['QR_TOKEN_ALREADY_USED', 'DUPLICATE_CLAIM'].includes(error?.code)
  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
      <section className="ga-card p-5 sm:p-7" aria-labelledby="verification-form-heading">
        <p className="ga-eyebrow">Secure claim check-in</p>
        <h2 id="verification-form-heading" className="mt-2 text-2xl font-extrabold text-ink">Scan or enter the claim token</h2>
        <p className="mt-3 text-sm leading-6 text-muted-copy">Keep the token field focused when using a handheld QR scanner. You may also paste the complete token from an authorized scanning device.</p>

        <div className="mt-5 rounded-lg border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy">
          Confirm that <strong className="text-ink">{distribution.title}</strong> is the correct event. Successful verification checks the beneficiary into the queue and records an audit trail.
        </div>

        <form onSubmit={onSubmit} className="mt-6" aria-busy={isVerifying}>
          <label htmlFor="qr-claim-token" className="block text-sm font-bold text-ink">QR claim token</label>
          <input id="qr-claim-token" name="qrToken" type="password" autoComplete="off" spellCheck="false" required autoFocus maxLength="512" value={qrToken} onChange={(event) => setQrToken(event.target.value)} aria-describedby={`qr-token-hint${error ? ' qr-token-error' : ''}`} aria-invalid={Boolean(error)} placeholder="Scan or paste token" className={`ga-input mt-2 font-mono ${error ? 'border-amber-400 focus:border-brand-amber focus:ring-amber-100' : ''}`} />
          <p id="qr-token-hint" className="mt-2 text-xs leading-5 text-muted-copy">The token is masked and is never stored by this page.</p>

          {error && <div id="qr-token-error" role="alert" className={`mt-4 rounded-lg border p-4 ${duplicateError ? 'border-red-200 bg-danger-soft' : 'border-amber-200 bg-warning-soft'}`}><p className={`font-bold ${duplicateError ? 'text-brand-red' : 'text-brand-amber'}`}>{duplicateError ? 'Possible duplicate claim' : 'Verification not completed'}</p><p className="mt-1 text-sm leading-6 text-copy">{error.message}</p><p className="mt-2 text-xs text-muted-copy">Confirm the selected event and token before trying again. Contact the System Administrator if the problem continues.</p></div>}

          <button type="submit" disabled={isVerifying || !qrToken.trim()} className="ga-btn-primary mt-5 w-full">{isVerifying ? <LoadingLabel>Verifying securely...</LoadingLabel> : 'Verify QR claim'}</button>
        </form>
      </section>

      <aside className="space-y-6" aria-label="Verification result and guidance">
        {result ? (
          <section role="status" aria-live="polite" className={`rounded-xl border p-6 shadow-sm ${result.verificationComplete ? 'border-emerald-200 bg-success-soft' : 'border-amber-200 bg-warning-soft'}`}>
            <span aria-hidden="true" className={`grid size-11 place-items-center rounded-full font-black text-white ${result.verificationComplete ? 'bg-brand-green' : 'bg-brand-amber'}`}>{result.verificationComplete ? '✓' : '!'}</span>
            <h2 className="mt-4 text-xl font-extrabold text-ink">{result.verificationComplete ? 'Claim verification complete' : 'QR accepted — biometric required'}</h2>
            <p className="mt-2 text-sm leading-6 text-copy">{result.verificationComplete ? 'The beneficiary was checked in and the claim is verified.' : 'The beneficiary was checked in. Complete biometric verification before the claim can be finalized.'}</p>
            <dl className="mt-5 space-y-3 border-t border-current/10 pt-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-copy">Claim status</dt><dd className="font-bold text-ink">{result.claim.claimStatus}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-copy">Claim reference</dt><dd className="max-w-48 truncate font-mono text-xs font-bold text-ink" title={result.claim.claimId}>{result.claim.claimId}</dd></div></dl>
          </section>
        ) : (
          <section className="rounded-xl border border-dashed border-line bg-white p-6 text-center"><span aria-hidden="true" className="mx-auto grid size-11 place-items-center rounded-full bg-info-soft font-black text-brand-blue">QR</span><h2 className="mt-4 font-extrabold text-ink">Awaiting verification</h2><p className="mt-2 text-sm leading-6 text-muted-copy">The verified claim result and required next step will appear here.</p></section>
        )}

        <section className="ga-card p-5"><h2 className="font-extrabold text-ink">Safe verification checklist</h2><ol className="mt-4 space-y-3 text-sm leading-6 text-copy"><li><strong className="text-brand-blue">1.</strong> Confirm the distribution event.</li><li><strong className="text-brand-blue">2.</strong> Scan only the beneficiary’s current token.</li><li><strong className="text-brand-blue">3.</strong> Follow the displayed verification result.</li></ol></section>
      </aside>
    </div>
  )
}

export default FacilitatorOperationsPage
