import { useEffect, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestEnrollmentList } from '../../auth/staffAuth.js'
import { Skeleton } from '../ui/skeleton.jsx'
import { Icon } from '../ui/icon.jsx'
import { OverviewEmptyState, OverviewUpdate } from '../ui/overview.jsx'

const number = new Intl.NumberFormat('en-PH')
const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' })

function formatDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : date.format(parsed)
}

function Link({ href, children, onNavigate, className = 'ga-admin-link' }) {
  return <a href={href} className={className} onClick={(event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate(href)
  }}>{children}</a>
}

export default function AdminOverview({ session, overview, draftEvents, draftError, draftLoading, liveStatus, reloadCount, onRefresh, refreshDisabled, onNavigate, onSessionExpired }) {
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
  const reviewRows = reviews ? [...reviews.pending.enrollments, ...reviews.validating.enrollments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5) : []
  const metrics = [
    ['Active programs', overview.programs.activeProgramCount, '/programs', 'programs'],
    ['Approved beneficiaries', overview.beneficiaries.approvedBeneficiaryCount, '/enrollments?status=APPROVED', 'beneficiaries'],
    ['Draft distributions', overview.distributions.statusCounts ? overview.distributions.statusCounts.DRAFT ?? 0 : null, null, 'audit'],
    ['Open distributions', overview.distributions.openDistributionCount, '/distributions/manage?status=OPEN', 'distributions'],
  ]

  return <div className="ga-overview ga-admin-overview">
    <header className="ga-overview-heading">
      <div><h1 className="ga-page-title">Overview</h1><p className="ga-page-copy">Review enrollments, prepare distributions, and monitor assistance releases.</p></div>
      <button type="button" className="ga-btn-secondary" onClick={onRefresh} disabled={refreshDisabled}><Icon name="reset" className="size-4" />Refresh</button>
    </header>
    <OverviewUpdate generatedAt={overview.generatedAt} liveStatus={liveStatus} />

    <div className="ga-overview-work">
      <section className="ga-admin-register" aria-labelledby="admin-review-heading">
        <header><h2 id="admin-review-heading"><Icon name="enrollments" />Enrollment reviews</h2><Link onNavigate={onNavigate} href="/enrollments">View all enrollments<Icon name="arrowRight" className="size-4" /></Link></header>
        {reviewError ? <div className="p-4" role="alert"><p>Enrollment reviews could not be loaded. {reviewError}</p><button type="button" onClick={onRefresh} className="ga-btn-secondary mt-3">Try again</button></div> : !reviews ? <div className="p-4" aria-label="Loading enrollment reviews"><Skeleton className="h-24" /></div> : <>
          <div className="ga-overview-review-counts"><Link onNavigate={onNavigate} href="/enrollments?status=PENDING"><strong>{number.format(pendingCount)}</strong> Awaiting review</Link><Link onNavigate={onNavigate} href="/enrollments?status=FOR_VALIDATION"><strong>{number.format(validatingCount)}</strong> Under validation</Link></div>
          {reviewRows.length ? <table className="ga-overview-enrollments" role="table">
            <caption className="sr-only">Recent enrollments awaiting review or validation, newest first</caption>
            <thead><tr><th scope="col">Beneficiary / program</th><th scope="col">Submitted / status</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
            <tbody>{reviewRows.map((enrollment) => <tr key={enrollment.enrollmentId}>
              <td><p className="ga-overview-record-name">{[enrollment.beneficiary.firstName, enrollment.beneficiary.lastName].filter(Boolean).join(' ')}</p><p className="ga-overview-record-detail">{enrollment.program.programName}</p>{enrollment.submittedById === session.user.userId && <p className="ga-overview-review-rule">Another Admin or DSWD reviewer must assess your submission.</p>}</td>
              <td><time dateTime={enrollment.createdAt}>{formatDate(enrollment.createdAt) || 'Not recorded'}</time><span className={`ga-overview-status ${enrollment.status === 'PENDING' ? 'ga-overview-status-pending' : ''}`}>{enrollment.status === 'PENDING' ? 'Awaiting review' : 'Under validation'}</span></td>
              <td><Link onNavigate={onNavigate} className="ga-admin-link ga-overview-row-action" href={`/enrollments?status=${enrollment.status}&enrollment=${encodeURIComponent(enrollment.enrollmentId)}`}>{enrollment.submittedById === session.user.userId ? 'View submission' : 'Review enrollment'}<span className="sr-only"> for {enrollment.beneficiary.firstName} {enrollment.beneficiary.lastName}</span></Link></td>
            </tr>)}</tbody>
          </table> : <OverviewEmptyState icon="enrollments" title="No enrollments awaiting review"><p>Submitted enrollments will appear here.</p><Link onNavigate={onNavigate} href="/beneficiaries">View beneficiary records</Link></OverviewEmptyState>}
        </>}
      </section>

      <section className="ga-admin-register" aria-labelledby="admin-drafts-heading">
        <header><h2 id="admin-drafts-heading"><Icon name="distributions" />Distribution preparation</h2><Link onNavigate={onNavigate} href="/distributions/manage?status=DRAFT">View draft distributions<Icon name="arrowRight" className="size-4" /></Link></header>
        <p className="ga-admin-register-note">Prepare sessions, beneficiaries, and schedules before opening a distribution.</p>
        {draftError ? <div className="p-4" role="alert"><p>Draft distributions could not be loaded. {draftError}</p><button type="button" onClick={onRefresh} className="ga-btn-secondary mt-3">Try again</button></div> : draftLoading ? <div className="p-4" aria-label="Loading draft distributions"><Skeleton className="h-24" /></div> : draftEvents.length ? <ul className="ga-overview-drafts">{draftEvents.map((event) => <li key={event.distributionId}>
          <p className="ga-overview-record-name">{event.title}</p>
          <dl><div><dt>Barangay</dt><dd>{event.barangay?.barangayName || 'Not recorded'}</dd></div><div><dt>Scheduled date</dt><dd><time dateTime={event.distributionDate}>{formatDate(event.distributionDate ? `${event.distributionDate}T00:00:00+08:00` : null) || 'Not recorded'}</time></dd></div></dl>
          <div className="ga-overview-draft-action"><span className="ga-overview-status">Draft</span><Link onNavigate={onNavigate} className="ga-admin-link ga-overview-row-action" href={`/distributions/manage?event=${encodeURIComponent(event.distributionId)}`}>Resume setup<span className="sr-only"> for {event.title}</span><Icon name="arrowRight" className="size-4" /></Link></div>
        </li>)}</ul> : <OverviewEmptyState icon="distributions" title="No draft distributions"><p>Create a distribution for an active program and barangay.</p><Link onNavigate={onNavigate} href="/distributions/manage?create=1">Create a distribution</Link></OverviewEmptyState>}
      </section>
    </div>

    <dl className="ga-admin-summary mt-5 grid grid-cols-2 lg:grid-cols-4" aria-label="Operations summary">
      {metrics.map(([label, value, href, icon]) => <div key={label}>
        <dt><span className="ga-overview-icon"><Icon name={icon} /></span><span>{label}</span></dt>
        <dd>
          <span className="ga-overview-total">{value == null ? '—' : number.format(value)}</span>
          {href && <Link onNavigate={onNavigate} href={href}>View {label.toLowerCase()}<Icon name="arrowRight" className="size-4" /></Link>}
        </dd>
      </div>)}
    </dl>

    <section className="ga-admin-register ga-overview-follow-up" aria-labelledby="admin-operations-heading">
      <header><h2 id="admin-operations-heading"><Icon name="monitoring" />Distribution follow-up</h2><Link onNavigate={onNavigate} href="/dswd/live-dashboard">View live monitoring<Icon name="arrowRight" className="size-4" /></Link></header>
      <dl className="ga-overview-follow-up-grid">
        <div><dt><Icon name="clock" className="size-4" />Unclaimed allocations</dt><dd className="ga-overview-total">{number.format(overview.beneficiaries.unclaimedAllocationCount)}</dd><dd><p>Pending or allocated assistance not yet recorded as received.</p><Link onNavigate={onNavigate} href="/distributions/manage">Review allocations<Icon name="arrowRight" className="size-4" /></Link></dd></div>
        <div><dt><Icon name="security" className="size-4" />Duplicate claim attempts</dt><dd className="ga-overview-total">{number.format(overview.anomalies.duplicateAttemptCount)}</dd><dd><p>Repeated QR or face verification attempts.</p><Link onNavigate={onNavigate} href="/reports?report=ANOMALIES">Review verification reports<Icon name="arrowRight" className="size-4" /></Link></dd></div>
        <div><dt><Icon name="ledger" className="size-4" />Remaining simulated allocation</dt><dd className="ga-overview-total">{overview.fundUtilization?.remainingAmount == null ? 'Unavailable' : money.format(overview.fundUtilization.remainingAmount)}</dd><dd><p>Simulation only. No real funds are transferred.</p><Link onNavigate={onNavigate} href="/dswd/ledger">Review transactions<Icon name="arrowRight" className="size-4" /></Link></dd></div>
      </dl>
    </section>

    <details className="ga-admin-guide mt-5">
      <summary>Workflow and setup guide</summary>
      <ol className="divide-y divide-line">
        {[
          ['1. Set up access', 'Add the barangay, create staff accounts, and assign the facilitator.', '/admin/administration', 'Staff and barangays'],
          ['2. Prepare the program', 'Set eligibility, required documents, amounts, and application dates. Activate the program when ready.', '/programs', 'Assistance programs'],
          ['3. Prepare beneficiary records', 'Register beneficiaries and upload documents. Submit enrollments for independent review.', '/beneficiaries', 'Beneficiary records'],
          ['4. Review enrollments', 'Check documents and eligibility. Approve, reject, or request corrections. You cannot approve your own submission.', '/enrollments', 'Enrollment review'],
          ['5. Prepare distribution', 'Select the program and barangay, plan sessions, assign approved beneficiaries, and schedule the queue. Open the event so approved beneficiaries can access their scheduled claim pass on mobile.', '/distributions/manage', 'Distribution events'],
          ['6. Validate claims', 'Review the QR credential and beneficiary identity, then confirm. Refer any remaining face check to the assigned Barangay Facilitator.', '/admin/verify-claims', 'Verify QR claims'],
          ['7. Monitor and reconcile', 'Facilitators record physical handovers; DSWD records simulated wallet credits. Review receipts and resolve concerns before reconciliation.', '/claim-accountability', 'Claims and receipts'],
        ].map(([title, description, href, label]) => <li key={href} className="grid gap-2 p-4 sm:grid-cols-[12rem_minmax(0,1fr)_11rem]"><strong className="text-sm">{title}</strong><p className="text-sm text-copy">{description}</p><Link onNavigate={onNavigate} href={href}>{label}</Link></li>)}
      </ol>
    </details>
  </div>
}
