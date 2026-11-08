import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getAuthErrorMessage, isSessionExpiredError, requestBeneficiary, requestBiometricAttemptReview, requestBiometricAttempts, requestDistribution } from '../../auth/staffAuth.js'
import { biometricActionHref, biometricAttemptGuidance, defaultFollowUp, followUpActions, followUpErrors, followUpStatuses, readBiometricFollowUps, writeBiometricFollowUp } from '../../utils/biometricFollowUp.js'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'

const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const resultLabels = { MATCHED: 'Face matched', NO_MATCH: 'Face did not match', LIVENESS_FAILED: 'Liveness check failed', CONSENT_INVALID: 'Consent needs review', PROFILE_UNAVAILABLE: 'Face profile unavailable', DUPLICATE: 'Duplicate check stopped the attempt', PROCESSOR_ERROR: 'Identity service unavailable' }
const resultLabel = (attempt) => attempt.result === 'DUPLICATE' ? attempt.claimId ? 'Existing claim found' : 'Face profile held' : resultLabels[attempt.result] || 'Result needs review'
const processorLabels = { SIMULATED: 'Simulated face check', SIMULATED_LOCAL: 'Simulated face check', NOT_RUN: 'Face check not run', REMOTE_DEEPFACE_ARCFACE: 'Connected biometric service' }
const formatDate = (value) => value ? dateTime.format(new Date(value)) : 'Not recorded'
const personName = (person) => [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ')

function RelatedAttempts({ initial, attempt, distributionId, token, onOpenAttempt, onSessionExpired }) {
  const [data, setData] = useState(initial)
  const [page, setPage] = useState(initial.pagination.page)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load(nextPage) {
    setLoading(true); setError(''); setPage(nextPage)
    try {
      const next = await requestBiometricAttempts(token, distributionId, { page: nextPage, pageSize: 20, beneficiaryId: attempt.beneficiaryId })
      if (next.attempts.some((item) => item.beneficiaryId !== attempt.beneficiaryId || item.distributionId !== distributionId)) throw new Error('The history contains an unrelated attempt. Please refresh it.')
      setData(next)
    } catch (issue) { if (isSessionExpiredError(issue)) onSessionExpired(); else setError(getAuthErrorMessage(issue)) }
    finally { setLoading(false) }
  }

  return <section aria-labelledby="related-attempts-title" className="ga-card overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5"><div><h2 id="related-attempts-title" className="ga-section-heading">Attempts for this beneficiary</h2><p className="mt-1 text-sm text-muted-copy">Same distribution event · {data.pagination.total} recorded</p></div><button type="button" onClick={() => load(1)} disabled={loading} className="ga-admin-link">Refresh attempts</button></div>
    {loading ? <p role="status" className="p-5 text-sm"><LoadingLabel>Loading attempts...</LoadingLabel></p> : error ? <div role="alert" className="p-5"><p className="text-sm text-brand-red">{error}</p><button type="button" onClick={() => load(page)} className="ga-btn-secondary mt-3">Retry attempt history</button></div> : <>
      <ol className="max-h-80 divide-y divide-line overflow-y-auto overscroll-contain" tabIndex={0} aria-label="Beneficiary attempt history">{data.attempts.map((item) => <li key={item.attemptId} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${item.attemptId === attempt.attemptId ? 'bg-info-soft/40' : ''}`}><div><p className="text-sm font-bold">{resultLabel(item)}</p><p className="mt-1 text-xs text-muted-copy">{formatDate(item.createdAt)} PHT</p></div>{item.attemptId === attempt.attemptId ? <span className="text-xs font-bold text-brand-blue">Selected attempt</span> : <button type="button" onClick={() => onOpenAttempt(item)} className="ga-admin-link" aria-label={`Review ${resultLabel(item)} from ${formatDate(item.createdAt)}`}>Review attempt</button>}</li>)}</ol>
      {data.pagination.totalPages > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4 text-sm"><p>Page {data.pagination.page} of {data.pagination.totalPages}</p><div className="flex gap-2"><button type="button" onClick={() => load(page - 1)} disabled={page <= 1} className="ga-btn-secondary">Previous attempts</button><button type="button" onClick={() => load(page + 1)} disabled={page >= data.pagination.totalPages} className="ga-btn-secondary">Next attempts</button></div></div>}
    </>}
  </section>
}

function FollowUpForm({ attempt, distributionId, session, onNavigate }) {
  const [initial] = useState(() => {
    try {
      const entry = readBiometricFollowUps(sessionStorage, session.user)[`${distributionId}:${attempt.attemptId}`]
      if (entry && entry.beneficiaryId !== attempt.beneficiaryId) throw new Error('The saved draft belongs to a different beneficiary.')
      return entry || { working: defaultFollowUp(attempt), saved: null }
    } catch { return { working: defaultFollowUp(attempt), saved: null, error: 'Saved review drafts could not be read. Contact your system administrator before clearing this tab.' } }
  })
  const [form, setForm] = useState(initial.working)
  const [saved, setSaved] = useState(initial.saved)
  const [storageError, setStorageError] = useState(initial.error || '')
  const [errors, setErrors] = useState({})
  const errorRef = useRef(null)
  const actions = followUpActions(attempt)
  const selectedAction = actions.find((item) => item.value === form.action)
  const canRetry = ['BARANGAY_FACILITATOR', 'DSWD_STAFF'].includes(session.user.role)
  const linkedAction = selectedAction?.area === 'verify' && !canRetry ? { area: 'beneficiary' } : selectedAction
  const href = linkedAction ? biometricActionHref(linkedAction, attempt, distributionId) : ''
  const dirty = !saved || ['status', 'action', 'notes', 'outcome'].some((key) => saved[key] !== form[key])
  useEffect(() => { if (Object.keys(errors).length || storageError) errorRef.current?.focus() }, [errors, storageError])

  function update(changes) {
    const next = { ...form, ...changes }
    setForm(next); setErrors({})
    if (initial.error) return
    try { writeBiometricFollowUp(sessionStorage, session.user, attempt, distributionId, next); setStorageError('') }
    catch { setStorageError('Changes could not be kept in this tab. Keep this page open and try saving again.') }
  }

  function save(event) {
    event.preventDefault()
    const validation = followUpErrors(form, attempt)
    setErrors(validation)
    if (Object.keys(validation).length) return
    const next = { ...form, notes: form.notes.trim(), outcome: form.outcome.trim() }
    const record = { ...next, reviewer: session.user.fullName, savedAt: new Date().toISOString() }
    try {
      if (initial.error) throw new Error(initial.error)
      writeBiometricFollowUp(sessionStorage, session.user, attempt, distributionId, next, record)
      setForm(next); setSaved(record); setStorageError('')
      toast.success('Review draft saved in this tab.', { description: 'No referral or official resolution was submitted.' })
    } catch { setStorageError('The review draft could not be saved. Your notes are still here. Please try again.') }
  }

  return <section className="ga-card overflow-hidden" aria-labelledby="follow-up-form-title">
    <div className="border-b border-line p-5"><h2 id="follow-up-form-title" className="ga-section-heading">Follow-up review</h2><p className="mt-1 text-sm leading-6 text-muted-copy">Record the checks needed and the proposed next step.</p></div>
    <form onSubmit={save} noValidate className="space-y-5 p-5">
      <p className="border-l-4 border-brand-amber bg-warning-soft px-4 py-3 text-sm leading-6 text-copy"><strong className="text-ink">Draft only.</strong> Kept in this signed-in tab until sign-out or closing the tab. Other staff cannot see it; referrals and resolutions are not submitted.</p>
      {(storageError || Object.keys(errors).length > 0) && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-red-200 bg-danger-soft p-4 outline-none"><p className="font-bold text-brand-red">{storageError || 'Check the review details'}</p>{Object.keys(errors).length > 0 && <ul className="mt-2 space-y-2 text-sm text-brand-red">{Object.entries(errors).map(([key, message]) => <li key={key}><a href={`#follow-up-${key}`} onClick={(event) => { event.preventDefault(); document.getElementById(`follow-up-${key}`)?.focus() }} className="underline">{message}</a></li>)}</ul>}</div>}
      <div><label htmlFor="follow-up-status" className="ga-label">Proposed follow-up status</label><select id="follow-up-status" value={form.status} onChange={(event) => update({ status: event.target.value })} aria-invalid={Boolean(errors.status)} aria-describedby={errors.status ? 'follow-up-status-error' : undefined} className="ga-input mt-2">{Object.entries(followUpStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{errors.status && <p id="follow-up-status-error" className="mt-2 text-sm text-brand-red">{errors.status}</p>}</div>
      <div><label htmlFor="follow-up-action" className="ga-label">{form.status === 'RESOLVED' ? 'Action reviewed' : 'Next action'}</label><select id="follow-up-action" value={form.action} onChange={(event) => update({ action: event.target.value })} aria-invalid={Boolean(errors.action)} aria-describedby="follow-up-action-help" className="ga-input mt-2">{actions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><p id="follow-up-action-help" className={`mt-2 text-sm ${errors.action ? 'text-brand-red' : 'text-copy'}`}>{errors.action || `Responsible role: ${selectedAction?.owner || 'Select an action'}`}</p>{selectedAction?.owner === 'Barangay staff' && <p className="mt-2 text-xs leading-5 text-muted-copy">Use your office’s existing handoff process to request the new attempt. Saving this draft does not notify Barangay staff.</p>}</div>
      <div><label htmlFor="follow-up-notes" className="ga-label">Review notes</label><textarea id="follow-up-notes" value={form.notes} onChange={(event) => update({ notes: event.target.value })} rows={4} maxLength={1000} aria-invalid={Boolean(errors.notes)} aria-describedby="follow-up-notes-help" placeholder="What was checked, what remains unclear, and what staff need to do next." className="ga-input mt-2 resize-y py-3" /><p id="follow-up-notes-help" className={`mt-2 text-xs leading-5 ${errors.notes ? 'text-brand-red' : 'text-muted-copy'}`}>{errors.notes || `${form.notes.length}/1,000 characters · minimum 10. Use record references; do not copy ID numbers or biometric data.`}</p></div>
      <div><label htmlFor="follow-up-outcome" className="ga-label">Follow-up outcome <span className="font-normal text-muted-copy">{form.status === 'RESOLVED' ? '(required for resolution)' : '(optional)'}</span></label><textarea id="follow-up-outcome" value={form.outcome} onChange={(event) => update({ outcome: event.target.value })} rows={3} maxLength={1000} aria-invalid={Boolean(errors.outcome)} aria-describedby="follow-up-outcome-help" placeholder="What was completed and which attempt or record supports the outcome." className="ga-input mt-2 resize-y py-3" /><p id="follow-up-outcome-help" className={`mt-2 text-xs leading-5 ${errors.outcome ? 'text-brand-red' : 'text-muted-copy'}`}>{errors.outcome || 'A follow-up outcome does not change this attempt’s result or satisfy any remaining claim checks.'}</p></div>
      <div className="border-t border-line pt-4"><button type="submit" disabled={Boolean(initial.error) || !dirty} className="ga-btn-primary w-full sm:w-auto">Save review draft</button><p className="mt-3 text-xs leading-5 text-muted-copy">{saved ? `Last saved by ${saved.reviewer} · ${formatDate(saved.savedAt)} PHT${dirty ? ' · Changes awaiting review' : ''}` : `Reviewer: ${session.user.fullName}. Confirm the draft with Save review draft.`}</p>{saved && <p role="status" className="mt-2 text-sm font-semibold text-copy">Saved draft: {followUpStatuses[saved.status]} · not submitted</p>}</div>
      {href && <a href={href} onClick={(event) => { event.preventDefault(); onNavigate(href) }} className="ga-admin-link inline-flex min-h-11 items-center gap-2"><Icon name="arrowRight" className="size-4" />{selectedAction.area === 'claim' ? 'Open claim record' : selectedAction.area === 'duplicates' ? 'Open duplicate review' : linkedAction.area === 'beneficiary' ? 'Open beneficiary record' : selectedAction.area === 'verify' ? 'Retry claim verification' : 'Open profile and consent'}</a>}
    </form>
  </section>
}

export default function BiometricAttemptReview({ session, distributionId, beneficiaryId, attemptId, returnHref, onNavigate, onOpenAttempt, onSessionExpired }) {
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const headingRef = useRef(null)
  useEffect(() => {
    let active = true
    if (!distributionId || !beneficiaryId) {
      Promise.resolve().then(() => { if (active) { setError('This review link is missing the event or beneficiary. Return to attempt history and select a record.'); setLoading(false) } })
      return () => { active = false }
    }
    Promise.all([
      requestBiometricAttemptReview(session.accessToken, distributionId, beneficiaryId, attemptId),
      requestBeneficiary(session.accessToken, beneficiaryId),
      requestDistribution(session.accessToken, distributionId),
    ]).then(([review, beneficiary, distribution]) => {
      if (!active) return
      if (beneficiary.beneficiaryId !== beneficiaryId || distribution.distributionId !== distributionId) throw new Error('The review records do not match the selected attempt. Return to history and select it again.')
      setContext({ ...review, beneficiary, distribution }); setError('')
    }).catch((issue) => { if (active) { if (isSessionExpiredError(issue)) onSessionExpired(); else setError(getAuthErrorMessage(issue)) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attemptId, beneficiaryId, distributionId, onSessionExpired, reload, session.accessToken])
  useEffect(() => { if (!loading) headingRef.current?.focus() }, [loading])

  return <div className="mt-5 space-y-5">
    <a href={returnHref} onClick={(event) => { event.preventDefault(); onNavigate(returnHref) }} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand-blue hover:underline"><Icon name="arrowLeft" className="size-4" />Back to attempt history</a>
    {loading ? <div role="status" className="ga-card p-6"><LoadingLabel>Loading attempt and beneficiary records...</LoadingLabel></div> : error ? <section ref={headingRef} tabIndex={-1} role="alert" className="ga-card p-6 outline-none"><h2 className="ga-section-heading">Attempt review unavailable</h2><p className="mt-2 text-sm text-copy">{error}</p><button type="button" onClick={() => { setLoading(true); setContext(null); setReload((value) => value + 1) }} className="ga-btn-secondary mt-4">Retry attempt review</button></section> : context && <>
      <header className="border-b border-line pb-5"><p className="ga-eyebrow">Attempt review</p><h2 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-extrabold text-ink outline-none">{personName(context.beneficiary)}</h2><p className="mt-2 text-sm leading-6 text-copy">{context.distribution.title} · {context.beneficiary.barangay?.barangayName || 'Barangay not recorded'}</p></header>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <section className="ga-card p-5" aria-labelledby="review-result-title"><div className="flex flex-wrap items-start justify-between gap-3"><h3 id="review-result-title" className="ga-section-heading">Recorded result</h3><span className={`rounded-full border px-3 py-1 text-xs font-bold ${context.attempt.result === 'MATCHED' ? 'ga-status-success' : 'ga-status-warning'}`}>{resultLabel(context.attempt)}</span></div><p className="mt-4 text-sm leading-6 text-copy">{biometricAttemptGuidance(context.attempt)}</p><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-copy">Recorded</dt><dd className="mt-1 font-semibold">{formatDate(context.attempt.createdAt)} PHT</dd></div><div><dt className="text-muted-copy">Verification mode</dt><dd className="mt-1 font-semibold">{processorLabels[context.attempt.processor] || 'Not identified'}</dd></div></dl><details className="mt-4 border-t border-line"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-muted-copy">Verification details</summary><dl className="space-y-2 break-words text-xs text-copy"><div><dt className="inline font-semibold">Attempt reference: </dt><dd className="inline">{context.attempt.attemptId}</dd></div><div><dt className="inline font-semibold">Match score: </dt><dd className="inline">{context.attempt.matchScore ?? 'Not run'}</dd></div><div><dt className="inline font-semibold">Liveness score: </dt><dd className="inline">{context.attempt.livenessScore ?? 'Not run'}</dd></div></dl></details></section>
          <RelatedAttempts initial={context.history} attempt={context.attempt} distributionId={distributionId} token={session.accessToken} onOpenAttempt={onOpenAttempt} onSessionExpired={onSessionExpired} />
        </div>
        {context.attempt.result === 'MATCHED' ? <section className="ga-card p-5"><h3 className="ga-section-heading">Continue with the claim record</h3><p className="mt-3 text-sm leading-6 text-copy">This attempt passed the face check. Check the claim for any remaining verification and release requirements.</p><a className="ga-admin-link mt-3 inline-flex min-h-11 items-center" href={biometricActionHref({ area: 'claim' }, context.attempt, distributionId)} onClick={(event) => { event.preventDefault(); onNavigate(biometricActionHref({ area: 'claim' }, context.attempt, distributionId)) }}>Open claim record</a></section> : <FollowUpForm attempt={context.attempt} distributionId={distributionId} session={session} onNavigate={onNavigate} />}
      </div>
    </>}
  </div>
}
