import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import {
  approveEnrollment,
  downloadBeneficiaryDocument,
  getAuthErrorMessage,
  isSessionExpiredError,
  rejectEnrollment,
  requestEnrollmentCorrection,
  requestEnrollmentList,
  requestPrograms,
  resubmitEnrollment,
  reviewBeneficiaryDocument,
  startEnrollmentReview,
} from '../auth/staffAuth.js'

const statuses = ['', 'PENDING', 'FOR_VALIDATION', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED', 'SUSPENDED', 'WITHDRAWN']
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const humanize = (value = '') => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
const fullName = (person) => [person?.firstName, person?.middleName, person?.lastName].filter(Boolean).join(' ')

function StatusBadge({ value }) {
  const style = value === 'APPROVED' || value === 'ACCEPTED'
    ? 'ga-status-success'
    : value === 'REJECTED' || value === 'SUSPENDED'
      ? 'ga-status-danger'
      : ['PENDING', 'FOR_VALIDATION', 'NEEDS_CORRECTION', 'SUBMITTED'].includes(value)
        ? 'ga-status-warning'
        : 'border-line bg-slate-100 text-copy'
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}>{humanize(value)}</span>
}

function EnrollmentSkeleton() {
  return <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(24rem,0.8fr)]" role="status" aria-label="Loading enrollments"><div className="ga-card p-5"><Skeleton className="h-10 w-full" />{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="mt-4 h-16 w-full" />)}</div><div className="ga-card p-6"><Skeleton className="h-7 w-52" /><Skeleton className="mt-5 h-24 w-full" /><Skeleton className="mt-4 h-44 w-full" /></div></div>
}

function ReviewProgress({ status }) {
  const step = status === 'PENDING' ? 1 : status === 'FOR_VALIDATION' || status === 'NEEDS_CORRECTION' ? 2 : ['APPROVED', 'REJECTED'].includes(status) ? 3 : 1
  return <ol className="mt-5 grid grid-cols-3" aria-label="Enrollment review progress">{['Submitted', 'Validation', 'Decision'].map((label, index) => <li key={label} className="relative text-center"><span aria-hidden="true" className={`relative z-10 mx-auto grid size-8 place-items-center rounded-full border-2 text-xs font-black ${index + 1 <= step ? 'border-brand-blue bg-brand-blue text-white' : 'border-line bg-white text-muted-copy'}`}>{index + 1}</span>{index < 2 && <span aria-hidden="true" className={`absolute left-1/2 top-4 h-0.5 w-full ${index + 1 < step ? 'bg-brand-blue' : 'bg-line'}`} />}<span className="relative z-10 mt-2 block text-xs font-bold text-copy">{label}</span></li>)}</ol>
}

function EnrollmentReviewPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const [draft, setDraft] = useState({ search: '', status: '', programId: '' })
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [programs, setPrograms] = useState([])
  const [selected, setSelected] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [confirmation, setConfirmation] = useState(null)
  const role = session.user.role
  const isDswd = role === 'DSWD_STAFF'
  const isFacilitator = role === 'BARANGAY_FACILITATOR'

  function reportError(requestError) {
    if (isSessionExpiredError(requestError)) return onSessionExpired()
    toast.error(getAuthErrorMessage(requestError))
  }

  useEffect(() => {
    let active = true
    requestPrograms(session.accessToken, { pageSize: 100 })
      .then((result) => { if (active) setPrograms(result.programs) })
      .catch((requestError) => {
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        toast.error(getAuthErrorMessage(requestError))
      })
    return () => { active = false }
  }, [onSessionExpired, session.accessToken])

  useEffect(() => {
    let active = true
    requestEnrollmentList(session.accessToken, { page, pageSize: 20, ...filters })
      .then((result) => {
        if (!active) return
        setData(result)
        setError('')
        setSelected((current) => current ? result.enrollments.find((item) => item.enrollmentId === current.enrollmentId) ?? current : null)
      })
      .catch((requestError) => { if (active) { if (isSessionExpiredError(requestError)) return onSessionExpired(); setError(getAuthErrorMessage(requestError)) } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [filters, onSessionExpired, page, reload, session.accessToken])

  function applyFilters(event) {
    event.preventDefault()
    setIsLoading(true)
    setPage(1)
    setFilters({ search: draft.search.trim(), status: draft.status, programId: draft.programId })
  }

  async function runAction(action, successMessage) {
    try {
      const updated = await action()
      setSelected(updated)
      setConfirmation(null)
      setReload((value) => value + 1)
      toast.success(successMessage, { description: `${fullName(updated.beneficiary)} · ${humanize(updated.status)}` })
    } catch (requestError) { reportError(requestError); throw requestError }
  }

  function confirmAction(reason) {
    if (confirmation?.type === 'approve') return runAction(() => approveEnrollment(session.accessToken, selected.enrollmentId), 'Enrollment approved.')
    if (confirmation?.type === 'correction') return runAction(() => requestEnrollmentCorrection(session.accessToken, selected.enrollmentId, reason), 'Correction request sent.')
    if (confirmation?.type === 'reject') return runAction(() => rejectEnrollment(session.accessToken, selected.enrollmentId, reason), 'Enrollment rejected.')
    if (confirmation?.type === 'resubmit') return runAction(() => resubmitEnrollment(session.accessToken, selected.enrollmentId), 'Enrollment resubmitted to DSWD.')
    if (confirmation?.type === 'document-accept') return reviewDocument(confirmation.document, 'ACCEPTED')
    if (confirmation?.type === 'document-reject') return reviewDocument(confirmation.document, 'REJECTED', reason)
    return undefined
  }

  async function reviewDocument(documentItem, decision, reason) {
    try {
      const updatedDocument = await reviewBeneficiaryDocument(session.accessToken, selected.beneficiaryId, documentItem.documentId, { decision, ...(reason ? { reason } : {}) })
      setSelected((current) => ({ ...current, beneficiary: { ...current.beneficiary, documents: current.beneficiary.documents.map((item) => item.documentId === updatedDocument.documentId ? updatedDocument : item) } }))
      setConfirmation(null)
      toast.success(decision === 'ACCEPTED' ? 'Document accepted.' : 'Document correction requested.')
    } catch (requestError) { reportError(requestError); throw requestError }
  }

  async function downloadDocument(documentItem) {
    try {
      const blob = await downloadBeneficiaryDocument(session.accessToken, selected.beneficiaryId, documentItem.documentId)
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = documentItem.originalFileName
      link.click()
      URL.revokeObjectURL(url)
    } catch (requestError) { reportError(requestError) }
  }

  const rows = data?.enrollments ?? []
  const requiredTypes = selected?.program.requiredDocumentTypes ?? []
  const acceptedTypes = new Set(selected?.beneficiary.documents.filter((item) => item.reviewStatus === 'ACCEPTED').map((item) => item.documentType))
  const unacceptedTypes = requiredTypes.filter((type) => !acceptedTypes.has(type))
  const confirmationContent = {
    approve: ['Approve this enrollment?', 'The beneficiary will become eligible for distribution under this program.', 'Approve enrollment', false],
    correction: ['Request a correction?', 'The facilitator will receive your note and can replace rejected documents before resubmitting.', 'Send correction request', false, 'Required correction'],
    reject: ['Reject this enrollment?', 'This closes the current enrollment review. The decision and reason are audit logged.', 'Reject enrollment', true, 'Rejection reason'],
    resubmit: ['Resubmit this enrollment?', 'The corrected enrollment will return to the DSWD pending review queue.', 'Resubmit enrollment', false],
    'document-accept': ['Accept this document?', 'The document will count toward this program’s approval requirements.', 'Accept document', false],
    'document-reject': ['Reject this document?', 'The facilitator must upload a corrected replacement before approval.', 'Reject document', true, 'Correction reason'],
  }[confirmation?.type] ?? []

  return (
    <DashboardShell breadcrumbs={['Operations', 'Beneficiary services', 'Enrollment review']} currentPath="/enrollments" onLogout={onLogout} onNavigate={onNavigate} pageTitle={isDswd ? 'Enrollment review' : 'Enrollments'} user={session.user}>
      <header className="border-b border-line pb-6"><p className="ga-eyebrow">Program eligibility workflow</p><h1 className="ga-page-title">{isDswd ? 'Enrollment review queue' : 'Beneficiary enrollments'}</h1><p className="ga-page-copy">{isDswd ? 'Validate submitted beneficiary documents and record a clear, accountable program decision.' : isFacilitator ? 'Track submissions, respond to correction requests, and return complete records for DSWD review.' : 'Review the status and audit-ready details of beneficiary program enrollments.'}</p></header>

      <form onSubmit={applyFilters} className="ga-card mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_13rem_18rem_auto] sm:p-5" aria-label="Enrollment filters"><div><label htmlFor="enrollment-search" className="sr-only">Search beneficiary</label><input id="enrollment-search" value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} placeholder="Search beneficiary name or PhilSys number" className="ga-input" /></div><div><label htmlFor="enrollment-status" className="sr-only">Enrollment status</label><select id="enrollment-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input">{statuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div><div><label htmlFor="enrollment-program" className="sr-only">Assistance program</label><select id="enrollment-program" value={draft.programId} onChange={(event) => setDraft((current) => ({ ...current, programId: event.target.value }))} className="ga-input"><option value="">All programs</option>{programs.map((program) => <option key={program.programId} value={program.programId}>{program.programCode} — {program.programName}</option>)}</select></div><button type="submit" className="ga-btn-primary">Apply filters</button></form>

      {isLoading ? <EnrollmentSkeleton /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="font-extrabold">Enrollments could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></section> : (
        <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(24rem,0.8fr)]">
          <section className="ga-card overflow-hidden"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="ga-section-heading">Review queue</h2><p className="mt-1 text-sm text-muted-copy">{data.pagination.total} matching enrollments</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-copy">Page {data.pagination.page}</span></div>
            {rows.length === 0 ? <div className="p-10 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft font-black text-brand-green">✓</span><h3 className="mt-4 font-extrabold">No enrollments in this view</h3><p className="mt-2 text-sm text-muted-copy">The current filter has no cases requiring attention.</p></div> : <><ul className="divide-y divide-line md:hidden">{rows.map((item) => <li key={item.enrollmentId} className={selected?.enrollmentId === item.enrollmentId ? 'bg-info-soft/60' : ''}><button type="button" onClick={() => setSelected(item)} className="w-full p-5 text-left"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold">{fullName(item.beneficiary)}</p><p className="mt-1 text-sm text-muted-copy">{item.program.programCode} · {item.beneficiary.barangay?.barangayName}</p></div><StatusBadge value={item.status} /></div></button></li>)}</ul><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">Beneficiary enrollment review queue</caption><thead><tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><th className="px-5 py-3">Beneficiary</th><th className="px-5 py-3">Program</th><th className="px-5 py-3">Submitted</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"><span className="sr-only">Action</span></th></tr></thead><tbody className="divide-y divide-line">{rows.map((item) => <tr key={item.enrollmentId} className={`hover:bg-slate-50 ${selected?.enrollmentId === item.enrollmentId ? 'bg-info-soft/60' : ''}`}><td className="px-5 py-4"><p className="font-bold text-ink">{fullName(item.beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">{item.beneficiary.barangay?.barangayName}</p></td><td className="px-5 py-4"><p className="font-semibold text-copy">{item.program.programCode}</p><p className="mt-1 max-w-48 truncate text-xs text-muted-copy">{item.program.programName}</p></td><td className="whitespace-nowrap px-5 py-4 text-xs text-muted-copy">{dateFormatter.format(new Date(item.createdAt))}</td><td className="px-5 py-4"><StatusBadge value={item.status} /></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => setSelected(item)} className="min-h-11 rounded-lg px-3 font-bold text-brand-blue hover:bg-info-soft">Review case</button></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-line px-5 py-4"><p className="text-xs font-semibold text-muted-copy">Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)}</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="ga-btn-secondary min-h-11 px-4 text-sm">Previous</button><button type="button" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)} className="ga-btn-secondary min-h-11 px-4 text-sm">Next</button></div></div></>}
          </section>

          <aside className="self-start xl:sticky xl:top-28">{!selected ? <div className="ga-card-flat p-7 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-xl font-black text-brand-blue">✓</span><h2 className="mt-4 text-lg font-extrabold">Select an enrollment</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Review identity, program requirements, documents, and the current decision state in one workspace.</p></div> : <div className="ga-card overflow-hidden"><div className="border-b border-line bg-brand-navy p-5 text-white"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-blue-200">{selected.program.programCode}</p><h2 className="mt-2 text-xl font-extrabold">{fullName(selected.beneficiary)}</h2><p className="mt-1 text-sm text-blue-100">{selected.program.programName}</p></div><StatusBadge value={selected.status} /></div><ReviewProgress status={selected.status} /></div>
            {selected.reviewNotes && <div className={`m-5 rounded-lg border p-4 text-sm leading-6 ${selected.status === 'NEEDS_CORRECTION' ? 'border-amber-200 bg-warning-soft text-brand-amber' : 'border-red-200 bg-danger-soft text-brand-red'}`}><p className="font-bold">{selected.status === 'NEEDS_CORRECTION' ? 'Correction requested' : 'Review note'}</p><p className="mt-1">{selected.reviewNotes}</p></div>}
            <div className="p-5"><div className="flex items-center justify-between"><h3 className="font-extrabold">Beneficiary record</h3><button type="button" onClick={() => onNavigate(`/beneficiaries?beneficiary=${selected.beneficiaryId}`)} className="min-h-11 rounded-lg px-3 text-xs font-bold text-brand-blue hover:bg-info-soft">Open full record</button></div><dl className="mt-3 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-copy">Barangay</dt><dd className="mt-1 font-bold">{selected.beneficiary.barangay?.barangayName}</dd></div><div><dt className="text-muted-copy">Submitted by</dt><dd className="mt-1 font-bold">{selected.submittedBy?.fullName}</dd></div></dl></div>
            <section className="border-t border-line p-5"><div className="flex items-center justify-between"><div><h3 className="font-extrabold">Required documents</h3><p className="mt-1 text-xs text-muted-copy">{requiredTypes.length} required by this program</p></div>{unacceptedTypes.length === 0 ? <span className="rounded-full border border-emerald-200 bg-success-soft px-2.5 py-1 text-xs font-bold text-brand-green">Ready</span> : <span className="rounded-full border border-amber-200 bg-warning-soft px-2.5 py-1 text-xs font-bold text-brand-amber">{unacceptedTypes.length} pending</span>}</div>
              {selected.beneficiary.documents.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-line p-4 text-sm text-muted-copy">No documents uploaded.</p> : <ul className="mt-4 space-y-3">{selected.beneficiary.documents.map((item) => { const required = requiredTypes.includes(item.documentType); return <li key={item.documentId} className={`rounded-lg border p-4 ${required ? 'border-blue-200 bg-info-soft/40' : 'border-line'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{humanize(item.documentType)}</p><p className="mt-1 truncate text-xs text-muted-copy">{required ? 'Program requirement' : 'Supporting document'} · {item.originalFileName}</p></div><StatusBadge value={item.reviewStatus} /></div>{item.reviewNotes && <p className="mt-3 rounded-md bg-danger-soft p-3 text-xs text-brand-red">{item.reviewNotes}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => downloadDocument(item)} className="min-h-11 rounded-lg border border-line px-3 text-xs font-bold text-brand-blue hover:bg-white">Download</button>{isDswd && selected.status === 'FOR_VALIDATION' && item.reviewStatus === 'SUBMITTED' && <><button type="button" onClick={() => setConfirmation({ type: 'document-accept', document: item })} className="min-h-11 rounded-lg bg-brand-green px-3 text-xs font-bold text-white">Accept</button><button type="button" onClick={() => setConfirmation({ type: 'document-reject', document: item })} className="min-h-11 rounded-lg border border-red-200 px-3 text-xs font-bold text-brand-red hover:bg-danger-soft">Reject</button></>}</div></li> })}</ul>}
            </section>
            <section className="border-t border-line p-5"><h3 className="font-extrabold">Available actions</h3>{isDswd && selected.status === 'PENDING' && <><p className="mt-2 text-sm leading-6 text-muted-copy">Claim this case for document and eligibility validation.</p><button type="button" onClick={() => runAction(() => startEnrollmentReview(session.accessToken, selected.enrollmentId), 'Enrollment review started.')} className="ga-btn-primary mt-4 w-full">Start validation</button></>}{isDswd && selected.status === 'FOR_VALIDATION' && <div className="mt-4 grid gap-3"><button type="button" disabled={unacceptedTypes.length > 0} onClick={() => setConfirmation({ type: 'approve' })} className="ga-btn-primary w-full">Approve enrollment</button>{unacceptedTypes.length > 0 && <p className="text-xs leading-5 text-brand-amber">Accept all required documents before approval: {unacceptedTypes.map(humanize).join(', ')}.</p>}<button type="button" onClick={() => setConfirmation({ type: 'correction' })} className="ga-btn-secondary w-full">Request correction</button><button type="button" onClick={() => setConfirmation({ type: 'reject' })} className="min-h-12 rounded-lg px-5 font-bold text-brand-red hover:bg-danger-soft">Reject enrollment</button></div>}{isFacilitator && selected.status === 'NEEDS_CORRECTION' && <><p className="mt-2 text-sm leading-6 text-muted-copy">Replace any rejected documents in the beneficiary record, then resubmit this case.</p><button type="button" onClick={() => onNavigate(`/beneficiaries?beneficiary=${selected.beneficiaryId}`)} className="ga-btn-secondary mt-4 w-full">Correct beneficiary documents</button><button type="button" onClick={() => setConfirmation({ type: 'resubmit' })} className="ga-btn-primary mt-3 w-full">Resubmit for review</button></>}{!((isDswd && ['PENDING', 'FOR_VALIDATION'].includes(selected.status)) || (isFacilitator && selected.status === 'NEEDS_CORRECTION')) && <p className="mt-2 text-sm leading-6 text-muted-copy">No action is required for this enrollment in its current status.</p>}</section>
          </div>}</aside>
        </div>
      )}

      {confirmation && <ConfirmationDialog open title={confirmationContent[0]} description={confirmationContent[1]} actionLabel={confirmationContent[2]} destructive={confirmationContent[3]} reasonLabel={confirmationContent[4]} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />}
    </DashboardShell>
  )
}

export default EnrollmentReviewPage
