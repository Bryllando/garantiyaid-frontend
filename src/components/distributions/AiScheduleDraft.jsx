import { useEffect, useRef, useState } from 'react'
import { confirmAiDistributionSchedule, getAuthErrorMessage, isSessionExpiredError, previewAiDistributionSchedule } from '../../auth/staffAuth.js'
import { uncertainConfirmation, retryConfirmationMessage } from '../assistant/confirmation-state.js'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'

const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const time = new Intl.DateTimeFormat('en-PH', { timeStyle: 'short', timeZone: 'Asia/Manila' })
const slotTime = slot => `${dateTime.format(new Date(slot.slotStart))}–${time.format(new Date(slot.slotEnd))}`

export default function AiScheduleDraft({ accessToken, distributionId, remainingCount, disabled, onBusyChange, onSaved, onSessionExpired }) {
  const dialogRef = useRef(null)
  const errorRef = useRef(null)
  const requestPending = useRef(false)
  const attemptRef = useRef(null)
  const [draft, setDraft] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  function close() {
    if (requestPending.current) return
    dialogRef.current?.close()
    if (uncertain) onSaved(null)
    setDraft(null); setError(''); setUncertain(false)
    attemptRef.current = null
  }

  async function generate() {
    if (requestPending.current) return
    if (!dialogRef.current?.open) dialogRef.current?.showModal()
    requestPending.current = true
    setBusy('generating'); onBusyChange(true)
    setError(''); setDraft(null); setReviewed(false); setUncertain(false)
    attemptRef.current = null
    try {
      const result = await previewAiDistributionSchedule(accessToken, distributionId)
      setDraft(result); setAssignments(result.assignments)
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) onSessionExpired()
      setError(getAuthErrorMessage(requestError))
    } finally { requestPending.current = false; setBusy(''); onBusyChange(false) }
  }

  async function save(event) {
    event.preventDefault()
    if (requestPending.current || !reviewed || !draft || overCapacity) return
    const attempt = attemptRef.current ?? { key: crypto.randomUUID(), assignments: structuredClone(assignments), draftId: draft.draftId }
    attemptRef.current = attempt
    requestPending.current = true
    setBusy('saving'); onBusyChange(true); setError('')
    try {
      const result = await confirmAiDistributionSchedule(accessToken, distributionId, attempt.draftId, attempt.assignments, attempt.key)
      dialogRef.current?.close()
      setDraft(null); setUncertain(false); attemptRef.current = null
      onSaved(result)
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) onSessionExpired()
      const pending = uncertainConfirmation(requestError) || requestError.code === 'AI_SCHEDULE_CONCURRENT_CHANGE'
      setUncertain(pending)
      if (!pending) attemptRef.current = null
      setError(`${getAuthErrorMessage(requestError)}${pending ? ` ${retryConfirmationMessage}` : ''}`)
    } finally { requestPending.current = false; setBusy(''); onBusyChange(false) }
  }

  const loads = (draft?.slots ?? []).map(slot => ({ ...slot, proposed: assignments.filter(row => row.slotId === slot.slotId).length }))
  const overCapacity = loads.some(slot => slot.occupied + slot.proposed > slot.capacity)
  const changed = draft ? assignments.filter(row => !draft.assignments.some(original => original.allocationId === row.allocationId && original.slotId === row.slotId)).length : 0

  return <>
    <section className="rounded-xl border border-blue-200 bg-info-soft p-4 sm:p-5" aria-label="AI schedule planning">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 font-extrabold text-ink"><Icon name="calendar" />AI schedule draft</p><p className="mt-2 max-w-2xl text-sm leading-6 text-copy">Get an AI suggestion that spreads appointments across available capacity. Review each assignment, edit time slots, then save to this draft event.</p><p className="mt-1 text-xs leading-5 text-muted-copy">Existing appointments stay in place. Generate sessions and allocate approved beneficiaries first.</p></div><button type="button" disabled={disabled || remainingCount === 0 || Boolean(busy)} onClick={generate} className="ga-btn-primary shrink-0">Generate AI draft</button></div>
    </section>
    <dialog ref={dialogRef} aria-labelledby="ai-schedule-title" onCancel={event => { event.preventDefault(); close() }} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(68rem,calc(100%-2rem))] overflow-y-auto rounded-xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <form onSubmit={save}>
        <header className="flex items-start justify-between gap-4 border-b border-line p-5 sm:p-6"><div><p className="ga-eyebrow">AI-driven distribution scheduler</p><h2 id="ai-schedule-title" className="mt-2 text-xl font-extrabold">Review AI schedule draft</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Assignments are saved only when you confirm below. The event stays a draft after saving. All times use Philippine Standard Time (PHT).</p></div><button type="button" disabled={Boolean(busy)} onClick={close} aria-label="Close AI draft" className="ga-btn-secondary min-h-11 px-3"><Icon name="close" /></button></header>
        <div className="space-y-5 p-5 sm:p-6">
          {busy === 'generating' && <p role="status" className="py-8 text-center text-sm text-copy"><LoadingLabel>Analyzing available slots and preparing a draft...</LoadingLabel></p>}
          {error && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-red-200 bg-danger-soft p-4 text-sm leading-6 text-brand-red">{error}</p>}
          {draft && <>
            <section aria-label="AI suggestion explanation" className="rounded-lg border border-line bg-slate-50 p-4"><h3 className="font-bold">AI suggestion</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-copy">{draft.summary}</p><p className="mt-3 text-xs leading-5 text-muted-copy">{assignments.length} beneficiaries · {changed} staff edits · Review expires {dateTime.format(new Date(draft.expiresAt))} PHT. This is a suggestion, with no guarantee of an optimal schedule.</p></section>
            <section aria-label="Proposed slot capacity"><h3 className="font-bold">Capacity after saving</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{loads.map(slot => <div key={slot.slotId} className={`rounded-lg border p-3 text-sm ${slot.occupied + slot.proposed > slot.capacity ? 'border-red-300 bg-danger-soft' : 'border-line'}`}><p className="font-semibold">{slot.sessionLabel}</p><p className="mt-1 text-xs leading-5 text-muted-copy">{slotTime(slot)}</p><p className="mt-2 font-bold tabular-nums">{slot.occupied + slot.proposed} / {slot.capacity} places</p><p className="mt-1 text-xs text-muted-copy">{slot.occupied} existing + {slot.proposed} proposed</p></div>)}</div></section>
            {overCapacity && <p role="alert" className="text-sm font-bold text-brand-red">A slot is over capacity. Move a proposed assignment to another eligible slot before saving.</p>}
            <fieldset disabled={Boolean(busy) || uncertain} className="min-w-0 space-y-3"><legend className="mb-3 font-bold">Review beneficiary assignments</legend>{draft.allocations.map(allocation => <div key={allocation.allocationId} className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center"><div className="min-w-0"><p className="break-words text-sm font-bold">{allocation.beneficiaryName}</p><p className="mt-1 text-xs text-muted-copy">{allocation.sitioPurok || 'Whole barangay'}</p></div><div className="min-w-0"><label htmlFor={`ai-slot-${allocation.allocationId}`} className="ga-label">Time slot for {allocation.beneficiaryName}</label><select id={`ai-slot-${allocation.allocationId}`} value={assignments.find(row => row.allocationId === allocation.allocationId)?.slotId || ''} onChange={event => { setAssignments(current => current.map(row => row.allocationId === allocation.allocationId ? { ...row, slotId: event.target.value } : row)); setReviewed(false); setError(''); attemptRef.current = null }} className="ga-input mt-2 w-full min-w-0">{draft.slots.filter(slot => allocation.eligibleSlotIds.includes(slot.slotId)).map(slot => <option key={slot.slotId} value={slot.slotId}>{slotTime(slot)} · {slot.sessionLabel} · {slot.location}</option>)}</select></div></div>)}</fieldset>
            <label className="flex min-h-11 items-start gap-3 rounded-lg bg-slate-50 p-4 text-sm leading-6"><input type="checkbox" checked={reviewed} disabled={Boolean(busy) || uncertain} onChange={event => setReviewed(event.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-blue" /><span>I reviewed the beneficiaries, time slots and capacity. Save these appointments to the draft event.</span></label>
          </>}
        </div>
        <footer className="flex flex-col-reverse gap-3 border-t border-line p-5 sm:flex-row sm:justify-end sm:p-6"><button type="button" disabled={Boolean(busy)} onClick={close} className="ga-btn-secondary">{uncertain ? 'Close and refresh queue' : 'Cancel'}</button><button type="button" disabled={Boolean(busy) || uncertain} onClick={generate} className="ga-btn-secondary">{draft ? 'Regenerate AI draft' : 'Try AI again'}</button>{draft && <button type="submit" disabled={Boolean(busy) || !reviewed || overCapacity} className="ga-btn-primary">{busy === 'saving' ? <LoadingLabel>Saving draft schedule...</LoadingLabel> : uncertain ? 'Retry same save' : 'Confirm and save draft schedule'}</button>}</footer>
      </form>
    </dialog>
  </>
}
