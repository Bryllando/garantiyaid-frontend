import { useEffect, useMemo, useRef, useState } from 'react'
import {
  confirmAssistantDistribution,
  previewAssistantDistribution,
  requestBarangays,
  requestPrograms,
} from '../../auth/staffAuth.js'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'
import { allPages, distributionFormFromTask, formatPreviewTime } from './task-preview.js'
import { confirmationSnapshot, uncertainConfirmation, retryConfirmationMessage } from './confirmation-state.js'

const todayInManila = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)

const initialForm = () => ({
  programId: '',
  barangayId: '',
  title: '',
  distributionDate: todayInManila(),
  startTime: '13:00',
  endTime: '17:00',
  slotDurationMinutes: '30',
  location: '',
  verificationRequirement: 'QR',
})

function eventDurationMinutes(form) {
  const [startHour, startMinute] = form.startTime.split(':').map(Number)
  const [endHour, endMinute] = form.endTime.split(':').map(Number)
  return (endHour * 60 + endMinute) - (startHour * 60 + startMinute)
}

function AssistantDistributionScheduler({ accessToken, onBack, onDone, onSessionExpired, taskDetails, onPendingConfirmation }) {
  const fromChat = Boolean(taskDetails)
  const [form, setForm] = useState(() => taskDetails ? distributionFormFromTask(taskDetails, [], []) : initialForm())
  const [programs, setPrograms] = useState([])
  const [barangays, setBarangays] = useState([])
  const [preview, setPreview] = useState(null)
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState('loading')
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [uncertain, setUncertain] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    const heading = document.getElementById('ai-draft-step-title')
    if (!heading) return
    const content = heading.closest('[data-assistant-content]')
    if (content) content.scrollTop = 0
    heading.focus({ preventScroll: true })
  }, [preview])

  const selectedProgram = programs.find((row) => row.programId === form.programId)
  const selectedBarangay = barangays.find((row) => row.barangayId === form.barangayId)
  const slotCount = useMemo(() => {
    const duration = eventDurationMinutes(form)
    const slotDuration = Number(form.slotDurationMinutes)
    return duration > 0 && duration % slotDuration === 0 ? duration / slotDuration : 0
  }, [form])

  useEffect(() => {
    let active = true
    Promise.all([
      allPages((page) => requestPrograms(accessToken, { ...page, status: 'ACTIVE' }), 'programs'),
      requestBarangays(accessToken),
    ]).then(([programData, barangayRows]) => {
      if (!active) return
      setPrograms(programData)
      setBarangays(barangayRows)
      if (taskDetails) setForm((current) => {
        const matched = distributionFormFromTask({ ...taskDetails, programId: current.programId || taskDetails.programId, barangayId: current.barangayId || taskDetails.barangayId }, programData, barangayRows)
        return { ...current, programId: matched.programId, barangayId: matched.barangayId }
      })
      setBusy('')
    }).catch((requestError) => {
      if (!active) return
      if (requestError.status === 401) onSessionExpired?.()
      setError(requestError.message)
      setBusy('')
    })
    return () => { active = false }
  }, [accessToken, onSessionExpired, taskDetails, loadAttempt])

  function backToDetails() {
    onBack(taskDetails ? {
      ...taskDetails, program: selectedProgram?.programCode || selectedProgram?.programName || taskDetails.program,
      barangay: selectedBarangay?.barangayName || taskDetails.barangay,
      programId: form.programId, barangayId: form.barangayId,
      title: form.title, date: form.distributionDate, startTime: form.startTime, endTime: form.endTime,
      slotDurationMinutes: form.slotDurationMinutes, location: form.location, verificationRequirement: form.verificationRequirement,
    } : undefined)
  }

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setPreview(null)
    setReviewed(false)
  }

  function payload() {
    return { ...form, slotDurationMinutes: Number(form.slotDurationMinutes) }
  }

  async function checkDraft(event) {
    event.preventDefault()
    if (busy) return
    if (!event.currentTarget.reportValidity()) return
    setError('')
    const duration = eventDurationMinutes(form)
    if (duration <= 0) return setError('End time must be later than the start time.')
    if (duration % Number(form.slotDurationMinutes) !== 0) return setError('The event window must divide evenly into the selected slot duration.')
    setBusy('preview')
    try {
      const request = payload()
      const checked = await previewAssistantDistribution(accessToken, request)
      setPreview(confirmationSnapshot(checked, request))
      setUncertain(false)
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired?.()
      setError(requestError.message)
    } finally {
      setBusy('')
    }
  }

  async function confirmDraft() {
    if (!preview || !reviewed || busy || submittingRef.current) return
    submittingRef.current = true
    setBusy('create')
    setError('')
    onPendingConfirmation?.({ kind: 'distribution', approvalId: preview.approvalId, request: preview.request })
    try {
      const distribution = await confirmAssistantDistribution(accessToken, preview.request, preview.approvalId)
      setUncertain(false)
      onPendingConfirmation?.(null)
      onDone(distribution)
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired?.()
      const unknown = uncertainConfirmation(requestError)
      setUncertain(unknown)
      setError(unknown ? retryConfirmationMessage : requestError.message)
      if (!unknown) { onPendingConfirmation?.(null); setPreview(null); setReviewed(false) }
    } finally {
      submittingRef.current = false
      setBusy('')
    }
  }

  if (busy === 'loading') return <div role="status" className="grid min-h-64 place-items-center text-sm font-semibold text-muted-copy"><LoadingLabel>Loading approved setup data...</LoadingLabel></div>

  if (preview) {
    return (
      <div className="space-y-5">
        <div>
          <button type="button" disabled={Boolean(busy) || uncertain} onClick={() => { setPreview(null); setReviewed(false) }} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="arrowLeft" className="size-4" /> Edit draft</button>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.1em] text-brand-green">Conflict check passed</p>
          <h3 id="ai-draft-step-title" tabIndex={-1} className="mt-1 text-xl font-bold text-ink">Confirm distribution draft</h3>
          <p className="mt-2 text-sm leading-6 text-muted-copy">This creates a draft only. It will not allocate beneficiaries, generate schedules, send notices, or open the event.</p>
        </div>

        <dl className="overflow-hidden rounded-xl border border-line bg-white text-sm">
          {[
            ['Event', form.title],
            ['Program', selectedProgram?.programName],
            ['Barangay', selectedBarangay?.barangayName],
            ['Starts', formatPreviewTime(`${form.distributionDate}T${form.startTime}:00+08:00`)],
            ['Ends', `${form.endTime} PHT`],
            ['Venue', form.location],
            ['Slot plan', `${slotCount} × ${form.slotDurationMinutes}-minute slots`],
            ['Verification', form.verificationRequirement.replaceAll('_AND_', ' + ')],
          ].map(([label, value]) => <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-b border-line px-4 py-3 last:border-0 max-[420px]:grid-cols-1 max-[420px]:gap-1"><dt className="text-muted-copy">{label}</dt><dd className="text-right font-bold text-ink [overflow-wrap:anywhere] max-[420px]:text-left">{value}</dd></div>)}
        </dl>

        <div className="rounded-xl border border-emerald-200 bg-success-soft p-4 text-sm leading-6 text-copy"><p className="flex items-start gap-2 font-bold text-brand-green"><Icon name="check" className="mt-0.5 size-4 shrink-0" />No current Barangay time conflict found.</p><p className="mt-1">The server will validate the references and conflict window again during creation.</p></div>
        <p className="text-xs leading-5 text-muted-copy">Checked {formatPreviewTime(preview.checkedAt)}</p>
        <p className="rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy">{uncertain ? 'The previous confirmation may have completed. Recover its result below.' : 'Nothing has been created yet.'} This approval covers only the displayed draft and expires {formatPreviewTime(preview.approvalExpiresAt)}.</p>
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-4 text-sm leading-6 text-copy"><input type="checkbox" checked={reviewed} disabled={Boolean(busy) || uncertain} onChange={(event) => setReviewed(event.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-blue" /><span>I reviewed the program, Barangay, venue, date, time, and verification method.</span></label>
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-danger-soft p-4 text-sm font-semibold text-brand-red">{error}</div>}
        <button type="button" onClick={confirmDraft} disabled={!reviewed || Boolean(busy)} className="ga-btn-primary w-full">{busy === 'create' ? <LoadingLabel>Confirming draft...</LoadingLabel> : uncertain ? 'Retry same confirmation' : 'Confirm and create draft'}</button>
      </div>
    )
  }

  return (
    <form onSubmit={checkDraft} className="space-y-5" noValidate>
      <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-5 border-0 p-0 disabled:opacity-60">
      <legend className="sr-only">Distribution draft details</legend>
      <div>
          <button type="button" onClick={backToDetails} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="arrowLeft" className="size-4" /> {fromChat ? 'Collected details' : 'Assistant home'}</button>
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.1em] text-brand-blue">Admin AI Scheduler</p>
        <h3 id="ai-draft-step-title" tabIndex={-1} className="mt-1 text-xl font-bold text-ink">Draft a distribution event</h3>
        <p className="mt-2 text-sm leading-6 text-muted-copy">Complete the official fields. The assistant checks current conflicts before asking for confirmation.</p>
      </div>

      {taskDetails && <div className="rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><p className="font-bold text-ink">Your chat details are filled in</p><p>Requested program: {taskDetails.program}. Barangay: {taskDetails.barangay}.</p><p className="mt-1">Select any unmatched records below. Only a unique exact match is selected automatically. Review the preview before confirming creation.</p></div>}

      <div><label htmlFor="ai-draft-program" className="ga-label">Active assistance program</label><select id="ai-draft-program" required value={form.programId} onChange={(event) => change('programId', event.target.value)} className="ga-input mt-2"><option value="">Choose a program</option>{programs.map((program) => <option key={program.programId} value={program.programId}>{program.programName} ({program.programCode})</option>)}</select></div>
      <div><label htmlFor="ai-draft-barangay" className="ga-label">Service Barangay</label><select id="ai-draft-barangay" required value={form.barangayId} onChange={(event) => change('barangayId', event.target.value)} className="ga-input mt-2"><option value="">Choose a Barangay</option>{barangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}, {barangay.city}</option>)}</select></div>
      <div><label htmlFor="ai-draft-title" className="ga-label">Event title</label><input id="ai-draft-title" required maxLength="200" value={form.title} onChange={(event) => change('title', event.target.value)} className="ga-input mt-2" /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="ai-draft-date" className="ga-label">Distribution date (PHT)</label><input id="ai-draft-date" type="date" required value={form.distributionDate} onChange={(event) => change('distributionDate', event.target.value)} className="ga-input mt-2" /></div><div><label htmlFor="ai-draft-duration" className="ga-label">Slot duration (minutes)</label><input id="ai-draft-duration" type="number" min="5" max="720" step="1" required value={form.slotDurationMinutes} onChange={(event) => change('slotDurationMinutes', event.target.value)} className="ga-input mt-2" /></div></div>
      <div className="grid grid-cols-2 gap-4"><div><label htmlFor="ai-draft-start" className="ga-label">Start time</label><input id="ai-draft-start" type="time" required value={form.startTime} onChange={(event) => change('startTime', event.target.value)} className="ga-input mt-2" /></div><div><label htmlFor="ai-draft-end" className="ga-label">End time</label><input id="ai-draft-end" type="time" required value={form.endTime} onChange={(event) => change('endTime', event.target.value)} className="ga-input mt-2" /></div></div>
      <div><label htmlFor="ai-draft-location" className="ga-label">Venue or location</label><input id="ai-draft-location" required maxLength="200" value={form.location} onChange={(event) => change('location', event.target.value)} className="ga-input mt-2" /></div>
      <div><label htmlFor="ai-draft-verification" className="ga-label">Claim verification</label><select id="ai-draft-verification" value={form.verificationRequirement} onChange={(event) => change('verificationRequirement', event.target.value)} className="ga-input mt-2"><option value="QR">QR credential</option><option value="BIOMETRIC">Biometric</option><option value="QR_AND_BIOMETRIC">QR + Biometric</option><option value="BIOMETRIC_AND_SIGNATURE">Biometric + Signature</option></select></div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-danger-soft p-4 text-sm font-semibold text-brand-red">{error}</div>}
      {!error && (!programs.length || !barangays.length) && <p role="status" className="rounded-xl border border-line bg-page p-4 text-sm text-muted-copy">An active program and barangay are required. No available records were found for one of these lists.</p>}
      {error && (programs.length === 0 || barangays.length === 0) && <button type="button" onClick={() => { setBusy('loading'); setError(''); setLoadAttempt((value) => value + 1) }} className="ga-btn-secondary w-full">Reload available records</button>}
      </fieldset>
      <button type="submit" disabled={Boolean(busy) || programs.length === 0 || barangays.length === 0} className="ga-btn-primary w-full">{busy === 'preview' ? <LoadingLabel>Checking configuration...</LoadingLabel> : 'Check conflicts and preview'}</button>
    </form>
  )
}

export default AssistantDistributionScheduler
