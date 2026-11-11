import { useCallback, useEffect, useRef, useState } from 'react'
import QrCredentialsDialog from '../components/distributions/QrCredentialsDialog.jsx'
import QrCredentialIssuance from '../components/distributions/QrCredentialIssuance.jsx'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { useMotionEntry } from '../components/ui/use-motion-entry.js'
import { DistributionSessionPlanner, DistributionSessionSummary } from '../components/distributions/DistributionSessionPlanner.jsx'
import SlotCapacityDialog from '../components/distributions/SlotCapacityDialog.jsx'
import EventOperationsStatus from '../components/distributions/EventOperationsStatus.jsx'
import EventOperationsReview from '../components/distributions/EventOperationsReview.jsx'
import { distributionSetupState } from '../utils/distributionWorkflow.js'
import { verificationLabels } from '../utils/claimVerification.js'
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
  requestProgram,
  requestPrograms,
  requestQrEligibleSchedules,
  reissueDistributionQrToken,
  updateDistribution,
  updateDistributionSlotCapacity,
} from '../auth/staffAuth.js'

const statuses = ['', 'DRAFT', 'OPEN', 'CLOSED', 'CANCELLED']
const verificationGuides = {
  QR: {
    scenario: 'For beneficiaries presenting a printed or digital QR credential.',
    checks: [['qr', 'Scan the current QR credential for this event.']],
    preparation: 'Generate and distribute QR credentials after the event opens. A printed credential can be used without a phone.',
  },
  BIOMETRIC: {
    scenario: 'For a venue equipped to verify identity using a live camera capture.',
    checks: [['biometrics', 'Complete a live face match against the enrolled profile.']],
    preparation: 'Prepare a working camera and biometric service. Beneficiaries need active consent and a cleared face profile.',
  },
  QR_OR_BIOMETRIC: {
    scenario: 'Complete ONE of these methods, based on what is available to the beneficiary. The other method is not required.',
    checks: [['qr', 'Scan the current event QR credential, printed or on a phone.'], ['biometrics', 'OR complete a live face match against the enrolled profile.']],
    preparation: 'Provide printed QR credentials for beneficiaries without a phone. Face matching uses the staff camera and needs active consent and a cleared face profile.',
  },
  QR_AND_BIOMETRIC: {
    scenario: 'For events requiring both a QR credential and a live identity check.',
    checks: [['qr', 'Scan the current QR credential for this event.'], ['biometrics', 'Complete a live face match against the enrolled profile.']],
    preparation: 'Prepare QR credentials, a working camera and biometric service, and cleared face profiles with active consent.',
  },
  BIOMETRIC_AND_SIGNATURE: {
    scenario: 'For events requiring a live identity check followed by a digital claim signature.',
    checks: [['biometrics', 'Complete a live face match against the enrolled profile.'], ['pen', 'Capture the beneficiary’s digital signature after the face check.']],
    preparation: 'Prepare a working camera, biometric service, signature input, and cleared face profiles with active consent.',
  },
}
const deliveryModes = [
  ['PHYSICAL_GOODS', 'Physical assistance', 'Barangay staff hand over the package and record release evidence after verification.', 'distributions'],
  ['SIMULATED_WALLET', 'Simulated wallet', 'DSWD records a test wallet credit after verification. No real funds are moved.', 'ledger'],
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

function DistributionFormDialog({ barangays, distribution, packageOnly = false, initialProgramId = '', programs, onClose, onSave }) {
  const dialogRef = useRef(null)
  const errorRef = useRef(null)
  const [form, setForm] = useState(() => distribution ? {
    packageName: distribution.packageName ?? '', packageUnit: distribution.packageUnit ?? 'pack', packageQuantity: String(distribution.packageQuantity ?? 1),
    programId: distribution.programId, title: distribution.title, distributionDate: distribution.distributionDate,
    startTime: distribution.startTime, endTime: distribution.endTime, slotDurationMinutes: String(distribution.slotDurationMinutes),
    location: distribution.location, barangayId: distribution.barangayId, deliveryMode: distribution.deliveryMode, verificationRequirement: distribution.verificationRequirement,
  } : { packageName: '', packageUnit: 'pack', packageQuantity: '1', programId: initialProgramId, title: '', distributionDate: todayInManila(), startTime: '08:00', endTime: '12:00', slotDurationMinutes: '30', location: '', barangayId: '', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR' })
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [reviewing, setReviewing] = useState(false)
  useEffect(() => { dialogRef.current?.showModal() }, [])
  useEffect(() => { if (formError) errorRef.current?.focus(); else if (reviewing) dialogRef.current?.querySelector('#review-event-heading')?.focus() }, [formError, reviewing])
  function change(field, value) { setForm((current) => ({ ...current, [field]: value })); setFormError('') }
  const [startHour, startMinute] = form.startTime.split(':').map(Number)
  const [endHour, endMinute] = form.endTime.split(':').map(Number)
  const eventMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute)
  const duration = Number(form.slotDurationMinutes)
  const windowCount = eventMinutes > 0 && duration > 0 && eventMinutes % duration === 0 ? eventMinutes / duration : 0
  const selectedProgram = programs.find((program) => program.programId === form.programId)
  const selectedBarangay = barangays.find((barangay) => barangay.barangayId === form.barangayId)
  const verificationGuide = verificationGuides[form.verificationRequirement]
  const needsQr = ['QR', 'QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC'].includes(form.verificationRequirement)
  const needsFace = ['BIOMETRIC', 'QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC', 'BIOMETRIC_AND_SIGNATURE'].includes(form.verificationRequirement)
  const requiresSignature = form.verificationRequirement === 'BIOMETRIC_AND_SIGNATURE'
  async function submit(event) {
    event.preventDefault()
    let issue = ''
    if (!packageOnly && !verificationGuide) issue = 'Select at least one allowed verification method.'
    else if (eventMinutes <= 0) issue = 'Distribution end time must be later than the start time.'
    else if (eventMinutes % duration !== 0) issue = 'The event time must divide evenly by the selected slot duration.'
    if (issue) {
      setFormError(issue)
      errorRef.current?.focus()
      return
    }
    if (!reviewing) {
      setFormError('')
      setReviewing(true)
      return
    }
    setFormError('')
    setIsSaving(true)
    try {
      await onSave({ ...(!packageOnly ? { ...form, slotDurationMinutes: duration } : {}), packageName: form.deliveryMode === 'PHYSICAL_GOODS' ? form.packageName.trim() : null, packageUnit: form.deliveryMode === 'PHYSICAL_GOODS' ? form.packageUnit.trim() : null, packageQuantity: form.deliveryMode === 'PHYSICAL_GOODS' ? Number(form.packageQuantity) : null })
      dialogRef.current?.close()
    } catch (requestError) {
      setFormError(getAuthErrorMessage(requestError))
    } finally { setIsSaving(false) }
  }
  return (
    <dialog ref={dialogRef} onClose={onClose} onCancel={(event) => { if (isSaving) event.preventDefault() }} aria-labelledby="distribution-form-title" aria-describedby="distribution-form-description" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(68rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <form onSubmit={submit} aria-labelledby="distribution-form-title" aria-busy={isSaving} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-4 sm:px-7 sm:py-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold text-brand-blue"><Icon name="distributions" className="size-4 shrink-0" />Step {reviewing ? '2' : '1'} of 2 · {reviewing ? 'Review draft' : 'Event details'}</p>
            <h2 id="distribution-form-title" className="mt-2 text-2xl font-extrabold">{reviewing ? 'Check event details' : packageOnly ? 'Edit assistance package' : distribution ? 'Edit draft event' : 'Create distribution event'}</h2>
            <p id="distribution-form-description" className="mt-2 max-w-2xl text-sm leading-6 text-muted-copy">{reviewing ? 'Confirm the details before saving. Use Change details to make a correction.' : packageOnly ? 'Set the package for this draft event. Opening the event locks these details.' : 'Set the program, schedule, assistance, and identity checks for this event.'}</p>
          </div>
          <button type="button" disabled={isSaving} onClick={() => dialogRef.current?.close()} aria-label="Close distribution form" className="ga-btn-secondary size-11 shrink-0 p-0"><Icon name="close" /></button>
        </header>

        <div className={`min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-7 ${!reviewing && !packageOnly ? 'grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_16rem]' : ''}`}>
          {reviewing ? <section className="mx-auto max-w-2xl" aria-labelledby="review-event-heading">
            {formError && <div ref={errorRef} tabIndex={-1} role="alert" className="mb-5 border-l-4 border-brand-red bg-danger-soft p-4 text-sm font-semibold text-brand-red">{formError}</div>}
            <h3 id="review-event-heading" tabIndex={-1} className="text-xl font-bold text-ink outline-none">Distribution details</h3>
            <dl className="mt-4 divide-y divide-line border-y border-line text-base">
              {[
                ['Event', form.title],
                ['Program', selectedProgram?.programName],
                ['Barangay', selectedBarangay ? `${selectedBarangay.barangayName}, ${selectedBarangay.city}` : ''],
                ['Date', displayDate(form.distributionDate)],
                ['Venue', form.location],
                ['Service time', `${form.startTime}–${form.endTime}`],
                ['Queue slot', `${form.slotDurationMinutes} minutes`],
                ...(form.deliveryMode === 'PHYSICAL_GOODS' ? [['Assistance package', `${form.packageName}: ${form.packageQuantity} ${form.packageUnit} per beneficiary`]] : []),
                ['Delivery', deliveryModes.find(([value]) => value === form.deliveryMode)?.[1]],
                ['Claim verification', verificationLabels[form.verificationRequirement] ?? humanize(form.verificationRequirement)],
              ].filter(([label]) => !packageOnly || ['Event', 'Assistance package'].includes(label)).map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4"><dt className="font-semibold text-copy">{label}</dt><dd className="font-bold text-ink">{value}</dd></div>)}
            </dl>
            <p className="mt-5 border-l-4 border-brand-blue bg-info-soft p-4 text-sm leading-6 text-copy">Saving keeps the event in draft. Beneficiaries are not notified and field operations do not open yet.</p>
          </section> : <>
          <div className="min-w-0 space-y-7">
            {formError && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-danger-soft p-4 text-sm font-semibold leading-6 text-brand-red"><p className="font-extrabold">There is a problem</p><p className="mt-1">{formError}</p></div>}

            {!packageOnly && <fieldset className="min-w-0 border-b border-line pb-7">
              <legend className="flex items-center gap-2 text-base font-semibold text-ink"><Icon name="programs" className="size-5 text-brand-blue" />1. Program and service area</legend>
              <p className="mt-2 text-sm leading-6 text-muted-copy">Fields marked <span aria-hidden="true" className="text-brand-red">*</span> are required. Choose an active program and barangay.</p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field id="distribution-title" label="Event title" icon="pen" placeholder="e.g. San Nicolas food assistance — November" required maxLength="200" value={form.title} onChange={(value) => change('title', value)} /></div>
                <div className="min-w-0"><label htmlFor="distribution-program" className="ga-label" data-required="true">Active assistance program</label><div className="relative mt-2"><Icon name="programs" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-copy" /><select id="distribution-program" required value={form.programId} onChange={(event) => change('programId', event.target.value)} className="ga-input pl-10"><option value="">Select program</option>{programs.map((program) => <option key={program.programId} value={program.programId}>{program.programName} ({program.programCode})</option>)}</select></div></div>
                <div className="min-w-0"><label htmlFor="distribution-barangay" className="ga-label" data-required="true">Service barangay</label><div className="relative mt-2"><Icon name="location" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-copy" /><select id="distribution-barangay" required value={form.barangayId} onChange={(event) => change('barangayId', event.target.value)} className="ga-input pl-10"><option value="">Select barangay</option>{barangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}, {barangay.city}</option>)}</select></div></div>
              </div>
            </fieldset>}

            {!packageOnly && <fieldset className="min-w-0 border-b border-line pb-7">
              <legend className="flex items-center gap-2 text-base font-semibold text-ink"><Icon name="calendar" className="size-5 text-brand-blue" />2. Schedule and venue</legend>
              <p className="mt-2 text-sm leading-6 text-muted-copy">Times use Philippine Standard Time (PHT).</p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <Field id="distribution-date" label="Distribution date" type="date" min={todayInManila()} required value={form.distributionDate} onChange={(value) => change('distributionDate', value)} />
                <Field id="distribution-location" label="Venue or location" icon="location" placeholder="e.g. Barangay hall, covered court" required maxLength="200" value={form.location} onChange={(value) => change('location', value)} />
                <Field id="distribution-start" label="Start time" type="time" required value={form.startTime} onChange={(value) => change('startTime', value)} />
                <div><Field id="distribution-end" label="End time" type="time" required value={form.endTime} aria-invalid={Boolean(formError && eventMinutes <= 0)} aria-describedby={formError && eventMinutes <= 0 ? 'distribution-time-error' : undefined} onChange={(value) => change('endTime', value)} />{formError && eventMinutes <= 0 && <p id="distribution-time-error" className="mt-2 text-sm font-semibold text-brand-red">{formError}</p>}</div>
                <div className="sm:col-span-2"><label htmlFor="slot-duration" className="ga-label" data-required="true">Queue slot duration</label><div className="relative mt-2"><Icon name="clock" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-copy" /><input id="slot-duration" type="number" list="common-slot-durations" min="5" max="720" step="5" required value={form.slotDurationMinutes} aria-invalid={Boolean(formError && eventMinutes > 0 && eventMinutes % duration !== 0)} aria-describedby={formError && eventMinutes > 0 && eventMinutes % duration !== 0 ? 'slot-duration-error' : 'slot-duration-hint'} onChange={(event) => change('slotDurationMinutes', event.target.value)} className="ga-input pl-10 pr-24" /><span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted-copy">minutes</span></div><datalist id="common-slot-durations">{[15, 20, 30, 60, 120].map((value) => <option key={value} value={value} />)}</datalist><p id="slot-duration-hint" className="mt-2 text-xs leading-5 text-muted-copy">Must divide the service window evenly. Set the capacity of each slot after saving.</p>{formError && eventMinutes > 0 && eventMinutes % duration !== 0 && <p id="slot-duration-error" className="mt-2 text-sm font-semibold text-brand-red">{formError}</p>}</div>
              </div>
            </fieldset>}

            {(!packageOnly || form.deliveryMode === 'PHYSICAL_GOODS') && <fieldset className={`min-w-0 ${!packageOnly ? 'border-b border-line pb-7' : ''}`}>
              <legend className="flex items-center gap-2 text-base font-semibold text-ink"><Icon name="distributions" className="size-5 text-brand-blue" />{packageOnly ? 'Assistance package per beneficiary' : '3. Assistance delivery'}</legend>
              {!packageOnly && <><p className="mt-2 text-sm leading-6 text-muted-copy">Choose what staff will release after identity verification.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {deliveryModes.map(([value, label, description, icon]) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-blue ${form.deliveryMode === value ? 'border-brand-blue bg-info-soft' : 'border-line bg-white hover:border-blue-200'}`}><input type="radio" name="deliveryMode" value={value} aria-labelledby={`delivery-${value}-label`} aria-describedby={`delivery-${value}-help`} checked={form.deliveryMode === value} onChange={() => change('deliveryMode', value)} className="mt-1 size-4 shrink-0 accent-brand-blue" /><span className="min-w-0"><span id={`delivery-${value}-label`} className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name={icon} className="size-4 shrink-0 text-brand-blue" />{label}</span><span id={`delivery-${value}-help`} className="mt-2 block text-xs leading-5 text-muted-copy">{description}</span></span></label>)}
                </div>
              </>}
              {form.deliveryMode === 'PHYSICAL_GOODS' && <div className={!packageOnly ? 'mt-5 border-t border-line pt-5' : 'mt-2'}>
                {!packageOnly && <h3 className="text-sm font-semibold text-ink">Assistance package per beneficiary</h3>}
                <p className="mt-2 text-sm leading-6 text-muted-copy">Define one item or standard package. Describe its contents in the name or office release log.</p>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Field id="package-name" label="Package or item name" icon="distributions" placeholder="e.g. Family food pack" required maxLength="150" value={form.packageName} onChange={(value) => change('packageName', value)} /></div>
                  <Field id="package-unit" label="Unit (for example, pack or kit)" required maxLength="30" value={form.packageUnit} onChange={(value) => change('packageUnit', value)} />
                  <Field id="package-quantity" label="Quantity per beneficiary" type="number" min="1" max="10000" step="1" required value={form.packageQuantity} onChange={(value) => change('packageQuantity', value)} />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-copy">Use whole units. Barangay staff record the actual handover and signed log reference. The package is fixed once the event opens.</p>
              </div>}
            </fieldset>}

            {!packageOnly && <fieldset className="min-w-0">
              <legend className="flex items-center gap-2 text-base font-semibold text-ink"><Icon name="security" className="size-5 text-brand-blue" />4. Claim verification</legend>
              <p id="verification-method-help" className="mt-2 text-sm leading-6 text-muted-copy">Allow the methods staff can offer at this event. By default, each beneficiary completes one available method.</p>
              <div id="distribution-verification" role="group" aria-label="Allowed verification methods" aria-describedby="verification-method-help" aria-invalid={Boolean(formError && !verificationGuide)} className="mt-4">
                <p id="verification-method-label" className="ga-label" data-required="true">Allowed verification methods</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className={`flex items-start gap-3 rounded-lg border p-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-blue ${requiresSignature ? 'cursor-not-allowed border-line bg-slate-50 opacity-60' : needsQr ? 'cursor-pointer border-brand-blue bg-info-soft' : 'cursor-pointer border-line hover:border-blue-200'}`}>
                    <input id="allow-qr" type="checkbox" checked={needsQr} disabled={requiresSignature} aria-labelledby="allow-qr-label" aria-describedby="allow-qr-help" onChange={(event) => change('verificationRequirement', event.target.checked ? needsFace ? 'QR_OR_BIOMETRIC' : 'QR' : needsFace ? 'BIOMETRIC' : '')} className="mt-1 size-4 shrink-0 accent-brand-blue" />
                    <span><span id="allow-qr-label" className="flex items-center gap-2 text-sm font-semibold"><Icon name="qr" className="size-4 shrink-0 text-brand-blue" />QR code</span><span id="allow-qr-help" className="mt-2 block text-xs leading-5 text-copy">Scan a printed credential or one shown on a phone.</span></span>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-blue ${needsFace ? 'border-brand-blue bg-info-soft' : 'border-line hover:border-blue-200'}`}>
                    <input id="allow-face" type="checkbox" checked={needsFace} aria-labelledby="allow-face-label" aria-describedby="allow-face-help" onChange={(event) => change('verificationRequirement', event.target.checked ? needsQr ? 'QR_OR_BIOMETRIC' : 'BIOMETRIC' : needsQr ? 'QR' : '')} className="mt-1 size-4 shrink-0 accent-brand-blue" />
                    <span><span id="allow-face-label" className="flex items-center gap-2 text-sm font-semibold"><Icon name="biometrics" className="size-4 shrink-0 text-brand-blue" />Live face match</span><span id="allow-face-help" className="mt-2 block text-xs leading-5 text-copy">Use the staff camera. Requires consent and an enrolled face profile.</span></span>
                  </label>
                </div>
                {needsQr && needsFace && <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm leading-6"><input type="checkbox" checked={form.verificationRequirement === 'QR_AND_BIOMETRIC'} onChange={(event) => change('verificationRequirement', event.target.checked ? 'QR_AND_BIOMETRIC' : 'QR_OR_BIOMETRIC')} className="mt-1 size-4 shrink-0 accent-brand-blue" /><span><span className="font-semibold">Require both methods for every beneficiary</span><span className="block text-xs text-muted-copy">Leave unchecked to allow either QR or face match.</span></span></label>}
                {needsFace && !needsQr && <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm leading-6"><input type="checkbox" checked={requiresSignature} onChange={(event) => change('verificationRequirement', event.target.checked ? 'BIOMETRIC_AND_SIGNATURE' : 'BIOMETRIC')} className="mt-1 size-4 shrink-0 accent-brand-blue" /><span><span className="font-semibold">Require a signature after the face match</span><span className="block text-xs text-muted-copy">This applies to every claim. Turn it off before allowing QR as an alternative.</span></span></label>}
                <p role="status" className={`mt-3 text-sm font-semibold ${!form.verificationRequirement ? 'text-brand-red' : 'text-brand-blue'}`}>{verificationLabels[form.verificationRequirement] || 'Select at least one method.'}</p>
              </div>
              {verificationGuide && <section className="mt-4 rounded-lg border border-line bg-slate-50 p-4" aria-labelledby="verification-checks-heading" aria-live="polite">
                <h3 id="verification-checks-heading" className="text-sm font-semibold text-ink">At the claim desk</h3><p className="mt-1 text-sm leading-6 text-copy">{verificationGuide.scenario}</p>
                <ul aria-label="Verification steps" className="mt-3 divide-y divide-line border-y border-line">{verificationGuide.checks.map(([icon, text]) => <li key={icon} className="flex items-start gap-3 py-3 text-sm leading-6 text-ink"><Icon name={icon} className="mt-0.5 size-5 shrink-0 text-brand-blue" /><span>{text}</span></li>)}</ul>
                <p className="mt-3 text-xs leading-5 text-copy"><span className="font-semibold text-ink">Prepare before claim day: </span>{verificationGuide.preparation}</p>
                <p className="mt-2 text-xs leading-5 text-muted-copy">Verification confirms identity. Staff record the handover or simulated wallet credit separately.</p>
              </section>}
              <details className="mt-4 rounded-lg border border-line px-4">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-copy focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="helpCases" className="size-4 shrink-0 text-brand-blue" /><span className="flex-1">If a required check cannot be completed</span><Icon name="chevronDown" className="size-4 shrink-0" /></summary>
                <dl className="space-y-4 border-t border-line py-4 text-sm leading-6">
                  {form.verificationRequirement === 'QR_OR_BIOMETRIC' && <div><dt className="font-semibold text-ink">Use the other allowed method</dt><dd className="mt-1 text-copy">If the beneficiary has no QR credential, staff may complete the face match with valid consent and a cleared profile. If face matching is unavailable, use a valid QR credential. If neither method can be completed, pause the claim and refer it for assistance. A completed claim cannot be claimed again using the other method.</dd></div>}
                  {needsQr && <div><dt className="font-semibold text-ink">Lost or damaged QR credential</dt><dd className="mt-1 text-copy">Ask the System Administrator to check whether a replacement can be issued for the active schedule. A used credential or an ended service session cannot simply be replaced.</dd></div>}
                  {needsFace && <div><dt className="font-semibold text-ink">Face profile, camera, or matching issue</dt><dd className="mt-1 text-copy">Keep the claim unverified. Ask authorized staff to resolve the profile, consent, camera, or service issue before retrying the required face check.</dd></div>}
                  {form.verificationRequirement === 'BIOMETRIC_AND_SIGNATURE' && <div><dt className="font-semibold text-ink">Beneficiary cannot complete the signature</dt><dd className="mt-1 text-copy">Pause the claim and refer it to the responsible officer for the appropriate process before release. The signature remains a required check for this event.</dd></div>}
                </dl>
                <p className="border-t border-line py-3 text-xs leading-5 text-muted-copy">Choose the method while the event is a draft. Opening the event locks its verification requirement.</p>
              </details>
            </fieldset>}
          </div>

          {!packageOnly && <aside className="min-w-0 self-start rounded-lg border border-line bg-slate-50 p-4 lg:sticky lg:top-0" aria-label="Distribution draft overview">
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink"><Icon name="audit" className="size-5 text-brand-blue" />Draft summary</h3><p className="mt-2 text-xs leading-5 text-muted-copy">Review the event setup before saving.</p>
            <dl className="mt-5 divide-y divide-line text-sm">
              <div className="py-3 first:pt-0"><dt className="text-xs font-semibold text-muted-copy">Program</dt><dd className="mt-1 font-bold text-ink">{selectedProgram?.programName || 'Not selected'}</dd></div>
              <div className="py-3"><dt className="text-xs font-semibold text-muted-copy">Service area</dt><dd className="mt-1 font-bold text-ink">{selectedBarangay ? `${selectedBarangay.barangayName}, ${selectedBarangay.city}` : 'Not selected'}</dd></div>
              <div className="py-3"><dt className="text-xs font-semibold text-muted-copy">Schedule</dt><dd className="mt-1 font-bold text-ink">{form.distributionDate ? displayDate(form.distributionDate) : 'Not selected'}</dd><dd className="mt-1 text-copy">{form.startTime || '—'}–{form.endTime || '—'}</dd></div>
              <div className="py-3"><dt className="text-xs font-semibold text-muted-copy">Service windows</dt><dd aria-live="polite" className={`mt-1 text-base font-semibold tabular-nums ${windowCount ? 'text-ink' : 'text-brand-amber'}`}>{windowCount ? `${windowCount} planned · ${form.slotDurationMinutes} min each` : 'Check the service times'}</dd><dd className="mt-1 text-xs leading-5 text-muted-copy">Set or review slot capacity after saving.</dd></div>
              <div className="py-3 last:pb-0"><dt className="text-xs font-semibold text-muted-copy">Verification</dt><dd className="mt-1 font-bold text-ink">{verificationLabels[form.verificationRequirement] || 'Select at least one method'}</dd></div>
              <div className="py-3 last:pb-0"><dt className="text-xs font-semibold text-muted-copy">Delivery</dt><dd className="mt-1 font-bold text-ink">{deliveryModes.find(([value]) => value === form.deliveryMode)?.[1]}</dd>{form.deliveryMode === 'PHYSICAL_GOODS' && <dd className="mt-1 text-xs leading-5 text-copy [overflow-wrap:anywhere]">{form.packageName ? `${form.packageQuantity || '—'} ${form.packageUnit || 'units'} · ${form.packageName}` : 'Package details needed'}</dd>}</div>
            </dl>
            <p className="mt-4 border-t border-line pt-4 text-xs leading-5 text-copy">Saving does not notify beneficiaries or open field operations. Review capacity and schedules before opening.</p>
          </aside>}
          </>}
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-line bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="max-w-sm text-xs leading-5 text-muted-copy">Changes are audit logged. Saving does not open the event.</p><div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row"><button type="button" onClick={() => { if (reviewing) { setReviewing(false); requestAnimationFrame(() => dialogRef.current?.querySelector(packageOnly ? '#package-name' : '#distribution-title')?.focus()) } else dialogRef.current?.close() }} disabled={isSaving} className="ga-btn-secondary">{reviewing ? 'Change details' : 'Cancel'}</button><button type="submit" disabled={isSaving} className="ga-btn-primary">{isSaving ? <LoadingLabel>Saving...</LoadingLabel> : <>{reviewing ? distribution ? 'Save event changes' : 'Create draft event' : 'Review event details'}<Icon name={reviewing ? 'check' : 'arrowRight'} className="size-4" /></>}</button></div></footer>
      </form>
    </dialog>
  )
}

function Field({ id, label, icon, onChange, ...inputProps }) {
  return <div className="min-w-0"><label htmlFor={id} className="ga-label" data-required={inputProps.required || undefined}>{label}</label><div className="relative mt-2">{icon && <Icon name={icon} className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-copy" />}<input id={id} onChange={(event) => onChange(event.target.value)} className={`ga-input min-w-0 ${icon ? 'pl-10' : ''}`} {...inputProps} /></div></div>
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
  const [initialProgramId] = useState(() => new URLSearchParams(window.location.search).get('program') || '')
  const openLinkedDraft = useRef(new URLSearchParams(window.location.search).get('create') === '1')
  const [draft, setDraft] = useState(() => ({ status: statuses.includes(new URLSearchParams(window.location.search).get('status')) ? new URLSearchParams(window.location.search).get('status') : '', programId: initialProgramId, barangayId: '' }))
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('event') || '')
  const linkedEventRef = useRef(selectedId)
  const linkedStageRef = useRef(new URLSearchParams(window.location.search).get('stage') || '')
  const [showEvent, setShowEvent] = useState(Boolean(selectedId))
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
  const [capacitySlot, setCapacitySlot] = useState(null)
  const [activeStage, setActiveStage] = useState('sessions')
  const [actionFeedback, setActionFeedback] = useState(null)
  const authorized = session.user.role === 'SYSTEM_ADMIN'
  const detailMotionRef = useMotionEntry(`${selectedId}:${activeStage}:${reload}`)

  useEffect(() => {
    if (!selectedId) return
    const url = new URL(window.location.href)
    url.searchParams.set('event', selectedId)
    window.history.replaceState(window.history.state, '', url)
  }, [selectedId])

  const reportError = useCallback((requestError) => {
    if (isSessionExpiredError(requestError)) return onSessionExpired()
    toast.error(getAuthErrorMessage(requestError))
  }, [onSessionExpired])

  useEffect(() => {
    if (!authorized) return undefined
    let active = true
    Promise.all([requestPrograms(session.accessToken, { page: 1, pageSize: 100, status: 'ACTIVE' }), requestBarangays(session.accessToken)])
      .then(async ([programData, barangays]) => {
        let programs = programData.programs
        if (initialProgramId && !programs.some((program) => program.programId === initialProgramId)) {
          try {
            const linkedProgram = await requestProgram(session.accessToken, initialProgramId)
            if (linkedProgram.status === 'ACTIVE') programs = [linkedProgram, ...programs]
          } catch (requestError) { if (active) reportError(requestError) }
        }
        if (!active) return
        setCatalogs({ programs, barangays })
        if (openLinkedDraft.current) {
          openLinkedDraft.current = false
          if (barangays.length && programs.length && (!initialProgramId || programs.some((program) => program.programId === initialProgramId))) setEventForm({ distribution: null, programId: initialProgramId })
          else toast.error('Choose an active program and barangay before creating a distribution.')
          const url = new URL(window.location.href)
          url.searchParams.delete('create')
          window.history.replaceState(window.history.state, '', url)
        }
      })
      .catch((requestError) => { if (active) reportError(requestError) })
    return () => { active = false }
  }, [authorized, initialProgramId, reportError, session.accessToken])

  useEffect(() => {
    if (!authorized) return undefined
    let active = true
    requestDistributionList(session.accessToken, { page, pageSize: 20, ...filters })
      .then((result) => { if (active) { const linked = linkedEventRef.current; linkedEventRef.current = ''; setData(result); setError(''); if (!result.distributions.length && !linked) { setSelected(null); setDetail(emptyDetail); setIsLoadingDetail(false) } setSelectedId((current) => linked || (result.distributions.some((item) => item.distributionId === current) ? current : result.distributions[0]?.distributionId || '')) } })
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
        distribution.status === 'OPEN' && ['QR', 'QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC'].includes(distribution.verificationRequirement) ? requestQrEligibleSchedules(session.accessToken, selectedId) : Promise.resolve(emptyDetail.qrEligible),
      ])
      if (active) {
        const activeAllocationCount = ['ALLOCATED', 'CLAIMED'].reduce((total, status) => total + (allocations.summary.countsByStatus?.[status] ?? 0), 0)
        const scheduledCount = ['SCHEDULED', 'CHECKED_IN', 'MISSED'].reduce((total, status) => total + (schedules.summary.countsByStatus?.[status] ?? 0), 0)
        setSelected(distribution)
        setDetail({ slots, allocations, schedules, qrTokens, eligible, qrEligible })
        const setup = distributionSetupState({ deliveryMode: distribution.deliveryMode, packageQuantity: distribution.packageQuantity, status: distribution.status, slotCount: slots.summary.matchingSlotCount ?? 0, capacity: slots.summary.matchingCapacity ?? 0, activeAllocations: activeAllocationCount, scheduled: scheduledCount, cancelledSchedules: schedules.summary.countsByStatus?.CANCELLED ?? 0, schedulableAllocations: schedules.summary.schedulableAllocationCount })
        setActiveStage(setup.stages.some((stage) => stage.key === linkedStageRef.current && stage.available) ? linkedStageRef.current : setup.recommendedStage)
        linkedStageRef.current = ''
      }
    }).catch((requestError) => { if (active) { reportError(requestError); setActionFeedback({ tone: 'error', message: getAuthErrorMessage(requestError) }); setSelected(current => current?.distributionId === selectedId ? current : null) } }).finally(() => { if (active) setIsLoadingDetail(false) })
    return () => { active = false }
  }, [authorized, reload, reportError, selectedId, session.accessToken])

  function selectEvent(distributionId) {
    setShowEvent(true)
    if (distributionId === selectedId && selected) return
    setActionFeedback(null)
    setIsLoadingDetail(true)
    setSelectedEnrollmentIds([])
    setSelected(null)
    setDetail(emptyDetail)
    setSelectedId(distributionId)
    if (distributionId === selectedId) setReload(value => value + 1)
    if (window.matchMedia('(max-width: 1279px)').matches) {
      requestAnimationFrame(() => {
        const scrollTarget = document.getElementById('event-return') ?? detailMotionRef.current
        detailMotionRef.current?.focus({ preventScroll: true })
        scrollTarget?.scrollIntoView({ block: 'start', behavior: 'instant' })
      })
    }
  }

  function applyFilters(event) { event.preventDefault(); setPage(1); setIsLoading(true); setFilters(draft) }
  async function saveEvent(payload) {
    try {
      const saved = eventForm?.distribution ? await updateDistribution(session.accessToken, eventForm.distribution.distributionId, payload) : await createDistribution(session.accessToken, payload)
      const message = eventForm?.distribution ? 'Distribution event updated.' : 'Draft distribution event created.'
      toast.success(message)
      setActionFeedback({ tone: 'success', message })
      setShowEvent(true); setEventForm(null); setSelectedId(saved.distributionId); setReload((value) => value + 1)
    } catch (requestError) { reportError(requestError); throw requestError }
  }
  async function runAction(name, operation, successMessage) {
    setActionBusy(name)
    setActionFeedback(null)
    try { const result = await operation(); toast.success(successMessage); setActionFeedback({ tone: 'success', message: successMessage }); setIsLoadingDetail(true); setReload((value) => value + 1); return result } catch (requestError) { const message = getAuthErrorMessage(requestError); setActionFeedback({ tone: 'error', message }); reportError(requestError); throw requestError } finally { setActionBusy('') }
  }
  async function createSlots(sessions) {
    return runAction('slots', () => generateDistributionSlots(session.accessToken, selectedId, sessions), 'Service sessions and time slots generated.')
  }
  async function saveCapacity(slotId, capacity) {
    await runAction('capacity', () => updateDistributionSlotCapacity(session.accessToken, selectedId, slotId, capacity), 'Time-slot capacity updated. Existing appointments are unchanged.')
    setCapacitySlot(null)
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
    const result = await runAction('qr', () => generateDistributionQrTokens(session.accessToken, selectedId), 'QR cards generated. Save or print them now.')
    setRawTokens({ distribution: selected, tokens: result.qrTokens })
  }
  async function replaceQr(item) {
    const result = await runAction('replace-qr', () => reissueDistributionQrToken(session.accessToken, selectedId, item.qrTokenId), 'Replacement QR created. Save the new card now.')
    setRawTokens({ distribution: selected, tokens: [result] })
  }
  function eventClosed(distribution) {
    linkedEventRef.current = distribution.distributionId
    setSelected(distribution)
    if (filters.status) {
      setFilters((current) => ({ ...current, status: 'CLOSED' }))
      setDraft((current) => ({ ...current, status: 'CLOSED' }))
    }
    setReload((value) => value + 1)
    toast.success('Distribution event closed. Records are preserved.')
  }
  async function confirmAction() {
    const action = confirmation
    const nextStatus = action.kind === 'open' ? 'OPEN' : 'CANCELLED'
    await runAction(action.kind, async () => {
      const result = action.kind === 'open' ? await openDistribution(session.accessToken, selectedId) : await cancelDistribution(session.accessToken, selectedId)
      linkedEventRef.current = selectedId
      if (filters.status) {
        setFilters((current) => ({ ...current, status: nextStatus }))
        setDraft((current) => ({ ...current, status: nextStatus }))
      }
      return result
    }, action.kind === 'open' ? 'Distribution event opened for operations.' : 'Distribution event cancelled.')
    setConfirmation(null)
  }

  const rows = data?.distributions ?? []
  const slotCount = detail.slots.summary.matchingSlotCount ?? 0
  const activeAllocations = ['ALLOCATED', 'CLAIMED'].reduce((total, status) => total + (detail.allocations.summary.countsByStatus?.[status] ?? 0), 0)
  const scheduled = ['SCHEDULED', 'CHECKED_IN', 'MISSED'].reduce((total, status) => total + (detail.schedules.summary.countsByStatus?.[status] ?? 0), 0)
  const capacity = detail.slots.summary.matchingCapacity ?? 0
  const workflow = distributionSetupState({ deliveryMode: selected?.deliveryMode, packageQuantity: selected?.packageQuantity, status: selected?.status, slotCount, capacity, activeAllocations, scheduled, cancelledSchedules: detail.schedules.summary.countsByStatus?.CANCELLED ?? 0, schedulableAllocations: detail.schedules.summary.schedulableAllocationCount })
  const readyToOpen = workflow.readyToOpen
  const remainingCapacity = workflow.remainingCapacity
  const canEditEvent = selected?.status === 'DRAFT' && slotCount === 0 && activeAllocations === 0
  const eligibleRows = detail.eligible.enrollments
  const filtersActive = Object.values(filters).some(Boolean)

  return (
    <DashboardShell breadcrumbs={['Operations', 'Distribution events']} currentPath="/distributions/manage" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Distribution events" showAssistant={!showEvent} user={session.user}>
      <header className={`ga-page-header gap-5 border-b border-line pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end ${showEvent ? 'hidden xl:grid' : 'grid'}`}>
        <div><p className="ga-eyebrow">Administrator operations</p><h1 className="ga-page-title">Distribution events</h1><p className="ga-page-copy max-w-3xl">Prepare an event, assign approved beneficiaries, and schedule their visits before field operations begin.</p></div>
        {authorized && <div className="flex flex-wrap items-center gap-2"><a href="/programs" onClick={(event) => { event.preventDefault(); onNavigate('/programs') }} className="ga-btn-secondary">Manage programs</a><button type="button" disabled={!catalogs.programs.length || !catalogs.barangays.length} onClick={() => setEventForm({ distribution: null, programId: catalogs.programs.some((program) => program.programId === filters.programId) ? filters.programId : '' })} className="ga-btn-primary shrink-0"><Icon name="plus" />Create distribution</button></div>}
      </header>

      {!authorized ? <section className="ga-card mt-6 p-8 text-center" role="alert"><span className="mx-auto grid size-12 place-items-center rounded-xl bg-danger-soft text-brand-red"><Icon name="lock" /></span><h2 className="ga-section-heading mt-4">Administrator access required</h2><p className="mt-2 text-muted-copy">Only System Administrators can configure distribution events.</p></section> : <>
        <p className={`mt-3 text-sm text-copy ${showEvent ? 'hidden xl:block' : ''}`}>Opening an event locks its sessions, beneficiary assignments, and queue. Review the setup before opening.</p>

        {!isLoading && (!catalogs.programs.length || !catalogs.barangays.length) && <section className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy" role="status"><Icon name="info" className="mt-0.5 size-5 shrink-0 text-brand-amber" /><p><strong className="text-brand-amber">Creation unavailable:</strong> {!catalogs.programs.length && !catalogs.barangays.length ? 'activate an assistance program and add an active barangay first' : !catalogs.programs.length ? 'activate at least one assistance program first' : 'add at least one active barangay first'}.</p></section>}

        <section className={`ga-card mt-5 p-4 sm:p-5 ${showEvent ? 'hidden xl:block' : ''}`} aria-labelledby="distribution-filter-title">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="distribution-filter-title" className="text-sm font-extrabold text-ink">Find an event</h2><p className="mt-1 text-xs text-muted-copy">Filter by event status, assistance program, or barangay.</p></div>{filtersActive && <button type="button" onClick={() => { const empty = { status: '', programId: '', barangayId: '' }; setDraft(empty); setFilters(empty); setPage(1); setIsLoading(true) }} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft"><Icon name="reset" className="mr-1 inline size-4" />Clear filters</button>}</div>
          <form onSubmit={applyFilters} className="mt-4 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)_auto]" aria-label="Distribution filters">
            <div><label htmlFor="distribution-status" className="ga-label">Event status</label><select id="distribution-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input mt-2">{statuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div>
            <div><label htmlFor="distribution-program-filter" className="ga-label">Assistance program</label><select id="distribution-program-filter" value={draft.programId} onChange={(event) => setDraft((current) => ({ ...current, programId: event.target.value }))} className="ga-input mt-2"><option value="">All programs</option>{catalogs.programs.map((program) => <option key={program.programId} value={program.programId}>{program.programName}</option>)}</select></div>
            <div><label htmlFor="distribution-barangay-filter" className="ga-label">Service Barangay</label><select id="distribution-barangay-filter" value={draft.barangayId} onChange={(event) => setDraft((current) => ({ ...current, barangayId: event.target.value }))} className="ga-input mt-2"><option value="">All Barangays</option>{catalogs.barangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}</option>)}</select></div>
            <button className="ga-btn-primary">Apply filters</button>
          </form>
        </section>

        {isLoading ? <LoadingState /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="font-extrabold">Distribution events could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></section> : <div className="mt-6 grid items-start gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className={`ga-card overflow-hidden xl:sticky xl:top-24 ${showEvent ? 'hidden xl:block' : ''}`} aria-labelledby="event-register-title">
            <div className="flex items-center justify-between border-b border-line px-4 py-4"><div><h2 id="event-register-title" className="scroll-mt-36 font-extrabold text-ink">Event register</h2><p className="mt-1 text-xs text-muted-copy">{data.pagination.total} matching {data.pagination.total === 1 ? 'record' : 'records'}</p></div><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold tabular-nums text-copy">{data.pagination.page}/{Math.max(data.pagination.totalPages, 1)}</span></div>
            {rows.length === 0 ? <div className="p-8 text-center"><span className="mx-auto grid size-11 place-items-center rounded-xl bg-info-soft text-brand-blue"><Icon name="distributions" /></span><h3 className="mt-4 font-extrabold">No events found</h3><p className="mt-2 text-sm leading-6 text-muted-copy">Clear the filters or create the first draft event.</p></div> : <div className="divide-y divide-line">{rows.map((distribution) => {
              const isSelected = selectedId === distribution.distributionId
              return <button key={distribution.distributionId} type="button" onClick={() => selectEvent(distribution.distributionId)} aria-pressed={isSelected} className={`relative block min-h-24 w-full px-4 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-blue ${isSelected ? 'bg-info-soft' : 'bg-white hover:bg-slate-50'}`}>{isSelected && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r bg-brand-blue" />}<div className="flex items-start justify-between gap-3"><p className="line-clamp-2 font-extrabold text-ink">{distribution.title}</p><StatusBadge value={distribution.status} /></div><p className="mt-2 truncate text-xs font-bold text-brand-blue">{distribution.program.programCode} · {distribution.barangay.barangayName}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-copy"><Icon name="calendar" className="size-3.5" />{displayDate(distribution.distributionDate)} · {distribution.startTime}–{distribution.endTime}</p></button>
            })}</div>}
            {data.pagination.totalPages > 1 && <div className="grid grid-cols-2 gap-2 border-t border-line p-3"><button type="button" disabled={page === 1} onClick={() => { setIsLoading(true); setPage((value) => value - 1) }} className="ga-btn-secondary min-h-11 px-3 text-sm"><Icon name="chevronLeft" />Previous</button><button type="button" disabled={page === data.pagination.totalPages} onClick={() => { setIsLoading(true); setPage((value) => value + 1) }} className="ga-btn-secondary min-h-11 px-3 text-sm">Next<Icon name="chevronRight" /></button></div>}
          </aside>

          {showEvent && <a id="event-return" href="#event-register-title" onClick={() => setShowEvent(false)} className="-mb-3 inline-flex min-h-11 scroll-mt-36 items-center gap-2 self-start rounded-lg px-2 text-sm font-bold text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue xl:hidden"><Icon name="arrowLeft" className="size-4" />Back to event register</a>}
          <section ref={detailMotionRef} tabIndex={-1} className={`min-w-0 scroll-mt-36 space-y-5 focus:outline-2 focus:outline-offset-2 focus:outline-brand-blue ${showEvent ? '' : 'hidden xl:block'}`} aria-label="Selected distribution event" aria-live="polite">{isLoadingDetail ? <div className="ga-card p-6"><Skeleton className="h-8 w-3/4" /><div className="mt-5 grid grid-cols-3 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="mt-5 h-56 w-full" /></div> : !selected ? <div className="ga-card p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-xl bg-info-soft text-brand-blue"><Icon name="distributions" /></span><h2 className="ga-section-heading mt-4">Select a distribution event</h2><p className="mt-2 text-sm text-muted-copy">Choose a record to see readiness, operational totals, and the next step.</p></div> : <>
            <article className="ga-card overflow-hidden">
              <header className="bg-brand-navy px-5 py-5 text-white sm:px-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-200">{selected.program.programCode} · {selected.barangay.barangayName}</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight">{selected.title}</h2><p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-blue-100"><span className="inline-flex items-center gap-1.5"><Icon name="calendar" className="size-4" />{displayDate(selected.distributionDate)}, {selected.startTime}–{selected.endTime}</span><span className="inline-flex items-center gap-1.5"><Icon name="location" className="size-4" />{selected.location}</span><span className="inline-flex items-center gap-1.5"><Icon name="receipt" className="size-4" />{humanize(selected.deliveryMode)}</span></p></div><div className="flex shrink-0 flex-wrap items-center gap-2"><StatusBadge value={selected.status} />{canEditEvent && <button type="button" onClick={() => setEventForm({ distribution: selected })} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 text-sm font-bold text-white hover:bg-white/20"><Icon name="pen" className="size-4" />Edit details</button>}</div></div></header>
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="leading-6 text-copy"><strong className="text-ink">Next step: </strong>{workflow.nextAction}</p>{selected.status === 'DRAFT' && <button type="button" onClick={() => { setActiveStage(workflow.recommendedStage); requestAnimationFrame(() => document.getElementById('distribution-stage-panel')?.focus()) }} className="ga-admin-link shrink-0">Continue setup</button>}</div>

                <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-line py-4 text-sm">
                  <div><dt className="text-muted-copy">Capacity</dt><dd className="mt-1 font-semibold tabular-nums">{capacity} places</dd></div>
                  <div><dt className="text-muted-copy">Allocated</dt><dd className="mt-1 font-semibold tabular-nums">{activeAllocations} {activeAllocations === 1 ? 'person' : 'people'}</dd></div>
                  <div><dt className="text-muted-copy">Scheduled</dt><dd className="mt-1 font-semibold tabular-nums">{scheduled} of {activeAllocations}</dd></div>
                </dl>

                <div className="mt-4"><WorkflowProgress activeStage={activeStage} workflow={workflow} onStageChange={(stage) => { setActionFeedback(null); setActiveStage(stage); requestAnimationFrame(() => document.getElementById('distribution-stage-panel')?.focus()) }} /></div>
                <details className="mt-4 border-t border-line pt-1"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue">Related records</summary><nav aria-label="Related event records" className="mt-4 flex flex-wrap gap-2">
                  {(selected.status === 'DRAFT' ? [
                    ['Manage programs', '/programs'],
                    ['Beneficiary records', '/beneficiaries'],
                    ['Enrollment review', `/enrollments?programId=${encodeURIComponent(selected.programId || selected.program.programId)}`],
                  ] : [
                    ['Claims and receipts', `/claim-accountability?distribution=${encodeURIComponent(selectedId)}`],
                    ['SMS delivery', `/notifications?distribution=${encodeURIComponent(selectedId)}`],
                    ['Simulated ledger', `/dswd/ledger?distribution=${encodeURIComponent(selectedId)}`],
                    ['Event report', `/reports?distribution=${encodeURIComponent(selectedId)}`],
                  ]).map(([label, href]) => <a key={href} href={href} onClick={(event) => { event.preventDefault(); onNavigate(href) }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-bold text-brand-blue transition-colors hover:border-blue-200 hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">{label}<Icon name="arrowRight" className="size-4" /></a>)}
                </nav></details>
              </div>
            </article>

            {actionFeedback && <div role={actionFeedback.tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border p-4 text-sm font-semibold leading-6 ${actionFeedback.tone === 'error' ? 'border-red-200 bg-danger-soft text-brand-red' : 'border-emerald-200 bg-success-soft text-brand-green'}`}><Icon name={actionFeedback.tone === 'error' ? 'info' : 'check'} className="mt-0.5 size-5 shrink-0" /><p>{actionFeedback.message}</p></div>}

            <section id="distribution-stage-panel" tabIndex={-1} className="ga-card min-w-0 overflow-hidden outline-none" aria-label={`${humanize(activeStage)} setup stage`}>
              {activeStage === 'sessions' && <><StageHeader label="Step 1 of 4" icon="calendar" title="Plan service sessions" description="Set the date, venue and capacity for each session. Choose a shared barangay queue or sessions for specific Sitios / Puroks." /><div className="p-5 sm:p-6">{slotCount === 0 && selected.status === 'DRAFT' ? <DistributionSessionPlanner key={selected.distributionId} busy={actionBusy === 'slots'} distribution={selected} onGenerate={createSlots} serviceAreaSummary={detail.eligible.summary} /> : slotCount > 0 ? <><DistributionSessionSummary slots={detail.slots.slots} summary={detail.slots.summary} onEditCapacity={selected.status === 'DRAFT' ? setCapacitySlot : undefined} /><p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-muted-copy"><Icon name="lock" className="mt-0.5 size-4 shrink-0" />{selected.status === 'DRAFT' ? 'Capacity can be edited while this event is a draft. Dates, venues, and service areas stay with the original session plan.' : 'The event sessions and capacity are locked. Use these records to review what was scheduled.'}</p></> : <p className="text-sm text-muted-copy">No service-session record is available for this event.</p>}</div></>}

              {activeStage === 'beneficiaries' && <><StageHeader label="Step 2 of 4" icon="beneficiaries" title="Allocate approved beneficiaries" description="Select only approved program enrollments covered by this event’s Barangay and available service sessions." />{!slotCount ? <LockedStage>Complete the service-session plan before allocating beneficiaries.</LockedStage> : selected.status !== 'DRAFT' ? <div className="p-5 sm:p-6"><div className="rounded-xl border border-line bg-slate-50 p-5"><p className="text-3xl font-black tabular-nums text-ink">{activeAllocations}</p><p className="mt-1 text-sm font-bold text-copy">assigned beneficiaries, including completed claims</p><p className="mt-2 text-xs leading-5 text-muted-copy">Allocations are frozen because this event is {selected.status.toLowerCase()}.</p></div></div> : eligibleRows.length === 0 ? <div className="p-7 text-center"><span className="mx-auto grid size-11 place-items-center rounded-xl bg-success-soft text-brand-green"><Icon name="check" /></span><p className="mt-4 font-extrabold text-ink">No approved enrollments waiting</p><p className="mt-1 text-sm leading-6 text-muted-copy">Check the enrollment list for this program and barangay. Beneficiaries must be approved before assignment to this event.</p></div> : <><div className="flex flex-col gap-2 border-y border-line bg-slate-50 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><p><strong className="text-ink">{remainingCapacity}</strong> of {capacity} queue places remain</p><p className="font-semibold text-copy">{activeAllocations} already allocated · {detail.eligible.allocationAmount ? `${moneyFormatter.format(Number(detail.eligible.allocationAmount))} each` : 'Grant amount unavailable'}</p></div><div className="max-h-[26rem] overflow-y-auto"><div className="divide-y divide-line sm:hidden">{eligibleRows.map((enrollment) => <label key={enrollment.enrollmentId} className="flex min-h-16 items-center gap-3 px-4 py-3"><input type="checkbox" aria-label={`Select ${fullName(enrollment.beneficiary)}`} disabled={!selectedEnrollmentIds.includes(enrollment.enrollmentId) && selectedEnrollmentIds.length >= remainingCapacity} checked={selectedEnrollmentIds.includes(enrollment.enrollmentId)} onChange={(event) => setSelectedEnrollmentIds((current) => event.target.checked ? [...current, enrollment.enrollmentId] : current.filter((id) => id !== enrollment.enrollmentId))} className="size-5 shrink-0 accent-brand-blue" /><span className="min-w-0"><span className="block truncate text-sm font-bold text-ink">{fullName(enrollment.beneficiary)}</span><span className="mt-1 block text-xs text-muted-copy">{enrollment.beneficiary.sitioPurok ?? 'Sitio/Purok not recorded'}</span></span></label>)}</div><table className="hidden w-full text-left text-sm sm:table"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><tr><th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Select available approved enrollments" disabled={remainingCapacity === 0} checked={selectedEnrollmentIds.length > 0 && selectedEnrollmentIds.length === Math.min(eligibleRows.length, remainingCapacity)} onChange={(event) => setSelectedEnrollmentIds(event.target.checked ? eligibleRows.slice(0, remainingCapacity).map((row) => row.enrollmentId) : [])} className="size-4 accent-brand-blue" /></th><th className="px-4 py-3">Beneficiary</th><th className="px-4 py-3">Sitio / Purok</th></tr></thead><tbody className="divide-y divide-line">{eligibleRows.map((enrollment) => <tr key={enrollment.enrollmentId} className="hover:bg-slate-50"><td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${fullName(enrollment.beneficiary)}`} disabled={!selectedEnrollmentIds.includes(enrollment.enrollmentId) && selectedEnrollmentIds.length >= remainingCapacity} checked={selectedEnrollmentIds.includes(enrollment.enrollmentId)} onChange={(event) => setSelectedEnrollmentIds((current) => event.target.checked ? [...current, enrollment.enrollmentId] : current.filter((id) => id !== enrollment.enrollmentId))} className="size-4 accent-brand-blue" /></td><td className="px-4 py-3 font-bold text-ink">{fullName(enrollment.beneficiary)}</td><td className="px-4 py-3 text-muted-copy">{enrollment.beneficiary.sitioPurok ?? 'Not recorded'}</td></tr>)}</tbody></table></div><div className="flex flex-col gap-3 border-t border-line p-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-copy"><strong className="text-ink">{selectedEnrollmentIds.length}</strong> selected for allocation</p><button type="button" disabled={!selectedEnrollmentIds.length || actionBusy === 'allocations'} onClick={allocate} className="ga-btn-primary">{actionBusy === 'allocations' ? <LoadingLabel>Allocating...</LoadingLabel> : `Allocate ${selectedEnrollmentIds.length || ''} ${selectedEnrollmentIds.length === 1 ? 'beneficiary' : 'beneficiaries'}`}</button></div></>}</>}

              {activeStage === 'queue' && <>
                <StageHeader label="Step 3 of 4" icon="queue" title="Build the queue schedule" description="Place each allocated beneficiary into the earliest available slot that covers their service area, then review the resulting queue before opening the event." />
                {!activeAllocations ? <LockedStage>Allocate at least one approved beneficiary before generating the queue.</LockedStage> : <div className="space-y-5 p-5 sm:p-6">
                  <div className="rounded-xl border border-line bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="text-sm font-extrabold text-ink">{scheduled} of {activeAllocations} allocations scheduled</p><p className="mt-1 text-xs text-muted-copy">{workflow.newScheduleCount ? `${workflow.newScheduleCount} still need a new queue assignment.` : workflow.cancelledScheduleCount ? 'The remaining allocations have cancelled schedules. Review them before returning them to the queue.' : 'Every active allocation has a queue assignment.'}</p></div>
                      {selected.status === 'DRAFT' && workflow.newScheduleCount > 0 && <button type="button" onClick={generateSchedules} disabled={actionBusy === 'schedules'} className="ga-btn-primary shrink-0">{actionBusy === 'schedules' ? <LoadingLabel>Scheduling...</LoadingLabel> : `Schedule ${workflow.newScheduleCount} remaining`}</button>}
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Queue schedule coverage" aria-valuemin="0" aria-valuemax={activeAllocations} aria-valuenow={scheduled}><div className="h-full rounded-full bg-brand-green transition-[width] motion-reduce:transition-none" style={{ width: `${activeAllocations ? Math.min(100, scheduled / activeAllocations * 100) : 0}%` }} /></div>
                  </div>
                  {selected.status === 'DRAFT' && workflow.cancelledScheduleCount > 0 && <div className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-warning-soft p-4 sm:flex-row sm:items-center"><div className="flex flex-1 items-start gap-3"><Icon name="info" className="mt-0.5 size-5 shrink-0 text-brand-amber" /><div><p className="text-sm font-bold text-ink">{workflow.cancelledScheduleCount} cancelled schedule{workflow.cancelledScheduleCount === 1 ? '' : 's'} to review</p><p className="mt-1 text-sm leading-6 text-copy">To bring a beneficiary back, open their cancelled record and choose <strong>Reactivate</strong>. This keeps the existing appointment and checks its slot capacity. Generating schedules does not undo a cancellation.</p></div></div><button type="button" onClick={() => onNavigate(`/admin/schedules?distribution=${encodeURIComponent(selectedId)}&status=CANCELLED`)} className="ga-btn-secondary shrink-0">Review cancelled schedules<Icon name="arrowRight" className="size-4" /></button></div>}
                  <QueuePreview schedules={detail.schedules.schedules} />
                  <div className="flex flex-wrap gap-3"><button type="button" onClick={() => onNavigate(`/admin/schedules?distribution=${encodeURIComponent(selectedId)}`)} className="ga-btn-secondary">{selected.status === 'DRAFT' ? 'Review and adjust schedules' : 'View beneficiary queue'}</button><button type="button" onClick={() => onNavigate(`/notifications?distribution=${encodeURIComponent(selectedId)}`)} className="ga-btn-secondary">Schedule notifications</button></div>
                </div>}
              </>}

              {activeStage === 'launch' && <><StageHeader label={selected.status === 'DRAFT' ? 'Step 4 of 4' : 'Selected event'} icon={selected.status === 'OPEN' ? 'check' : 'security'} title={selected.status === 'DRAFT' ? 'Review and open the event' : selected.status === 'OPEN' ? 'Distribution operations' : 'Preserved event record'} description={selected.status === 'DRAFT' ? 'Check the session plan, beneficiary list, and schedule before opening the event.' : selected.status === 'OPEN' ? 'Review work remaining, follow up on affected records, and prepare the event report.' : 'The event is read-only and remains available for reporting and audit review.'} />
                {selected.status === 'DRAFT' && <div className="p-5 sm:p-6"><ul className="divide-y divide-line rounded-xl border border-line">{[
                  ['Service sessions', 'sessions', slotCount > 0, slotCount > 0 ? `${detail.slots.summary.sessionCount} sessions and ${slotCount} queue slots` : 'Generate at least one service session'],
                  ['Capacity', 'sessions', workflow.capacityComplete, `${capacity} places for ${activeAllocations} allocated beneficiaries`],
                  ['Beneficiary allocation', 'beneficiaries', activeAllocations > 0, activeAllocations > 0 ? `${activeAllocations} approved beneficiaries allocated` : 'Allocate at least one approved beneficiary'],
                  ['Queue coverage', 'queue', scheduled >= activeAllocations && activeAllocations > 0, activeAllocations > 0 ? `${scheduled} of ${activeAllocations} allocations scheduled` : 'Waiting for beneficiary allocations'],
                ].map(([label, stage, complete, description]) => <li key={label} className="flex flex-wrap items-center gap-3 p-4"><span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full ${complete ? 'bg-success-soft text-brand-green' : 'bg-warning-soft text-brand-amber'}`}><Icon name={complete ? 'check' : 'clock'} className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink">{label}<span className="ml-2 text-xs font-normal text-muted-copy">{complete ? 'Complete' : 'Needs attention'}</span></p><p className="mt-1 text-sm leading-5 text-copy">{description}</p></div><button type="button" disabled={!workflow.stages.find((item) => item.key === stage).available} onClick={() => { setActiveStage(stage); requestAnimationFrame(() => document.getElementById('distribution-stage-panel')?.focus()) }} aria-label={`Review ${label.toLowerCase()}`} className="ga-admin-link">Review</button></li>)}</ul>{selected.deliveryMode === 'PHYSICAL_GOODS' && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-line py-4"><div><p className="text-sm font-bold text-ink">Assistance package</p><p className="mt-1 text-sm text-copy">{workflow.packageComplete ? `${selected.packageName}: ${selected.packageQuantity} ${selected.packageUnit} per beneficiary` : 'Define the package, unit and quantity before opening.'}</p></div><button type="button" onClick={() => setEventForm({ distribution: selected, packageOnly: true })} className="ga-admin-link">Edit assistance package</button></div>}<div id="opening-readiness" className={`mt-5 rounded-xl border p-4 ${readyToOpen ? 'border-emerald-200 bg-success-soft' : 'border-amber-200 bg-warning-soft'}`}><p className={`font-extrabold ${readyToOpen ? 'text-brand-green' : 'text-brand-amber'}`}>{readyToOpen ? 'Ready to open' : 'Complete the remaining setup steps'}</p><p className="mt-1 text-sm leading-6 text-copy">{readyToOpen ? 'Opening lets field staff begin. Package details, sessions, beneficiary assignments, and schedules will be locked.' : workflow.packageComplete ? 'Use Review beside an incomplete item to return to that stage.' : 'Use Edit assistance package to complete the package definition.'}</p></div><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button type="button" aria-describedby="opening-readiness" disabled={!readyToOpen || Boolean(actionBusy)} onClick={() => setConfirmation({ kind: 'open', title: 'Open this distribution event?', description: 'Package details, allocations, slots, and schedules will be frozen so field operations can begin.', actionLabel: 'Open event' })} className="ga-btn-primary">Open distribution event</button><button type="button" disabled={Boolean(actionBusy)} onClick={() => setConfirmation({ kind: 'cancel', title: 'Cancel this distribution event?', description: 'This permanently cancels its slots, allocations, and schedules. Use only when the event will not proceed.', actionLabel: 'Cancel event', destructive: true })} className="ga-btn-danger">Cancel event</button></div></div>}
                {selected.status === 'OPEN' && <div className="space-y-5 p-5 sm:p-6">
                  {['QR', 'QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC'].includes(selected.verificationRequirement) ? <QrCredentialIssuance key={selectedId} accessToken={session.accessToken} busy={actionBusy} data={detail.qrTokens} distribution={selected} onGenerate={generateQr} onReplace={replaceQr} onSessionExpired={onSessionExpired} readyCount={detail.qrEligible.summary.qrEligibleScheduleCount} /> : <div className="rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">{verificationLabels[selected.verificationRequirement] ?? humanize(selected.verificationRequirement)}:</strong> {selected.verificationRequirement === 'BIOMETRIC_AND_SIGNATURE' ? 'Facilitators complete a live face match, then collect the beneficiary signature in the biometric workspace.' : 'QR token issuance is not required for this event.'}</div>}
                  <section aria-label="Next actions for this event" className="border-y border-line py-4"><h4 className="font-bold text-ink">{['QR', 'QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC'].includes(selected.verificationRequirement) ? 'Use the beneficiary QR card' : 'Verification and notices'}</h4><p className="mt-2 text-sm leading-6 text-copy">{['QR', 'QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC'].includes(selected.verificationRequirement) ? 'Admin: paste the full backup token from the saved card or CSV in Verify QR claims. Barangay staff can scan the printed card using the device camera or a USB QR scanner. ' : ''}{selected.deliveryMode === 'PHYSICAL_GOODS' ? 'After all required identity checks, the Barangay Facilitator records the handover and release evidence.' : 'After all required identity checks, DSWD records the simulated wallet credit.'}</p><div className="mt-4 flex flex-wrap gap-3">{['QR', 'QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC'].includes(selected.verificationRequirement) && <button type="button" onClick={() => onNavigate(`/admin/verify-claims?distribution=${encodeURIComponent(selectedId)}`)} className="ga-btn-primary">Verify QR claims</button>}<button type="button" onClick={() => onNavigate(`/notifications?distribution=${encodeURIComponent(selectedId)}`)} className="ga-btn-secondary">Send schedule notices</button></div></section>
                  <EventOperationsStatus key={`notices:${selectedId}`} distribution={selected} qrRemaining={detail.qrEligible.summary.qrEligibleScheduleCount} token={session.accessToken} onNavigate={onNavigate} onSessionExpired={onSessionExpired} />
                  <EventOperationsReview key={`review:${selectedId}`} onClosed={eventClosed} distribution={selected} token={session.accessToken} onNavigate={onNavigate} onSessionExpired={onSessionExpired} />
                </div>}
                {['CLOSED', 'CANCELLED'].includes(selected.status) && <div className="p-5 sm:p-6"><div className="flex items-start gap-3 rounded-xl border border-line bg-slate-50 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-muted-copy shadow-sm"><Icon name={selected.status === 'CANCELLED' ? 'close' : 'archive'} /></span><div><p className="font-extrabold text-ink">{humanize(selected.status)} distribution</p><p className="mt-1 text-sm leading-6 text-muted-copy">Operational changes are disabled. Reports, queue records, and audit history remain available.</p></div></div></div>}
              </>}
            </section>
          </>}</section>
        </div>}
      </>}

      {capacitySlot && <SlotCapacityDialog slot={capacitySlot} onSave={saveCapacity} onClose={() => setCapacitySlot(null)} />}
      {eventForm && <DistributionFormDialog packageOnly={eventForm.packageOnly} barangays={catalogs.barangays} distribution={eventForm.distribution} initialProgramId={eventForm.programId} programs={catalogs.programs} onClose={() => setEventForm(null)} onSave={saveEvent} />}
      <ConfirmationDialog open={Boolean(confirmation)} title={confirmation?.title} description={confirmation?.description} actionLabel={confirmation?.actionLabel} destructive={confirmation?.destructive} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />
      {rawTokens && <QrCredentialsDialog distribution={rawTokens.distribution} tokens={rawTokens.tokens} onClose={() => setRawTokens(null)} />}
    </DashboardShell>
  )
}

export default DistributionManagementPage
