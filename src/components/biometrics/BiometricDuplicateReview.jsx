import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  getAuthErrorMessage,
  isSessionExpiredError,
  requestBiometricDuplicateCases,
  reviewBiometricDuplicateCase,
} from '../../auth/staffAuth.js'
import { Icon } from '../ui/icon.jsx'
import { Skeleton } from '../ui/skeleton.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'
import { useMotionEntry } from '../ui/use-motion-entry.js'

const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const dateOnly = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const filters = ['', 'PENDING', 'CLEARED', 'CONFIRMED']
const humanize = (value = '') => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
const personName = (person) => [person?.firstName, person?.middleName, person?.lastName].filter(Boolean).join(' ')

function ReviewStatus({ value }) {
  const style = value === 'CLEARED'
    ? 'ga-status-success'
    : value === 'CONFIRMED'
      ? 'ga-status-danger'
      : 'ga-status-warning'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}>{humanize(value)}</span>
}

function PersonRecord({ label, person }) {
  return (
    <section className="min-w-0 rounded-lg border border-line bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">{label}</p>
      <h3 className="mt-2 truncate font-extrabold text-ink">{personName(person)}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div><dt className="text-muted-copy">Record</dt><dd className="mt-1 font-mono font-bold text-ink">{person.beneficiaryId.slice(0, 8).toUpperCase()}</dd></div>
        <div><dt className="text-muted-copy">Birth date</dt><dd className="mt-1 font-bold text-ink">{dateOnly.format(new Date(person.birthDate))}</dd></div>
        <div className="col-span-2"><dt className="text-muted-copy">Barangay</dt><dd className="mt-1 font-bold text-ink">{person.barangay?.barangayName}, {person.barangay?.city}</dd></div>
      </dl>
    </section>
  )
}

function DuplicateDecisionDialog({ decision, onClose, onSubmit }) {
  const dialogRef = useRef(null)
  const [notes, setNotes] = useState('')
  const [attestation, setAttestation] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const clearing = decision.action === 'CLEAR_AS_DISTINCT'

  useEffect(() => { dialogRef.current?.showModal() }, [])

  async function submit(event) {
    event.preventDefault()
    if (notes.trim().length < 20) return setError('Document at least 20 characters of evidence and reasoning.')
    if (!attestation) return setError('Confirm that you reviewed both beneficiary records and the match evidence.')
    setBusy(true)
    setError('')
    try {
      await onSubmit(decision.action, notes.trim())
      dialogRef.current?.close()
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); if (!busy) dialogRef.current?.close() }} onClose={onClose} aria-labelledby="duplicate-decision-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/60 backdrop:backdrop-blur-[3px]">
      <form onSubmit={submit} className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Identity integrity decision</p><h2 id="duplicate-decision-title" className="mt-2 text-2xl font-extrabold">{clearing ? 'Clear as distinct people' : 'Confirm duplicate record'}</h2><p className="mt-2 text-sm leading-6 text-muted-copy">{clearing ? 'Activate the candidate template after documentary and in-person evidence show that the records belong to different people.' : 'Keep the candidate template blocked after evidence confirms both records represent the same person.'}</p></div><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} aria-label="Close duplicate review" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line hover:bg-slate-50"><Icon name="close" /></button></div>
        <div className="mt-5 rounded-xl border border-line bg-slate-50 p-4 text-sm"><p className="font-bold text-ink">Case {decision.duplicateCaseId.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-muted-copy">Similarity {(Number(decision.matchScore) * 100).toFixed(1)}% · review threshold {(Number(decision.matchThreshold) * 100).toFixed(1)}%</p></div>
        <div className="mt-5"><label htmlFor="duplicate-review-notes" className="ga-label">Evidence and decision notes</label><textarea id="duplicate-review-notes" required minLength={20} maxLength={1000} rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record the identity documents, in-person checks, and reasoning used for this decision." className="ga-input mt-2 min-h-36 resize-y py-3" /><p className="mt-2 text-xs text-muted-copy">{notes.trim().length}/1000 characters · minimum 20</p></div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 text-sm leading-6 text-copy hover:bg-slate-50"><input type="checkbox" checked={attestation} onChange={(event) => setAttestation(event.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-blue" /><span><strong className="text-ink">Independent evidence reviewed.</strong> I checked both records and understand this decision changes whether the candidate template can be used for claims.</span></label>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm font-semibold text-brand-red">{error}</p>}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={busy || !attestation} className={clearing ? 'ga-btn-primary' : 'min-h-11 rounded-lg bg-brand-red px-4 font-bold text-white hover:brightness-95 disabled:opacity-50'}>{busy ? <LoadingLabel>Recording decision...</LoadingLabel> : clearing ? 'Clear and activate' : 'Confirm and block'}</button></div>
      </form>
    </dialog>
  )
}

function CaseCard({ duplicateCase, onDecision }) {
  return (
    <article className="ga-card overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-line bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Detected {dateTime.format(new Date(duplicateCase.detectedAt))}</p><p className="mt-1 font-mono text-xs font-bold text-ink">Case {duplicateCase.duplicateCaseId.slice(0, 8).toUpperCase()}</p></div><ReviewStatus value={duplicateCase.status} /></header>
      <div className="p-5">
        <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
          <PersonRecord label="Candidate enrollment" person={duplicateCase.candidateBeneficiary} />
          <div className="grid place-items-center px-2"><span className="rounded-full border border-amber-200 bg-warning-soft px-3 py-2 text-xs font-black tabular-nums text-brand-amber">{(Number(duplicateCase.matchScore) * 100).toFixed(1)}% match</span></div>
          <PersonRecord label="Existing active profile" person={duplicateCase.matchedBeneficiary} />
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-muted-copy">Threshold {(Number(duplicateCase.matchThreshold) * 100).toFixed(1)}%. Face similarity is a review signal; staff evidence determines the outcome.</p>{duplicateCase.status === 'PENDING' ? <div className="flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => onDecision({ ...duplicateCase, action: 'CLEAR_AS_DISTINCT' })} className="ga-btn-secondary">Clear as distinct</button><button type="button" onClick={() => onDecision({ ...duplicateCase, action: 'CONFIRM_DUPLICATE' })} className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-bold text-brand-red hover:bg-danger-soft">Confirm duplicate</button></div> : <p className="text-sm font-semibold text-copy">Reviewed {dateTime.format(new Date(duplicateCase.reviewedAt))} by {duplicateCase.reviewedBy?.fullName}</p>}</div>
        {duplicateCase.reviewNotes && <p className="mt-4 rounded-lg border border-line bg-slate-50 p-4 text-sm leading-6 text-copy"><strong className="text-ink">Decision record:</strong> {duplicateCase.reviewNotes}</p>}
      </div>
    </article>
  )
}

export default function BiometricDuplicateReview({ session, onSessionExpired }) {
  const [status, setStatus] = useState('PENDING')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [decision, setDecision] = useState(null)
  const motionRef = useMotionEntry(`${status}:${page}:${refresh}`)

  const handleError = useCallback((error) => {
    if (isSessionExpiredError(error)) return onSessionExpired()
    toast.error(getAuthErrorMessage(error))
  }, [onSessionExpired])

  useEffect(() => {
    let active = true
    requestBiometricDuplicateCases(session.accessToken, { page, pageSize: 20, status })
      .then((result) => { if (active) setData(result) })
      .catch(handleError)
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [handleError, page, refresh, session.accessToken, status])

  async function submitDecision(action, reviewNotes) {
    await reviewBiometricDuplicateCase(session.accessToken, decision.duplicateCaseId, { action, reviewNotes, attestation: true })
    toast.success(action === 'CLEAR_AS_DISTINCT' ? 'Candidate cleared as a distinct person.' : 'Duplicate record confirmed and blocked.', { description: 'The decision and reviewer identity were added to the audit trail.' })
    setRefresh((value) => value + 1)
  }

  const counts = data?.summary.countsByStatus ?? {}
  return (
    <div ref={motionRef} className="mt-6 space-y-5">
      <section className="ga-card overflow-hidden">
        <header className="border-b border-line bg-brand-navy p-5 text-white sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-200">Restricted identity review</p><h2 className="mt-2 text-2xl font-extrabold">Possible duplicate profiles</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">Compare the two beneficiary records and document an evidence-based decision. Face similarity never merges, deletes, or rejects a beneficiary automatically.</p></header>
        <div className="grid grid-cols-3 gap-px bg-line"><div className="bg-white p-4"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Pending</p><p className="mt-2 text-2xl font-black tabular-nums text-brand-amber">{counts.PENDING ?? 0}</p></div><div className="bg-white p-4"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Cleared</p><p className="mt-2 text-2xl font-black tabular-nums text-brand-green">{counts.CLEARED ?? 0}</p></div><div className="bg-white p-4"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Confirmed</p><p className="mt-2 text-2xl font-black tabular-nums text-brand-red">{counts.CONFIRMED ?? 0}</p></div></div>
      </section>

      <section className="ga-card p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><label htmlFor="duplicate-case-status" className="ga-label">Review status</label><select id="duplicate-case-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); setLoading(true) }} className="ga-input mt-2 min-w-56"><option value="">All cases</option>{filters.slice(1).map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></div><p className="max-w-xl text-sm leading-6 text-muted-copy">Only System Administrators and DSWD Staff can see cross-barangay comparison details. Raw captures and biometric templates are never returned.</p></div></section>

      {loading ? <div className="space-y-4" role="status" aria-label="Loading duplicate review cases"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div> : data?.cases.length ? <section className="space-y-4" aria-live="polite">{data.cases.map((duplicateCase) => <CaseCard key={duplicateCase.duplicateCaseId} duplicateCase={duplicateCase} onDecision={setDecision} />)}</section> : <section className="ga-card border-dashed p-10 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-brand-green"><Icon name="check" /></span><h2 className="mt-4 ga-section-heading">No {status ? humanize(status).toLowerCase() : ''} duplicate cases</h2><p className="mt-2 text-sm text-muted-copy">New similarity flags will appear here after protected enrollment.</p></section>}

      {(data?.pagination.totalPages ?? 0) > 1 && <nav aria-label="Duplicate case pages" className="flex items-center justify-between gap-4"><button type="button" disabled={page <= 1 || loading} onClick={() => { setPage((value) => value - 1); setLoading(true) }} className="ga-btn-secondary">Previous</button><p className="text-sm font-bold text-copy">Page {data.pagination.page} of {data.pagination.totalPages}</p><button type="button" disabled={page >= data.pagination.totalPages || loading} onClick={() => { setPage((value) => value + 1); setLoading(true) }} className="ga-btn-secondary">Next</button></nav>}
      {decision && <DuplicateDecisionDialog decision={decision} onClose={() => setDecision(null)} onSubmit={submitDecision} />}
    </div>
  )
}
