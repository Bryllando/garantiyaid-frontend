import { useEffect, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestDistributionList, requestEnrollmentList } from '../../auth/staffAuth.js'
import { SkeletonRows } from '../ui/skeleton.jsx'
import { Icon } from '../ui/icon.jsx'
import { OverviewEmptyState, OverviewUpdate } from '../ui/overview.jsx'

const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const name = (person) => [person?.firstName, person?.middleName, person?.lastName].filter(Boolean).join(' ')

function Link({ href, onNavigate, children, className = 'ga-admin-link' }) {
  return <a href={href} className={className} onClick={(event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate(href)
  }}>{children}</a>
}

export default function DswdWorkOverview({ session, overview, liveStatus, reloadCount, onRefresh, refreshDisabled, onNavigate, onSessionExpired }) {
  const [reviews, setReviews] = useState(null)
  const [reviewError, setReviewError] = useState('')
  const [events, setEvents] = useState(null)
  const [eventError, setEventError] = useState('')
  useEffect(() => {
    let active = true
    Promise.all(['PENDING', 'FOR_VALIDATION'].map((status) => requestEnrollmentList(session.accessToken, { status, page: 1, pageSize: 5 })))
      .then(([pending, validating]) => { if (active) { setReviews({ pending, validating }); setReviewError('') } })
      .catch((issue) => { if (active) { if (isSessionExpiredError(issue)) return onSessionExpired(); setReviewError(getAuthErrorMessage(issue)) } })
    return () => { active = false }
  }, [onSessionExpired, reloadCount, session.accessToken])
  useEffect(() => {
    let active = true
    requestDistributionList(session.accessToken, { status: 'OPEN', page: 1, pageSize: 5 })
      .then((data) => { if (active) { setEvents(data); setEventError('') } })
      .catch((issue) => { if (active) { if (isSessionExpiredError(issue)) return onSessionExpired(); setEventError(getAuthErrorMessage(issue)) } })
    return () => { active = false }
  }, [onSessionExpired, reloadCount, session.accessToken])
  const rows = reviews ? [...reviews.validating.enrollments, ...reviews.pending.enrollments].slice(0, 6) : []
  const reviewCount = reviews ? reviews.pending.pagination.total + reviews.validating.pagination.total : null
  return <div className="ga-overview ga-dswd-overview">
    <header className="ga-overview-heading">
      <div><h1 className="ga-page-title">DSWD overview</h1><p className="ga-page-copy">Review enrollment submissions and follow up on distribution work across authorized barangays.</p></div>
      <button type="button" onClick={onRefresh} disabled={refreshDisabled} className="ga-btn-secondary"><Icon name="reset" className="size-4" />Refresh records</button>
    </header>
    <OverviewUpdate generatedAt={overview.generatedAt} liveStatus={liveStatus} />
    <dl className="ga-admin-summary grid grid-cols-2 lg:grid-cols-4" aria-label="DSWD work summary">
      {[
        ['Enrollment reviews', reviewCount, reviewError ? 'Last available review count' : 'Pending or under validation', 'enrollments'],
        ['Open events', overview.distributions.openDistributionCount, 'Review distribution work', 'distributions'],
        ['Awaiting Admin setup', overview.distributions.statusCounts?.DRAFT ?? 0, 'Draft distribution events', 'audit'],
        ['Completed claims', overview.beneficiaries.claimedBeneficiaryCount, 'Recorded release or wallet credit', 'receipt'],
      ].map(([label, count, detail, icon]) => <div key={label}><dt><span className="ga-overview-icon"><Icon name={icon} /></span><span>{label}</span></dt><dd><span className="ga-overview-total">{count == null ? 'Not loaded' : count.toLocaleString('en-PH')}</span><span className="ga-overview-metric-detail">{detail}</span></dd></div>)}
    </dl>
    <div className="ga-overview-work ga-overview-work-equal">
      <section className="ga-admin-register" aria-labelledby="dswd-reviews-heading">
        <header><h2 id="dswd-reviews-heading"><Icon name="enrollments" />Enrollment reviews</h2></header>
        <p className="ga-admin-register-note">Continue validations, then review new submissions.</p>
        {reviewError && <div role="alert" className="border-b border-line bg-warning-soft p-4 text-sm leading-6"><p>Enrollment reviews could not be refreshed. {reviews ? 'The list below is from the previous update.' : ''} {reviewError}</p><button onClick={onRefresh} className="ga-admin-link">Retry enrollment reviews</button></div>}
        {!reviews && !reviewError ? <SkeletonRows label="Loading enrollment reviews" rows={2} /> : reviews && <>
          <div className="ga-overview-review-counts"><Link href="/enrollments?status=FOR_VALIDATION" onNavigate={onNavigate}><strong>{reviews.validating.pagination.total.toLocaleString('en-PH')}</strong> Under validation</Link><Link href="/enrollments?status=PENDING" onNavigate={onNavigate}><strong>{reviews.pending.pagination.total.toLocaleString('en-PH')}</strong> Pending review</Link></div>
          {rows.length ? <><p className="ga-overview-list-caption">Recent submissions in each review stage. Showing {rows.length} of {reviewCount} records.</p><ul className="ga-overview-records">{rows.map((row) => <li key={row.enrollmentId}>
            <div className="min-w-0 sm:flex-1"><h3 className="break-words text-sm font-semibold text-ink">{name(row.beneficiary)}</h3><p className="mt-1 text-sm text-copy">{row.program?.programName || row.program?.programCode || 'Program not recorded'}</p><p className="mt-1 text-xs leading-5 text-muted-copy">{row.status === 'FOR_VALIDATION' ? 'Under validation' : 'Pending review'}{row.createdAt ? ` · Submitted ${date.format(new Date(row.createdAt))}` : ''}</p></div>
            <Link href={`/enrollments?status=${row.status}&enrollment=${encodeURIComponent(row.enrollmentId)}`} onNavigate={onNavigate} className="ga-admin-link ga-overview-row-action">Open review<span className="sr-only"> for {name(row.beneficiary)}</span><Icon name="arrowRight" className="size-4" /></Link>
          </li>)}</ul></> : <OverviewEmptyState icon="enrollments" title="No pending or in-progress enrollment reviews in your authorized scope." />}
        </>}
      </section>
      <section className="ga-admin-register" aria-labelledby="dswd-events-heading">
        <header><h2 id="dswd-events-heading"><Icon name="distributions" />Open distribution events</h2></header>
        <p className="ga-admin-register-note">Select an event to see pending work and the responsible staff.</p>
        {eventError && <div role="alert" className="border-b border-line bg-warning-soft p-4 text-sm leading-6"><p>Open events could not be refreshed. {events ? 'Showing the previous list.' : ''} {eventError}</p><button onClick={onRefresh} className="ga-admin-link">Retry open events</button></div>}
        {!events && !eventError ? <SkeletonRows label="Loading open events" /> : events && <>
          {events.distributions.length ? <ul className="ga-overview-records ga-overview-events">{events.distributions.map((event) => <li key={event.distributionId}>
            <div className="min-w-0 flex-1"><h3 className="ga-overview-record-name">{event.title}</h3><p className="ga-overview-event-meta"><Icon name="location" className="size-4 shrink-0" />{event.barangay?.barangayName || 'Barangay not recorded'}<span aria-hidden="true">·</span><time dateTime={event.distributionDate}>{date.format(new Date(`${event.distributionDate}T00:00:00+08:00`))}</time></p><p className="ga-overview-event-meta"><Icon name={event.deliveryMode === 'PHYSICAL_GOODS' ? 'distributions' : 'ledger'} className="size-4 shrink-0" />{event.deliveryMode === 'PHYSICAL_GOODS' ? 'Barangay physical release' : 'DSWD simulated credit'}</p></div>
            <Link href={`/dswd/live-dashboard?status=OPEN&distribution=${encodeURIComponent(event.distributionId)}`} onNavigate={onNavigate} className="ga-admin-link ga-overview-row-action">View work remaining<span className="sr-only"> for {event.title}</span><Icon name="arrowRight" className="size-4" /></Link>
          </li>)}</ul> : <OverviewEmptyState icon="distributions" title="No open events."><p>Review draft events for preparation status or completed events for follow-up.</p></OverviewEmptyState>}
          <div className="border-t border-line px-4 py-3 text-xs text-muted-copy">Showing {events.distributions.length} of {events.pagination.total} open events.</div>
        </>}
        <div className="ga-overview-section-actions"><Link href="/dswd/live-dashboard?status=OPEN" onNavigate={onNavigate}>View all open events<Icon name="arrowRight" className="size-4" /></Link><Link href="/dswd/live-dashboard?status=DRAFT" onNavigate={onNavigate}>Review draft events</Link></div>
      </section>
    </div>
    <aside className="ga-overview-responsibilities"><Icon name="people" className="size-5 shrink-0" /><p><strong className="font-semibold text-ink">Staff responsibilities:</strong> DSWD reviews enrollments and records simulated credits. Barangay staff handle attendance and physical release. Admin prepares distribution events.</p></aside>
  </div>
}
