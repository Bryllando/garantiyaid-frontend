import { useEffect, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestDistributionList, requestEnrollmentList } from '../../auth/staffAuth.js'
import { LoadingLabel } from '../ui/spinner.jsx'

const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const name = (person) => [person?.firstName, person?.middleName, person?.lastName].filter(Boolean).join(' ')

function Link({ href, onNavigate, children, className = 'ga-admin-link' }) {
  return <a href={href} className={className} onClick={(event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate(href)
  }}>{children}</a>
}

export default function DswdWorkOverview({ session, overview, error, liveStatus, reloadCount, onRefresh, onNavigate, onSessionExpired }) {
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
  return <div>
    <header className="ga-page-header flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
      <div><h1 className="ga-page-title">DSWD overview</h1><p className="ga-page-copy">Review enrollment submissions and follow up on distribution work across authorized barangays.</p></div>
      <button type="button" onClick={onRefresh} className="ga-btn-secondary">Refresh records</button>
    </header>
    <div className="my-3 space-y-1 text-xs leading-5 text-muted-copy" role="status">
      <p>Summary last updated: {overview.generatedAt}</p>
      <p>{liveStatus === 'connected' ? 'Live updates connected. Records also refresh every minute.' : liveStatus === 'connecting' ? 'Connecting to live updates. Records refresh every minute.' : 'Live updates disconnected. Records refresh every minute; use Refresh records to check now.'}</p>
    </div>
    {error && <p role="alert" className="mb-4 border-l-2 border-brand-amber bg-warning-soft p-3 text-sm">Summary refresh failed. Showing the last successful figures. {error}</p>}
    <dl className="ga-admin-summary grid grid-cols-2 lg:grid-cols-4" aria-label="DSWD work summary">
      {[
        ['Enrollment reviews', reviewCount, reviewError ? 'Last available review count' : 'Pending or under validation'],
        ['Open events', overview.distributions.openDistributionCount, 'Review distribution work'],
        ['Awaiting Admin setup', overview.distributions.statusCounts?.DRAFT ?? 0, 'Draft distribution events'],
        ['Completed claims', overview.beneficiaries.claimedBeneficiaryCount, 'Recorded release or wallet credit'],
      ].map(([label, count, detail]) => <div key={label}><dt>{label}</dt><dd><span className="block text-2xl font-semibold tabular-nums text-ink">{count == null ? 'Not loaded' : count.toLocaleString('en-PH')}</span><span className="text-xs text-muted-copy">{detail}</span></dd></div>)}
    </dl>
    <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
      <section className="ga-admin-register" aria-labelledby="dswd-reviews-heading">
        <header><div><h2 id="dswd-reviews-heading">Enrollment reviews</h2><p className="mt-1 text-sm font-normal text-copy">Continue validations, then review new submissions.</p></div></header>
        {reviewError && <div role="alert" className="border-b border-line bg-warning-soft p-4 text-sm leading-6"><p>Enrollment reviews could not be refreshed. {reviews ? 'The list below is from the previous update.' : ''} {reviewError}</p><button onClick={onRefresh} className="ga-admin-link">Retry enrollment reviews</button></div>}
        {!reviews && !reviewError ? <p role="status" className="p-5 text-sm"><LoadingLabel>Loading enrollment reviews...</LoadingLabel></p> : reviews && <>
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line px-4 py-2 text-sm"><Link href="/enrollments?status=FOR_VALIDATION" onNavigate={onNavigate}>Under validation ({reviews.validating.pagination.total})</Link><Link href="/enrollments?status=PENDING" onNavigate={onNavigate}>Pending review ({reviews.pending.pagination.total})</Link></div>
          {rows.length ? <><p className="px-4 pt-3 text-xs leading-5 text-muted-copy">Recent submissions in each review stage. Showing {rows.length} of {reviewCount} records.</p><ul className="divide-y divide-line">{rows.map((row) => <li key={row.enrollmentId} className="grid gap-2 p-4 sm:flex sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0 sm:flex-1"><h3 className="break-words text-sm font-semibold text-ink">{name(row.beneficiary)}</h3><p className="mt-1 text-sm text-copy">{row.program?.programName || row.program?.programCode || 'Program not recorded'}</p><p className="mt-1 text-xs leading-5 text-muted-copy">{row.status === 'FOR_VALIDATION' ? 'Under validation' : 'Pending review'}{row.createdAt ? ` · Submitted ${date.format(new Date(row.createdAt))}` : ''}</p></div>
            <Link href={`/enrollments?status=${row.status}&enrollment=${encodeURIComponent(row.enrollmentId)}`} onNavigate={onNavigate}>Open review</Link>
          </li>)}</ul></> : <p className="p-5 text-sm leading-6 text-copy">No pending or in-progress enrollment reviews in your authorized scope.</p>}
        </>}
      </section>
      <section className="ga-admin-register" aria-labelledby="dswd-events-heading">
        <header><div><h2 id="dswd-events-heading">Open distribution events</h2><p className="mt-1 text-sm font-normal text-copy">Select an event to see pending work and the responsible staff.</p></div></header>
        {eventError && <div role="alert" className="border-b border-line bg-warning-soft p-4 text-sm leading-6"><p>Open events could not be refreshed. {events ? 'Showing the previous list.' : ''} {eventError}</p><button onClick={onRefresh} className="ga-admin-link">Retry open events</button></div>}
        {!events && !eventError ? <p role="status" className="p-5 text-sm"><LoadingLabel>Loading open events...</LoadingLabel></p> : events && <>
          {events.distributions.length ? <ul className="divide-y divide-line">{events.distributions.map((event) => <li key={event.distributionId} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1 basis-52"><h3 className="break-words text-sm font-semibold text-ink">{event.title}</h3><p className="mt-1 text-sm leading-6 text-copy">{event.barangay?.barangayName || 'Barangay not recorded'} · {date.format(new Date(`${event.distributionDate}T00:00:00+08:00`))}</p><p className="mt-1 text-xs leading-5 text-muted-copy">{event.deliveryMode === 'PHYSICAL_GOODS' ? 'Barangay physical release' : 'DSWD simulated credit'}</p></div>
            <Link href={`/dswd/live-dashboard?status=OPEN&distribution=${encodeURIComponent(event.distributionId)}`} onNavigate={onNavigate}>View work remaining</Link>
          </li>)}</ul> : <p className="p-5 text-sm leading-6 text-copy">No open events. Review draft events for preparation status or completed events for follow-up.</p>}
          <div className="border-t border-line px-4 py-3 text-xs text-muted-copy">Showing {events.distributions.length} of {events.pagination.total} open events.</div>
        </>}
        <div className="flex flex-wrap gap-x-5 border-t border-line px-4 py-2"><Link href="/dswd/live-dashboard?status=OPEN" onNavigate={onNavigate}>View all open events</Link><Link href="/dswd/live-dashboard?status=DRAFT" onNavigate={onNavigate}>Review draft events</Link></div>
      </section>
    </div>
    <p className="mt-5 border-t border-line pt-4 text-sm leading-6 text-copy"><strong className="font-semibold text-ink">Staff responsibilities:</strong> DSWD reviews enrollments and records simulated credits. Barangay staff handle attendance and physical release. Admin prepares distribution events.</p>
  </div>
}
