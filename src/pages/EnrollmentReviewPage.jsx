import { enrollmentLocation, readEnrollmentLocation } from '../utils/enrollmentLocation.js'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import BeneficiaryWorkflowNav from '../components/beneficiaries/BeneficiaryWorkflowNav.jsx'
import BeneficiaryDocumentPreview from '../components/beneficiaries/BeneficiaryDocumentPreview.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { useMotionEntry } from '../components/ui/use-motion-entry.js'
import { programDocumentRequirements, missingProgramDocuments, documentMeetsRequirement } from '../utils/programDocuments.js'
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
  enrollmentReadiness,
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
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>{value === 'SUBMITTED' ? 'Awaiting review' : humanize(value)}</span>
}

function EnrollmentSkeleton({ selected }) {
  return <div className={`mt-6 grid items-start gap-5 ${selected ? 'xl:grid-cols-[20rem_minmax(0,1fr)]' : ''}`} role="status" aria-label="Loading enrollments"><div className="ga-card p-5"><Skeleton className="h-7 w-48" />{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="mt-4 h-16 w-full" />)}</div>{selected && <div className="ga-card p-6"><Skeleton className="h-7 w-52" /><Skeleton className="mt-5 h-28 w-full" /><Skeleton className="mt-4 h-52 w-full" /></div>}</div>
}

function ReviewProgress({ status }) {
  const step = status === 'PENDING' ? 1 : ['FOR_VALIDATION', 'NEEDS_CORRECTION'].includes(status) ? 2 : ['APPROVED', 'REJECTED'].includes(status) ? 3 : 1
  return <ol className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4" aria-label="Enrollment review progress">{['Submitted', 'Validation', 'Decision'].map((label, index) => <li key={label} aria-current={index + 1 === step ? 'step' : undefined} className={`flex min-w-0 flex-col items-center gap-1.5 text-xs sm:flex-row sm:gap-2 sm:text-sm ${index + 1 === step ? 'font-semibold text-brand-blue' : 'text-muted-copy'}`}><span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs ${index + 1 <= step ? 'border-brand-blue bg-brand-blue text-white' : 'border-line bg-white'}`}>{index + 1 < step ? <Icon name="check" className="size-3.5" /> : index + 1}</span><span>{label}</span></li>)}</ol>
}

const eligibilityStatus = {
  ELIGIBLE: { label: 'Required eligibility criteria met', copy: 'Required documents are checked separately before approval.' },
  INELIGIBLE: { label: 'Eligibility blocked', copy: 'A mandatory rule is not met.' },
  REVIEW_REQUIRED: { label: 'Reviewer input needed', copy: 'Complete the manual checks below.' },
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
  const operator = { EQUALS: 'is', NOT_EQUALS: 'is not', GREATER_THAN: 'more than', GREATER_THAN_OR_EQUAL: 'at least', LESS_THAN: 'less than', LESS_THAN_OR_EQUAL: 'at most', IN: 'one of', NOT_IN: 'not one of' }[result.operator] ?? humanize(result.operator)
  return `${humanize(result.fieldName)} · ${operator} ${valueText(result.expectedValue)}${result.fieldName === 'AGE' ? ' years' : ''}`
}

function actualText(result, beneficiary) {
  if (result.fieldName === 'AGE') return `${result.actualValue} years old on the enrollment date`
  if (result.fieldName === 'BARANGAY_ID' && result.actualValue === beneficiary?.barangayId) return beneficiary.barangay?.barangayName ?? result.actualValue
  if (result.fieldName === 'DOCUMENT_TYPE') return result.actualValue?.accepted ? 'Accepted document found' : 'No accepted document found'
  if (result.fieldName === 'MANUAL_REVIEW') return result.actualValue?.remarks ?? 'Awaiting reviewer decision'
  return valueText(result.actualValue)
}

function EligibilityOverview({ beneficiary, decisions, editable, error, evaluation, onDecisionChange }) {
  if (!evaluation || error) return <section className="border-t border-line p-5" aria-labelledby="eligibility-heading"><h3 id="eligibility-heading" tabIndex={-1} className="scroll-mt-32 font-extrabold">Eligibility checks</h3><p className="mt-3 text-sm leading-6 text-muted-copy">{error ? 'Evidence is not confirmed. Reload the case using Try again above.' : <LoadingLabel>Loading eligibility evidence…</LoadingLabel>}</p></section>

  const status = eligibilityStatus[evaluation.overallStatus] ?? eligibilityStatus.REVIEW_REQUIRED
  const referenceDate = evaluation.referenceDate ? dateOnlyFormatter.format(new Date(`${evaluation.referenceDate}T00:00:00+08:00`)) : 'Not recorded'
  const evidenceSource = evaluation.schemaVersion
    ? `Preserved approval evidence${evaluation.evaluatedAt ? ` · ${dateFormatter.format(new Date(evaluation.evaluatedAt))}` : ''}`
    : 'Current rule preview'
  return (
    <section className="border-t border-line px-5 py-5 sm:px-6" aria-labelledby="eligibility-heading">
      <h3 id="eligibility-heading" tabIndex={-1} className="flex scroll-mt-32 items-center gap-2 font-semibold"><Icon name="security" className="size-5 text-brand-blue" />Eligibility checks</h3>
      <p className="mt-1 text-xs text-muted-copy">{evidenceSource} · Reference date: {referenceDate}</p>
      <p className="mt-3 text-sm font-semibold text-ink">{evaluation.results.length ? status.label : 'No eligibility criteria configured'}</p>
      <p className="mt-1 text-sm leading-6 text-muted-copy">{evaluation.results.length ? status.copy : 'This program has no rule checks. Required documents still need to be accepted.'}</p>
      {evaluation.results.length > 0 && <p className="mt-2 text-xs text-muted-copy">{evaluation.summary?.met ?? 0} met · {evaluation.summary?.notMet ?? 0} not met · {evaluation.summary?.reviewRequired ?? 0} awaiting review</p>}

      <ol className="mt-4 divide-y divide-line border-y border-line" aria-label="Eligibility criteria results">
        {evaluation.results.map((result, index) => {
          const outcome = resultStatus[result.outcome] ?? resultStatus.REVIEW_REQUIRED
          const decision = decisions[result.criterionId] ?? {}
          const isManualEditable = editable && result.fieldName === 'MANUAL_REVIEW'
          return (
            <li key={result.criterionId} className="bg-white py-4">
              <div className="flex items-start gap-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${outcome.tone}`}><Icon name={outcome.icon} className="size-4" strokeWidth={2.2} /></span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-ink">{index + 1}. {result.criterionName}</p><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${outcome.tone}`}>{outcome.label}</span><span className="rounded-full border border-line bg-slate-50 px-2 py-0.5 text-xs font-medium text-copy">{result.isRequired ? 'Mandatory' : 'Advisory'}</span></div><p className="mt-1 text-sm leading-6 text-copy">{ruleText(result)}</p><p className="mt-1 text-sm leading-6 text-copy"><span className="font-medium">Evidence:</span> {actualText(result, beneficiary)}</p></div>
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
  const [initialLocation] = useState(() => readEnrollmentLocation(window.location.search))
  const [draft, setDraft] = useState(initialLocation.filters)
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(initialLocation.page)
  const [data, setData] = useState(null)
  const [programs, setPrograms] = useState([])
  const [selectedId, setSelectedId] = useState(initialLocation.selectedId)
  const [selected, setSelected] = useState(null)
  const [manualDecisions, setManualDecisions] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(Boolean(initialLocation.selectedId))
  const [detailError, setDetailError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const actionPending = useRef(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [detailReload, setDetailReload] = useState(0)
  const [confirmation, setConfirmation] = useState(null)
  const [previewDocument, setPreviewDocument] = useState(null)
  const role = session.user.role
  useEffect(() => {
    window.history.replaceState(window.history.state, '', enrollmentLocation({ filters, page, selectedId }))
  }, [filters, page, role, selectedId])
  const beneficiaryLink = (beneficiaryId) => `/beneficiaries?beneficiary=${encodeURIComponent(beneficiaryId)}&review=${encodeURIComponent(enrollmentLocation({ filters, page, selectedId }).split('?')[1] || '')}`
  const isDswd = role === 'DSWD_STAFF'
  const canReview = role === 'SYSTEM_ADMIN' || isDswd
  const canReviewSelected = canReview && selected?.submittedById !== session.user.userId
  const isFacilitator = role === 'BARANGAY_FACILITATOR'
  const queueTitle = canReview ? 'Review queue' : 'Barangay enrollments'
  const caseActionLabel = canReview ? 'Review case' : 'View enrollment'
  const hasFilters = Boolean(filters.search || filters.status || filters.programId)
  const detailRef = useRef(null)
  const viewRef = useMotionEntry(selectedId || 'enrollment-queue')

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
      })
      .catch((requestError) => { if (active) { if (isSessionExpiredError(requestError)) return onSessionExpired(); setError(getAuthErrorMessage(requestError)) } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [filters, onSessionExpired, page, reload, role, session.accessToken])

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
    if (item.enrollmentId === selectedId) return
    setPreviewDocument(null)
    setSelected(item)
    setSelectedId(item.enrollmentId)
    setDetailLoading(true)
    setManualDecisions({})
    setActionError('')
    setDetailError('')
    setConfirmation(null)
    requestAnimationFrame(() => {
      const returnButton = document.getElementById('enrollment-return')
      returnButton?.focus({ preventScroll: true })
      if (window.matchMedia('(max-width: 1279px)').matches) {
        const scrollTarget = returnButton ?? detailRef.current
        scrollTarget?.scrollIntoView({ block: 'start', behavior: 'instant' })
      }
    })
  }

  function returnToQueue() {
    setPreviewDocument(null)
    setSelectedId('')
    setSelected(null)
    setConfirmation(null)
    requestAnimationFrame(() => document.getElementById('enrollment-list-heading')?.focus())
  }

  function applyFilters(event, values = draft) {
    event.preventDefault()
    setPreviewDocument(null)
    setIsLoading(true)
    setPage(1)
    setSelectedId('')
    setSelected(null)
    setManualDecisions({})
    setActionError('')
    setConfirmation(null)
    setFilters({ search: values.search.trim(), status: values.status, programId: values.programId })
  }

  function clearFilters(event) {
    const cleared = { search: '', status: '', programId: '' }
    setDraft(cleared)
    applyFilters(event, cleared)
  }

  async function runAction(action, successMessage, actionName, rethrow = false) {
    if (actionPending.current) return
    actionPending.current = true
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
      if (actionName === 'start-review') requestAnimationFrame(() => {
        const heading = document.getElementById('enrollment-documents-heading')
        heading?.focus({ preventScroll: true })
        heading?.scrollIntoView({ block: 'start', behavior: 'instant' })
      })
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
      actionPending.current = false
      setBusyAction('')
    }
  }

  function confirmAction(reason) {
    if (!confirmationAllowed) {
      setActionError('This case is not ready for this action. Close this dialog and review the latest requirements.')
      return Promise.reject(new Error('Review requirements changed.'))
    }
    if (confirmation?.type === 'approve') return runAction(() => approveEnrollment(session.accessToken, selected.enrollmentId, { remarks: '', manualDecisions: manualEligibilityPayload(selected.eligibilityEvaluation, manualDecisions) }), 'Enrollment approved.', 'approve', true)
    if (confirmation?.type === 'correction') return runAction(() => requestEnrollmentCorrection(session.accessToken, selected.enrollmentId, reason), 'Correction request sent.', 'correction', true)
    if (confirmation?.type === 'reject') return runAction(() => rejectEnrollment(session.accessToken, selected.enrollmentId, reason), 'Enrollment rejected.', 'reject', true)
    if (confirmation?.type === 'resubmit') return runAction(() => resubmitEnrollment(session.accessToken, selected.enrollmentId), 'Enrollment resubmitted for independent review.', 'resubmit', true)
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

  function openConfirmation(value) {
    setActionError('')
    setConfirmation(value)
  }

  const rows = data?.enrollments ?? []
  const documents = selected?.beneficiary?.documents ?? []
  const requiredTypes = programDocumentRequirements(selected?.program)
  const unacceptedTypes = missingProgramDocuments(selected?.program, documents, ['ACCEPTED']).map(item => item.label)
  const missingTypes = missingProgramDocuments(selected?.program, documents)
  const missingSubmissionTypes = missingProgramDocuments(selected?.program, documents, ['SUBMITTED', 'ACCEPTED'])
  const eligibility = applyManualEligibilityDecisions(selected?.eligibilityEvaluation, manualDecisions)
  const approvalBlockers = eligibilityApprovalBlockers(eligibility, unacceptedTypes)
  const checksUnavailable = detailLoading || Boolean(detailError)
  const approvalReady = approvalBlockers.length === 0 && !checksUnavailable
  const reviewBusy = Boolean(busyAction) || checksUnavailable
  const readiness = enrollmentReadiness({ status: selected?.status, evaluation: eligibility, unacceptedDocumentTypes: unacceptedTypes, canReview: canReviewSelected, loading: detailLoading, error: detailError })
  const confirmationAllowed = !checksUnavailable && (confirmation?.type === 'resubmit'
    ? (isFacilitator || canReview) && selected?.status === 'NEEDS_CORRECTION' && missingSubmissionTypes.length === 0
    : canReviewSelected && selected?.status === 'FOR_VALIDATION' && (confirmation?.type !== 'approve' || approvalReady))
  const confirmationContent = {
    approve: ['Approve this enrollment?', `${fullName(selected?.beneficiary)} · ${selected?.program?.programName}. Required documents and eligibility checks are complete. Approval allows Admin to allocate and schedule assistance; it does not record a release.`, 'Approve enrollment', false],
    correction: ['Request a correction?', 'Admin or Barangay staff can use your note to correct documents before the case is resubmitted.', 'Send correction request', false, 'Required correction'],
    reject: ['Reject this enrollment?', 'This closes the current enrollment review. The decision and reason are audit logged.', 'Reject enrollment', true, 'Rejection reason'],
    resubmit: ['Resubmit this enrollment?', 'The corrected enrollment returns to the pending queue. A different authorized Admin or DSWD staff member must review it.', 'Resubmit enrollment', false],
    'document-accept': ['Accept this document?', 'The document will count toward this program’s approval requirements.', 'Accept document', false],
    'document-reject': ['Reject this document?', 'The facilitator must upload a corrected replacement before approval.', 'Reject document', true, 'Correction reason'],
  }[confirmation?.type] ?? []

  return (
    <DashboardShell breadcrumbs={['Operations', 'Beneficiary services', canReview ? 'Enrollment review' : 'Enrollments']} currentPath="/enrollments" onLogout={onLogout} onNavigate={onNavigate} showAssistant={!selectedId} pageTitle={canReview ? 'Enrollment review' : 'Enrollments'} user={session.user}>
      <header className={`ga-page-header border-b border-line pb-6 ${selectedId ? 'hidden xl:block' : ''}`}><p className="ga-eyebrow">Program eligibility workflow</p><h1 className="ga-page-title">{role === 'SYSTEM_ADMIN' ? 'Enrollment review' : canReview ? 'Enrollment review queue' : 'Beneficiary enrollments'}</h1><p className="ga-page-copy">{canReview ? 'Review each criterion and required document before approving, requesting correction, or rejecting an enrollment.' : isFacilitator ? 'Track submissions, respond to correction requests, and return complete records for staff review.' : 'Review the status and preserved eligibility evidence for beneficiary enrollments.'}</p></header>

      {role === 'SYSTEM_ADMIN' && <div className={selectedId ? 'hidden xl:block' : ''}><BeneficiaryWorkflowNav currentPath="/enrollments" onNavigate={onNavigate} /></div>}

      <form onSubmit={applyFilters} className={`ga-card mt-6 items-end gap-4 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_11rem_16rem_auto] sm:p-5 ${selectedId ? 'hidden xl:grid' : 'grid'}`} aria-label="Enrollment filters">
        <div className="min-w-0"><label htmlFor="enrollment-search" className="ga-label">Beneficiary</label><div className="relative mt-2"><Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-copy" /><input id="enrollment-search" type="search" value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} placeholder="Search name or PhilSys number" className="ga-input pl-11" /></div></div>
        <div><label htmlFor="enrollment-status" className="ga-label">Status</label><select id="enrollment-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input mt-2">{statuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div>
        <div><label htmlFor="enrollment-program" className="ga-label">Assistance program</label><select id="enrollment-program" value={draft.programId} onChange={(event) => setDraft((current) => ({ ...current, programId: event.target.value }))} className="ga-input mt-2"><option value="">All programs</option>{programs.map((program) => <option key={program.programId} value={program.programId}>{program.programCode} — {program.programName}</option>)}</select></div>
        <button type="submit" className="ga-btn-primary">Apply filters</button>
      </form>

      {selectedId && <h1 className="sr-only xl:hidden">Enrollment review{selected ? `: ${fullName(selected.beneficiary)}` : ''}</h1>}
      {isLoading ? <EnrollmentSkeleton selected={Boolean(selectedId)} /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="font-extrabold">Enrollments could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></section> : (
        <div ref={viewRef} className={`mt-6 grid items-start gap-5 ${selectedId ? 'xl:grid-cols-[20rem_minmax(0,1fr)]' : ''}`}>
          <section aria-labelledby="enrollment-list-heading" className={`ga-card min-w-0 overflow-hidden ${selectedId ? 'hidden xl:block' : ''}`}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-5 sm:px-6">
              <div><h2 id="enrollment-list-heading" tabIndex={-1} className="scroll-mt-36 text-lg font-semibold focus:outline-none">{queueTitle}</h2><p role="status" className="mt-1 text-sm text-muted-copy">{data.pagination.total} {data.pagination.total === 1 ? 'enrollment' : 'enrollments'}{hasFilters && ' matching your filters'}{!hasFilters && !selectedId && <> · {canReview ? 'Open a case to review its documents and eligibility.' : 'Open an enrollment to check its progress.'}</>}</p></div>
              {hasFilters && !selectedId && <button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="reset" className="size-4" />Clear filters</button>}
            </header>
            {rows.length === 0 ? (
              <div className="px-5 py-12 text-center"><Icon name={hasFilters ? 'search' : 'enrollments'} className="mx-auto size-8 text-muted-copy" /><h3 className="mt-4 font-semibold text-ink">{hasFilters ? 'No enrollments match your filters' : 'No enrollments yet'}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-copy">{hasFilters ? 'Try another name, status, or program, or clear the filters to see all enrollments.' : canReview ? 'Submitted program applications will appear here for review.' : 'Applications submitted for beneficiaries in your barangay will appear here.'}</p></div>
            ) : <>
              <ul className={`divide-y divide-line ${selectedId ? 'max-h-[min(36rem,60vh)] overflow-y-auto overscroll-contain' : 'xl:hidden'}`}>
                {rows.map((item) => <li key={item.enrollmentId} className={selectedId === item.enrollmentId ? 'bg-info-soft/60' : ''}>
                  <button type="button" aria-pressed={selectedId === item.enrollmentId} onClick={() => chooseEnrollment(item)} className="group w-full p-5 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-blue">
                    <span className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block font-semibold text-ink [overflow-wrap:anywhere]">{fullName(item.beneficiary)}</span><span className="mt-1 block text-xs leading-5 text-muted-copy">{item.beneficiary.barangay?.barangayName}</span></span><Icon name="chevronRight" className="mt-0.5 size-4 shrink-0 text-muted-copy group-hover:text-brand-blue" /></span>
                    <span className="mt-3 block text-sm leading-6 text-copy [overflow-wrap:anywhere]">{item.program.programName}</span><span className="block text-xs leading-5 text-muted-copy [overflow-wrap:anywhere]">{item.program.programCode}</span>
                    <span className="mt-3 flex flex-wrap items-center justify-between gap-2"><StatusBadge value={item.status} />{!selectedId && <span className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-blue">{caseActionLabel}<Icon name="arrowRight" className="size-4" /></span>}</span>
                    {item.status === 'NEEDS_CORRECTION' && <span className="mt-2 block text-xs font-medium text-brand-amber">{canReview ? 'Awaiting Barangay corrections' : 'Action needed: check the correction note'}</span>}
                    {!selectedId && <time dateTime={item.createdAt} className="mt-2 block text-xs text-muted-copy">Submitted {dateFormatter.format(new Date(item.createdAt))}</time>}
                  </button>
                </li>)}
              </ul>
              <div className={selectedId ? 'hidden' : 'hidden xl:block'}>
                <table className="w-full table-fixed text-left text-sm">
                  <caption className="sr-only">{canReview ? 'Beneficiary enrollment review queue' : 'Barangay beneficiary enrollments'}</caption>
                  <colgroup><col className="w-1/4" /><col /><col className="w-40" /><col className="w-44" /><col className="w-44" /></colgroup>
                  <thead><tr className="border-b border-line bg-slate-50 text-xs font-medium text-muted-copy"><th scope="col" className="px-6 py-3">Beneficiary</th><th scope="col" className="px-4 py-3">Assistance program</th><th scope="col" className="px-4 py-3">Submitted</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3 text-right">Action</th></tr></thead>
                  <tbody className="divide-y divide-line">{rows.map((item) => <tr key={item.enrollmentId} className="align-top hover:bg-slate-50/80">
                    <td className="px-6 py-5"><p className="font-semibold leading-6 text-ink [overflow-wrap:anywhere]">{fullName(item.beneficiary)}</p><p className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-muted-copy"><Icon name="location" className="size-3.5 shrink-0" />{item.beneficiary.barangay?.barangayName}</p></td>
                    <td className="px-4 py-5"><p className="font-medium leading-6 text-ink [overflow-wrap:anywhere]">{item.program.programName}</p><p className="mt-1 text-xs leading-5 text-muted-copy [overflow-wrap:anywhere]">{item.program.programCode}</p></td>
                    <td className="px-4 py-5"><time dateTime={item.createdAt} title={dateFormatter.format(new Date(item.createdAt))} className="text-sm leading-6 text-copy">{dateOnlyFormatter.format(new Date(item.createdAt))}</time></td>
                    <td className="px-4 py-5"><StatusBadge value={item.status} />{item.status === 'NEEDS_CORRECTION' && <p className="mt-2 text-xs leading-5 text-muted-copy">{canReview ? 'Awaiting corrections' : 'Your action needed'}</p>}</td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => chooseEnrollment(item)} className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md px-2 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">{caseActionLabel}<Icon name="arrowRight" className="size-4" /></button></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-slate-50/50 px-5 py-4 sm:px-6"><p className="text-xs leading-5 text-muted-copy">Page <span className="font-semibold text-copy">{data.pagination.page}</span> of {Math.max(data.pagination.totalPages, 1)}</p><nav aria-label="Enrollment pages" className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="ga-btn-secondary min-h-11 gap-1 px-3 text-sm"><Icon name="chevronLeft" className="size-4" />Previous</button><button type="button" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)} className="ga-btn-secondary min-h-11 gap-1 px-3 text-sm">Next<Icon name="chevronRight" className="size-4" /></button></nav></footer>
            </>}
          </section>

          {selectedId && <aside ref={detailRef} aria-label="Selected enrollment" className="min-w-0 self-start scroll-mt-36">
            <button type="button" id="enrollment-return" onClick={returnToQueue} className="mb-3 inline-flex min-h-11 scroll-mt-36 items-center gap-2 self-start rounded-md px-2 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="arrowLeft" className="size-4" />{canReview ? 'Back to review queue' : 'Back to enrollments'}</button>
            {detailError && <div className="mb-4 rounded-xl border border-red-200 bg-danger-soft p-4 text-sm text-brand-red" role="alert"><p className="font-bold">Eligibility evidence could not be loaded</p><p className="mt-1 leading-5">{detailError}</p><button type="button" disabled={detailLoading} onClick={() => { setDetailLoading(true); setDetailReload((value) => value + 1) }} className="mt-3 min-h-11 rounded-lg bg-white px-3 font-bold text-brand-red">Try again</button></div>}
            {!selected ? (detailLoading ? <div className="ga-card p-5" role="status"><LoadingLabel>Loading enrollment...</LoadingLabel></div> : null) : <div className="ga-card overflow-hidden" aria-busy={detailLoading}><header className="border-b border-t-4 border-line border-t-brand-navy bg-white px-5 py-5 sm:px-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold tracking-wide text-muted-copy">{selected.program.programCode}</p><h2 className="mt-1 text-2xl font-semibold text-ink [overflow-wrap:anywhere]">{fullName(selected.beneficiary)}</h2><p className="mt-1 text-sm leading-6 text-copy [overflow-wrap:anywhere]">{selected.program.programName}</p></div><StatusBadge value={selected.status} /></div><div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm leading-6"><div><dt className="inline text-muted-copy">Barangay: </dt><dd className="inline font-medium text-ink">{selected.beneficiary.barangay?.barangayName}</dd></div><div><dt className="inline text-muted-copy">Submitted by: </dt><dd className="inline font-medium text-ink">{selected.submittedBy?.fullName}</dd></div></dl><button type="button" onClick={() => onNavigate(beneficiaryLink(selected.beneficiaryId))} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">Open full record<Icon name="arrowRight" className="size-4" /></button></div><ReviewProgress status={selected.status} /></header>

            {selected.status === 'APPROVED' && <section className="m-5 border-l-4 border-brand-blue bg-info-soft p-4"><h3 className="font-bold text-ink">Approved for the program</h3><p className="mt-1 text-sm leading-6 text-copy">Admin can now allocate this beneficiary to a distribution and schedule a visit. Approval alone does not confirm an appointment or receipt of assistance.</p><a href={`${beneficiaryLink(selected.beneficiaryId)}&progressEnrollment=${encodeURIComponent(selected.enrollmentId)}`} onClick={(event) => { event.preventDefault(); onNavigate(event.currentTarget.getAttribute('href')) }} className="ga-admin-link mt-3 inline-flex min-h-11 items-center">View beneficiary assistance progress</a>{role === 'SYSTEM_ADMIN' && <button type="button" onClick={() => onNavigate(`/distributions/manage?program=${encodeURIComponent(selected.program.programId)}&status=DRAFT`)} className="ga-btn-secondary mt-3">Find a distribution for this program</button>}</section>}
            {selected.reviewNotes && <div className={`m-5 rounded-lg border p-4 text-sm leading-6 ${selected.status === 'NEEDS_CORRECTION' ? 'border-amber-200 bg-warning-soft text-brand-amber' : 'border-red-200 bg-danger-soft text-brand-red'}`}><p className="font-bold">{selected.status === 'NEEDS_CORRECTION' ? 'Correction requested' : 'Review note'}</p><p className="mt-1">{selected.reviewNotes}</p></div>}
            {canReview && !canReviewSelected && ['PENDING', 'FOR_VALIDATION'].includes(selected.status) && <p className="m-5 rounded-lg border border-blue-200 bg-info-soft p-4 text-sm text-copy" role="status">A different authorized staff member must review this enrollment because you submitted it.</p>}
            {canReview && <section className="border-b border-line bg-slate-50 px-5 py-5 sm:px-6" aria-labelledby="readiness-heading">
              <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-semibold text-muted-copy">Review summary</p><h3 id="readiness-heading" tabIndex={-1} aria-live="polite" className={`mt-1 scroll-mt-32 text-lg font-semibold focus:outline-none ${readiness === 'Ready for decision' ? 'text-brand-green' : 'text-ink'}`}>{readiness}</h3>
                {canReviewSelected && selected.status === 'PENDING' && <p className="mt-1 max-w-lg text-sm leading-6 text-copy">Start validation to accept documents and record eligibility decisions.</p>}
                {canReviewSelected && selected.status === 'FOR_VALIDATION' && <p className="mt-1 max-w-lg text-sm leading-6 text-copy">Preview the files, record your checks, then make an enrollment decision.</p>}
              </div>
              {canReviewSelected && selected.status === 'PENDING' && <button type="button" disabled={reviewBusy} onClick={() => runAction(() => startEnrollmentReview(session.accessToken, selected.enrollmentId), 'Enrollment review started.', 'start-review')} className="ga-btn-primary w-full shrink-0 sm:w-auto">{busyAction === 'start-review' ? <LoadingLabel>Starting validation...</LoadingLabel> : <><Icon name="enrollments" className="size-4" />Start validation</>}</button>}
              {canReviewSelected && selected.status === 'FOR_VALIDATION' && <a href="#enrollment-decision-heading" className="ga-btn-secondary w-full shrink-0 text-sm sm:w-auto">Go to decision<Icon name="arrowRight" className="size-4" /></a>}
              </div>
              {actionError && !confirmation && selected.status === 'PENDING' && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm leading-6 text-brand-red">{actionError}</div>}
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-white px-4 pb-3"><dt><a href="#enrollment-documents-heading" className="inline-flex min-h-11 items-center gap-2 rounded font-semibold text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="reports" className="size-4" />Documents<Icon name="arrowRight" className="size-3.5" /></a></dt><dd className="leading-6 text-copy">{checksUnavailable ? 'Not confirmed' : requiredTypes.length ? `${requiredTypes.length - unacceptedTypes.length} of ${requiredTypes.length} required documents accepted` : 'None required by this program'}</dd></div>
                <div className="rounded-lg border border-line bg-white px-4 pb-3"><dt><a href="#eligibility-heading" className="inline-flex min-h-11 items-center gap-2 rounded font-semibold text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="security" className="size-4" />Eligibility<Icon name="arrowRight" className="size-3.5" /></a></dt><dd className="leading-6 text-copy">{checksUnavailable ? 'Not confirmed' : !eligibility ? 'Awaiting evidence' : !eligibility.results.length ? 'No criteria configured' : eligibilityStatus[eligibility.overallStatus]?.label ?? 'Review needed'}</dd></div>
              </dl>
              {selected.status === 'NEEDS_CORRECTION' && <p className="mt-3 text-sm leading-6 text-copy">Admin or Barangay staff must correct rejected documents. Resubmit the corrected case for an independent review.</p>}
            </section>}




            <section className="border-t border-line px-5 py-5 sm:px-6" aria-labelledby="enrollment-documents-heading"><div className="flex flex-wrap items-center justify-between gap-3"><h3 id="enrollment-documents-heading" tabIndex={-1} className="scroll-mt-32 font-semibold">Required documents</h3>{checksUnavailable ? <span className="text-xs text-muted-copy">Not confirmed</span> : unacceptedTypes.length === 0 ? <span className="shrink-0 whitespace-nowrap rounded-full border border-emerald-200 bg-success-soft px-2.5 py-1 text-xs font-semibold text-brand-green">{requiredTypes.length ? 'Accepted' : 'Not required'}</span> : <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-200 bg-warning-soft px-2.5 py-1 text-xs font-semibold text-brand-amber">{unacceptedTypes.length} pending</span>}</div><p className="mt-2 text-sm leading-6 text-copy">{requiredTypes.length} required by this program. Preview each file before recording a decision.</p>
              {requiredTypes.some(item => item.documentName) && <details className="mt-3 rounded-lg border border-line px-3 text-sm leading-6 text-copy"><summary className="min-h-11 cursor-pointer py-2.5 font-medium focus-visible:outline-2 focus-visible:outline-brand-blue">Other documents required</summary><ul className="mb-3 list-disc pl-5">{requiredTypes.filter(item => item.documentName).map(item => <li key={item.documentName}>{item.documentName}</li>)}</ul></details>}
              {!checksUnavailable && missingTypes.length > 0 && <p className="mt-4 border-l-2 border-amber-300 pl-3 text-sm leading-6 text-copy"><strong>Not uploaded:</strong> {missingTypes.map(item => item.label).join(', ')}. Request a correction so the facilitator can add these documents.</p>}
              {documents.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-line p-4 text-sm text-muted-copy">No documents uploaded.</p> : <ul className="mt-4 divide-y divide-line border-y border-line" aria-label="Uploaded documents">{documents.map(item => {
                const required = requiredTypes.some(requirement => documentMeetsRequirement(item, requirement))
                const documentBusy = reviewBusy
                return <li key={item.documentId} className="grid gap-x-4 gap-y-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-muted-copy"><Icon name="reports" className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2"><p className="min-w-0 text-sm font-semibold text-ink [overflow-wrap:anywhere]">{item.documentName ? `Other — ${item.documentName}` : humanize(item.documentType)}</p><StatusBadge value={item.reviewStatus} /></div><p className="mt-1 text-xs leading-5 text-muted-copy [overflow-wrap:anywhere]">{item.originalFileName}</p><p className="mt-1 text-xs text-muted-copy">{required ? 'Required by this program' : 'Additional supporting document'}</p></div></div>
                  {item.reviewNotes && <p className="border-l-2 border-brand-red bg-danger-soft px-3 py-2 text-sm leading-6 text-brand-red sm:col-span-2 sm:row-start-2">{item.reviewNotes}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:col-start-2 sm:row-start-1 sm:flex-col sm:items-end sm:justify-center sm:gap-y-1"><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={documentBusy} onClick={() => setPreviewDocument(item)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue disabled:opacity-60"><Icon name="eye" className="size-4" />Preview</button><button type="button" onClick={() => downloadDocument(item)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-copy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="download" className="size-4" />Download</button></div>
                    {canReviewSelected && selected.status === 'FOR_VALIDATION' && item.reviewStatus === 'SUBMITTED' && <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={documentBusy} onClick={() => openConfirmation({ type: 'document-accept', document: item })} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-semibold text-brand-green hover:bg-success-soft focus-visible:outline-2 focus-visible:outline-brand-green disabled:opacity-60"><Icon name="check" className="size-4" />Accept</button><button type="button" disabled={documentBusy} onClick={() => openConfirmation({ type: 'document-reject', document: item })} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-red hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-brand-red disabled:opacity-60"><Icon name="close" className="size-4" />Reject</button></div>}
                  </div>
                </li>
              })}</ul>}
            </section>

            <EligibilityOverview beneficiary={selected.beneficiary} decisions={manualDecisions} editable={canReviewSelected && selected.status === 'FOR_VALIDATION' && !reviewBusy} error={detailError} evaluation={detailLoading ? null : eligibility} onDecisionChange={changeManualDecision} />

            <section className="border-t border-line bg-slate-50 px-5 py-5 sm:px-6" aria-labelledby="enrollment-decision-heading">
              <h3 id="enrollment-decision-heading" tabIndex={-1} className="scroll-mt-32 font-extrabold">Review decision</h3>
              {actionError && !confirmation && selected.status !== 'PENDING' && <div className="mt-3 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm leading-6 text-brand-red" role="alert">{actionError}</div>}
              {checksUnavailable && <p className="mt-3 text-sm leading-6 text-muted-copy">{detailError ? 'Reload the case using Try again above before making a decision.' : 'Checking the latest documents and eligibility evidence. Decisions will be available when this finishes.'}</p>}
              {canReviewSelected && selected.status === 'PENDING' && <>
                <p className="mt-2 text-sm leading-6 text-copy">Validation has not started. Use Start validation in the review summary to unlock document decisions. Starting a review does not approve this enrollment.</p>
                <a href="#readiness-heading" className="mt-2 inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold text-brand-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-blue">Back to review summary<Icon name="arrowRight" className="size-4" /></a>
              </>}
              {canReviewSelected && selected.status === 'FOR_VALIDATION' && <>
                {!checksUnavailable && approvalBlockers.length > 0 && <div id="approval-blockers" className="mt-3 border-l-2 border-amber-300 pl-3 text-sm leading-6 text-copy"><p className="font-bold">Before you can approve</p><ul className="mt-1 list-disc space-y-1 pl-4">{approvalBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}
                {approvalReady && <p className="mt-2 text-sm leading-6 text-copy">All required checks are complete. Review the evidence above before confirming your decision.</p>}
                <button type="button" disabled={!approvalReady || Boolean(busyAction)} aria-describedby={!checksUnavailable && approvalBlockers.length ? 'approval-blockers' : undefined} onClick={() => openConfirmation({ type: 'approve' })} className="ga-btn-primary mt-4 w-full sm:w-auto">Approve enrollment</button>
                <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                  <div><button type="button" disabled={reviewBusy} onClick={() => openConfirmation({ type: 'correction' })} className="ga-btn-secondary w-full">Request correction</button><p className="mt-2 text-xs leading-5 text-muted-copy">Return missing or incorrect information to the facilitator. A reason is required.</p></div>
                  <div><button type="button" disabled={reviewBusy} onClick={() => openConfirmation({ type: 'reject' })} className="min-h-12 w-full rounded-lg border border-line bg-white px-4 font-bold text-brand-red hover:bg-danger-soft disabled:opacity-60">Reject enrollment</button><p className="mt-2 text-xs leading-5 text-muted-copy">Close this application with a recorded reason.</p></div>
                </div>
              </>}
              {(isFacilitator || canReview) && selected.status === 'NEEDS_CORRECTION' && <><p className="mt-2 text-sm leading-6 text-muted-copy">Admin or Barangay staff must replace rejected documents. A submitted replacement can return for review; DSWD accepts it during validation. Resubmission requires a different reviewer.</p><button type="button" onClick={() => onNavigate(beneficiaryLink(selected.beneficiaryId))} className="ga-btn-secondary mt-4 w-full">{isDswd ? 'Review beneficiary documents' : 'Correct beneficiary documents'}</button><p id="resubmit-help" className="mt-3 text-sm leading-6 text-copy">{missingSubmissionTypes.length ? `Upload or replace: ${missingSubmissionTypes.map(item => item.label).join(', ')}.` : 'Required documents are present. Check the correction note before resubmitting.'}</p><button type="button" disabled={reviewBusy || missingSubmissionTypes.length > 0} aria-describedby="resubmit-help" onClick={() => openConfirmation({ type: 'resubmit' })} className="ga-btn-primary mt-3 w-full">Resubmit for review</button></>}
              {!((canReviewSelected && ['PENDING', 'FOR_VALIDATION'].includes(selected.status)) || ((isFacilitator || canReview) && selected.status === 'NEEDS_CORRECTION')) && <p className="mt-2 text-sm leading-6 text-muted-copy">{canReview && selected.submittedById === session.user.userId && ['PENDING', 'FOR_VALIDATION'].includes(selected.status) ? 'You submitted this enrollment. Another authorized reviewer must complete the review.' : selected.status === 'APPROVED' ? 'Enrollment review is complete. Admin handles distribution allocation and scheduling.' : selected.status === 'REJECTED' ? 'This application was not approved. Refer to the review notes for the reason.' : selected.status === 'NEEDS_CORRECTION' ? 'Waiting for corrected documents and resubmission.' : 'No review action is available in the current status.'}</p>}
            </section>
          </div>}</aside>}
        </div>
      )}

      {confirmation && <ConfirmationDialog open error={actionError} confirmDisabled={!confirmationAllowed || Boolean(busyAction)} title={confirmationContent[0]} description={confirmationContent[1]} actionLabel={confirmationContent[2]} destructive={confirmationContent[3]} reasonLabel={confirmationContent[4]} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />}
      {previewDocument && selected && <BeneficiaryDocumentPreview key={`${selected.enrollmentId}:${previewDocument.documentId}`} document={previewDocument} beneficiaryId={selected.beneficiaryId} token={session.accessToken} onSessionExpired={onSessionExpired} onClose={() => setPreviewDocument(null)} />}
    </DashboardShell>
  )
}

export default EnrollmentReviewPage
