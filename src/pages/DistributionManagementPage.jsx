import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import {
  cancelDistribution,
  createDistribution,
  createDistributionAllocations,
  generateDistributionQrTokens,
  generateDistributionSchedules,
  generateDistributionSlots,
  getAuthErrorMessage,
  isSessionExpiredError,
  openDistribution,
  requestBarangays,
  requestDistribution,
  requestDistributionAllocations,
  requestDistributionList,
  requestDistributionQrTokens,
  requestDistributionSchedules,
  requestDistributionSlots,
  requestEligibleDistributionEnrollments,
  requestPrograms,
  requestQrEligibleSchedules,
  updateDistribution,
} from '../auth/staffAuth.js'

const statuses = ['', 'DRAFT', 'OPEN', 'CLOSED', 'CANCELLED']
const verificationRequirements = ['QR', 'BIOMETRIC', 'QR_AND_BIOMETRIC']
const emptyDetail = { slots: { slots: [], summary: { matchingSlotCount: 0, matchingCapacity: 0 } }, allocations: { allocations: [], summary: { countsByStatus: {}, totalAmount: '0' } }, schedules: { schedules: [], summary: { countsByStatus: {}, matchingScheduleCount: 0 } }, eligible: { enrollments: [], pagination: { total: 0 }, allocationAmount: null }, qrEligible: { schedules: [], summary: { qrEligibleScheduleCount: 0 } }, qrTokens: { qrTokens: [], summary: { matchingTokenCount: 0 } } }
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const timeFormatter = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
const moneyFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const humanize = (value = '') => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
const fullName = (person) => [person?.firstName, person?.middleName, person?.lastName].filter(Boolean).join(' ')
const displayDate = (value) => value ? dateFormatter.format(new Date(`${value.slice(0, 10)}T00:00:00+08:00`)) : 'Not recorded'
const displayTime = (value) => value ? timeFormatter.format(new Date(value)) : '—'
const todayInManila = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)

function StatusBadge({ value }) {
  const style = ['OPEN', 'ACTIVE', 'AVAILABLE', 'ALLOCATED', 'SCHEDULED'].includes(value) ? 'ga-status-success' : ['DRAFT', 'PENDING', 'FULL'].includes(value) ? 'ga-status-warning' : ['CANCELLED', 'REVOKED'].includes(value) ? 'ga-status-danger' : 'border-line bg-slate-100 text-copy'
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}>{humanize(value)}</span>
}

function LoadingState() {
  return <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(34rem,1.35fr)]" role="status" aria-label="Loading distribution management"><div className="ga-card p-5"><Skeleton className="h-12 w-full" />{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="mt-4 h-24 w-full" />)}</div><div className="ga-card p-6"><Skeleton className="h-8 w-3/4" /><div className="mt-5 grid grid-cols-3 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="mt-5 h-56 w-full" /></div></div>
}

function DistributionFormDialog({ barangays, distribution, programs, onClose, onSave }) {
  const dialogRef = useRef(null)
  const [form, setForm] = useState(() => distribution ? {
    programId: distribution.programId, title: distribution.title, distributionDate: distribution.distributionDate,
    startTime: distribution.startTime, endTime: distribution.endTime, slotDurationMinutes: String(distribution.slotDurationMinutes),
    location: distribution.location, barangayId: distribution.barangayId, verificationRequirement: distribution.verificationRequirement,
  } : { programId: '', title: '', distributionDate: todayInManila(), startTime: '08:00', endTime: '12:00', slotDurationMinutes: '30', location: '', barangayId: '', verificationRequirement: 'QR' })
  const [isSaving, setIsSaving] = useState(false)
  useEffect(() => { dialogRef.current?.showModal() }, [])
  function change(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  async function submit(event) {
    event.preventDefault()
    const [startHour, startMinute] = form.startTime.split(':').map(Number)
    const [endHour, endMinute] = form.endTime.split(':').map(Number)
    const eventMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute)
    if (eventMinutes <= 0) return toast.error('Distribution end time must be later than the start time.')
    if (eventMinutes % Number(form.slotDurationMinutes) !== 0) return toast.error('The event time must divide evenly by the selected slot duration.')
    setIsSaving(true)
    try {
      await onSave({ ...form, slotDurationMinutes: Number(form.slotDurationMinutes) })
      dialogRef.current?.close()
    } catch {
      // The page reports the API error and leaves this form open.
    } finally { setIsSaving(false) }
  }
  return (
    <dialog ref={dialogRef} onClose={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(50rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <form onSubmit={submit} className="p-5 sm:p-7"><div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Distribution configuration</p><h2 className="mt-2 text-2xl font-extrabold">{distribution ? 'Edit draft event' : 'Create distribution event'}</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Set the program, service area, venue, time window, and verification method.</p></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close distribution form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-xl hover:bg-slate-50">×</button></div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2"><div className="sm:col-span-2"><Field id="distribution-title" label="Event title" required maxLength="200" value={form.title} onChange={(value) => change('title', value)} /></div><div><label htmlFor="distribution-program" className="ga-label">Active assistance program</label><select id="distribution-program" required value={form.programId} onChange={(event) => change('programId', event.target.value)} className="ga-input mt-2"><option value="">Select program</option>{programs.map((program) => <option key={program.programId} value={program.programId}>{program.programName} ({program.programCode})</option>)}</select></div><div><label htmlFor="distribution-barangay" className="ga-label">Service barangay</label><select id="distribution-barangay" required value={form.barangayId} onChange={(event) => change('barangayId', event.target.value)} className="ga-input mt-2"><option value="">Select barangay</option>{barangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}, {barangay.city}</option>)}</select></div>
          <Field id="distribution-date" label="Distribution date" type="date" min={todayInManila()} required value={form.distributionDate} onChange={(value) => change('distributionDate', value)} /><Field id="distribution-location" label="Venue or location" required maxLength="200" value={form.location} onChange={(value) => change('location', value)} /><Field id="distribution-start" label="Start time" type="time" required value={form.startTime} onChange={(value) => change('startTime', value)} /><Field id="distribution-end" label="End time" type="time" required value={form.endTime} onChange={(value) => change('endTime', value)} />
          <div><label htmlFor="slot-duration" className="ga-label">Slot duration in minutes</label><input id="slot-duration" type="number" list="common-slot-durations" min="5" max="720" step="5" required value={form.slotDurationMinutes} onChange={(event) => change('slotDurationMinutes', event.target.value)} className="ga-input mt-2" /><datalist id="common-slot-durations">{[15, 20, 30, 60, 120].map((value) => <option key={value} value={value} />)}</datalist></div><div><label htmlFor="verification-requirement" className="ga-label">Claim verification</label><select id="verification-requirement" value={form.verificationRequirement} onChange={(event) => change('verificationRequirement', event.target.value)} className="ga-input mt-2">{verificationRequirements.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></div>
        </div><div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => dialogRef.current?.close()} disabled={isSaving} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={isSaving} className="ga-btn-primary">{isSaving ? 'Saving…' : distribution ? 'Save event' : 'Create draft event'}</button></div></form>
    </dialog>
  )
}

function Field({ id, label, onChange, ...inputProps }) {
  return <div><label htmlFor={id} className="ga-label">{label}</label><input id={id} onChange={(event) => onChange(event.target.value)} className="ga-input mt-2" {...inputProps} /></div>
}

function WorkflowProgress({ activeAllocations, distribution, scheduled, slotCount }) {
  const steps = [
    ['Event', true],
    ['Time slots', slotCount > 0],
    ['Allocations', activeAllocations > 0],
    ['Schedules', activeAllocations > 0 && scheduled >= activeAllocations],
    ['Open', distribution.status === 'OPEN' || distribution.status === 'CLOSED'],
  ]
  return <ol className="grid gap-2 sm:grid-cols-5" aria-label="Distribution readiness">{steps.map(([label, complete], index) => <li key={label} className={`rounded-lg border p-3 ${complete ? 'border-emerald-200 bg-success-soft' : 'border-line bg-slate-50'}`}><span className={`grid size-7 place-items-center rounded-full text-xs font-black ${complete ? 'bg-brand-green text-white' : 'bg-slate-200 text-copy'}`}>{complete ? '✓' : index + 1}</span><p className="mt-2 text-xs font-bold text-ink">{label}</p></li>)}</ol>
}

function RawTokensDialog({ onClose, tokens }) {
  const dialogRef = useRef(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { dialogRef.current?.showModal() }, [])
  const tokenText = tokens.map((item) => `${fullName(item.beneficiary)}: ${item.token}`).join('\n')
  async function copy() {
    try { await navigator.clipboard.writeText(tokenText); setSaved(true); toast.success('QR token list copied securely.') } catch { toast.error('Copy failed. Download the token list instead.') }
  }
  function download() {
    const rows = [['Beneficiary', 'Token', 'Expires at'], ...tokens.map((item) => [fullName(item.beneficiary), item.token, item.expiresAt])]
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'garantiyaid-qr-tokens.csv'; link.click(); URL.revokeObjectURL(url); setSaved(true); toast.success('QR token CSV downloaded.')
  }
  function cancel(event) {
    if (saved) return
    event.preventDefault()
    toast.error('Copy or download the one-time token list before closing.')
  }
  return <dialog ref={dialogRef} onCancel={cancel} onClose={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(48rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 shadow-lg backdrop:bg-slate-950/55"><div className="p-5 sm:p-7"><div><p className="ga-eyebrow">One-time secure output</p><h2 className="mt-2 text-2xl font-extrabold">Save generated QR tokens now</h2><p className="mt-2 text-sm leading-6 text-brand-red">For security, the raw tokens cannot be retrieved again after this window is closed.</p></div><div className="mt-5 max-h-72 overflow-y-auto rounded-xl border border-line"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-muted-copy"><tr><th className="px-4 py-3">Beneficiary</th><th className="px-4 py-3">Secure token</th></tr></thead><tbody className="divide-y divide-line">{tokens.map((item) => <tr key={item.qrTokenId}><td className="px-4 py-3 font-bold">{fullName(item.beneficiary)}</td><td className="max-w-80 break-all px-4 py-3 font-mono text-xs">{item.token}</td></tr>)}</tbody></table></div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={!saved} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Done, tokens saved</button><button type="button" onClick={copy} className="ga-btn-secondary">Copy token list</button><button type="button" onClick={download} className="ga-btn-primary">Download CSV</button></div></div></dialog>
}

function DistributionManagementPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const [catalogs, setCatalogs] = useState({ programs: [], barangays: [] })
  const [draft, setDraft] = useState({ status: '', programId: '', barangayId: '' })
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(emptyDetail)
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState([])
  const [isLoading, setIsLoading] = useState(() => session.user.role === 'SYSTEM_ADMIN')
  const [isLoadingDetail, setIsLoadingDetail] = useState(() => session.user.role === 'SYSTEM_ADMIN')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [eventForm, setEventForm] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [actionBusy, setActionBusy] = useState('')
  const [rawTokens, setRawTokens] = useState(null)
  const authorized = session.user.role === 'SYSTEM_ADMIN'

  const reportError = useCallback((requestError) => {
    if (isSessionExpiredError(requestError)) return onSessionExpired()
    toast.error(getAuthErrorMessage(requestError))
  }, [onSessionExpired])

  useEffect(() => {
    if (!authorized) return undefined
    let active = true
    Promise.all([requestPrograms(session.accessToken, { page: 1, pageSize: 100, status: 'ACTIVE' }), requestBarangays(session.accessToken)])
      .then(([programData, barangays]) => { if (active) setCatalogs({ programs: programData.programs, barangays }) })
      .catch((requestError) => { if (active) reportError(requestError) })
    return () => { active = false }
  }, [authorized, reportError, session.accessToken])

  useEffect(() => {
    if (!authorized) return undefined
    let active = true
    requestDistributionList(session.accessToken, { page, pageSize: 20, ...filters })
      .then((result) => { if (active) { setData(result); setError(''); if (!result.distributions.length) setIsLoadingDetail(false); setSelectedId((current) => current || result.distributions[0]?.distributionId || '') } })
      .catch((requestError) => { if (active) { if (isSessionExpiredError(requestError)) return onSessionExpired(); setError(getAuthErrorMessage(requestError)) } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [authorized, filters, onSessionExpired, page, reload, session.accessToken])

  useEffect(() => {
    if (!selectedId || !authorized) return undefined
    let active = true
    requestDistribution(session.accessToken, selectedId).then(async (distribution) => {
      const [slots, allocations, schedules, qrTokens, eligible, qrEligible] = await Promise.all([
        requestDistributionSlots(session.accessToken, selectedId),
        requestDistributionAllocations(session.accessToken, selectedId),
        requestDistributionSchedules(session.accessToken, selectedId),
        requestDistributionQrTokens(session.accessToken, selectedId),
        distribution.status === 'DRAFT' ? requestEligibleDistributionEnrollments(session.accessToken, selectedId) : Promise.resolve(emptyDetail.eligible),
        distribution.status === 'OPEN' && distribution.verificationRequirement !== 'BIOMETRIC' ? requestQrEligibleSchedules(session.accessToken, selectedId) : Promise.resolve(emptyDetail.qrEligible),
      ])
      if (active) { setSelected(distribution); setDetail({ slots, allocations, schedules, qrTokens, eligible, qrEligible }) }
    }).catch((requestError) => { if (active) { reportError(requestError); setSelected(null); setDetail(emptyDetail) } }).finally(() => { if (active) setIsLoadingDetail(false) })
    return () => { active = false }
  }, [authorized, reload, reportError, selectedId, session.accessToken])

  function applyFilters(event) { event.preventDefault(); setPage(1); setIsLoading(true); setFilters(draft) }
  async function saveEvent(payload) {
    try {
      const saved = eventForm?.distribution ? await updateDistribution(session.accessToken, eventForm.distribution.distributionId, payload) : await createDistribution(session.accessToken, payload)
      toast.success(eventForm?.distribution ? 'Distribution event updated.' : 'Draft distribution event created.')
      setEventForm(null); setSelectedId(saved.distributionId); setReload((value) => value + 1)
    } catch (requestError) { reportError(requestError); throw requestError }
  }
  async function runAction(name, operation, successMessage) {
    setActionBusy(name)
    try { const result = await operation(); toast.success(successMessage); setIsLoadingDetail(true); setReload((value) => value + 1); return result } catch (requestError) { reportError(requestError); throw requestError } finally { setActionBusy('') }
  }
  async function createSlots(event) {
    event.preventDefault(); const capacity = Number(new FormData(event.currentTarget).get('capacity'))
    await runAction('slots', () => generateDistributionSlots(session.accessToken, selectedId, capacity), 'Distribution time slots generated.')
  }
  async function allocate() {
    if (!selectedEnrollmentIds.length) return toast.error('Select at least one approved enrollment.')
    if (selectedEnrollmentIds.length > remainingCapacity) return toast.error(`Only ${remainingCapacity} queue ${remainingCapacity === 1 ? 'place remains' : 'places remain'} in this event.`)
    await runAction('allocations', () => createDistributionAllocations(session.accessToken, selectedId, selectedEnrollmentIds), `${selectedEnrollmentIds.length} beneficiary allocation${selectedEnrollmentIds.length === 1 ? '' : 's'} created.`)
    setSelectedEnrollmentIds([])
  }
  async function generateSchedules() { await runAction('schedules', () => generateDistributionSchedules(session.accessToken, selectedId), 'Queue schedules generated for all active allocations.') }
  async function generateQr() {
    const result = await runAction('qr', () => generateDistributionQrTokens(session.accessToken, selectedId), 'QR tokens generated.')
    setRawTokens(result.qrTokens)
  }
  async function confirmAction() {
    const action = confirmation
    if (action.kind === 'open') await runAction('open', () => openDistribution(session.accessToken, selectedId), 'Distribution event opened for operations.')
    else await runAction('cancel', () => cancelDistribution(session.accessToken, selectedId), 'Distribution event cancelled.')
    setConfirmation(null)
  }

  const rows = data?.distributions ?? []
  const slotCount = detail.slots.summary.matchingSlotCount ?? 0
  const activeAllocations = detail.allocations.summary.countsByStatus?.ALLOCATED ?? 0
  const scheduled = ['SCHEDULED', 'CHECKED_IN', 'MISSED'].reduce((total, status) => total + (detail.schedules.summary.countsByStatus?.[status] ?? 0), 0)
  const readyToOpen = slotCount > 0 && activeAllocations > 0 && scheduled >= activeAllocations
  const remainingCapacity = Math.max(0, (detail.slots.summary.matchingCapacity ?? 0) - activeAllocations)
  const canEditEvent = selected?.status === 'DRAFT' && slotCount === 0 && activeAllocations === 0
  const eligibleRows = detail.eligible.enrollments

  return <DashboardShell breadcrumbs={['Operations', 'Aid distribution', 'Distribution setup']} currentPath="/distributions/manage" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Distribution setup" user={session.user}>
    <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="ga-eyebrow">Controlled event preparation</p><h1 className="ga-page-title">Distribution management</h1><p className="ga-page-copy">Turn an active assistance program into a scheduled, capacity-controlled distribution event ready for secure beneficiary verification.</p></div>{authorized && <button type="button" disabled={!catalogs.programs.length || !catalogs.barangays.length} onClick={() => setEventForm({ distribution: null })} className="ga-btn-primary shrink-0">Create distribution</button>}</header>
    {!authorized ? <section className="ga-card mt-6 p-8 text-center" role="alert"><h2 className="ga-section-heading">Administrator access required</h2><p className="mt-2 text-muted-copy">Only System Administrators can configure distribution events.</p></section> : <>
      <section className="mt-6 flex flex-col gap-3 rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy sm:flex-row sm:items-center sm:justify-between"><p><strong className="text-ink">Safe workflow:</strong> event setup, allocations, and schedules remain editable only while the event is in draft.</p><span className="shrink-0 font-bold text-brand-blue">Audit logged</span></section>
      {!isLoading && (!catalogs.programs.length || !catalogs.barangays.length) && <section className="mt-4 rounded-xl border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy" role="status"><strong className="text-brand-amber">Distribution creation unavailable:</strong> {!catalogs.programs.length ? 'a DSWD staff member must activate at least one assistance program' : 'at least one active barangay is required'}.</section>}
      <form onSubmit={applyFilters} className="ga-card mt-5 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:p-5" aria-label="Distribution filters"><div><label htmlFor="distribution-status" className="sr-only">Event status</label><select id="distribution-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input">{statuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div><div><label htmlFor="distribution-program-filter" className="sr-only">Assistance program</label><select id="distribution-program-filter" value={draft.programId} onChange={(event) => setDraft((current) => ({ ...current, programId: event.target.value }))} className="ga-input"><option value="">All programs</option>{catalogs.programs.map((program) => <option key={program.programId} value={program.programId}>{program.programName}</option>)}</select></div><div><label htmlFor="distribution-barangay-filter" className="sr-only">Barangay</label><select id="distribution-barangay-filter" value={draft.barangayId} onChange={(event) => setDraft((current) => ({ ...current, barangayId: event.target.value }))} className="ga-input"><option value="">All barangays</option>{catalogs.barangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}</option>)}</select></div><button className="ga-btn-primary">Apply filters</button></form>
      {isLoading ? <LoadingState /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="font-extrabold">Distribution events could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></section> : <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(34rem,1.35fr)]">
        <section className="ga-card overflow-hidden"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="ga-section-heading">Distribution events</h2><p className="mt-1 text-sm text-muted-copy">{data.pagination.total} matching {data.pagination.total === 1 ? 'event' : 'events'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold">Page {data.pagination.page}</span></div>{rows.length === 0 ? <div className="p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h3 className="mt-4 font-extrabold">No distribution events</h3><p className="mt-2 text-sm text-muted-copy">Adjust the filters or create the first draft event.</p></div> : <div className="divide-y divide-line">{rows.map((distribution) => <button key={distribution.distributionId} type="button" onClick={() => { setIsLoadingDetail(true); setSelectedEnrollmentIds([]); setSelectedId(distribution.distributionId) }} aria-pressed={selectedId === distribution.distributionId} className={`block min-h-28 w-full cursor-pointer px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-blue ${selectedId === distribution.distributionId ? 'bg-info-soft' : 'bg-white'}`}><div className="flex items-start justify-between gap-3"><p className="font-extrabold">{distribution.title}</p><StatusBadge value={distribution.status} /></div><p className="mt-2 text-sm font-semibold text-brand-blue">{distribution.program.programCode} · {distribution.barangay.barangayName}</p><p className="mt-2 text-xs text-muted-copy">{displayDate(distribution.distributionDate)} · {distribution.startTime}–{distribution.endTime}</p></button>)}</div>}{data.pagination.totalPages > 1 && <div className="flex items-center justify-between border-t border-line px-5 py-4 text-sm"><span>Page {page} of {data.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => { setIsLoading(true); setPage((value) => value - 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Previous</button><button type="button" disabled={page === data.pagination.totalPages} onClick={() => { setIsLoading(true); setPage((value) => value + 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Next</button></div></div>}</section>
        <section className="space-y-5" aria-live="polite">{isLoadingDetail ? <div className="ga-card p-6"><Skeleton className="h-8 w-3/4" /><div className="mt-5 grid grid-cols-3 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="mt-5 h-56 w-full" /></div> : !selected ? <div className="ga-card p-10 text-center"><h2 className="ga-section-heading">Select a distribution event</h2><p className="mt-2 text-sm text-muted-copy">Choose an event to review its setup and next valid action.</p></div> : <>
          <article className="ga-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="ga-eyebrow">{selected.program.programCode} · {selected.barangay.barangayName}</p><h2 className="mt-2 text-2xl font-extrabold">{selected.title}</h2><p className="mt-2 text-sm text-muted-copy">{displayDate(selected.distributionDate)} · {selected.startTime}–{selected.endTime} · {selected.location}</p><p className="mt-1 text-xs font-semibold text-copy">{selected.slotDurationMinutes}-minute slots · {humanize(selected.verificationRequirement)} verification</p></div><StatusBadge value={selected.status} /></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-line bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">Slot capacity</p><p className="mt-1 text-2xl font-extrabold">{detail.slots.summary.matchingCapacity ?? 0}</p></div><div className="rounded-lg border border-line bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">Allocated</p><p className="mt-1 text-2xl font-extrabold">{activeAllocations}</p></div><div className="rounded-lg border border-line bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">Scheduled</p><p className="mt-1 text-2xl font-extrabold">{scheduled}</p></div></div><div className="mt-5"><WorkflowProgress activeAllocations={activeAllocations} distribution={selected} scheduled={scheduled} slotCount={slotCount} /></div>{canEditEvent && <button type="button" onClick={() => setEventForm({ distribution: selected })} className="ga-btn-secondary mt-5">Edit event details</button>}</article>
          {selected.status === 'DRAFT' && <>
            <article className="ga-card p-5 sm:p-6"><div className="flex items-start gap-4"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-info-soft font-black text-brand-blue">1</span><div><h3 className="ga-section-heading">Generate time slots</h3><p className="mt-1 text-sm leading-6 text-muted-copy">Create equal service windows across the configured event time.</p></div></div>{slotCount === 0 ? <form onSubmit={createSlots} className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-slate-50 p-4 sm:flex-row sm:items-end"><div className="flex-1"><label htmlFor="slot-capacity" className="ga-label">Beneficiaries per slot</label><input id="slot-capacity" name="capacity" type="number" required min="1" max="1000" defaultValue="10" className="ga-input mt-2" /></div><button disabled={actionBusy === 'slots'} className="ga-btn-primary">{actionBusy === 'slots' ? 'Generating…' : 'Generate slots'}</button></form> : <div className="mt-5 rounded-xl border border-emerald-200 bg-success-soft p-4"><p className="font-bold text-brand-green">{slotCount} time slots ready with total capacity for {detail.slots.summary.matchingCapacity} beneficiaries.</p><div className="mt-3 flex flex-wrap gap-2">{detail.slots.slots.slice(0, 6).map((slot) => <span key={slot.slotId} className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-copy">{displayTime(slot.slotStart)}–{displayTime(slot.slotEnd)} · {slot.capacity}</span>)}</div></div>}</article>
            <article className="ga-card overflow-hidden"><div className="p-5 sm:p-6"><div className="flex items-start gap-4"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-info-soft font-black text-brand-blue">2</span><div><h3 className="ga-section-heading">Allocate approved beneficiaries</h3><p className="mt-1 text-sm leading-6 text-muted-copy">Only approved enrollments for this program and barangay are eligible.</p></div></div></div>{slotCount === 0 ? <p className="border-t border-line p-5 text-sm text-muted-copy">Generate time slots before creating allocations.</p> : eligibleRows.length === 0 ? <div className="border-t border-line p-6"><p className="font-bold">No eligible enrollments waiting</p><p className="mt-1 text-sm text-muted-copy">All approved beneficiaries may already be allocated, or enrollment review is still pending.</p></div> : <><div className="border-y border-line bg-slate-50 px-5 py-3 text-sm font-semibold text-copy">{remainingCapacity} of {detail.slots.summary.matchingCapacity} queue places remain</div><div className="max-h-72 overflow-y-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-muted-copy"><tr><th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Select available eligible enrollments" disabled={remainingCapacity === 0} checked={selectedEnrollmentIds.length > 0 && selectedEnrollmentIds.length === Math.min(eligibleRows.length, remainingCapacity)} onChange={(event) => setSelectedEnrollmentIds(event.target.checked ? eligibleRows.slice(0, remainingCapacity).map((row) => row.enrollmentId) : [])} className="size-4 accent-brand-blue" /></th><th className="px-4 py-3">Beneficiary</th><th className="hidden px-4 py-3 sm:table-cell">Barangay</th></tr></thead><tbody className="divide-y divide-line">{eligibleRows.map((enrollment) => <tr key={enrollment.enrollmentId} className="hover:bg-slate-50"><td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${fullName(enrollment.beneficiary)}`} disabled={!selectedEnrollmentIds.includes(enrollment.enrollmentId) && selectedEnrollmentIds.length >= remainingCapacity} checked={selectedEnrollmentIds.includes(enrollment.enrollmentId)} onChange={(event) => setSelectedEnrollmentIds((current) => event.target.checked ? [...current, enrollment.enrollmentId] : current.filter((id) => id !== enrollment.enrollmentId))} className="size-4 accent-brand-blue" /></td><td className="px-4 py-3 font-bold">{fullName(enrollment.beneficiary)}</td><td className="hidden px-4 py-3 text-muted-copy sm:table-cell">{enrollment.beneficiary.barangay.barangayName}</td></tr>)}</tbody></table></div><div className="flex flex-col gap-3 border-t border-line p-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-copy"><strong className="text-ink">{selectedEnrollmentIds.length}</strong> selected · {detail.eligible.allocationAmount ? `${moneyFormatter.format(Number(detail.eligible.allocationAmount))} each` : 'Grant amount unavailable'}</p><button type="button" disabled={!selectedEnrollmentIds.length || actionBusy === 'allocations'} onClick={allocate} className="ga-btn-primary">{actionBusy === 'allocations' ? 'Allocating…' : 'Create allocations'}</button></div></>}</article>
            <article className="ga-card p-5 sm:p-6"><div className="flex items-start gap-4"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-info-soft font-black text-brand-blue">3</span><div className="flex-1"><h3 className="ga-section-heading">Build the queue schedule</h3><p className="mt-1 text-sm leading-6 text-muted-copy">Assign every active allocation to the earliest slot with available capacity.</p><p className="mt-4 text-sm font-bold text-ink">{scheduled} of {activeAllocations} active allocations scheduled</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-green transition-[width]" style={{ width: `${activeAllocations ? Math.min(100, scheduled / activeAllocations * 100) : 0}%` }} /></div></div></div>{activeAllocations > scheduled && <button type="button" onClick={generateSchedules} disabled={actionBusy === 'schedules'} className="ga-btn-primary mt-5 w-full sm:w-auto">{actionBusy === 'schedules' ? 'Scheduling…' : `Schedule ${activeAllocations - scheduled} remaining`}</button>}</article>
            <article className={`rounded-xl border p-5 sm:p-6 ${readyToOpen ? 'border-emerald-200 bg-success-soft' : 'border-amber-200 bg-warning-soft'}`}><h3 className="ga-section-heading">{readyToOpen ? 'Ready to open' : 'Event is not ready to open'}</h3><p className="mt-2 text-sm leading-6 text-copy">{readyToOpen ? 'Allocations and queue schedules are complete. Opening freezes event setup and enables staff operations.' : 'Complete time slots, at least one allocation, and a schedule for every active allocation.'}</p><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button type="button" disabled={!readyToOpen || actionBusy === 'open'} onClick={() => setConfirmation({ kind: 'open', title: 'Open this distribution event?', description: 'Allocations, slots, and schedules will be frozen so field operations can begin.', actionLabel: 'Open event' })} className="ga-btn-primary">Open distribution event</button><button type="button" onClick={() => setConfirmation({ kind: 'cancel', title: 'Cancel this distribution event?', description: 'This permanently cancels its slots, allocations, and schedules. Use only when the event will not proceed.', actionLabel: 'Cancel event', destructive: true })} className="ga-btn-danger">Cancel event</button></div></article>
          </>}
          {selected.status === 'OPEN' && <article className="ga-card p-5 sm:p-6"><div className="flex items-start gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-success-soft font-black text-brand-green">✓</span><div><h3 className="ga-section-heading">Event open for field operations</h3><p className="mt-1 text-sm leading-6 text-muted-copy">The queue is frozen. Facilitators can now check schedules and verify claims.</p></div></div>{selected.verificationRequirement === 'BIOMETRIC' ? <div className="mt-5 rounded-xl border border-blue-200 bg-info-soft p-4 text-sm text-copy">This event uses biometric verification only, so QR token issuance is not required.</div> : <div className="mt-5 rounded-xl border border-line p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-extrabold">QR token issuance</h4><p className="mt-1 text-sm text-muted-copy">{detail.qrTokens.summary.matchingTokenCount} issued · {detail.qrEligible.summary.qrEligibleScheduleCount} ready to generate</p></div><button type="button" disabled={!detail.qrEligible.summary.qrEligibleScheduleCount || actionBusy === 'qr'} onClick={generateQr} className="ga-btn-primary">{actionBusy === 'qr' ? 'Generating…' : 'Generate remaining QR tokens'}</button></div><p className="mt-4 rounded-lg bg-warning-soft p-3 text-xs font-semibold leading-5 text-brand-amber">Raw QR values are displayed only once. Download them immediately for the approved delivery process.</p></div>}</article>}
          {['CLOSED', 'CANCELLED'].includes(selected.status) && <article className="ga-card p-6"><h3 className="ga-section-heading">Event record is read-only</h3><p className="mt-2 text-sm text-muted-copy">This {selected.status.toLowerCase()} distribution remains available for reports and audit review.</p></article>}
          {detail.schedules.schedules.length > 0 && <article className="ga-card overflow-hidden"><div className="border-b border-line p-5"><h3 className="ga-section-heading">Queue preview</h3><p className="mt-1 text-sm text-muted-copy">First {Math.min(6, detail.schedules.schedules.length)} scheduled beneficiaries.</p></div><div className="divide-y divide-line">{detail.schedules.schedules.slice(0, 6).map((schedule) => <div key={schedule.scheduleId} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"><div className="min-w-0"><p className="truncate font-bold">#{schedule.queueNumber} · {fullName(schedule.beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">{displayTime(schedule.slot.slotStart)}–{displayTime(schedule.slot.slotEnd)}</p></div><StatusBadge value={schedule.status} /></div>)}</div></article>}
        </>}</section>
      </div>}
    </>}
    {eventForm && <DistributionFormDialog barangays={catalogs.barangays} distribution={eventForm.distribution} programs={catalogs.programs} onClose={() => setEventForm(null)} onSave={saveEvent} />}
    <ConfirmationDialog open={Boolean(confirmation)} title={confirmation?.title} description={confirmation?.description} actionLabel={confirmation?.actionLabel} destructive={confirmation?.destructive} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />
    {rawTokens && <RawTokensDialog tokens={rawTokens} onClose={() => setRawTokens(null)} />}
  </DashboardShell>
}

export default DistributionManagementPage
