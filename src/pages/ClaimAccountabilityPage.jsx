import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import ClaimReceiptDialog from '../components/claims/ClaimReceiptDialog.jsx'
import DisputeCaseDetail from '../components/claims/DisputeCaseDetail.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { connectStaffRealtime } from '../realtime/staffRealtime.js'
import { claimChecks, claimWorkflow, disputeLedgerHref } from '../utils/claimWorkflow.js'
import { verificationLabels } from '../utils/claimVerification.js'
import {
  createClaimDispute,
  getAuthErrorMessage,
  isSessionExpiredError,
  issueClaimReceipt,
  markPhysicalClaimReleased,
  recordClaimReceiptPrint,
  requestClaimDisputes,
  requestDistributionClaims,
  requestDistributionClaim,
  requestDistribution,
  requestAllDistributions,
  reviewClaimDispute,
} from '../auth/staffAuth.js'

const claimStatuses = ['', 'VERIFIED', 'CLAIMED', 'VOIDED', 'PENDING', 'REJECTED']
const disputeStatuses = ['', 'OPEN', 'UNDER_REVIEW', 'REFERRED', 'RESOLVED']
const activeDisputeStatuses = ['OPEN', 'UNDER_REVIEW', 'REFERRED']
const reasonOptions = [
  ['BENEFICIARY_DENIES_RECEIPT', 'Beneficiary denies receiving assistance'],
  ['AMOUNT_OR_ASSISTANCE_MISMATCH', 'Amount or assistance does not match'],
  ['SUSPECTED_IDENTITY_MISUSE', 'Suspected identity misuse'],
  ['RECEIPT_OR_RECORD_ERROR', 'Receipt or record contains an error'],
  ['OTHER', 'Other documented concern'],
]
const releaseEvidenceOptions = [
  ['OFFICIAL_RELEASE_LOG', 'Official release log'],
  ['SIGNED_ACKNOWLEDGEMENT', 'Signed acknowledgment'],
  ['PHOTO_REFERENCE', 'Photo evidence reference'],
  ['OTHER', 'Other official evidence'],
]
const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const dateOnly = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

function humanize(value = '') {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()).replace(/\bqr\b/gi, 'QR')
}

function beneficiaryName(beneficiary) {
  return [beneficiary?.firstName, beneficiary?.middleName, beneficiary?.lastName].filter(Boolean).join(' ')
}

function statusStyle(status) {
  if (['CLAIMED', 'RESOLVED'].includes(status)) return 'border-emerald-200 bg-success-soft text-brand-green'
  if (['OPEN', 'UNDER_REVIEW', 'VERIFIED', 'PENDING'].includes(status)) return 'border-amber-200 bg-warning-soft text-brand-amber'
  if (['REFERRED'].includes(status)) return 'border-blue-200 bg-info-soft text-brand-blue'
  return 'border-red-200 bg-danger-soft text-brand-red'
}

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyle(status)}`}>{humanize(status)}</span>
}

function AccountabilitySkeleton() {
  return <div className="mt-6 space-y-5" role="status" aria-label="Loading claim accountability records"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-96 rounded-xl" /></div>
}

function validateFields(form, errors, setErrors) {
  setErrors(errors)
  const field = Object.keys(errors)[0]
  if (field) form.elements.namedItem(field)?.focus()
  return !field
}

function FileDisputeDialog({ claim, onClose, onSubmit }) {
  const dialogRef = useRef(null)
  const [reasonCode, setReasonCode] = useState(claim.claimStatus === 'CLAIMED' ? 'BENEFICIARY_DENIES_RECEIPT' : 'OTHER')
  const [statement, setStatement] = useState('')
  const [beneficiaryPresent, setBeneficiaryPresent] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => { dialogRef.current?.showModal() }, [])

  async function submit(event) {
    event.preventDefault()
    if (!validateFields(event.currentTarget, {
      ...(statement.trim().length < 20 || statement.trim().length > 2000 ? { 'dispute-statement': 'Use 20 to 2,000 characters to document the beneficiary statement.' } : {}),
      ...(!beneficiaryPresent ? { 'beneficiary-present': 'Confirm that the beneficiary is present and made this statement.' } : {}),
    }, setFieldErrors)) return
    setBusy(true)
    setError('')
    try {
      await onSubmit({ reasonCode, statement: statement.trim(), beneficiaryPresent })
      dialogRef.current?.close()
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); if (!busy) dialogRef.current?.close() }} onClose={onClose} aria-labelledby="file-dispute-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/60 backdrop:backdrop-blur-[3px]">
      <form noValidate onSubmit={submit} className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Beneficiary grievance</p><h2 id="file-dispute-title" className="mt-2 text-2xl font-extrabold">File a claim dispute</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Record the beneficiary’s own statement. Filing preserves the original claim and pauses any unsettled credit.</p></div><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} aria-label="Close dispute form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="close" /></button></div>
        <div className="mt-5 rounded-xl border border-line bg-slate-50 p-4"><p className="font-bold text-ink">{beneficiaryName(claim.beneficiary)}</p><p className="mt-1 text-sm text-muted-copy">Claim {claim.claimId} · {humanize(claim.claimStatus)}</p></div>
        <div className="mt-5"><label htmlFor="dispute-reason" className="ga-label">Reason</label><select id="dispute-reason" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} className="ga-input mt-2 cursor-pointer">{reasonOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="mt-5"><label htmlFor="dispute-statement" className="ga-label">Beneficiary statement</label><textarea id="dispute-statement" aria-invalid={Boolean(fieldErrors['dispute-statement'])} aria-describedby="dispute-statement-help dispute-statement-error" required minLength={20} maxLength={2000} rows={5} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="Write what the beneficiary is disputing, what they expected, and any receipt or amount they presented." className="ga-input mt-2 min-h-36 resize-y py-3" /><p id="dispute-statement-help" className="mt-2 text-xs text-muted-copy">{statement.trim().length}/2000 characters · minimum 20</p>{fieldErrors['dispute-statement'] && <p id="dispute-statement-error" role="alert" className="mt-2 text-sm font-semibold text-brand-red">{fieldErrors['dispute-statement']}</p>}</div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 text-sm leading-6 text-copy hover:bg-slate-50"><input id="beneficiary-present" type="checkbox" aria-invalid={Boolean(fieldErrors['beneficiary-present'])} aria-describedby="beneficiary-present-error" checked={beneficiaryPresent} onChange={(event) => setBeneficiaryPresent(event.target.checked)} className="mt-1 size-5 accent-brand-blue" /><span><strong className="text-ink">Beneficiary is present.</strong> I read back this statement and confirmed it reflects their concern.</span></label>{fieldErrors['beneficiary-present'] && <p id="beneficiary-present-error" role="alert" className="mt-2 text-sm font-semibold text-brand-red">{fieldErrors['beneficiary-present']}</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm font-semibold text-brand-red">{error}</p>}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={busy} className="ga-btn-primary">{busy ? <LoadingLabel>Filing dispute...</LoadingLabel> : 'File dispute'}</button></div>
      </form>
    </dialog>
  )
}

function PhysicalReleaseDialog({ claim, onClose, onSubmit }) {
  const dialogRef = useRef(null)
  const [pendingRelease, setPendingRelease] = useState(null)
  const [evidenceType, setEvidenceType] = useState('OFFICIAL_RELEASE_LOG')
  const [releasedQuantity, setReleasedQuantity] = useState('')
  const packageDetails = claim.distribution
  const hasPackage = packageDetails?.packageQuantity != null
  const [evidenceReference, setEvidenceReference] = useState('')
  const [notes, setNotes] = useState('')
  const [beneficiaryAcknowledged, setBeneficiaryAcknowledged] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => { dialogRef.current?.showModal() }, [])

  async function submit(event) {
    event.preventDefault()
    if (!validateFields(event.currentTarget, {
      ...(evidenceReference.trim().length < 3 || evidenceReference.trim().length > 120 ? { 'release-evidence-reference': 'Enter the official evidence reference using 3 to 120 characters.' } : {}),
      ...(hasPackage && Number(releasedQuantity) !== packageDetails.packageQuantity ? { 'released-quantity': `Enter the full handover quantity: ${packageDetails.packageQuantity} ${packageDetails.packageUnit}. Refer shortages or substitutions before completing this claim.` } : {}),
      ...(!beneficiaryAcknowledged ? { 'beneficiary-acknowledged': 'Confirm that the named beneficiary received the assistance.' } : {}),
    }, setFieldErrors)) return
    setBusy(true)
    setError('')
    const request = pendingRelease || { idempotencyKey: crypto.randomUUID(), payload: {
        evidenceType,
        evidenceReference: evidenceReference.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        beneficiaryAcknowledged,
        ...(hasPackage ? { releasedQuantity: Number(releasedQuantity) } : {}),
    } }
    setPendingRelease(request)
    try {
      await onSubmit(request.payload, request.idempotencyKey)
      dialogRef.current?.close()
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
      if (requestError.status >= 400 && requestError.status < 500) setPendingRelease(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); if (!busy) dialogRef.current?.close() }} onClose={onClose} aria-labelledby="physical-release-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/60 backdrop:backdrop-blur-[3px]">
      <form noValidate onSubmit={submit} className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Physical assistance handover</p><h2 id="physical-release-title" className="mt-2 text-2xl font-extrabold">Record the release</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-copy">Confirm the evidence from the handover. The system records who received the assistance, who released it, and the supporting evidence.</p></div><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} aria-label="Close physical release form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="close" /></button></div>

        <section className="mt-5 overflow-hidden rounded-xl border border-line" aria-label="Release review">
          <div className="bg-brand-navy p-4 text-white"><p className="text-xs font-bold uppercase tracking-[0.1em] text-blue-200">Verified recipient</p><p className="mt-1 text-lg font-extrabold">{beneficiaryName(claim.beneficiary)}</p></div>
          <dl className="grid gap-px bg-line text-sm sm:grid-cols-3"><div className="bg-white p-4"><dt className="text-xs font-semibold text-muted-copy">Queue</dt><dd className="mt-1 font-bold tabular-nums text-ink">#{claim.schedule.queueNumber}</dd></div><div className="bg-white p-4"><dt className="text-xs font-semibold text-muted-copy">Recorded value</dt><dd className="mt-1 font-bold tabular-nums text-ink">{money.format(Number(claim.allocation.amount))}</dd></div><div className="bg-white p-4"><dt className="text-xs font-semibold text-muted-copy">Identity checks</dt><dd className="mt-1 font-bold text-ink">{humanize(claim.verificationMethod)}</dd></div></dl>
        </section>

        {hasPackage ? <div className="mt-5"><label htmlFor="released-quantity" className="ga-label">Quantity handed over</label><p id="released-quantity-help" className="mt-2 text-sm leading-6 text-copy">{packageDetails.packageName}: {packageDetails.packageQuantity} {packageDetails.packageUnit} per beneficiary. Enter the actual whole-unit quantity after handover.</p><input id="released-quantity" type="number" min="1" max="10000" step="1" required disabled={busy || Boolean(pendingRelease)} value={releasedQuantity} onChange={(event) => { setReleasedQuantity(event.target.value); setFieldErrors((previous) => ({ ...previous, 'released-quantity': undefined })) }} aria-invalid={Boolean(fieldErrors['released-quantity'])} aria-describedby="released-quantity-help released-quantity-error" className="ga-input mt-2" />{fieldErrors['released-quantity'] && <p id="released-quantity-error" role="alert" className="mt-2 text-sm font-semibold text-brand-red">{fieldErrors['released-quantity']}</p>}</div> : <p className="mt-5 text-sm leading-6 text-copy">This older event has no package quantity recorded. Keep the item and quantity details in its signed release log.</p>}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div><label htmlFor="release-evidence-type" className="ga-label">Evidence type</label><select id="release-evidence-type" disabled={busy || Boolean(pendingRelease)} value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)} className="ga-input mt-2 cursor-pointer">{releaseEvidenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><label htmlFor="release-evidence-reference" className="ga-label">Evidence reference</label><input id="release-evidence-reference" disabled={busy || Boolean(pendingRelease)} aria-invalid={Boolean(fieldErrors['release-evidence-reference'])} aria-describedby="release-evidence-reference-help release-evidence-reference-error" required minLength={3} maxLength={120} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Example: LOG-2026-0917-004" className="ga-input mt-2" /><p id="release-evidence-reference-help" className="mt-2 text-xs leading-5 text-muted-copy">Identify the exact signed log entry or acknowledgment, including its page and row when applicable.</p>{fieldErrors['release-evidence-reference'] && <p id="release-evidence-reference-error" role="alert" className="mt-2 text-sm font-semibold text-brand-red">{fieldErrors['release-evidence-reference']}</p>}</div>
        </div>
        <div className="mt-5"><label htmlFor="release-notes" className="ga-label">Release notes <span className="font-normal text-muted-copy">(optional)</span></label><textarea id="release-notes" disabled={busy || Boolean(pendingRelease)} maxLength={1000} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a concise handover note. Do not enter sensitive identity data." className="ga-input mt-2 min-h-24 resize-y py-3" /></div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-success-soft p-4 text-sm leading-6 text-copy"><input id="beneficiary-acknowledged" disabled={busy || Boolean(pendingRelease)} type="checkbox" aria-invalid={Boolean(fieldErrors['beneficiary-acknowledged'])} aria-describedby="beneficiary-acknowledged-error" checked={beneficiaryAcknowledged} onChange={(event) => setBeneficiaryAcknowledged(event.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-green" /><span><strong className="text-ink">Handover completed.</strong> I confirm the named beneficiary received the physical assistance and the evidence reference above identifies the release record.</span></label>{fieldErrors['beneficiary-acknowledged'] && <p id="beneficiary-acknowledged-error" role="alert" className="mt-2 text-sm font-semibold text-brand-red">{fieldErrors['beneficiary-acknowledged']}</p>}
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-warning-soft p-3 text-xs font-semibold leading-5 text-brand-amber"><Icon name="info" className="mt-0.5 size-4 shrink-0" />A claim can be released exactly once. Correct errors through the dispute workflow; do not create another release.</p>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm font-semibold text-brand-red">{error}</p>}
        {pendingRelease && !busy && <p role="status" className="mt-3 text-sm leading-6 text-copy">The release result is unconfirmed. Retry sends the original evidence reference and the same request, so a saved release is recovered without recording another handover.</p>}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-muted-copy">The system records your staff identity and Philippine timestamp.</p><div className="flex flex-col-reverse gap-3 sm:flex-row"><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={busy} className="ga-btn-primary">{busy ? <LoadingLabel>Recording release...</LoadingLabel> : pendingRelease ? 'Retry release record' : <><Icon name="check" /> Mark assistance released</>}</button></div></div>
      </form>
    </dialog>
  )
}

function ReviewDecisionDialog({ action, canSettle, dispute, distributionId, returnTo, onClose, onNavigate, onSubmit }) {
  const dialogRef = useRef(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const physicalRelease = dispute.claim.releaseMethod === 'PHYSICAL_GOODS' || dispute.claim.distribution?.deliveryMode === 'PHYSICAL_GOODS'
  const needsReversal = action === 'COMPLETE_REMEDIATION' && dispute.claim.claimStatus === 'CLAIMED' && !physicalRelease
  const content = {
    CONFIRM_CLAIM: ['Confirm recorded claim', dispute.claim.isDuplicateFlag ? 'Document why this claim is valid despite the duplicate concern. Confirmation clears the hold; it does not verify or release assistance.' : 'Record which available verification, receipt, and release or credit evidence supports the original claim.', 'Confirm claim'],
    REFER_FOR_INVESTIGATION: ['Refer for investigation', 'Explain the identity, document, or transaction concern that needs formal investigation.', 'Refer case'],
    COMPLETE_REMEDIATION: ['Complete beneficiary remediation', 'Describe the correction, reversal, communication, and documents completed for the beneficiary.', 'Resolve as remediated'],
  }[action]

  useEffect(() => { dialogRef.current?.showModal() }, [])

  async function submit(event) {
    event.preventDefault()
    if (!validateFields(event.currentTarget, {
      ...(reviewNotes.trim().length < 20 || reviewNotes.trim().length > 2000 ? { 'review-notes': 'Use 20 to 2,000 characters to document your review evidence and reasoning.' } : {}),
    }, setFieldErrors)) return
    setBusy(true)
    setError('')
    try {
      await onSubmit({ action, reviewNotes: reviewNotes.trim() })
      dialogRef.current?.close()
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
      if (requestError.status === 409) setConflict(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); if (!busy) dialogRef.current?.close() }} onClose={onClose} aria-labelledby="review-decision-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/60">
      <form noValidate onSubmit={submit} className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Independent decision</p><h2 id="review-decision-title" className="mt-2 text-2xl font-extrabold">{content[0]}</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Case {dispute.referenceNo}</p></div><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} aria-label="Close review decision" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line hover:bg-slate-50"><Icon name="close" /></button></div>
        {needsReversal ? <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-warning-soft p-4"><p className="font-bold text-ink">Reverse the completed credit first</p><p className="mt-2 text-sm leading-6 text-copy">A claimed record cannot be closed as remediated while its ledger credit remains completed. {canSettle ? 'Reverse it in the ledger, then return to this case.' : 'Ask DSWD Staff to reverse it in the ledger, then return to this case.'}</p>{canSettle && <button type="button" onClick={() => onNavigate(disputeLedgerHref(distributionId, dispute, returnTo))} className="ga-btn-secondary mt-4">Open ledger</button>}</div> : <><p className="mt-5 text-sm leading-6 text-copy">{content[1]}</p>{action === 'COMPLETE_REMEDIATION' && physicalRelease && <p className="mt-4 rounded-lg border border-blue-200 bg-info-soft p-3 text-sm leading-6 text-copy"><strong className="text-ink">Physical release:</strong> No wallet reversal is required. Resolving this case voids the claim while preserving the original handover evidence.</p>}<div className="mt-5"><label htmlFor="review-notes" className="ga-label">Review notes and evidence</label><textarea id="review-notes" aria-invalid={Boolean(fieldErrors['review-notes'])} aria-describedby="review-notes-help review-notes-error" required minLength={20} maxLength={2000} rows={6} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} className="ga-input mt-2 min-h-40 resize-y py-3" /><p id="review-notes-help" className="mt-2 text-xs text-muted-copy">These notes are saved with the case and shown in Recorded review.</p>{fieldErrors['review-notes'] && <p id="review-notes-error" role="alert" className="mt-2 text-sm font-semibold text-brand-red">{fieldErrors['review-notes']}</p>}</div></>}
        {conflict && <p className="mt-4 text-sm leading-6 text-copy">Your notes remain in this form. Copy them if needed, then close the form and review the refreshed case before deciding.</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm font-semibold text-brand-red">{error}</p>}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Close</button>{!needsReversal && <button type="submit" disabled={busy || conflict} className={action === 'CONFIRM_CLAIM' ? 'ga-btn-primary' : 'ga-btn-secondary'}>{busy ? <LoadingLabel>Recording decision...</LoadingLabel> : content[2]}</button>}</div>
      </form>
    </dialog>
  )
}

function ClaimActions({ busy, unavailable, state, claim, distribution, role, onDispute, onReceipt, onRelease, onNavigate }) {
  const activeDispute = claim.disputes?.some((item) => activeDisputeStatuses.includes(item.status))
  const showRelease = role === 'BARANGAY_FACILITATOR' && distribution?.deliveryMode === 'PHYSICAL_GOODS'
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {showRelease && <button type="button" disabled={busy || unavailable || !state.canRelease} onClick={() => onRelease(claim)} className="ga-btn-primary">{claim.claimStatus === 'CLAIMED' ? 'Released' : 'Mark released'}</button>}
      {state.href && <a href={state.href} onClick={(event) => { event.preventDefault(); onNavigate(state.href) }} className="ga-btn-secondary">{state.action}</a>}
      <button type="button" disabled={busy || unavailable || !state.receiptReady} onClick={() => onReceipt(claim)} className="ga-btn-secondary">{busy ? <LoadingLabel>Loading...</LoadingLabel> : claim.receipt ? 'View receipt' : 'Issue receipt'}</button>
      {!activeDispute && (['VERIFIED', 'CLAIMED', 'VOIDED'].includes(claim.claimStatus) || (claim.claimStatus === 'PENDING' && claim.isDuplicateFlag)) && <button type="button" disabled={busy || unavailable} onClick={() => onDispute(claim)} className="ga-admin-link min-h-11 px-2">File dispute</button>}
    </div>
    {!state.receiptReady && <p className="text-xs leading-5 text-muted-copy">A receipt is available after release or settlement.</p>}
  </div>
}

function ClaimsView({ busyClaimId, claims, distribution, role, unavailable, onDispute, onReceipt, onRelease, onNavigate }) {
  if (!claims.length) return <EmptyState title="No matching claim records" copy="Try another status, search term, or distribution event." />
  return <ul className="divide-y divide-line">{claims.map((claim) => {
    const state = claimWorkflow(claim, distribution, role)
    const releaseTime = claim.releasedAt || claim.claimedAt
    return <li key={claim.claimId} className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="text-lg font-bold text-ink">{beneficiaryName(claim.beneficiary)}</h2><p className="mt-1 text-sm text-muted-copy">Queue #{claim.schedule?.queueNumber ?? 'Not recorded'} · {claim.beneficiary?.barangay?.barangayName || 'Barangay not recorded'}</p></div>
        <span className={'inline-flex max-w-full rounded-full border px-3 py-1 text-sm font-semibold ' + (state.tone === 'success' ? 'ga-status-success' : state.tone === 'danger' ? 'ga-status-danger' : 'ga-status-warning')}>{state.transactionLabel || state.label}</span>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <div><p className="ga-label">Verification</p><p className="mt-2 text-sm font-semibold">{verificationLabels[claim.verificationMethod || distribution?.verificationRequirement]}</p><dl className="mt-2 space-y-2 text-sm">{claimChecks(claim, distribution).map((check) => <div key={check.key} className="flex flex-wrap justify-between gap-x-3"><dt className="text-copy">{check.label}</dt><dd className={check.required && !check.complete ? 'font-semibold text-brand-amber' : 'text-muted-copy'}>{check.status}</dd></div>)}</dl>{claim.manualVerification && <p className="mt-3 break-words text-xs leading-5 text-muted-copy">Identity review: {claim.manualVerification.evidenceReference} · {claim.manualVerification.verifiedByName || 'Authorized staff'} · {dateTime.format(new Date(claim.manualVerification.verifiedAt))} PHT</p>}</div>
        <div className="text-sm"><p className="ga-label">Recorded assistance</p><p className="mt-2 font-semibold tabular-nums">{money.format(Number(claim.allocation?.amount ?? 0))}</p><p className="mt-2 text-copy">{releaseTime ? (claim.releaseMethod === 'PHYSICAL_GOODS' || distribution?.deliveryMode === 'PHYSICAL_GOODS' ? 'Released ' : 'Credited ') + dateTime.format(new Date(releaseTime)) + ' PHT' : 'No release or credit recorded'}</p>{claim.releasedBy?.fullName && <p className="mt-1 text-muted-copy">Recorded by {claim.releasedBy.fullName}</p>}{claim.releasedQuantity != null && <p className="mt-2 text-copy">{claim.releasedPackageName}: {claim.releasedQuantity} {claim.releasedPackageUnit}</p>}{claim.releaseEvidenceReference && <p className="mt-1 break-words text-copy">Evidence: {claim.releaseEvidenceReference}</p>}<p className="mt-2 break-words text-muted-copy">{claim.receipt?.receiptNo || 'No receipt issued'}</p></div>
        <div className="border-l-2 border-line pl-4 text-sm"><p className="ga-label">Next step</p><p className="mt-2 leading-6 text-copy">{state.next}</p><p className="mt-2 font-semibold text-ink">Responsible: {state.owner}</p></div>
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4"><ClaimActions busy={busyClaimId === claim.claimId} unavailable={unavailable} state={state} claim={claim} distribution={distribution} role={role} onDispute={onDispute} onReceipt={onReceipt} onRelease={onRelease} onNavigate={onNavigate} /><details className="text-xs text-muted-copy"><summary className="min-h-8 cursor-pointer py-2">Record reference</summary><p className="break-all pb-2">{claim.claimId} · Recorded status: {humanize(claim.claimStatus)}</p></details></div>
    </li>
  })}</ul>
}

function DisputesView({ disputes, onOpen }) {
  if (!disputes.length) return <EmptyState title="No matching disputes" copy="Try another status, search term, or distribution event." />
  return <ul className="divide-y divide-line" aria-label="Dispute cases">{disputes.map((dispute) => <li key={dispute.disputeId} className="p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-all text-xs font-semibold text-muted-copy">{dispute.referenceNo}</p><h2 className="mt-1 break-words text-lg font-bold text-ink">{beneficiaryName(dispute.claim.beneficiary)}</h2></div><StatusBadge status={dispute.status} /></div>
    <p className="mt-2 text-sm leading-6 text-copy">{humanize(dispute.reasonCode)}</p>
    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="text-sm leading-6 text-muted-copy"><p>Reviewer: <span className="font-semibold text-ink">{dispute.assignedTo?.fullName || 'Unassigned'}</span></p><p>Filed {dateTime.format(new Date(dispute.filedAt))} PHT</p></div><button type="button" onClick={() => onOpen(dispute)} aria-label={`Open case ${dispute.referenceNo}`} className="ga-btn-secondary shrink-0">Open case</button></div>
  </li>)}</ul>
}

function EmptyState({ copy, title }) {
  return <div className="px-5 py-14 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-brand-blue"><Icon name="receipt" /></span><h3 className="mt-4 text-lg font-extrabold text-ink">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-copy">{copy}</p></div>
}

export default function ClaimAccountabilityPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const [initialQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const view = params.get('view') === 'disputes' ? 'disputes' : 'claims'
    return { distributionId: params.get('distribution') ?? '', claimId: params.get('claim') ?? '', caseId: view === 'disputes' ? params.get('case') || '' : '', search: params.get('search') ?? params.get('claim') ?? '', view, page: /^[1-9]\d*$/.test(params.get('page')) && Number.isSafeInteger(Number(params.get('page'))) ? Number(params.get('page')) : 1, status: (view === 'disputes' ? disputeStatuses : claimStatuses).includes(params.get('status')) ? params.get('status') : '' }
  })
  const caseId = initialQuery.caseId
  const [distributions, setDistributions] = useState([])
  const [selectedId, setSelectedId] = useState(initialQuery.distributionId)
  const [view, setView] = useState(initialQuery.view)
  const [draftSearch, setDraftSearch] = useState(initialQuery.search)
  const [draftStatus, setDraftStatus] = useState(initialQuery.status)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState({ search: initialQuery.search, status: initialQuery.status })
  const [page, setPage] = useState(initialQuery.page)
  const [records, setRecords] = useState(null)
  const [summary, setSummary] = useState({ countsByStatus: {} })
  const [pagination, setPagination] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [receipt, setReceipt] = useState(null)
  const [releaseClaim, setReleaseClaim] = useState(null)
  const [disputeClaim, setDisputeClaim] = useState(null)
  const [decision, setDecision] = useState(null)
  const [busyClaimId, setBusyClaimId] = useState('')
  const [busyDisputeId, setBusyDisputeId] = useState('')
  const [listReload, setListReload] = useState(0)
  const [listError, setListError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [connection, setConnection] = useState('connecting')
  const [actionError, setActionError] = useState('')

  const refreshRecords = useCallback(() => {
    setRefreshing(true)
    setRefresh((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!selectedId) return undefined
    let timer
    const scheduleRefresh = () => { clearTimeout(timer); timer = setTimeout(refreshRecords, 300) }
    const disconnect = connectStaffRealtime(session.accessToken, {
      onReady: () => { setConnection('connected'); scheduleRefresh() },
      onUpdate: (_event, payload) => { if (payload?.distributionId === selectedId) scheduleRefresh() },
      onDisconnect: () => setConnection('disconnected'),
      onError: (issue) => {
        if (['AUTHENTICATION_REQUIRED', 'INVALID_TOKEN', 'INVALID_SESSION'].includes(issue?.data?.code)) return onSessionExpired()
        setConnection('disconnected')
      },
    })
    // Disputes have no dedicated live event; visible registers also refresh every minute.
    const safetyRefresh = setInterval(() => { if (document.visibilityState === 'visible') scheduleRefresh() }, 60_000)
    return () => { clearTimeout(timer); clearInterval(safetyRefresh); disconnect() }
  }, [onSessionExpired, refreshRecords, selectedId, session.accessToken])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (caseId) return
    if (selectedId) url.searchParams.set('distribution', selectedId)
    else url.searchParams.delete('distribution')
    if (view === 'disputes') url.searchParams.set('view', 'disputes')
    else url.searchParams.delete('view')
    if (filters.search) url.searchParams.set('search', filters.search)
    else url.searchParams.delete('search')
    if (filters.status) url.searchParams.set('status', filters.status)
    else url.searchParams.delete('status')
    if (page > 1) url.searchParams.set('page', String(page))
    else url.searchParams.delete('page')
    if (view !== 'claims' || filters.search !== initialQuery.claimId) url.searchParams.delete('claim')
    window.history.replaceState(window.history.state, '', url)
  }, [caseId, filters, initialQuery.claimId, page, selectedId, view])

  const openReceipt = useCallback(async (claim) => {
    setBusyClaimId(claim.claimId)
    try {
      const data = await issueClaimReceipt(session.accessToken, selectedId, claim.claimId)
      setReceipt(data.receipt)
      if (data.created) { toast.success('Claim receipt issued', { description: data.receipt.receiptNo }); setRefresh((value) => value + 1) }
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      toast.error('Unable to open receipt', { description: getAuthErrorMessage(requestError) })
    } finally {
      setBusyClaimId('')
    }
  }, [onSessionExpired, selectedId, session.accessToken])

  useEffect(() => {
    if (caseId) return undefined
    let active = true
    requestAllDistributions(session.accessToken)
      .then(async (items) => {
        if (initialQuery.distributionId && !items.some((item) => item.distributionId === initialQuery.distributionId)) {
          items.unshift(await requestDistribution(session.accessToken, initialQuery.distributionId))
        }
        if (!active) return
        setListError('')
        setDistributions(items)
        setSelectedId((current) => items.some((item) => item.distributionId === current) ? current : items.find((item) => item.status === 'OPEN')?.distributionId ?? items[0]?.distributionId ?? '')
        setLoading(false)
      })
      .catch((requestError) => {
        if (!active) return
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        setListError(getAuthErrorMessage(requestError))
        setLoading(false)
      })
    return () => { active = false }
  }, [caseId, initialQuery.distributionId, listReload, onSessionExpired, session.accessToken])

  useEffect(() => {
    if (!selectedId || caseId) return undefined
    let active = true
    const request = view === 'claims' ? requestDistributionClaims : requestClaimDisputes
    Promise.all([
      request(session.accessToken, selectedId, { page, pageSize: 20, ...filters }),
      requestDistribution(session.accessToken, selectedId),
    ]).then(([data, distribution]) => {
      if (!active) return
      if (distribution.distributionId !== selectedId) throw new Error('The returned event does not match the selected distribution.')
      if (page > Math.max(1, data.pagination.totalPages)) { setPage(Math.max(1, data.pagination.totalPages)); return }
      setDistributions((items) => items.map((item) => item.distributionId === selectedId ? distribution : item))
      setRecords(view === 'claims' ? data.claims : data.disputes)
      setSummary(data.summary)
      setPagination(data.pagination)
      setError('')
      setUpdatedAt(new Date())
    }).catch((requestError) => {
      if (!active) return
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      setError(getAuthErrorMessage(requestError))
    }).finally(() => { if (active) { setLoading(false); setRefreshing(false) } })
    return () => { active = false }
  }, [caseId, filters, onSessionExpired, page, refresh, selectedId, session.accessToken, view])

  async function openCurrentClaim(claim, setDialog, release = false) {
    setBusyClaimId(claim.claimId); setActionError('')
    try {
      const [current, distribution] = await Promise.all([
        requestDistributionClaim(session.accessToken, selectedId, claim.claimId),
        requestDistribution(session.accessToken, selectedId),
      ])
      if (current.distributionId !== selectedId || distribution.distributionId !== selectedId) throw new Error('The claim does not belong to this event.')
      if (release && !claimWorkflow(current, distribution, session.user.role).canRelease) throw new Error('This claim is no longer available for release. Refresh records to review its current status.')
      setDialog(current)
    } catch (issue) {
      if (isSessionExpiredError(issue)) return onSessionExpired()
      setActionError(getAuthErrorMessage(issue)); refreshRecords()
    } finally { setBusyClaimId('') }
  }

  function applyFilters(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setPage(1)
    setFilters({ search: draftSearch.trim(), status: draftStatus })
  }

  function changeView(nextView) {
    setLoading(true)
    setError('')
    setView(nextView)
    setDraftStatus('')
    setFilters({ search: '', status: '' })
    setDraftSearch('')
    setPage(1)
    setRecords(null)
  }

  async function fileDispute(payload) {
    const created = await createClaimDispute(session.accessToken, selectedId, disputeClaim.claimId, payload)
    toast.success('Dispute filed', { description: `Case ${created.referenceNo} is awaiting independent review.` })
    setView('disputes')
    setLoading(true)
    setFilters({ search: '', status: '' })
    setDraftSearch('')
    setDraftStatus('')
    setPage(1)
    setRefresh((value) => value + 1)
  }

  async function releasePhysicalAssistance(payload, idempotencyKey) {
    setBusyClaimId(releaseClaim.claimId)
    try {
      const data = await markPhysicalClaimReleased(
        session.accessToken,
        selectedId,
        releaseClaim.claimId,
        payload,
        idempotencyKey,
      )
      toast.success('Physical assistance released', {
        description: `${beneficiaryName(data.claim.beneficiary)} · ${data.release.evidence.reference}`,
      })
      refreshRecords()
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) onSessionExpired()
      throw requestError
    } finally {
      setBusyClaimId('')
    }
  }

  async function startReview(dispute) {
    setBusyDisputeId(dispute.disputeId)
    setActionError('')
    try {
      await reviewClaimDispute(session.accessToken, selectedId, dispute.disputeId, { action: 'START_REVIEW', expectedUpdatedAt: dispute.updatedAt })
      toast.success('Independent review assigned to you')
      setRefresh((value) => value + 1)
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      setActionError(getAuthErrorMessage(requestError))
      setRefresh((value) => value + 1)
    } finally {
      setBusyDisputeId('')
    }
  }

  async function submitDecision(payload) {
    try {
      await reviewClaimDispute(session.accessToken, selectedId, decision.dispute.disputeId, { ...payload, expectedUpdatedAt: decision.dispute.updatedAt, expectedClaimUpdatedAt: decision.dispute.claim.updatedAt })
      toast.success('Review decision recorded')
    } catch (issue) {
      if (isSessionExpiredError(issue)) onSessionExpired()
      throw issue
    } finally { setRefresh((value) => value + 1) }
  }

  function openCase(dispute) {
    const url = new URL(window.location.href)
    url.searchParams.set('case', dispute.disputeId)
    onNavigate(url.pathname + url.search)
  }

  function backToCases() {
    const url = new URL(window.location.href)
    url.searchParams.delete('case')
    onNavigate(url.pathname + url.search)
  }

  const selectedDistribution = distributions.find((item) => item.distributionId === selectedId)
  const statusOptions = view === 'claims' ? claimStatuses : disputeStatuses
  const counts = summary?.countsByStatus ?? {}
  const total = pagination?.total ?? 0
  const returnTo = window.location.pathname + window.location.search

  return (
    <DashboardShell breadcrumbs={['Operations', 'Claims', 'Accountability']} currentPath="/claim-accountability" onLogout={onLogout} onNavigate={onNavigate} pageTitle={caseId ? 'Dispute review' : 'Claim accountability'} user={session.user} showAssistant={false}>
      <header className="ga-page-header border-b border-line pb-7"><p className="ga-eyebrow">Claim records</p><h1 className="ga-page-title">{caseId ? 'Dispute review' : 'Claims and receipts'}</h1><p className="ga-page-copy">{caseId ? 'Review the beneficiary statement, claim evidence, and recorded outcome.' : session.user.role === 'BARANGAY_FACILITATOR' ? 'Record physical handovers, issue receipts, and refer beneficiary concerns for independent review.' : 'Review release evidence, receipts, and beneficiary concerns within the selected event.'}</p></header>
      {session.user.role === 'SYSTEM_ADMIN' && selectedId && <a href={`/distributions/manage?event=${encodeURIComponent(selectedId)}`} onClick={(event) => { event.preventDefault(); onNavigate(`/distributions/manage?event=${encodeURIComponent(selectedId)}`) }} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand-blue hover:underline"><Icon name="arrowLeft" className="size-4" />Return to distribution event</a>}

      {!caseId && <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-copy">
        <p role="status">{updatedAt ? 'Updated ' + dateTime.format(updatedAt) + ' PHT · ' : ''}{connection === 'connected' ? 'Live claim updates connected' : connection === 'connecting' ? 'Connecting to live updates' : 'Live connection unavailable; automatic refresh remains active'}</p>
        <button type="button" disabled={refreshing || loading} onClick={() => { if (listError || !selectedId) { setListReload((value) => value + 1); setLoading(true) } else refreshRecords() }} className="ga-btn-secondary">{refreshing ? <LoadingLabel>Refreshing...</LoadingLabel> : 'Refresh records'}</button>
      </div>
      <section className="ga-card mt-6 p-4 sm:p-5" aria-label="Claim accountability filters">
        {view === 'disputes' && <button type="button" aria-expanded={filtersOpen} aria-controls="accountability-filter-fields" onClick={() => setFiltersOpen((value) => !value)} className="ga-btn-secondary w-full lg:hidden">{filtersOpen ? 'Hide case filters' : `Filter cases${filters.status ? ' · ' + humanize(filters.status) : ''}`}</button>}
        <div id="accountability-filter-fields" className={view === 'disputes' ? `${filtersOpen ? 'mt-4' : 'hidden'} lg:mt-0 lg:block` : ''}>
        <form onSubmit={applyFilters} className="grid gap-4 lg:grid-cols-[minmax(16rem,1.2fr)_minmax(12rem,0.7fr)_minmax(12rem,0.7fr)_auto]">
          <div><label htmlFor="accountability-distribution" className="ga-label">Distribution event</label><select id="accountability-distribution" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setPagination(null); setRecords(event.target.value ? null : []); setLoading(Boolean(event.target.value)); setError(''); setActionError(''); setUpdatedAt(null); setDraftSearch(''); setDraftStatus(''); setFilters({ search: '', status: '' }); setPage(1) }} className="ga-input mt-2 cursor-pointer font-semibold"><option value="">Select a distribution</option>{distributions.map((item) => <option key={item.distributionId} value={item.distributionId}>{item.title} — {dateOnly.format(new Date(item.distributionDate))}</option>)}</select></div>
          <div><label htmlFor="accountability-search" className="ga-label">Search</label><input id="accountability-search" type="search" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Name or reference" className="ga-input mt-2" /></div>
          <div><label htmlFor="accountability-status" className="ga-label">Status</label><select id="accountability-status" value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)} className="ga-input mt-2 cursor-pointer"><option value="">All statuses</option>{statusOptions.filter(Boolean).map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select></div>
          <button type="submit" disabled={!selectedId} className="ga-btn-primary self-end">Apply</button>
        </form>
        </div>
        {selectedDistribution && <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-copy"><strong className="text-ink">{view === 'disputes' ? selectedDistribution.title : 'Current scope:'}</strong><span>{selectedDistribution.barangay?.barangayName} · {selectedDistribution.location} · {humanize(selectedDistribution.status)}</span><span className="rounded-full border border-blue-200 bg-info-soft px-2.5 py-1 text-xs font-bold text-brand-blue">{humanize(selectedDistribution.deliveryMode)}</span></div>}
        {view === 'disputes' && filters.search && <p className="mt-2 break-words text-sm text-muted-copy lg:hidden">Search: {filters.search}</p>}
      </section>

      {selectedDistribution && view === 'claims' && <section aria-label="Verification and release responsibilities" className="mt-5 border-l-4 border-brand-blue bg-info-soft p-4">
        <h2 className="text-sm font-bold text-ink">Verified claims still need a release record</h2>
        <p className="mt-1 text-sm leading-6 text-copy">{selectedDistribution.deliveryMode === 'PHYSICAL_GOODS' ? 'The assigned Barangay Facilitator records the handover with supporting evidence. Admin and DSWD review the record and any concerns.' : 'DSWD records the simulated wallet credit. Admin reviews the transaction and reconciliation records. No real money is transferred.'} Receipts are available after release.</p>
        {selectedDistribution.deliveryMode === 'SIMULATED_WALLET' && ['SYSTEM_ADMIN', 'DSWD_STAFF'].includes(session.user.role) && <button type="button" onClick={() => onNavigate(`/dswd/ledger?distribution=${encodeURIComponent(selectedId)}`)} className="ga-btn-secondary mt-3">{session.user.role === 'DSWD_STAFF' ? 'Open wallet credits' : 'Review transactions'}</button>}
      </section>}

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div role="tablist" aria-label="Accountability record type" className="inline-flex w-full rounded-xl border border-line bg-white p-1 shadow-sm sm:w-auto"><button type="button" role="tab" aria-selected={view === 'claims'} onClick={() => changeView('claims')} className={`min-h-11 flex-1 rounded-lg px-5 text-sm font-bold sm:flex-none ${view === 'claims' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}>Claims & receipts</button><button type="button" role="tab" aria-selected={view === 'disputes'} onClick={() => changeView('disputes')} className={`min-h-11 flex-1 rounded-lg px-5 text-sm font-bold sm:flex-none ${view === 'disputes' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}>Dispute review</button></div>
        <p className="text-sm font-semibold text-muted-copy">{total} matching {view === 'claims' ? 'claim' : 'case'} record(s)</p>
      </div>

      {view === 'disputes' && <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Dispute status summary">{['OPEN', 'UNDER_REVIEW', 'REFERRED', 'RESOLVED'].map((status) => <div key={status} className="ga-card-flat p-4"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">{humanize(status)}</p><p className="mt-2 text-2xl font-black tabular-nums text-ink">{counts[status] ?? 0}</p></div>)}</section>}

      </>}
      {(caseId ? actionError : error || listError || actionError) && <section className="ga-card mt-5 border-amber-200 p-5" role="alert"><h2 className="font-bold">{actionError ? 'Action unavailable' : 'Records could not be refreshed'}</h2><p className="mt-2 text-sm leading-6 text-copy">{caseId ? actionError : listError || error || actionError}</p>{!caseId && records && <p className="mt-2 text-sm text-copy">Previously loaded records remain visible. Refresh before taking action.</p>}<button type="button" onClick={() => { setActionError(''); if (listError) { setLoading(true); setListReload((value) => value + 1) } else refreshRecords() }} className="ga-btn-secondary mt-3">Try again</button></section>}
      {caseId && (selectedId ? (
        <DisputeCaseDetail key={selectedId + caseId} caseId={caseId} distributionId={selectedId} refresh={refresh} session={session} busy={Boolean(busyDisputeId)} onStart={startReview} onDecision={(dispute, action) => setDecision({ dispute, action })} onBack={backToCases} onNavigate={onNavigate} onSessionExpired={onSessionExpired} />
      ) : (
        <section role="alert" className="ga-card mt-5 p-6"><h2 className="font-bold">This case link is missing its event</h2><p className="mt-2 text-sm leading-6 text-copy">Return to the case list and select the distribution event.</p><button type="button" onClick={backToCases} className="ga-btn-secondary mt-4">Back to cases</button></section>
      ))}
      {!caseId && (loading ? <AccountabilitySkeleton /> : !selectedId ? (
        <section className="ga-card mt-5 p-6"><h2 className="font-bold">Select a distribution event</h2><p className="mt-2 text-sm text-copy">Choose an event above to review its claims, releases, and receipts.</p></section>
      ) : records && (
        <section className="ga-card mt-5 overflow-hidden" aria-busy={refreshing}>
          {view === 'claims' ? <ClaimsView busyClaimId={busyClaimId} unavailable={Boolean(error || listError)} distribution={selectedDistribution} role={session.user.role} claims={records} onNavigate={onNavigate} onDispute={(claim) => openCurrentClaim(claim, setDisputeClaim)} onReceipt={openReceipt} onRelease={(claim) => openCurrentClaim(claim, setReleaseClaim, true)} /> : <DisputesView disputes={records} onOpen={openCase} />}
        </section>
      ))}

      {!caseId && pagination?.totalPages > 1 && <nav aria-label={`${view} pagination`} className="mt-5 flex items-center justify-between gap-4"><button type="button" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage((value) => value - 1) }} className="ga-btn-secondary">Previous</button><p className="text-sm font-bold text-copy">Page {pagination.page} of {pagination.totalPages}</p><button type="button" disabled={page >= pagination.totalPages || loading} onClick={() => { setLoading(true); setPage((value) => value + 1) }} className="ga-btn-secondary">Next</button></nav>}

      {receipt && <ClaimReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} onDispute={() => { const claim = records?.find((item) => item.claimId === receipt.claimId); setReceipt(null); if (claim) openCurrentClaim(claim, setDisputeClaim) }} onPrint={async () => { const updated = await recordClaimReceiptPrint(session.accessToken, selectedId, receipt.claimId); setReceipt(updated) }} />}
      {releaseClaim && <PhysicalReleaseDialog claim={releaseClaim} onClose={() => setReleaseClaim(null)} onSubmit={releasePhysicalAssistance} />}
      {disputeClaim && <FileDisputeDialog claim={disputeClaim} onClose={() => setDisputeClaim(null)} onSubmit={fileDispute} />}
      {decision && <ReviewDecisionDialog action={decision.action} canSettle={session.user.role === 'DSWD_STAFF'} distributionId={selectedId} returnTo={returnTo} dispute={decision.dispute} onClose={() => setDecision(null)} onNavigate={onNavigate} onSubmit={submitDecision} />}
    </DashboardShell>
  )
}
