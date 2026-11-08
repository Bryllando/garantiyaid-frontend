import { useEffect, useRef, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestBeneficiaryEnrollments, requestBeneficiaryEventProgress, requestAllDistributions } from '../../auth/staffAuth.js'
import { beneficiaryJourney } from '../../utils/beneficiaryJourney.js'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'

export default function BeneficiaryAssistanceProgress({ beneficiary, token, role, onNavigate, onSessionExpired }) {
  const [enrollments, setEnrollments] = useState([])
  const [enrollmentId, setEnrollmentId] = useState(() => new URLSearchParams(window.location.search).get('progressEnrollment') || '')
  const eventToRestore = useRef(new URLSearchParams(window.location.search).get('progressEvent') || '')
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState('')
  const [records, setRecords] = useState(null)
  const [loading, setLoading] = useState('enrollments')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const enrollment = enrollments.find((item) => item.enrollmentId === enrollmentId)
  const distribution = events.find((item) => item.distributionId === eventId)

  useEffect(() => {
    let active = true
    requestBeneficiaryEnrollments(token, beneficiary).then((rows) => {
      if (active) { setEnrollments(rows); setEnrollmentId((current) => rows.some((row) => row.enrollmentId === current) ? current : rows[0]?.enrollmentId ?? ''); setLoading(rows.length ? 'events' : '') }
    }).catch((issue) => { if (active) { setLoading(''); if (isSessionExpiredError(issue)) onSessionExpired(); else setError(getAuthErrorMessage(issue)) } })
    return () => { active = false }
  }, [beneficiary, onSessionExpired, reload, token])

  useEffect(() => {
    if (!enrollment) return undefined
    let active = true
    async function loadEvents() {
      const rows = await requestAllDistributions(token, { programId: enrollment.programId ?? enrollment.program.programId, barangayId: beneficiary.barangayId })
      if (active) {
        setEvents(rows)
        const restored = rows.some((item) => item.distributionId === eventToRestore.current) ? eventToRestore.current : ''
        eventToRestore.current = ''
        setEventId(restored)
        setLoading(restored ? 'records' : '')
      }
    }
    loadEvents().catch((issue) => { if (active) { setLoading(''); if (isSessionExpiredError(issue)) onSessionExpired(); else setError(getAuthErrorMessage(issue)) } })
    return () => { active = false }
  }, [beneficiary.barangayId, enrollment, onSessionExpired, token])

  useEffect(() => {
    if (!eventId) return undefined
    let active = true
    requestBeneficiaryEventProgress(token, eventId, beneficiary).then((result) => { if (active) setRecords(result) })
      .catch((issue) => { if (active) { if (isSessionExpiredError(issue)) onSessionExpired(); else setError(getAuthErrorMessage(issue)) } })
      .finally(() => { if (active) setLoading('') })
    return () => { active = false }
  }, [beneficiary, eventId, onSessionExpired, token])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (enrollmentId) url.searchParams.set('progressEnrollment', enrollmentId)
    if (eventId) url.searchParams.set('progressEvent', eventId)
    else if (!eventToRestore.current) url.searchParams.delete('progressEvent')
    window.history.replaceState(window.history.state, '', url)
  }, [enrollmentId, eventId])

  function refresh() {
    eventToRestore.current = eventId
    setError(''); setRecords(null); setEvents([]); setEventId(''); setLoading('enrollments'); setReload((value) => value + 1)
  }
  const steps = beneficiaryJourney(enrollment, distribution, records, role)
  return <section className="border-b border-line p-5" aria-labelledby="beneficiary-progress-heading">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="beneficiary-progress-heading" tabIndex={-1} className="scroll-mt-32 font-bold focus-visible:outline-2 focus-visible:outline-brand-blue">Assistance progress</h3><button type="button" onClick={refresh} disabled={Boolean(loading)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-brand-blue hover:bg-info-soft">Refresh progress</button></div>
    <p className="mt-1 text-sm leading-6 text-muted-copy">Follow this beneficiary from enrollment through release and receipt. Each distribution has its own schedule and claim.</p>
    {error ? <div role="alert" className="mt-4 rounded-lg border border-red-200 p-4 text-sm"><p className="font-semibold">Progress could not be loaded</p><p className="mt-1 text-copy">{error}</p><button type="button" onClick={refresh} className="ga-btn-secondary mt-3">Try again</button></div> : loading === 'enrollments' ? <p role="status" className="mt-4 text-sm"><LoadingLabel>Loading enrollments...</LoadingLabel></p> : !enrollments.length ? <div className="mt-4 border-l-2 border-line pl-4"><p className="text-sm font-semibold">No enrollment recorded</p><p className="mt-1 text-sm text-muted-copy">Registering a beneficiary does not enroll them in a program.</p><a href="#beneficiary-enrollment-heading" className="ga-admin-link">Choose a program</a></div> : <>
      <div className="mt-4"><label htmlFor="progress-enrollment" className="ga-label">Program enrollment</label><select id="progress-enrollment" value={enrollmentId} onChange={(event) => { setEnrollmentId(event.target.value); setEventId(''); setEvents([]); setRecords(null); setLoading('events') }} className="ga-input mt-2">{enrollments.map((item) => <option key={item.enrollmentId} value={item.enrollmentId}>{item.program.programName} — {item.status.replaceAll('_', ' ').toLowerCase()}</option>)}</select></div>
      <div className="mt-4"><label htmlFor="progress-event" className="ga-label">Distribution event</label><select id="progress-event" value={eventId} disabled={!events.length || loading === 'events'} onChange={(event) => { setEventId(event.target.value); setRecords(null); setLoading(event.target.value ? 'records' : '') }} aria-describedby="progress-event-help" className="ga-input mt-2"><option value="">{loading === 'events' ? 'Loading events...' : events.length ? 'Choose an event to check' : 'No event available for this program and barangay'}</option>{events.map((item) => <option key={item.distributionId} value={item.distributionId}>{item.title} — {item.distributionDate?.slice(0, 10)} ({item.status.toLowerCase()})</option>)}</select><p id="progress-event-help" className="mt-2 text-xs leading-5 text-muted-copy">{!events.length && loading !== 'events' ? 'Admin must prepare an event for this program and barangay before allocation and scheduling.' : 'An event appearing here does not mean this beneficiary is assigned to it.'}</p></div>
      {loading === 'records' ? <p role="status" className="mt-4 text-sm"><LoadingLabel>Checking event records...</LoadingLabel></p> : <ol className="mt-5 divide-y divide-line" aria-label="Beneficiary assistance stages">{steps.map((step, index) => <li key={step.title} className="flex gap-3 py-4 first:pt-0"><span aria-hidden="true" className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold ${step.complete ? 'border-emerald-200 bg-success-soft text-brand-green' : 'border-line text-muted-copy'}`}>{step.complete ? <Icon name="check" className="size-4" /> : index + 1}</span><div className="min-w-0"><p className="text-xs text-muted-copy">{step.title}</p><p className="mt-1 text-sm font-bold text-ink">{step.status}</p><p className="mt-1 text-sm leading-6 text-copy">{step.detail}</p><p className="mt-1 text-xs leading-5 text-muted-copy">Responsible: {step.owner}</p>{step.title === 'Schedule' && records?.schedule?.slot?.slotStart && <p className="mt-1 text-sm text-copy">{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(records.schedule.slot.slotStart))}</p>}{step.href && <a href={step.href} onClick={(event) => { event.preventDefault(); onNavigate(step.href) }} className="ga-admin-link">{step.action}</a>}</div></li>)}</ol>}
    </>}
  </section>
}
