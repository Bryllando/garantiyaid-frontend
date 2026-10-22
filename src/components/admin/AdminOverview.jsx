import { useEffect, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestEnrollmentList } from '../../auth/staffAuth.js'
import { Skeleton } from '../ui/skeleton.jsx'

const number = new Intl.NumberFormat('en-PH')
const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

function Link({ href, children, onNavigate, className = 'ga-admin-link' }) {
  return <a href={href} className={className} onClick={(event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate(href)
  }}>{children}</a>
}

export default function AdminOverview({ session, overview, draftEvents, draftError, draftLoading, liveStatus, reloadCount, onRefresh, onNavigate, onSessionExpired }) {
  const [reviews, setReviews] = useState(null)
  const [reviewError, setReviewError] = useState('')
  useEffect(() => {
    let active = true
    Promise.all(['PENDING', 'FOR_VALIDATION'].map((status) => requestEnrollmentList(session.accessToken, { status, page: 1, pageSize: 5 })))
      .then(([pending, validating]) => {
        if (active) {
          setReviews({ pending, validating })
          setReviewError('')
        }
      })
      .catch((error) => {
        if (!active) return
        if (isSessionExpiredError(error)) return onSessionExpired()
        setReviewError(getAuthErrorMessage(error))
      })
    return () => { active = false }
  }, [onSessionExpired, reloadCount, session.accessToken])

  const pendingCount = reviews?.pending.pagination.total
  const validatingCount = reviews?.validating.pagination.total
  const reviewRows = reviews ? [...reviews.pending.enrollments, ...reviews.validating.enrollments].slice(0, 5) : []
  const metrics = [
    ['Active programs', overview.programs.activeProgramCount, '/programs'],
    ['Approved beneficiaries', overview.beneficiaries.approvedBeneficiaryCount, '/enrollments?status=APPROVED'],
    ['Draft distributions', overview.distributions.statusCounts?.DRAFT ?? 0, '/distributions/manage?status=DRAFT'],
    ['Open distributions', overview.distributions.openDistributionCount, '/distributions/manage?status=OPEN'],
  ]

  return <div className="ga-admin-overview">
    <header className="ga-page-header flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
      <div><h1 className="ga-page-title">Administration overview</h1><p className="ga-page-copy">Programs, beneficiary reviews, and distribution records across authorized barangays.</p></div>
      <button type="button" className="ga-btn-secondary" onClick={onRefresh}>Refresh records</button>
    </header>
    <div className="my-3 flex flex-wrap justify-between gap-2 text-xs text-muted-copy" role="status">
      <span>Updated {overview.generatedAt}</span>
      <span>{liveStatus === 'connected' ? 'Live updates connected' : liveStatus === 'connecting' ? 'Connecting to live updates' : 'Live updates unavailable. Use Refresh records.'}</span>
    </div>

    <dl className="ga-admin-summary grid grid-cols-2 lg:grid-cols-4">
      {metrics.map(([label, value, href]) => <div key={label}><dt>{label}</dt><dd><Link onNavigate={onNavigate} href={href} className="ga-admin-metric-link">{number.format(value ?? 0)}<span className="sr-only"> — View {label.toLowerCase()}</span></Link></dd></div>)}
    </dl>

    <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
      <section className="ga-admin-register" aria-labelledby="admin-review-heading">
        <header><h2 id="admin-review-heading">Enrollment reviews</h2><Link onNavigate={onNavigate} href="/enrollments">View all</Link></header>
        {reviewError ? <div className="p-4" role="alert"><p>Enrollment reviews could not be loaded. {reviewError}</p><button type="button" onClick={onRefresh} className="ga-btn-secondary mt-3">Try again</button></div> : !reviews ? <div className="p-4" aria-label="Loading enrollment reviews"><Skeleton className="h-24" /></div> : <>
          <p className="ga-admin-register-note">{pendingCount} awaiting review · {validatingCount} under validation</p>
          {reviewRows.length ? <ul className="divide-y divide-line">{reviewRows.map((enrollment) => <li key={enrollment.enrollmentId} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0"><p className="font-semibold text-ink">{[enrollment.beneficiary.firstName, enrollment.beneficiary.lastName].filter(Boolean).join(' ')}</p><p className="mt-1 text-sm text-copy">{enrollment.program.programName}</p><p className="mt-1 text-xs text-muted-copy">{enrollment.submittedById === session.user.userId ? 'Submitted by you — another reviewer is required' : enrollment.status === 'PENDING' ? 'Waiting for document and eligibility review' : 'Document and eligibility review in progress'}</p></div>
            <Link onNavigate={onNavigate} href={`/enrollments?status=${enrollment.status}&enrollment=${encodeURIComponent(enrollment.enrollmentId)}`}>Open<span className="sr-only"> enrollment for {enrollment.beneficiary.firstName}</span></Link>
          </li>)}</ul> : <div className="p-5"><p className="font-semibold">No enrollments awaiting review</p><p className="mt-1 text-sm text-copy">Submitted applications will appear here.</p><Link onNavigate={onNavigate} href="/beneficiaries">Open beneficiary records</Link></div>}
        </>}
      </section>

      <section className="ga-admin-register" aria-labelledby="admin-drafts-heading">
        <header><h2 id="admin-drafts-heading">Distribution preparation</h2><Link onNavigate={onNavigate} href="/distributions/manage?status=DRAFT">View drafts</Link></header>
        <p className="ga-admin-register-note">Prepare sessions, beneficiary assignments, and queue schedules before opening an event.</p>
        {draftError ? <div className="p-4" role="alert"><p>Draft events could not be loaded. {draftError}</p><button type="button" onClick={onRefresh} className="ga-btn-secondary mt-3">Try again</button></div> : draftLoading ? <div className="p-4" aria-label="Loading draft events"><Skeleton className="h-24" /></div> : draftEvents.length ? <ul className="divide-y divide-line">{draftEvents.map((event) => <li key={event.distributionId} className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="font-semibold text-ink">{event.title}</p><p className="mt-1 text-sm text-copy">{event.barangay?.barangayName} · {event.distributionDate}</p><p className="mt-1 text-xs text-muted-copy">Draft — setup not yet opened to field staff</p></div><Link onNavigate={onNavigate} href={`/distributions/manage?event=${encodeURIComponent(event.distributionId)}`}>Continue<span className="sr-only"> {event.title}</span></Link></li>)}</ul> : <div className="p-5"><p className="font-semibold">No draft distributions</p><p className="mt-1 text-sm text-copy">Choose an active program and service barangay to create an event.</p><Link onNavigate={onNavigate} href="/distributions/manage?create=1">Create a distribution</Link></div>}
      </section>
    </div>

    <section className="ga-admin-register mt-5" aria-labelledby="admin-operations-heading">
      <header><h2 id="admin-operations-heading">Distribution follow-up</h2><Link onNavigate={onNavigate} href="/dswd/live-dashboard">Live monitoring</Link></header>
      <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-4"><p className="text-sm text-copy">Unclaimed allocations</p><p className="mt-1 text-xl font-semibold tabular-nums">{number.format(overview.beneficiaries.unclaimedAllocationCount)}</p><Link onNavigate={onNavigate} href="/claim-accountability">Review claims and receipts</Link></div>
        <div className="p-4"><p className="text-sm text-copy">Duplicate claim attempts</p><p className="mt-1 text-xl font-semibold tabular-nums">{number.format(overview.anomalies.duplicateAttemptCount)}</p><Link onNavigate={onNavigate} href="/reports">Review verification reports</Link></div>
        <div className="p-4"><p className="text-sm text-copy">Remaining simulated allocation</p><p className="mt-1 text-xl font-semibold tabular-nums">{money.format(overview.fundUtilization?.remainingAmount ?? 0)}</p><Link onNavigate={onNavigate} href="/dswd/ledger">Review transactions</Link><p className="mt-1 text-xs text-muted-copy">Simulation only. No real funds are transferred.</p></div>
      </div>
    </section>

    <details className="ga-admin-guide mt-5">
      <summary>Admin workflow and setup guide</summary>
      <ol className="divide-y divide-line">
        {[
          ['1. Set up access', 'Add the barangay, create staff accounts, and assign the facilitator.', '/admin/administration', 'Staff and barangays'],
          ['2. Prepare the program', 'Set eligibility, required documents, amounts, and application dates. Activate the program when ready.', '/programs', 'Assistance programs'],
          ['3. Prepare beneficiary records', 'Register beneficiaries and upload documents. Submit enrollments for independent review.', '/beneficiaries', 'Beneficiary records'],
          ['4. Review enrollments', 'Check documents and eligibility. Approve, reject, or request corrections. You cannot approve your own submission.', '/enrollments', 'Enrollment review'],
          ['5. Prepare distribution', 'Select the program and barangay, plan sessions, assign approved beneficiaries, and schedule the queue. Open the event and issue QR credentials when required.', '/distributions/manage', 'Distribution events'],
          ['6. Monitor and reconcile', 'Review claims, receipts, exceptions, and transaction records. Facilitators record physical releases; DSWD handles simulated wallet credits.', '/claim-accountability', 'Claims and receipts'],
        ].map(([title, description, href, label]) => <li key={href} className="grid gap-2 p-4 sm:grid-cols-[12rem_minmax(0,1fr)_11rem]"><strong className="text-sm">{title}</strong><p className="text-sm text-copy">{description}</p><Link onNavigate={onNavigate} href={href}>{label}</Link></li>)}
      </ol>
    </details>
  </div>
}
