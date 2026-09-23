import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { useMotionEntry } from '../components/ui/use-motion-entry.js'
import { DistributionSessionPlanner, DistributionSessionSummary } from '../components/distributions/DistributionSessionPlanner.jsx'
import { distributionSetupState } from '../utils/distributionWorkflow.js'
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
const verificationRequirements = ['QR', 'BIOMETRIC', 'QR_AND_BIOMETRIC', 'BIOMETRIC_AND_SIGNATURE']
const verificationLabels = { BIOMETRIC_AND_SIGNATURE: 'Face + Signature' }
const verificationDescriptions = {
  QR: 'Single-use QR token at claim time.',
  BIOMETRIC: 'Live face match completes the identity check.',
  QR_AND_BIOMETRIC: 'Both QR token and live face match are required.',
  BIOMETRIC_AND_SIGNATURE: 'Live face match followed by an encrypted beneficiary signature.',
}
const deliveryModes = [
  ['PHYSICAL_GOODS', 'Physical assistance', 'Facilitators hand over goods after identity verification and record release evidence.'],
  ['SIMULATED_WALLET', 'Simulated wallet', 'DSWD or an administrator records a prototype ledger credit. No real funds move.'],
]
const emptyDetail = { slots: { slots: [], summary: { matchingSlotCount: 0, matchingCapacity: 0, sessionCount: 0 } }, allocations: { allocations: [], summary: { countsByStatus: {}, totalAmount: '0' } }, schedules: { schedules: [], summary: { countsByStatus: {}, matchingScheduleCount: 0 } }, eligible: { enrollments: [], pagination: { total: 0 }, allocationAmount: null, summary: { serviceAreas: [], unspecifiedServiceAreaCount: 0 } }, qrEligible: { schedules: [], summary: { qrEligibleScheduleCount: 0 } }, qrTokens: { qrTokens: [], summary: { matchingTokenCount: 0 } } }
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
  const errorRef = useRef(null)
  const [form, setForm] = useState(() => distribution ? {
    programId: distribution.programId, title: distribution.title, distributionDate: distribution.distributionDate,
    startTime: distribution.startTime, endTime: distribution.endTime, slotDurationMinutes: String(distribution.slotDurationMinutes),
    location: distribution.location, barangayId: distribution.barangayId, deliveryMode: distribution.deliveryMode, verificationRequirement: distribution.verificationRequirement,
  } : { programId: '', title: '', distributionDate: todayInManila(), startTime: '08:00', endTime: '12:00', slotDurationMinutes: '30', location: '', barangayId: '', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR' })
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  useEffect(() => { dialogRef.current?.showModal() }, [])
  function change(field, value) { setForm((current) => ({ ...current, [field]: value })); setFormError('') }
  const [startHour, startMinute] = form.startTime.split(':').map(Number)
  const [endHour, endMinute] = form.endTime.split(':').map(Number)
  const eventMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute)
  const duration = Number(form.slotDurationMinutes)
  const windowCount = eventMinutes > 0 && duration > 0 && eventMinutes % duration === 0 ? eventMinutes / duration : 0
  const selectedProgram = programs.find((program) => program.programId === form.programId)
  const selectedBarangay = barangays.find((barangay) => barangay.barangayId === form.barangayId)
  async function submit(event) {
    event.preventDefault()
    let issue = ''
    if (eventMinutes <= 0) issue = 'Distribution end time must be later than the start time.'
    else if (eventMinutes % duration !== 0) issue = 'The event time must divide evenly by the selected slot duration.'
    if (issue) {
      setFormError(issue)
      requestAnimationFrame(() => errorRef.current?.focus())
      return
    }
    setIsSaving(true)
    try {
      await onSave({ ...form, slotDurationMinutes: duration })
      dialogRef.current?.close()
    } catch (requestError) {
      setFormError(getAuthErrorMessage(requestError))
      requestAnimationFrame(() => errorRef.current?.focus())
    } finally { setIsSaving(false) }
  }
  return (
    <dialog ref={dialogRef} onClose={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(68rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-page p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <form onSubmit={submit} aria-labelledby="distribution-form-title">
        <header className="flex items-start justify-between gap-5 border-b border-line bg-white px-5 py-5 sm:px-7">
          <div>
            <p className="ga-eyebrow">Administrator setup</p>
            <h2 id="distribution-form-title" className="mt-2 text-2xl font-extrabold">{distribution ? 'Edit draft event' : 'Create distribution event'}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-copy">Define the service scope first. Capacity and beneficiary scheduling are completed after this draft is saved.</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close distribution form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-white text-xl hover:bg-slate-50">×</button>
        </header>

        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-6">
            {formError && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-danger-soft p-4 text-sm font-semibold leading-6 text-brand-red"><p className="font-extrabold">Check the event timing</p><p className="mt-1">{formError}</p></div>}

            <fieldset className="rounded-xl border border-line bg-white p-5">
              <legend className="px-2 text-sm font-extrabold text-ink">1. Program and service area</legend>
              <div className="mt-2 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field id="distribution-title" label="Event title" required maxLength="200" value={form.title} onChange={(value) => change('title', value)} /></div>
                <div><label htmlFor="distribution-program" className="ga-label">Active assistance program</label><select id="distribution-program" required value={form.programId} onChange={(event) => change('programId', event.target.value)} className="ga-input mt-2"><option value="">Select program</option>{programs.map((program) => <option key={program.programId} value={program.programId}>{program.programName} ({program.programCode})</option>)}</select></div>
                <div><label htmlFor="distribution-barangay" className="ga-label">Service barangay</label><select id="distribution-barangay" required value={form.barangayId} onChange={(event) => change('barangayId', event.target.value)} className="ga-input mt-2"><option value="">Select barangay</option>{barangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}, {barangay.city}</option>)}</select></div>
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-line bg-white p-5">
              <legend className="px-2 text-sm font-extrabold text-ink">2. Date, venue, and service window</legend>
              <div className="mt-2 grid gap-5 sm:grid-cols-2">
                <Field id="distribution-date" label="Distribution date" type="date" min={todayInManila()} required value={form.distributionDate} onChange={(value) => change('distributionDate', value)} />
                <Field id="distribution-location" label="Venue or location" required maxLength="200" value={form.location} onChange={(value) => change('location', value)} />
                <Field id="distribution-start" label="Start time" type="time" required value={form.startTime} onChange={(value) => change('startTime', value)} />
                <Field id="distribution-end" label="End time" type="time" required value={form.endTime} onChange={(value) => change('endTime', value)} />
                <div className="sm:col-span-2"><label htmlFor="slot-duration" className="ga-label">Queue slot duration</label><div className="relative mt-2"><input id="slot-duration" type="number" list="common-slot-durations" min="5" max="720" step="5" required value={form.slotDurationMinutes} onChange={(event) => change('slotDurationMinutes', event.target.value)} className="ga-input pr-24" /><span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-muted-copy">minutes</span></div><datalist id="common-slot-durations">{[15, 20, 30, 60, 120].map((value) => <option key={value} value={value} />)}</datalist><p className="mt-2 text-xs leading-5 text-muted-copy">The service window must divide evenly into this duration.</p></div>
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-line bg-white p-5">
              <legend className="px-2 text-sm font-extrabold text-ink">3. Assistance delivery</legend>
              <p className="mt-2 text-sm leading-6 text-muted-copy">This controls the settlement path after a claim passes every identity check.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {deliveryModes.map(([value, label, description]) => <label key={value} className={`flex min-h-32 cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${form.deliveryMode === value ? 'border-brand-blue bg-info-soft ring-2 ring-blue-100' : 'border-line bg-white hover:border-blue-200'}`}><input type="radio" name="deliveryMode" value={value} checked={form.deliveryMode === value} onChange={() => change('deliveryMode', value)} className="mt-1 size-4 shrink-0 accent-brand-blue" /><span><span className="block text-sm font-extrabold text-ink">{label}</span><span className="mt-1 block text-xs leading-5 text-muted-copy">{description}</span></span></label>)}
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-line bg-white p-5">
              <legend className="px-2 text-sm font-extrabold text-ink">4. Claim verification</legend>
              <p className="mt-2 text-sm leading-6 text-muted-copy">Choose the identity evidence facilitators must complete at claim time.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {verificationRequirements.map((value) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${form.verificationRequirement === value ? 'border-brand-blue bg-info-soft ring-2 ring-blue-100' : 'border-line bg-white hover:border-blue-200'}`}><input type="radio" name="verificationRequirement" value={value} checked={form.verificationRequirement === value} onChange={() => change('verificationRequirement', value)} className="mt-1 size-4 shrink-0 accent-brand-blue" /><span><span className="block text-sm font-extrabold text-ink">{verificationLabels[value] ?? humanize(value)}</span><span className="mt-1 block text-xs leading-5 text-muted-copy">{verificationDescriptions[value]}</span></span></label>)}
              </div>
            </fieldset>
          </div>

          <aside className="self-start rounded-xl border border-line bg-white p-5 lg:sticky lg:top-5" aria-label="Distribution draft overview">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-info-soft text-brand-blue"><Icon name="overview" /></span><div><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Draft overview</p><p className="font-extrabold text-ink">Before capacity</p></div></div>
            <dl className="mt-5 divide-y divide-line text-sm">
              <div className="py-3 first:pt-0"><dt className="text-xs font-semibold text-muted-copy">Program</dt><dd className="mt-1 font-bold text-ink">{selectedProgram?.programName || 'Not selected'}</dd></div>
              <div className="py-3"><dt className="text-xs font-semibold text-muted-copy">Service area</dt><dd className="mt-1 font-bold text-ink">{selectedBarangay ? `${selectedBarangay.barangayName}, ${selectedBarangay.city}` : 'Not selected'}</dd></div>
              <div className="py-3"><dt className="text-xs font-semibold text-muted-copy">Schedule</dt><dd className="mt-1 font-bold text-ink">{form.distributionDate ? displayDate(form.distributionDate) : 'Not selected'}</dd><dd className="mt-1 text-copy">{form.startTime || '—'}–{form.endTime || '—'}</dd></div>
              <div className="py-3"><dt className="text-xs font-semibold text-muted-copy">Service windows</dt><dd className={`mt-1 text-2xl font-black tabular-nums ${windowCount ? 'text-brand-green' : 'text-brand-amber'}`}>{windowCount || '—'}</dd><dd className="mt-1 text-xs leading-5 text-muted-copy">Capacity per slot is assigned in the next stage.</dd></div>
              <div className="py-3 last:pb-0"><dt className="text-xs font-semibold text-muted-copy">Verification</dt><dd className="mt-1 font-bold text-ink">{verificationLabels[form.verificationRequirement] ?? humanize(form.verificationRequirement)}</dd></div>
              <div className="py-3 last:pb-0"><dt className="text-xs font-semibold text-muted-copy">Delivery</dt><dd className="mt-1 font-bold text-ink">{deliveryModes.find(([value]) => value === form.deliveryMode)?.[1]}</dd></div>
            </dl>
            <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-copy"><strong className="text-ink">Draft behavior:</strong> saving does not notify beneficiaries or open field operations.</div>
          </aside>
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-line bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="text-xs leading-5 text-muted-copy">All changes are audit logged. The event remains editable until service sessions or allocations are created.</p><div className="flex flex-col-reverse gap-3 sm:flex-row"><button type="button" onClick={() => dialogRef.current?.close()} disabled={isSaving} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={isSaving} className="ga-btn-primary">{isSaving ? <LoadingLabel>Saving...</LoadingLabel> : distribution ? 'Save event changes' : 'Create draft event'}</button></div></footer>
      </form>
    </dialog>
  )
}

function Field({ id, label, onChange, ...inputProps }) {
  return <div><label htmlFor={id} className="ga-label">{label}</label><input id={id} onChange={(event) => onChange(event.target.value)} className="ga-input mt-2" {...inputProps} /></div>
}

function WorkflowProgress({ activeStage, onStageChange, workflow }) {
  return (
    <nav aria-label="Distribution setup stages">
      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {workflow.stages.map((stage, index) => {
          const selected = activeStage === stage.key
          return (
            <li key={stage.key}>
              <button
                type="button"
                disabled={!stage.available}
                aria-current={selected ? 'step' : undefined}
                aria-controls="distribution-stage-panel"
                onClick={() => onStageChange(stage.key)}
                className={`group flex min-h-20 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${selected ? 'border-brand-blue bg-info-soft shadow-sm' : stage.complete ? 'border-emerald-200 bg-white hover:bg-success-soft' : stage.available ? 'border-line bg-white hover:border-blue-200 hover:bg-slate-50' : 'border-line bg-slate-50 opacity-55'}`}
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${stage.complete ? 'bg-brand-green text-white' : selected ? 'bg-brand-blue text-white' : 'bg-slate-200 text-copy'}`}><Icon name={stage.complete ? 'check' : stage.icon} className="size-4" strokeWidth={2.2} /></span>
                <span className="min-w-0"><span className="block text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-copy">Step {index + 1}</span><span className="mt-0.5 block text-sm font-extrabold text-ink">{stage.shortLabel}</span></span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function RawTokensDialog({ distribution, onClose, tokens }) {
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
  function printCards() {
    setSaved(true)
    requestAnimationFrame(() => window.print())
  }
  function cancel(event) {
    if (saved) return
    event.preventDefault()
    toast.error('Print, copy, or download the one-time QR credentials before closing.')
  }
  return (
    <dialog ref={dialogRef} onCancel={cancel} onClose={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(70rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">One-time secure output</p><h2 className="mt-1 text-2xl font-bold">Save beneficiary QR credentials now</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-brand-red">These raw credentials cannot be retrieved again after this window closes. Print the cards for approved distribution or save the CSV in an authorized secure location.</p></div><span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-emerald-200 bg-success-soft px-3 py-1.5 text-xs font-bold text-brand-green"><Icon name="security" className="size-4" /> Single use</span></div>

        <section data-qr-credential-print className="mt-6">
          <header className="mb-5 hidden border-b-2 border-brand-navy pb-4 print:block"><p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-blue">GarantiyAid · Official claim credentials</p><h1 className="mt-1 text-2xl font-bold text-brand-navy">{distribution.title}</h1><p className="mt-1 text-sm text-copy">{displayDate(distribution.distributionDate)} · {distribution.location}</p></header>
          <div className="ga-qr-credential-grid grid gap-4 lg:grid-cols-2">
            {tokens.map((item) => (
              <article key={item.qrTokenId} className="ga-qr-credential-card rounded-xl border border-line bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-blue">Aid claim credential</p><h3 className="mt-1 text-lg font-bold text-ink">{fullName(item.beneficiary)}</h3></div><Icon name="qr" className="size-6 shrink-0 text-brand-blue" strokeWidth={2} /></div>
                <div className="mt-4 grid items-center gap-4 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                  <div className="mx-auto rounded-xl border border-line bg-white p-2"><QRCodeSVG value={item.token} size={136} level="M" marginSize={1} title={`Claim QR code for ${fullName(item.beneficiary)}`} /></div>
                  <dl className="min-w-0 space-y-3 text-sm"><div><dt className="text-xs font-semibold text-muted-copy">Distribution</dt><dd className="mt-1 font-bold text-ink">{distribution.title}</dd></div><div><dt className="text-xs font-semibold text-muted-copy">Expires</dt><dd className="mt-1 font-semibold text-ink">{dateFormatter.format(new Date(item.expiresAt))} · {timeFormatter.format(new Date(item.expiresAt))}</dd></div><div><dt className="text-xs font-semibold text-muted-copy">Backup token</dt><dd className="mt-1 [overflow-wrap:anywhere] font-mono text-[0.65rem] leading-4 text-copy">{item.token}</dd></div></dl>
                </div>
                <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-muted-copy">Present this credential only to an authorized GarantiyAid facilitator. It becomes invalid after a successful claim.</p>
              </article>
            ))}
          </div>
        </section>

        <div data-qr-credential-actions className="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:flex-wrap sm:justify-end"><button type="button" disabled={!saved} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Done, credentials saved</button><button type="button" onClick={copy} className="ga-btn-secondary">Copy raw tokens</button><button type="button" onClick={download} className="ga-btn-secondary">Download CSV</button><button type="button" onClick={printCards} className="ga-btn-primary"><Icon name="printer" /> Print QR cards</button></div>
      </div>
    </dialog>
  )
}

function StageHeader({ description, icon, label, title }) {
  return (
    <header className="flex items-start gap-4 border-b border-line px-5 py-5 sm:px-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-brand-blue"><Icon name={icon} strokeWidth={2.1} /></span>
      <div><p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-blue">{label}</p><h3 className="mt-1 text-xl font-extrabold text-ink">{title}</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-copy">{description}</p></div>
    </header>
  )
}

function LockedStage({ children }) {
  return <div className="m-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy sm:m-6"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white text-brand-amber"><Icon name="lock" className="size-4" /></span><p>{children}</p></div>
}

function QueuePreview({ schedules }) {
  if (!schedules.length) return <div className="rounded-xl border border-dashed border-line bg-slate-50 p-7 text-center"><span className="mx-auto grid size-10 place-items-center rounded-lg bg-white text-muted-copy shadow-sm"><Icon name="queue" /></span><p className="mt-3 font-extrabold text-ink">No queue assignments yet</p><p className="mt-1 text-sm leading-6 text-muted-copy">Generate the queue after at least one approved beneficiary has been allocated.</p></div>
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="flex items-center justify-between gap-4 border-b border-line bg-slate-50 px-4 py-3"><p className="text-sm font-extrabold text-ink">Queue preview</p><span className="text-xs font-bold text-muted-copy">First {Math.min(6, schedules.length)} of {schedules.length}</span></div>
      <div className="divide-y divide-line">{schedules.slice(0, 6).map((schedule) => <div key={schedule.scheduleId} className="flex items-center justify-between gap-4 bg-white px-4 py-3.5 hover:bg-slate-50"><div className="min-w-0"><p className="truncate font-bold text-ink"><span className="mr-2 font-mono text-brand-blue">#{schedule.queueNumber}</span>{fullName(schedule.beneficiary)}</p><p className="mt-1 text-xs font-semibold text-copy">{schedule.slot.sessionLabel}</p><p className="mt-1 text-xs text-muted-copy">{displayDate(schedule.slot.slotStart)} · {displayTime(schedule.slot.slotStart)}–{displayTime(schedule.slot.slotEnd)} · {schedule.slot.location}</p></div><StatusBadge value={schedule.status} /></div>)}</div>
    </div>
  )
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
  const [activeStage, setActiveStage] = useState('sessions')
  const [actionFeedback, setActionFeedback] = useState(null)
  const authorized = session.user.role === 'SYSTEM_ADMIN'
  const detailMotionRef = useMotionEntry(`${selectedId}:${activeStage}:${reload}`)

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
      .then((result) => { if (active) { setData(result); setError(''); if (!result.distributions.length) { setSelected(null); setDetail(emptyDetail); setIsLoadingDetail(false) } setSelectedId((current) => result.distributions.some((item) => item.distributionId === current) ? current : result.distributions[0]?.distributionId || '') } })
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
        distribution.status === 'OPEN' && ['QR', 'QR_AND_BIOMETRIC'].includes(distribution.verificationRequirement) ? requestQrEligibleSchedules(session.accessToken, selectedId) : Promise.resolve(emptyDetail.qrEligible),
      ])
      if (active) {
        const activeAllocationCount = allocations.summary.countsByStatus?.ALLOCATED ?? 0
        const scheduledCount = ['SCHEDULED', 'CHECKED_IN', 'MISSED'].reduce((total, status) => total + (schedules.summary.countsByStatus?.[status] ?? 0), 0)
        setSelected(distribution)
        setDetail({ slots, allocations, schedules, qrTokens, eligible, qrEligible })
        setActiveStage(distributionSetupState({ status: distribution.status, slotCount: slots.summary.matchingSlotCount ?? 0, capacity: slots.summary.matchingCapacity ?? 0, activeAllocations: activeAllocationCount, scheduled: scheduledCount }).recommendedStage)
      }
    }).catch((requestError) => { if (active) { reportError(requestError); setSelected(null); setDetail(emptyDetail) } }).finally(() => { if (active) setIsLoadingDetail(false) })
    return () => { active = false }
  }, [authorized, reload, reportError, selectedId, session.accessToken])

  function applyFilters(event) { event.preventDefault(); setPage(1); setIsLoading(true); setFilters(draft) }
  async function saveEvent(payload) {
    try {
      const saved = eventForm?.distribution ? await updateDistribution(session.accessToken, eventForm.distribution.distributionId, payload) : await createDistribution(session.accessToken, payload)
      const message = eventForm?.distribution ? 'Distribution event updated.' : 'Draft distribution event created.'
      toast.success(message)
      setActionFeedback({ tone: 'success', message })
      setEventForm(null); setSelectedId(saved.distributionId); setReload((value) => value + 1)
    } catch (requestError) { reportError(requestError); throw requestError }
  }
  async function runAction(name, operation, successMessage) {
    setActionBusy(name)
    setActionFeedback(null)
    try { const result = await operation(); toast.success(successMessage); setActionFeedback({ tone: 'success', message: successMessage }); setIsLoadingDetail(true); setReload((value) => value + 1); return result } catch (requestError) { const message = getAuthErrorMessage(requestError); setActionFeedback({ tone: 'error', message }); reportError(requestError); throw requestError } finally { setActionBusy('') }
  }
  async function createSlots(sessions) {
    try { await runAction('slots', () => generateDistributionSlots(session.accessToken, selectedId, sessions), 'Service sessions and time slots generated.') } catch { /* Inline feedback is already shown. */ }
  }
  async function allocate() {
    if (!selectedEnrollmentIds.length) return toast.error('Select at least one approved enrollment.')
    if (selectedEnrollmentIds.length > remainingCapacity) return toast.error(`Only ${remainingCapacity} queue ${remainingCapacity === 1 ? 'place remains' : 'places remain'} in this event.`)
    try {
      await runAction('allocations', () => createDistributionAllocations(session.accessToken, selectedId, selectedEnrollmentIds), `${selectedEnrollmentIds.length} beneficiary allocation${selectedEnrollmentIds.length === 1 ? '' : 's'} created.`)
      setSelectedEnrollmentIds([])
    } catch { /* Inline feedback is already shown. */ }
  }
  async function generateSchedules() {
    try { await runAction('schedules', () => generateDistributionSchedules(session.accessToken, selectedId), 'Queue schedules generated for all active allocations.') } catch { /* Inline feedback is already shown. */ }
  }
  async function generateQr() {
    try {
      const result = await runAction('qr', () => generateDistributionQrTokens(session.accessToken, selectedId), 'QR tokens generated.')
      setRawTokens(result.qrTokens)
    } catch { /* Inline feedback is already shown. */ }
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
  const capacity = detail.slots.summary.matchingCapacity ?? 0
  const workflow = distributionSetupState({ status: selected?.status, slotCount, capacity, activeAllocations, scheduled })
  const readyToOpen = workflow.readyToOpen
  const remainingCapacity = workflow.remainingCapacity
  const canEditEvent = selected?.status === 'DRAFT' && slotCount === 0 && activeAllocations === 0
  const eligibleRows = detail.eligible.enrollments
  const filtersActive = Object.values(filters).some(Boolean)

  return (
    <DashboardShell breadcrumbs={['Operations', 'Aid distribution', 'Distribution setup']} currentPath="/distributions/manage" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Distribution setup" user={session.user}>
      <header className="grid gap-5 border-b border-line pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div><p className="ga-eyebrow">Administrator operations</p><h1 className="ga-page-title">Distribution control room</h1><p className="ga-page-copy max-w-3xl">Build the service plan, allocate approved beneficiaries, generate the queue, and release a verified event to field staff.</p></div>
        {authorized && <button type="button" disabled={!catalogs.programs.length || !catalogs.barangays.length} onClick={() => setEventForm({ distribution: null })} className="ga-btn-primary shrink-0"><Icon name="plus" />Create distribution</button>}
      </header>

      {!authorized ? <section className="ga-card mt-6 p-8 text-center" role="alert"><span className="mx-auto grid size-12 place-items-center rounded-xl bg-danger-soft text-brand-red"><Icon name="lock" /></span><h2 className="ga-section-heading mt-4">Administrator access required</h2><p className="mt-2 text-muted-copy">Only System Administrators can configure distribution events.</p></section> : <>
        <section className="mt-6 flex items-start gap-3 border-l-4 border-brand-blue bg-info-soft px-4 py-3.5 text-sm leading-6 text-copy"><Icon name="security" className="mt-0.5 size-5 shrink-0 text-brand-blue" /><p><strong className="text-ink">Controlled release:</strong> every change is audit logged. Opening an event freezes its sessions, allocations, and queue before facilitators begin field operations.</p></section>

        {!isLoading && (!catalogs.programs.length || !catalogs.barangays.length) && <section className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy" role="status"><Icon name="info" className="mt-0.5 size-5 shrink-0 text-brand-amber" /><p><strong className="text-brand-amber">Creation unavailable:</strong> {!catalogs.programs.length && !catalogs.barangays.length ? 'activate an assistance program and add an active Barangay first' : !catalogs.programs.length ? 'DSWD Staff must activate at least one assistance program first' : 'add at least one active Barangay first'}.</p></section>}

        <section className="ga-card mt-5 p-4 sm:p-5" aria-labelledby="distribution-filter-title">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="distribution-filter-title" className="text-sm font-extrabold text-ink">Find an event</h2><p className="mt-1 text-xs text-muted-copy">Narrow the register by lifecycle, program, or service area.</p></div>{filtersActive && <button type="button" onClick={() => { const empty = { status: '', programId: '', barangayId: '' }; setDraft(empty); setFilters(empty); setPage(1); setIsLoading(true) }} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft"><Icon name="reset" className="mr-1 inline size-4" />Clear filters</button>}</div>
          <form onSubmit={applyFilters} className="mt-4 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)_auto]" aria-label="Distribution filters">
            <div><label htmlFor="distribution-status" className="ga-label">Lifecycle</label><select id="distribution-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input mt-2">{statuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div>
            <div><label htmlFor="distribution-program-filter" className="ga-label">Assistance program</label><select id="distribution-program-filter" value={draft.programId} onChange={(event) => setDraft((current) => ({ ...current, programId: event.target.value }))} className="ga-input mt-2"><option value="">All programs</option>{catalogs.programs.map((program) => <option key={program.programId} value={program.programId}>{program.programName}</option>)}</select></div>
            <div><label htmlFor="distribution-barangay-filter" className="ga-label">Service Barangay</label><select id="distribution-barangay-filter" value={draft.barangayId} onChange={(event) => setDraft((current) => ({ ...current, barangayId: event.target.value }))} className="ga-input mt-2"><option value="">All Barangays</option>{catalogs.barangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}</option>)}</select></div>
            <button className="ga-btn-primary">Apply filters</button>
          </form>
        </section>

        {isLoading ? <LoadingState /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="font-extrabold">Distribution events could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></section> : <div className="mt-6 grid items-start gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="ga-card overflow-hidden xl:sticky xl:top-24" aria-labelledby="event-register-title">
            <div className="flex items-center justify-between border-b border-line px-4 py-4"><div><h2 id="event-register-title" className="font-extrabold text-ink">Event register</h2><p className="mt-1 text-xs text-muted-copy">{data.pagination.total} matching {data.pagination.total === 1 ? 'record' : 'records'}</p></div><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold tabular-nums text-copy">{data.pagination.page}/{Math.max(data.pagination.totalPages, 1)}</span></div>
            {rows.length === 0 ? <div className="p-8 text-center"><span className="mx-auto grid size-11 place-items-center rounded-xl bg-info-soft text-brand-blue"><Icon name="distributions" /></span><h3 className="mt-4 font-extrabold">No events found</h3><p className="mt-2 text-sm leading-6 text-muted-copy">Clear the filters or create the first draft event.</p></div> : <div className="divide-y divide-line">{rows.map((distribution) => {
              const isSelected = selectedId === distribution.distributionId
              return <button key={distribution.distributionId} type="button" onClick={() => { setActionFeedback(null); setIsLoadingDetail(true); setSelectedEnrollmentIds([]); setSelectedId(distribution.distributionId) }} aria-pressed={isSelected} className={`relative block min-h-24 w-full px-4 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-blue ${isSelected ? 'bg-info-soft' : 'bg-white hover:bg-slate-50'}`}>{isSelected && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r bg-brand-blue" />}<div className="flex items-start justify-between gap-3"><p className="line-clamp-2 font-extrabold text-ink">{distribution.title}</p><StatusBadge value={distribution.status} /></div><p className="mt-2 truncate text-xs font-bold text-brand-blue">{distribution.program.programCode} · {distribution.barangay.barangayName}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-copy"><Icon name="calendar" className="size-3.5" />{displayDate(distribution.distributionDate)} · {distribution.startTime}–{distribution.endTime}</p></button>
            })}</div>}
            {data.pagination.totalPages > 1 && <div className="grid grid-cols-2 gap-2 border-t border-line p-3"><button type="button" disabled={page === 1} onClick={() => { setIsLoading(true); setPage((value) => value - 1) }} className="ga-btn-secondary min-h-11 px-3 text-sm"><Icon name="chevronLeft" />Previous</button><button type="button" disabled={page === data.pagination.totalPages} onClick={() => { setIsLoading(true); setPage((value) => value + 1) }} className="ga-btn-secondary min-h-11 px-3 text-sm">Next<Icon name="chevronRight" /></button></div>}
          </aside>

          <main ref={detailMotionRef} className="min-w-0 space-y-5" aria-live="polite">{isLoadingDetail ? <div className="ga-card p-6"><Skeleton className="h-8 w-3/4" /><div className="mt-5 grid grid-cols-3 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="mt-5 h-56 w-full" /></div> : !selected ? <div className="ga-card p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-xl bg-info-soft text-brand-blue"><Icon name="distributions" /></span><h2 className="ga-section-heading mt-4">Select a distribution event</h2><p className="mt-2 text-sm text-muted-copy">Choose a record to see readiness, operational totals, and the next valid action.</p></div> : <>
            <article className="ga-card overflow-hidden">
              <header className="bg-brand-navy px-5 py-5 text-white sm:px-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-200">{selected.program.programCode} · {selected.barangay.barangayName}</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight">{selected.title}</h2><p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-blue-100"><span className="inline-flex items-center gap-1.5"><Icon name="calendar" className="size-4" />{displayDate(selected.distributionDate)}, {selected.startTime}–{selected.endTime}</span><span className="inline-flex items-center gap-1.5"><Icon name="location" className="size-4" />{selected.location}</span><span className="inline-flex items-center gap-1.5"><Icon name="receipt" className="size-4" />{humanize(selected.deliveryMode)}</span></p></div><div className="flex shrink-0 flex-wrap items-center gap-2"><StatusBadge value={selected.status} />{canEditEvent && <button type="button" onClick={() => setEventForm({ distribution: selected })} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 text-sm font-bold text-white hover:bg-white/20"><Icon name="pen" className="size-4" />Edit details</button>}</div></div></header>
              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-info-soft p-4"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-brand-blue shadow-sm"><Icon name="arrowRight" className="size-4" /></span><div><p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-blue">Next valid action</p><p className="mt-1 text-sm font-bold leading-6 text-ink">{workflow.nextAction}</p></div></div>

                <dl className="mt-5 grid divide-y divide-line overflow-hidden rounded-xl border border-line bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  <div className="p-4"><dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Planned capacity</dt><dd className="mt-1 text-2xl font-black tabular-nums text-ink">{capacity}</dd><dd className="mt-1 text-xs text-muted-copy">Across {slotCount} queue {slotCount === 1 ? 'slot' : 'slots'}</dd></div>
                  <div className="p-4"><dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Allocated</dt><dd className="mt-1 text-2xl font-black tabular-nums text-ink">{activeAllocations}</dd><dd className="mt-1 text-xs text-muted-copy">{remainingCapacity} places remaining</dd></div>
                  <div className="p-4"><dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Queue coverage</dt><dd className="mt-1 text-2xl font-black tabular-nums text-ink">{scheduled}<span className="text-base font-bold text-muted-copy">/{activeAllocations}</span></dd><dd className="mt-1 text-xs text-muted-copy">Active allocations scheduled</dd></div>
                </dl>

                <div className="mt-4"><div className="flex items-center justify-between gap-4 text-xs font-bold"><span className="text-copy">Capacity assigned</span><span className="tabular-nums text-ink">{workflow.occupancyPercent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Distribution capacity assigned" aria-valuemin="0" aria-valuemax="100" aria-valuenow={workflow.occupancyPercent}><div className="h-full rounded-full bg-brand-blue transition-[width] motion-reduce:transition-none" style={{ width: `${workflow.occupancyPercent}%` }} /></div></div>

                <div className="mt-6 border-t border-line pt-5"><WorkflowProgress activeStage={activeStage} workflow={workflow} onStageChange={(stage) => { setActionFeedback(null); setActiveStage(stage) }} /></div>
              </div>
            </article>

            {actionFeedback && <div role={actionFeedback.tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border p-4 text-sm font-semibold leading-6 ${actionFeedback.tone === 'error' ? 'border-red-200 bg-danger-soft text-brand-red' : 'border-emerald-200 bg-success-soft text-brand-green'}`}><Icon name={actionFeedback.tone === 'error' ? 'info' : 'check'} className="mt-0.5 shrink-0" /><p>{actionFeedback.message}</p></div>}

            <section id="distribution-stage-panel" tabIndex={-1} className="ga-card min-w-0 overflow-hidden outline-none" aria-label={`${humanize(activeStage)} setup stage`}>
              {activeStage === 'sessions' && <><StageHeader label="Step 1 of 4" icon="calendar" title="Plan service sessions" description="Define when and where people will be served, how many places each time slot holds, and whether sessions cover the whole Barangay or named Sitios and Puroks." /><div className="p-5 sm:p-6">{slotCount === 0 && selected.status === 'DRAFT' ? <DistributionSessionPlanner key={selected.distributionId} busy={actionBusy === 'slots'} distribution={selected} onGenerate={createSlots} serviceAreaSummary={detail.eligible.summary} /> : slotCount > 0 ? <><DistributionSessionSummary slots={detail.slots.slots} summary={detail.slots.summary} /><p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-muted-copy"><Icon name="lock" className="mt-0.5 size-4 shrink-0" />Generated service sessions are preserved with this event. Cancel the draft and create a replacement event if the service plan must be rebuilt.</p></> : <p className="text-sm text-muted-copy">No service-session record is available for this event.</p>}</div></>}

              {activeStage === 'beneficiaries' && <><StageHeader label="Step 2 of 4" icon="beneficiaries" title="Allocate approved beneficiaries" description="Select only approved program enrollments covered by this event’s Barangay and available service sessions." />{!slotCount ? <LockedStage>Complete the service-session plan before allocating beneficiaries.</LockedStage> : selected.status !== 'DRAFT' ? <div className="p-5 sm:p-6"><div className="rounded-xl border border-line bg-slate-50 p-5"><p className="text-3xl font-black tabular-nums text-ink">{activeAllocations}</p><p className="mt-1 text-sm font-bold text-copy">active beneficiary allocations</p><p className="mt-2 text-xs leading-5 text-muted-copy">Allocations are frozen because this event is {selected.status.toLowerCase()}.</p></div></div> : eligibleRows.length === 0 ? <div className="p-7 text-center"><span className="mx-auto grid size-11 place-items-center rounded-xl bg-success-soft text-brand-green"><Icon name="check" /></span><p className="mt-4 font-extrabold text-ink">No approved enrollments waiting</p><p className="mt-1 text-sm leading-6 text-muted-copy">All covered beneficiaries may already be allocated, or DSWD enrollment review is still pending.</p></div> : <><div className="flex flex-col gap-2 border-y border-line bg-slate-50 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><p><strong className="text-ink">{remainingCapacity}</strong> of {capacity} queue places remain</p><p className="font-semibold text-copy">{activeAllocations} already allocated · {detail.eligible.allocationAmount ? `${moneyFormatter.format(Number(detail.eligible.allocationAmount))} each` : 'Grant amount unavailable'}</p></div><div className="max-h-[26rem] overflow-y-auto"><div className="divide-y divide-line sm:hidden">{eligibleRows.map((enrollment) => <label key={enrollment.enrollmentId} className="flex min-h-16 items-center gap-3 px-4 py-3"><input type="checkbox" aria-label={`Select ${fullName(enrollment.beneficiary)}`} disabled={!selectedEnrollmentIds.includes(enrollment.enrollmentId) && selectedEnrollmentIds.length >= remainingCapacity} checked={selectedEnrollmentIds.includes(enrollment.enrollmentId)} onChange={(event) => setSelectedEnrollmentIds((current) => event.target.checked ? [...current, enrollment.enrollmentId] : current.filter((id) => id !== enrollment.enrollmentId))} className="size-5 shrink-0 accent-brand-blue" /><span className="min-w-0"><span className="block truncate text-sm font-bold text-ink">{fullName(enrollment.beneficiary)}</span><span className="mt-1 block text-xs text-muted-copy">{enrollment.beneficiary.sitioPurok ?? 'Sitio/Purok not recorded'}</span></span></label>)}</div><table className="hidden w-full text-left text-sm sm:table"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><tr><th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Select available approved enrollments" disabled={remainingCapacity === 0} checked={selectedEnrollmentIds.length > 0 && selectedEnrollmentIds.length === Math.min(eligibleRows.length, remainingCapacity)} onChange={(event) => setSelectedEnrollmentIds(event.target.checked ? eligibleRows.slice(0, remainingCapacity).map((row) => row.enrollmentId) : [])} className="size-4 accent-brand-blue" /></th><th className="px-4 py-3">Beneficiary</th><th className="px-4 py-3">Sitio / Purok</th></tr></thead><tbody className="divide-y divide-line">{eligibleRows.map((enrollment) => <tr key={enrollment.enrollmentId} className="hover:bg-slate-50"><td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${fullName(enrollment.beneficiary)}`} disabled={!selectedEnrollmentIds.includes(enrollment.enrollmentId) && selectedEnrollmentIds.length >= remainingCapacity} checked={selectedEnrollmentIds.includes(enrollment.enrollmentId)} onChange={(event) => setSelectedEnrollmentIds((current) => event.target.checked ? [...current, enrollment.enrollmentId] : current.filter((id) => id !== enrollment.enrollmentId))} className="size-4 accent-brand-blue" /></td><td className="px-4 py-3 font-bold text-ink">{fullName(enrollment.beneficiary)}</td><td className="px-4 py-3 text-muted-copy">{enrollment.beneficiary.sitioPurok ?? 'Not recorded'}</td></tr>)}</tbody></table></div><div className="flex flex-col gap-3 border-t border-line p-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-copy"><strong className="text-ink">{selectedEnrollmentIds.length}</strong> selected for allocation</p><button type="button" disabled={!selectedEnrollmentIds.length || actionBusy === 'allocations'} onClick={allocate} className="ga-btn-primary">{actionBusy === 'allocations' ? <LoadingLabel>Allocating...</LoadingLabel> : `Allocate ${selectedEnrollmentIds.length || ''} ${selectedEnrollmentIds.length === 1 ? 'beneficiary' : 'beneficiaries'}`}</button></div></>}</>}

              {activeStage === 'queue' && <><StageHeader label="Step 3 of 4" icon="queue" title="Build the queue schedule" description="Place each allocated beneficiary into the earliest available slot that covers their service area, then review the resulting queue before release." />{!activeAllocations ? <LockedStage>Allocate at least one approved beneficiary before generating the queue.</LockedStage> : <div className="space-y-5 p-5 sm:p-6"><div className="rounded-xl border border-line bg-slate-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-extrabold text-ink">{scheduled} of {activeAllocations} allocations scheduled</p><p className="mt-1 text-xs text-muted-copy">{workflow.unscheduled ? `${workflow.unscheduled} still need a queue assignment.` : 'Every active allocation has a queue assignment.'}</p></div>{selected.status === 'DRAFT' && workflow.unscheduled > 0 && <button type="button" onClick={generateSchedules} disabled={actionBusy === 'schedules'} className="ga-btn-primary shrink-0">{actionBusy === 'schedules' ? <LoadingLabel>Scheduling...</LoadingLabel> : `Schedule ${workflow.unscheduled} remaining`}</button>}</div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Queue schedule coverage" aria-valuemin="0" aria-valuemax={activeAllocations} aria-valuenow={scheduled}><div className="h-full rounded-full bg-brand-green transition-[width] motion-reduce:transition-none" style={{ width: `${activeAllocations ? Math.min(100, scheduled / activeAllocations * 100) : 0}%` }} /></div></div><QueuePreview schedules={detail.schedules.schedules} /></div>}</>}

              {activeStage === 'launch' && <><StageHeader label="Step 4 of 4" icon={selected.status === 'OPEN' ? 'check' : 'security'} title={selected.status === 'DRAFT' ? 'Review and open the event' : selected.status === 'OPEN' ? 'Field operations released' : 'Preserved event record'} description={selected.status === 'DRAFT' ? 'Confirm every readiness gate before freezing setup and releasing the queue to authorized field staff.' : selected.status === 'OPEN' ? 'The service plan and queue are frozen. Complete any required credential issuance and monitor operations.' : 'The event is read-only and remains available for reporting and audit review.'} />
                {selected.status === 'DRAFT' && <div className="p-5 sm:p-6"><ul className="divide-y divide-line rounded-xl border border-line">{[
                  ['Service sessions', slotCount > 0, slotCount > 0 ? `${detail.slots.summary.sessionCount} sessions and ${slotCount} queue slots` : 'Generate at least one service session'],
                  ['Beneficiary allocation', activeAllocations > 0, activeAllocations > 0 ? `${activeAllocations} approved beneficiaries allocated` : 'Allocate at least one approved beneficiary'],
                  ['Queue coverage', scheduled >= activeAllocations && activeAllocations > 0, activeAllocations > 0 ? `${scheduled} of ${activeAllocations} allocations scheduled` : 'Waiting for beneficiary allocations'],
                ].map(([label, complete, description]) => <li key={label} className="flex items-start gap-3 p-4"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${complete ? 'bg-success-soft text-brand-green' : 'bg-warning-soft text-brand-amber'}`}><Icon name={complete ? 'check' : 'clock'} className="size-4" strokeWidth={2.2} /></span><div><p className="text-sm font-extrabold text-ink">{label}</p><p className="mt-1 text-xs leading-5 text-muted-copy">{description}</p></div></li>)}</ul><div id="opening-readiness" className={`mt-5 rounded-xl border p-4 ${readyToOpen ? 'border-emerald-200 bg-success-soft' : 'border-amber-200 bg-warning-soft'}`}><p className={`font-extrabold ${readyToOpen ? 'text-brand-green' : 'text-brand-amber'}`}>{readyToOpen ? 'All release checks passed' : 'Release checks are incomplete'}</p><p className="mt-1 text-sm leading-6 text-copy">{readyToOpen ? 'Opening changes the lifecycle to OPEN and freezes all sessions, allocations, and schedules.' : 'Return to the first incomplete stage shown above.'}</p></div><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button type="button" aria-describedby="opening-readiness" disabled={!readyToOpen || Boolean(actionBusy)} onClick={() => setConfirmation({ kind: 'open', title: 'Open this distribution event?', description: 'Allocations, slots, and schedules will be frozen so field operations can begin.', actionLabel: 'Open event' })} className="ga-btn-primary">Open distribution event</button><button type="button" disabled={Boolean(actionBusy)} onClick={() => setConfirmation({ kind: 'cancel', title: 'Cancel this distribution event?', description: 'This permanently cancels its slots, allocations, and schedules. Use only when the event will not proceed.', actionLabel: 'Cancel event', destructive: true })} className="ga-btn-danger">Cancel event</button></div></div>}
                {selected.status === 'OPEN' && <div className="space-y-5 p-5 sm:p-6"><div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-success-soft p-4"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-brand-green"><Icon name="check" /></span><div><p className="font-extrabold text-brand-green">Event open for field operations</p><p className="mt-1 text-sm leading-6 text-copy">Facilitators can view their assigned queue and complete the configured claim checks.</p></div></div>{!['QR', 'QR_AND_BIOMETRIC'].includes(selected.verificationRequirement) ? <div className="rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">{verificationLabels[selected.verificationRequirement] ?? humanize(selected.verificationRequirement)}:</strong> {selected.verificationRequirement === 'BIOMETRIC_AND_SIGNATURE' ? 'facilitators complete a live face match, then collect the beneficiary signature in the biometric workspace.' : 'QR token issuance is not required for this event.'}</div> : <div className="rounded-xl border border-line p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-blue">Credential issuance</p><h4 className="mt-1 font-extrabold text-ink">Beneficiary QR tokens</h4><p className="mt-1 text-sm text-muted-copy">{detail.qrTokens.summary.matchingTokenCount} issued · {detail.qrEligible.summary.qrEligibleScheduleCount} ready to generate</p></div><button type="button" disabled={!detail.qrEligible.summary.qrEligibleScheduleCount || actionBusy === 'qr'} onClick={generateQr} className="ga-btn-primary">{actionBusy === 'qr' ? <LoadingLabel>Generating...</LoadingLabel> : 'Generate remaining QR tokens'}</button></div><p className="mt-4 flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-xs font-semibold leading-5 text-brand-amber"><Icon name="info" className="mt-0.5 size-4 shrink-0" />Raw QR values appear once. Print or download them immediately through the approved delivery process.</p></div>}</div>}
                {['CLOSED', 'CANCELLED'].includes(selected.status) && <div className="p-5 sm:p-6"><div className="flex items-start gap-3 rounded-xl border border-line bg-slate-50 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-muted-copy shadow-sm"><Icon name={selected.status === 'CANCELLED' ? 'close' : 'archive'} /></span><div><p className="font-extrabold text-ink">{humanize(selected.status)} distribution</p><p className="mt-1 text-sm leading-6 text-muted-copy">Operational changes are disabled. Reports, queue records, and audit history remain available.</p></div></div></div>}
              </>}
            </section>
          </>}</main>
        </div>}
      </>}

      {eventForm && <DistributionFormDialog barangays={catalogs.barangays} distribution={eventForm.distribution} programs={catalogs.programs} onClose={() => setEventForm(null)} onSave={saveEvent} />}
      <ConfirmationDialog open={Boolean(confirmation)} title={confirmation?.title} description={confirmation?.description} actionLabel={confirmation?.actionLabel} destructive={confirmation?.destructive} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />
      {rawTokens && <RawTokensDialog distribution={selected} tokens={rawTokens} onClose={() => setRawTokens(null)} />}
    </DashboardShell>
  )
}

export default DistributionManagementPage
