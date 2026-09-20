import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { useMotionEntry } from '../components/ui/use-motion-entry.js'
import {
  approveEnrollment,
  downloadBeneficiaryDocument,
  getAuthErrorMessage,
  isSessionExpiredError,
  rejectEnrollment,
  requestEnrollment,
  requestEnrollmentCorrection,
  requestEnrollmentList,
  requestPrograms,
  resubmitEnrollment,
  reviewBeneficiaryDocument,
  startEnrollmentReview,
} from '../auth/staffAuth.js'
import {
  applyManualEligibilityDecisions,
  eligibilityApprovalBlockers,
  manualEligibilityPayload,
} from '../utils/enrollmentEligibility.js'

const statuses = ['', 'PENDING', 'FOR_VALIDATION', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED', 'SUSPENDED', 'WITHDRAWN']
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const dateOnlyFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
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
  return <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(27rem,0.95fr)]" role="status" aria-label="Loading enrollments"><div className="ga-card p-5"><Skeleton className="h-10 w-full" />{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="mt-4 h-16 w-full" />)}</div><div className="ga-card p-6"><Skeleton className="h-7 w-52" /><Skeleton className="mt-5 h-28 w-full" /><Skeleton className="mt-4 h-52 w-full" /></div></div>
}

function ReviewProgress({ status }) {
  const step = status === 'PENDING' ? 1 : ['FOR_VALIDATION', 'NEEDS_CORRECTION'].includes(status) ? 2 : ['APPROVED', 'REJECTED'].includes(status) ? 3 : 1
  return <ol className="mt-5 grid grid-cols-3" aria-label="Enrollment review progress">{['Submitted', 'Validation', 'Decision'].map((label, index) => <li key={label} className="relative text-center"><span aria-hidden="true" className={`relative z-10 mx-auto grid size-8 place-items-center rounded-full border-2 text-xs font-black ${index + 1 <= step ? 'border-brand-blue bg-brand-blue text-white' : 'border-line bg-white text-muted-copy'}`}>{index + 1}</span>{index < 2 && <span aria-hidden="true" className={`absolute left-1/2 top-4 h-0.5 w-full ${index + 1 < step ? 'bg-brand-blue' : 'bg-line'}`} />}<span className="relative z-10 mt-2 block text-xs font-bold text-copy">{label}</span></li>)}</ol>
}

const eligibilityStatus = {
  ELIGIBLE: { label: 'Eligible for approval', copy: 'Every mandatory rule is met.', icon: 'check', tone: 'border-emerald-200 bg-success-soft text-brand-green' },
  INELIGIBLE: { label: 'Eligibility blocked', copy: 'A mandatory rule is not met.', icon: 'close', tone: 'border-red-200 bg-danger-soft text-brand-red' },
  REVIEW_REQUIRED: { label: 'Reviewer input needed', copy: 'Complete the manual checks below.', icon: 'clock', tone: 'border-amber-200 bg-warning-soft text-brand-amber' },
}

const resultStatus = {
  MET: { label: 'Met', icon: 'check', tone: 'bg-success-soft text-brand-green' },
  NOT_MET: { label: 'Not met', icon: 'close', tone: 'bg-danger-soft text-brand-red' },
  REVIEW_REQUIRED: { label: 'Review needed', icon: 'clock', tone: 'bg-warning-soft text-brand-amber' },
}

function valueText(value) {
  if (Array.isArray(value)) return value.map((item) => humanize(String(item))).join(', ')
  if (typeof value === 'boolean') return value ? 'Required' : 'Not required'
  if (value === null || value === undefined) return 'Not recorded'
  return humanize(String(value))
}

function ruleText(result) {
  if (result.fieldName === 'MANUAL_REVIEW') return 'Documented DSWD judgment with remarks'
  if (result.fieldName === 'DOCUMENT_TYPE') return `${humanize(result.expectedValue)} must be accepted`
  return `${humanize(result.fieldName)} ${humanize(result.operator)} ${valueText(result.expectedValue)}`
}

function actualText(result, beneficiary) {
  if (result.fieldName === 'AGE') return `${result.actualValue} years old on the enrollment date`
  if (result.fieldName === 'BARANGAY_ID' && result.actualValue === beneficiary?.barangayId) return beneficiary.barangay?.barangayName ?? result.actualValue
  if (result.fieldName === 'DOCUMENT_TYPE') return result.actualValue?.accepted ? 'Accepted document found' : 'No accepted document found'
  if (result.fieldName === 'MANUAL_REVIEW') return result.actualValue?.remarks ?? 'Awaiting reviewer decision'
  return valueText(result.actualValue)
}

function EligibilityOverview({ beneficiary, decisions, editable, evaluation, onDecisionChange }) {
  if (!evaluation) return <section className="border-t border-line p-5" aria-busy="true"><div className="flex items-center gap-3"><Skeleton className="size-11 rounded-xl" /><div className="flex-1"><Skeleton className="h-5 w-40" /><Skeleton className="mt-2 h-4 w-56" /></div></div><Skeleton className="mt-4 h-32 w-full" /></section>

  const status = eligibilityStatus[evaluation.overallStatus] ?? eligibilityStatus.REVIEW_REQUIRED
  const referenceDate = evaluation.referenceDate ? dateOnlyFormatter.format(new Date(`${evaluation.referenceDate}T00:00:00+08:00`)) : 'Not recorded'
  const evidenceSource = evaluation.schemaVersion
    ? `Preserved approval evidence${evaluation.evaluatedAt ? ` · ${dateFormatter.format(new Date(evaluation.evaluatedAt))}` : ''}`
    : 'Current rule preview'
  return (
    <section className="border-t border-line p-5" aria-labelledby="eligibility-heading" aria-live="polite">
      <div className={`rounded-xl border p-4 ${status.tone}`}>
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/80"><Icon name={status.icon} /></span><div><p className="text-xs font-bold uppercase tracking-[0.08em]">{evidenceSource}</p><h3 id="eligibility-heading" className="mt-1 text-lg font-extrabold">{status.label}</h3><p className="mt-1 text-sm leading-5">{status.copy}</p></div></div>
        <p className="mt-3 border-t border-current/15 pt-3 text-xs font-semibold">Age and demographic rules use the enrollment date: {referenceDate}.</p>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['Met', evaluation.summary?.met ?? 0, 'text-brand-green'],
          ['Not met', evaluation.summary?.notMet ?? 0, 'text-brand-red'],
          ['Review', evaluation.summary?.reviewRequired ?? 0, 'text-brand-amber'],
        ].map(([label, value, tone]) => <div key={label} className="rounded-lg border border-line bg-slate-50 px-2 py-3"><dt className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-muted-copy">{label}</dt><dd className={`mt-1 text-xl font-black tabular-nums ${tone}`}>{value}</dd></div>)}
      </dl>

      <ol className="mt-4 space-y-3" aria-label="Eligibility criteria results">
        {evaluation.results.map((result, index) => {
          const outcome = resultStatus[result.outcome] ?? resultStatus.REVIEW_REQUIRED
          const decision = decisions[result.criterionId] ?? {}
          const isManualEditable = editable && result.fieldName === 'MANUAL_REVIEW'
          return (
            <li key={result.criterionId} className="rounded-xl border border-line bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${outcome.tone}`}><Icon name={outcome.icon} className="size-4" strokeWidth={2.2} /></span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold text-ink">{index + 1}. {result.criterionName}</p><span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${outcome.tone}`}>{outcome.label}</span><span className="rounded-full border border-line bg-slate-50 px-2 py-0.5 text-[0.6875rem] font-bold text-copy">{result.isRequired ? 'Mandatory' : 'Advisory'}</span></div><p className="mt-1 text-xs font-semibold text-brand-blue">{ruleText(result)}</p><p className="mt-2 text-sm leading-5 text-copy"><span className="font-bold">Evidence:</span> {actualText(result, beneficiary)}</p></div>
              </div>

              {isManualEditable && <fieldset className="mt-4 border-t border-line pt-4"><legend className="ga-label">Reviewer decision</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{[[true, 'Satisfied'], [false, 'Not satisfied']].map(([passed, label]) => <label key={label} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm font-bold ${decision.passed === passed ? 'border-brand-blue bg-info-soft text-brand-navy' : 'border-line text-copy hover:bg-slate-50'}`}><input type="radio" name={`manual-${result.criterionId}`} checked={decision.passed === passed} onChange={() => onDecisionChange(result.criterionId, 'passed', passed)} className="size-4 accent-brand-blue" /><span>{label}</span></label>)}</div><label htmlFor={`manual-remarks-${result.criterionId}`} className="ga-label mt-4 block">Evidence remarks</label><textarea id={`manual-remarks-${result.criterionId}`} rows="3" maxLength="1000" value={decision.remarks ?? ''} onChange={(event) => onDecisionChange(result.criterionId, 'remarks', event.target.value)} aria-describedby={`manual-remarks-help-${result.criterionId}`} placeholder="State the evidence reviewed and why it supports this decision." className="ga-input mt-2 min-h-24 resize-y py-3" /><p id={`manual-remarks-help-${result.criterionId}`} className={`mt-2 text-xs leading-5 ${(decision.remarks?.trim().length ?? 0) > 0 && decision.remarks.trim().length < 5 ? 'text-brand-red' : 'text-muted-copy'}`}>At least 5 characters. These remarks become part of the approval evidence.</p></fieldset>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function EnrollmentReviewPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const [draft, setDraft] = useState({ search: '', status: '', programId: '' })
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [programs, setPrograms] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [selected, setSelected] = useState(null)
  const [manualDecisions, setManualDecisions] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [detailReload, setDetailReload] = useState(0)
  const [confirmation, setConfirmation] = useState(null)
  const role = session.user.role
  const isDswd = role === 'DSWD_STAFF'
  const isFacilitator = role === 'BARANGAY_FACILITATOR'
  const detailRef = useMotionEntry(selected?.enrollmentId ? `${selected.enrollmentId}:${selected.updatedAt ?? ''}:${detailReload}` : 'empty-enrollment')

  function reportError(requestError, inline = false) {
    if (isSessionExpiredError(requestError)) return onSessionExpired()
    const message = getAuthErrorMessage(requestError)
    if (inline) setActionError(message)
    toast.error(message)
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
        setSelectedId((current) => current && !result.enrollments.some((item) => item.enrollmentId === current) ? '' : current)
      })
      .catch((requestError) => { if (active) { if (isSessionExpiredError(requestError)) return onSessionExpired(); setError(getAuthErrorMessage(requestError)) } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [filters, onSessionExpired, page, reload, session.accessToken])

  useEffect(() => {
    if (!selectedId) return undefined
    let active = true
    requestEnrollment(session.accessToken, selectedId)
      .then((enrollment) => { if (active) { setSelected(enrollment); setDetailError('') } })
      .catch((requestError) => {
        if (!active) return
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        setDetailError(getAuthErrorMessage(requestError))
      })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [detailReload, onSessionExpired, selectedId, session.accessToken])

  function chooseEnrollment(item) {
    setSelected(item)
    setSelectedId(item.enrollmentId)
    setDetailLoading(true)
    setManualDecisions({})
    setActionError('')
    setDetailError('')
    setConfirmation(null)
  }

  function applyFilters(event) {
    event.preventDefault()
    setIsLoading(true)
    setPage(1)
    setSelectedId('')
    setSelected(null)
    setManualDecisions({})
    setActionError('')
    setConfirmation(null)
    setFilters({ search: draft.search.trim(), status: draft.status, programId: draft.programId })
  }

  async function runAction(action, successMessage, actionName, rethrow = false) {
    setBusyAction(actionName)
    setActionError('')
    try {
      const updated = await action()
      setSelected((current) => ({ ...current, ...updated, eligibilityEvaluation: updated.eligibilityEvaluation ?? current?.eligibilityEvaluation }))
      setConfirmation(null)
      setReload((value) => value + 1)
      setDetailLoading(true)
      setDetailReload((value) => value + 1)
      toast.success(successMessage, { description: `${fullName(updated.beneficiary)} · ${humanize(updated.status)}` })
    } catch (requestError) {
      if (requestError.details?.eligibilityEvaluation) {
        setSelected((current) => ({ ...current, eligibilityEvaluation: requestError.details.eligibilityEvaluation }))
      }
      reportError(requestError, true)
      if (requestError.status === 409) {
        setDetailLoading(true)
        setDetailReload((value) => value + 1)
      }
      if (rethrow) throw requestError
    } finally {
      setBusyAction('')
    }
  }

  function confirmAction(reason) {
    if (confirmation?.type === 'approve') return runAction(() => approveEnrollment(session.accessToken, selected.enrollmentId, { remarks: '', manualDecisions: manualEligibilityPayload(selected.eligibilityEvaluation, manualDecisions) }), 'Enrollment approved.', 'approve', true)
    if (confirmation?.type === 'correction') return runAction(() => requestEnrollmentCorrection(session.accessToken, selected.enrollmentId, reason), 'Correction request sent.', 'correction', true)
    if (confirmation?.type === 'reject') return runAction(() => rejectEnrollment(session.accessToken, selected.enrollmentId, reason), 'Enrollment rejected.', 'reject', true)
    if (confirmation?.type === 'resubmit') return runAction(() => resubmitEnrollment(session.accessToken, selected.enrollmentId), 'Enrollment resubmitted to DSWD.', 'resubmit', true)
    if (confirmation?.type === 'document-accept') return reviewDocument(confirmation.document, 'ACCEPTED')
    if (confirmation?.type === 'document-reject') return reviewDocument(confirmation.document, 'REJECTED', reason)
    return undefined
  }

  async function reviewDocument(documentItem, decision, reason) {
    setBusyAction(`document-${documentItem.documentId}`)
    setActionError('')
    try {
      const updatedDocument = await reviewBeneficiaryDocument(session.accessToken, selected.beneficiaryId, documentItem.documentId, { decision, ...(reason ? { reason } : {}) })
      setSelected((current) => ({ ...current, beneficiary: { ...current.beneficiary, documents: current.beneficiary.documents.map((item) => item.documentId === updatedDocument.documentId ? updatedDocument : item) } }))
      setConfirmation(null)
      setDetailLoading(true)
      setDetailReload((value) => value + 1)
      toast.success(decision === 'ACCEPTED' ? 'Document accepted.' : 'Document correction requested.')
    } catch (requestError) {
      reportError(requestError, true)
      throw requestError
    } finally {
      setBusyAction('')
    }
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

  function changeManualDecision(criterionId, field, value) {
    setManualDecisions((current) => ({
      ...current,
      [criterionId]: { ...current[criterionId], [field]: value },
    }))
    setActionError('')
  }

  const rows = data?.enrollments ?? []
  const documents = selected?.beneficiary?.documents ?? []
  const requiredTypes = selected?.program?.requiredDocumentTypes ?? []
  const acceptedTypes = new Set(documents.filter((item) => item.reviewStatus === 'ACCEPTED').map((item) => item.documentType))
  const unacceptedTypes = requiredTypes.filter((type) => !acceptedTypes.has(type))
  const eligibility = applyManualEligibilityDecisions(selected?.eligibilityEvaluation, manualDecisions)
  const approvalBlockers = eligibilityApprovalBlockers(eligibility, unacceptedTypes)
  const approvalReady = approvalBlockers.length === 0 && !detailLoading && !detailError
  const confirmationContent = {
    approve: ['Approve this enrollment?', `${eligibility?.summary?.met ?? 0} of ${eligibility?.summary?.total ?? 0} eligibility criteria are met and all required documents are accepted. The decision evidence will be audit logged.`, 'Approve enrollment', false],
    correction: ['Request a correction?', 'The facilitator will receive your note and can replace rejected documents before resubmitting.', 'Send correction request', false, 'Required correction'],
    reject: ['Reject this enrollment?', 'This closes the current enrollment review. The decision and reason are audit logged.', 'Reject enrollment', true, 'Rejection reason'],
    resubmit: ['Resubmit this enrollment?', 'The corrected enrollment will return to the DSWD pending review queue.', 'Resubmit enrollment', false],
    'document-accept': ['Accept this document?', 'The document will count toward this program’s approval requirements.', 'Accept document', false],
    'document-reject': ['Reject this document?', 'The facilitator must upload a corrected replacement before approval.', 'Reject document', true, 'Correction reason'],
  }[confirmation?.type] ?? []

  return (
    <DashboardShell breadcrumbs={['Operations', 'Beneficiary services', 'Enrollment review']} currentPath="/enrollments" onLogout={onLogout} onNavigate={onNavigate} pageTitle={isDswd ? 'Enrollment review' : 'Enrollments'} user={session.user}>
      <header className="border-b border-line pb-6"><p className="ga-eyebrow">Program eligibility workflow</p><h1 className="ga-page-title">{isDswd ? 'Enrollment review queue' : 'Beneficiary enrollments'}</h1><p className="ga-page-copy">{isDswd ? 'Review every criterion, verify accepted documents, and record a defensible program decision.' : isFacilitator ? 'Track submissions, respond to correction requests, and return complete records for DSWD review.' : 'Review the status and preserved eligibility evidence for beneficiary enrollments.'}</p></header>

      <form onSubmit={applyFilters} className="ga-card mt-6 grid items-end gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_13rem_18rem_auto] sm:p-5" aria-label="Enrollment filters">
        <div><label htmlFor="enrollment-search" className="ga-label">Beneficiary</label><input id="enrollment-search" value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} placeholder="Name or PhilSys number" className="ga-input mt-2" /></div>
        <div><label htmlFor="enrollment-status" className="ga-label">Status</label><select id="enrollment-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input mt-2">{statuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div>
        <div><label htmlFor="enrollment-program" className="ga-label">Assistance program</label><select id="enrollment-program" value={draft.programId} onChange={(event) => setDraft((current) => ({ ...current, programId: event.target.value }))} className="ga-input mt-2"><option value="">All programs</option>{programs.map((program) => <option key={program.programId} value={program.programId}>{program.programCode} — {program.programName}</option>)}</select></div>
        <button type="submit" className="ga-btn-primary">Apply filters</button>
      </form>

      {isLoading ? <EnrollmentSkeleton /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="font-extrabold">Enrollments could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></section> : (
        <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(27rem,0.95fr)]">
          <section className="ga-card overflow-hidden"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="ga-section-heading">Review queue</h2><p className="mt-1 text-sm text-muted-copy">{data.pagination.total} matching enrollments</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-copy">Page {data.pagination.page}</span></div>
            {rows.length === 0 ? <div className="p-10 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-brand-green"><Icon name="check" className="size-6" /></span><h3 className="mt-4 font-extrabold">No enrollments in this view</h3><p className="mt-2 text-sm text-muted-copy">The current filter has no cases requiring attention.</p></div> : <><ul className="divide-y divide-line md:hidden">{rows.map((item) => <li key={item.enrollmentId} className={selectedId === item.enrollmentId ? 'bg-info-soft/60' : ''}><button type="button" aria-pressed={selectedId === item.enrollmentId} onClick={() => chooseEnrollment(item)} className="w-full p-5 text-left"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold">{fullName(item.beneficiary)}</p><p className="mt-1 text-sm text-muted-copy">{item.program.programCode} · {item.beneficiary.barangay?.barangayName}</p></div><StatusBadge value={item.status} /></div></button></li>)}</ul><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">Beneficiary enrollment review queue</caption><thead><tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><th className="px-5 py-3">Beneficiary</th><th className="px-5 py-3">Program</th><th className="px-5 py-3">Submitted</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"><span className="sr-only">Action</span></th></tr></thead><tbody className="divide-y divide-line">{rows.map((item) => <tr key={item.enrollmentId} className={`hover:bg-slate-50 ${selectedId === item.enrollmentId ? 'bg-info-soft/60' : ''}`}><td className="px-5 py-4"><p className="font-bold text-ink">{fullName(item.beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">{item.beneficiary.barangay?.barangayName}</p></td><td className="px-5 py-4"><p className="font-semibold text-copy">{item.program.programCode}</p><p className="mt-1 max-w-48 truncate text-xs text-muted-copy">{item.program.programName}</p></td><td className="whitespace-nowrap px-5 py-4 text-xs text-muted-copy">{dateFormatter.format(new Date(item.createdAt))}</td><td className="px-5 py-4"><StatusBadge value={item.status} /></td><td className="px-5 py-4 text-right"><button type="button" aria-pressed={selectedId === item.enrollmentId} onClick={() => chooseEnrollment(item)} className="min-h-11 rounded-lg px-3 font-bold text-brand-blue hover:bg-info-soft">Review case</button></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-line px-5 py-4"><p className="text-xs font-semibold text-muted-copy">Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)}</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="ga-btn-secondary min-h-11 px-4 text-sm">Previous</button><button type="button" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)} className="ga-btn-secondary min-h-11 px-4 text-sm">Next</button></div></div></>}
          </section>

          <aside ref={detailRef} className="self-start xl:sticky xl:top-28">{!selectedId || !selected ? <div className="ga-card-flat p-7 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-brand-blue"><Icon name="enrollments" className="size-6" /></span><h2 className="mt-4 text-lg font-extrabold">Select an enrollment</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Open a case to review the rule-by-rule eligibility result, documents, and decision state.</p></div> : <div className="ga-card overflow-hidden" aria-busy={detailLoading}><div className="border-b border-line bg-brand-navy p-5 text-white"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-blue-200">{selected.program.programCode}</p><h2 className="mt-2 text-xl font-extrabold">{fullName(selected.beneficiary)}</h2><p className="mt-1 text-sm text-blue-100">{selected.program.programName}</p></div><StatusBadge value={selected.status} /></div><ReviewProgress status={selected.status} /></div>
            {detailError && <div className="m-5 rounded-xl border border-red-200 bg-danger-soft p-4 text-sm text-brand-red" role="alert"><p className="font-bold">Eligibility evidence could not be loaded</p><p className="mt-1 leading-5">{detailError}</p><button type="button" onClick={() => { setDetailLoading(true); setDetailReload((value) => value + 1) }} className="mt-3 min-h-11 rounded-lg bg-white px-3 font-bold text-brand-red">Try again</button></div>}
            {selected.reviewNotes && <div className={`m-5 rounded-lg border p-4 text-sm leading-6 ${selected.status === 'NEEDS_CORRECTION' ? 'border-amber-200 bg-warning-soft text-brand-amber' : 'border-red-200 bg-danger-soft text-brand-red'}`}><p className="font-bold">{selected.status === 'NEEDS_CORRECTION' ? 'Correction requested' : 'Review note'}</p><p className="mt-1">{selected.reviewNotes}</p></div>}
            <div className="p-5"><div className="flex items-center justify-between"><h3 className="font-extrabold">Beneficiary record</h3><button type="button" onClick={() => onNavigate(`/beneficiaries?beneficiary=${selected.beneficiaryId}`)} className="min-h-11 rounded-lg px-3 text-xs font-bold text-brand-blue hover:bg-info-soft">Open full record</button></div><dl className="mt-3 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-copy">Barangay</dt><dd className="mt-1 font-bold">{selected.beneficiary.barangay?.barangayName}</dd></div><div><dt className="text-muted-copy">Submitted by</dt><dd className="mt-1 font-bold">{selected.submittedBy?.fullName}</dd></div></dl></div>

            <EligibilityOverview beneficiary={selected.beneficiary} decisions={manualDecisions} editable={isDswd && selected.status === 'FOR_VALIDATION'} evaluation={eligibility} onDecisionChange={changeManualDecision} />

            <section className="border-t border-line p-5"><div className="flex items-center justify-between"><div><h3 className="font-extrabold">Required documents</h3><p className="mt-1 text-xs text-muted-copy">{requiredTypes.length} required by this program</p></div>{unacceptedTypes.length === 0 ? <span className="rounded-full border border-emerald-200 bg-success-soft px-2.5 py-1 text-xs font-bold text-brand-green">Ready</span> : <span className="rounded-full border border-amber-200 bg-warning-soft px-2.5 py-1 text-xs font-bold text-brand-amber">{unacceptedTypes.length} pending</span>}</div>
              {documents.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-line p-4 text-sm text-muted-copy">No documents uploaded.</p> : <ul className="mt-4 space-y-3">{documents.map((item) => { const required = requiredTypes.includes(item.documentType); const documentBusy = busyAction === `document-${item.documentId}`; return <li key={item.documentId} className={`rounded-lg border p-4 ${required ? 'border-blue-200 bg-info-soft/40' : 'border-line'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{humanize(item.documentType)}</p><p className="mt-1 truncate text-xs text-muted-copy">{required ? 'Program requirement' : 'Supporting document'} · {item.originalFileName}</p></div><StatusBadge value={item.reviewStatus} /></div>{item.reviewNotes && <p className="mt-3 rounded-md bg-danger-soft p-3 text-xs text-brand-red">{item.reviewNotes}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => downloadDocument(item)} className="min-h-11 rounded-lg border border-line px-3 text-xs font-bold text-brand-blue hover:bg-white">Download</button>{isDswd && selected.status === 'FOR_VALIDATION' && item.reviewStatus === 'SUBMITTED' && <><button type="button" disabled={documentBusy} onClick={() => setConfirmation({ type: 'document-accept', document: item })} className="min-h-11 rounded-lg bg-brand-green px-3 text-xs font-bold text-white disabled:opacity-60">Accept</button><button type="button" disabled={documentBusy} onClick={() => setConfirmation({ type: 'document-reject', document: item })} className="min-h-11 rounded-lg border border-red-200 px-3 text-xs font-bold text-brand-red hover:bg-danger-soft disabled:opacity-60">Reject</button></>}</div></li> })}</ul>}
            </section>

            <section className="border-t border-line p-5" aria-describedby={approvalBlockers.length > 0 ? 'approval-blockers' : undefined}><h3 className="font-extrabold">Available actions</h3>{actionError && <div className="mt-3 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm leading-5 text-brand-red" role="alert">{actionError}</div>}{isDswd && selected.status === 'PENDING' && <><p className="mt-2 text-sm leading-6 text-muted-copy">Claim this case for document and eligibility validation.</p><button type="button" disabled={Boolean(busyAction) || detailLoading} onClick={() => runAction(() => startEnrollmentReview(session.accessToken, selected.enrollmentId), 'Enrollment review started.', 'start-review')} className="ga-btn-primary mt-4 w-full">{busyAction === 'start-review' ? <LoadingLabel>Starting validation...</LoadingLabel> : 'Start validation'}</button></>}{isDswd && selected.status === 'FOR_VALIDATION' && <div className="mt-4 grid gap-3"><button type="button" disabled={!approvalReady || Boolean(busyAction)} onClick={() => setConfirmation({ type: 'approve' })} className="ga-btn-primary w-full">Approve enrollment</button>{approvalBlockers.length > 0 && <div id="approval-blockers" className="rounded-lg border border-amber-200 bg-warning-soft p-3 text-xs leading-5 text-brand-amber"><p className="font-bold">Approval is waiting for:</p><ul className="mt-1 list-disc space-y-1 pl-4">{approvalBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}<button type="button" disabled={Boolean(busyAction)} onClick={() => setConfirmation({ type: 'correction' })} className="ga-btn-secondary w-full">Request correction</button><button type="button" disabled={Boolean(busyAction)} onClick={() => setConfirmation({ type: 'reject' })} className="min-h-12 rounded-lg px-5 font-bold text-brand-red hover:bg-danger-soft disabled:opacity-60">Reject enrollment</button></div>}{isFacilitator && selected.status === 'NEEDS_CORRECTION' && <><p className="mt-2 text-sm leading-6 text-muted-copy">Replace any rejected documents in the beneficiary record, then resubmit this case.</p><button type="button" onClick={() => onNavigate(`/beneficiaries?beneficiary=${selected.beneficiaryId}`)} className="ga-btn-secondary mt-4 w-full">Correct beneficiary documents</button><button type="button" disabled={Boolean(busyAction)} onClick={() => setConfirmation({ type: 'resubmit' })} className="ga-btn-primary mt-3 w-full">Resubmit for review</button></>}{!((isDswd && ['PENDING', 'FOR_VALIDATION'].includes(selected.status)) || (isFacilitator && selected.status === 'NEEDS_CORRECTION')) && <p className="mt-2 text-sm leading-6 text-muted-copy">No action is required for this enrollment in its current status.</p>}</section>
          </div>}</aside>
        </div>
      )}

      {confirmation && <ConfirmationDialog open title={confirmationContent[0]} description={confirmationContent[1]} actionLabel={confirmationContent[2]} destructive={confirmationContent[3]} reasonLabel={confirmationContent[4]} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />}
    </DashboardShell>
  )
}

export default EnrollmentReviewPage
