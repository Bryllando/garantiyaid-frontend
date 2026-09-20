import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import ClaimReceiptDialog from '../components/claims/ClaimReceiptDialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import {
  createClaimDispute,
  getAuthErrorMessage,
  isSessionExpiredError,
  issueClaimReceipt,
  markPhysicalClaimReleased,
  recordClaimReceiptPrint,
  requestClaimDisputes,
  requestDistributionClaims,
  requestDistributionList,
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
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
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

function FileDisputeDialog({ claim, onClose, onSubmit }) {
  const dialogRef = useRef(null)
  const [reasonCode, setReasonCode] = useState('BENEFICIARY_DENIES_RECEIPT')
  const [statement, setStatement] = useState('')
  const [beneficiaryPresent, setBeneficiaryPresent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { dialogRef.current?.showModal() }, [])

  async function submit(event) {
    event.preventDefault()
    if (statement.trim().length < 20) return setError('Document the beneficiary statement in at least 20 characters.')
    if (!beneficiaryPresent) return setError('Confirm that the beneficiary is present and made this statement.')
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
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); dialogRef.current?.close() }} onClose={onClose} aria-labelledby="file-dispute-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/60 backdrop:backdrop-blur-[3px]">
      <form onSubmit={submit} className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Beneficiary grievance</p><h2 id="file-dispute-title" className="mt-2 text-2xl font-extrabold">File a claim dispute</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Record the beneficiary’s own statement. Filing preserves the original claim and pauses any unsettled credit.</p></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close dispute form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="close" /></button></div>
        <div className="mt-5 rounded-xl border border-line bg-slate-50 p-4"><p className="font-bold text-ink">{beneficiaryName(claim.beneficiary)}</p><p className="mt-1 text-sm text-muted-copy">Claim {claim.claimId} · {humanize(claim.claimStatus)}</p></div>
        <div className="mt-5"><label htmlFor="dispute-reason" className="ga-label">Reason</label><select id="dispute-reason" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} className="ga-input mt-2 cursor-pointer">{reasonOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="mt-5"><label htmlFor="dispute-statement" className="ga-label">Beneficiary statement</label><textarea id="dispute-statement" required minLength={20} maxLength={2000} rows={5} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="Write what the beneficiary is disputing, what they expected, and any receipt or amount they presented." className="ga-input mt-2 min-h-36 resize-y py-3" /><p className="mt-2 text-xs text-muted-copy">{statement.trim().length}/2000 characters · minimum 20</p></div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 text-sm leading-6 text-copy hover:bg-slate-50"><input type="checkbox" checked={beneficiaryPresent} onChange={(event) => setBeneficiaryPresent(event.target.checked)} className="mt-1 size-5 accent-brand-blue" /><span><strong className="text-ink">Beneficiary is present.</strong> I read back this statement and confirmed it reflects their concern.</span></label>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm font-semibold text-brand-red">{error}</p>}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={busy} className="ga-btn-primary">{busy ? <LoadingLabel>Filing dispute...</LoadingLabel> : 'File dispute'}</button></div>
      </form>
    </dialog>
  )
}

function PhysicalReleaseDialog({ claim, onClose, onSubmit }) {
  const dialogRef = useRef(null)
  const idempotencyKey = useRef(crypto.randomUUID())
  const [evidenceType, setEvidenceType] = useState('OFFICIAL_RELEASE_LOG')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [notes, setNotes] = useState('')
  const [beneficiaryAcknowledged, setBeneficiaryAcknowledged] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { dialogRef.current?.showModal() }, [])

  async function submit(event) {
    event.preventDefault()
    if (evidenceReference.trim().length < 3) return setError('Enter the official log, acknowledgment, or evidence reference.')
    if (!beneficiaryAcknowledged) return setError('Confirm the beneficiary received the assistance before recording release.')
    setBusy(true)
    setError('')
    try {
      await onSubmit({
        evidenceType,
        evidenceReference: evidenceReference.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        beneficiaryAcknowledged,
      }, idempotencyKey.current)
      dialogRef.current?.close()
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); if (!busy) dialogRef.current?.close() }} onClose={onClose} aria-labelledby="physical-release-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/60 backdrop:backdrop-blur-[3px]">
      <form onSubmit={submit} className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Physical assistance handover</p><h2 id="physical-release-title" className="mt-2 text-2xl font-extrabold">Record the release</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-copy">Confirm the evidence from the handover. This changes the verified claim and its allocation to Claimed in one protected transaction.</p></div><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} aria-label="Close physical release form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="close" /></button></div>

        <section className="mt-5 overflow-hidden rounded-xl border border-line" aria-label="Release review">
          <div className="bg-brand-navy p-4 text-white"><p className="text-xs font-bold uppercase tracking-[0.1em] text-blue-200">Verified recipient</p><p className="mt-1 text-lg font-extrabold">{beneficiaryName(claim.beneficiary)}</p></div>
          <dl className="grid gap-px bg-line text-sm sm:grid-cols-3"><div className="bg-white p-4"><dt className="text-xs font-semibold text-muted-copy">Queue</dt><dd className="mt-1 font-bold tabular-nums text-ink">#{claim.schedule.queueNumber}</dd></div><div className="bg-white p-4"><dt className="text-xs font-semibold text-muted-copy">Recorded value</dt><dd className="mt-1 font-bold tabular-nums text-ink">{money.format(Number(claim.allocation.amount))}</dd></div><div className="bg-white p-4"><dt className="text-xs font-semibold text-muted-copy">Identity checks</dt><dd className="mt-1 font-bold text-ink">{humanize(claim.verificationMethod)}</dd></div></dl>
        </section>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div><label htmlFor="release-evidence-type" className="ga-label">Evidence type</label><select id="release-evidence-type" value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)} className="ga-input mt-2 cursor-pointer">{releaseEvidenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><label htmlFor="release-evidence-reference" className="ga-label">Evidence reference</label><input id="release-evidence-reference" required minLength={3} maxLength={120} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Example: LOG-2026-0917-004" className="ga-input mt-2" /><p className="mt-2 text-xs leading-5 text-muted-copy">Use the reference printed on the official log, acknowledgment, or approved evidence file.</p></div>
        </div>
        <div className="mt-5"><label htmlFor="release-notes" className="ga-label">Release notes <span className="font-normal text-muted-copy">(optional)</span></label><textarea id="release-notes" maxLength={1000} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record package quantity or a concise handover note. Do not enter sensitive identity data." className="ga-input mt-2 min-h-24 resize-y py-3" /></div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-success-soft p-4 text-sm leading-6 text-copy"><input type="checkbox" checked={beneficiaryAcknowledged} onChange={(event) => setBeneficiaryAcknowledged(event.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-green" /><span><strong className="text-ink">Handover completed.</strong> I confirm the named beneficiary received the physical assistance and the evidence reference above identifies the release record.</span></label>
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-warning-soft p-3 text-xs font-semibold leading-5 text-brand-amber"><Icon name="info" className="mt-0.5 size-4 shrink-0" />A claim can be released exactly once. Correct errors through the dispute workflow; do not create another release.</p>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm font-semibold text-brand-red">{error}</p>}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-muted-copy">The system records your staff identity and Philippine timestamp.</p><div className="flex flex-col-reverse gap-3 sm:flex-row"><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={busy || !beneficiaryAcknowledged} className="ga-btn-primary">{busy ? <LoadingLabel>Recording release...</LoadingLabel> : <><Icon name="check" /> Mark assistance released</>}</button></div></div>
      </form>
    </dialog>
  )
}

function ReviewDecisionDialog({ action, dispute, onClose, onNavigate, onSubmit }) {
  const dialogRef = useRef(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const physicalRelease = dispute.claim.releaseMethod === 'PHYSICAL_GOODS' || dispute.claim.distribution?.deliveryMode === 'PHYSICAL_GOODS'
  const needsReversal = action === 'COMPLETE_REMEDIATION' && dispute.claim.claimStatus === 'CLAIMED' && !physicalRelease
  const content = {
    CONFIRM_CLAIM: ['Confirm recorded claim', 'Record why the face, signature, receipt, and ledger evidence support the original claim.', 'Confirm claim'],
    REFER_FOR_INVESTIGATION: ['Refer for investigation', 'Explain the identity, document, or transaction concern that needs formal investigation.', 'Refer case'],
    COMPLETE_REMEDIATION: ['Complete beneficiary remediation', 'Describe the correction, reversal, communication, and documents completed for the beneficiary.', 'Resolve as remediated'],
  }[action]

  useEffect(() => { dialogRef.current?.showModal() }, [])

  async function submit(event) {
    event.preventDefault()
    if (reviewNotes.trim().length < 20) return setError('Provide at least 20 characters of review evidence and reasoning.')
    setBusy(true)
    setError('')
    try {
      await onSubmit({ action, reviewNotes: reviewNotes.trim() })
      dialogRef.current?.close()
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); dialogRef.current?.close() }} onClose={onClose} aria-labelledby="review-decision-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/60">
      <form onSubmit={submit} className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Independent decision</p><h2 id="review-decision-title" className="mt-2 text-2xl font-extrabold">{content[0]}</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Case {dispute.referenceNo}</p></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close review decision" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line hover:bg-slate-50"><Icon name="close" /></button></div>
        {needsReversal ? <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-warning-soft p-4"><p className="font-bold text-ink">Reverse the completed credit first</p><p className="mt-2 text-sm leading-6 text-copy">A claimed record cannot be closed as remediated while its ledger credit remains completed. Reverse it in the ledger, then return to this case.</p><button type="button" onClick={() => onNavigate('/dswd/ledger')} className="ga-btn-secondary mt-4">Open ledger</button></div> : <><p className="mt-5 text-sm leading-6 text-copy">{content[1]}</p>{action === 'COMPLETE_REMEDIATION' && physicalRelease && <p className="mt-4 rounded-lg border border-blue-200 bg-info-soft p-3 text-sm leading-6 text-copy"><strong className="text-ink">Physical release:</strong> No wallet reversal is required. Resolving this case voids the claim while preserving the original handover evidence.</p>}<div className="mt-5"><label htmlFor="review-notes" className="ga-label">Review notes and evidence</label><textarea id="review-notes" required minLength={20} maxLength={2000} rows={6} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} className="ga-input mt-2 min-h-40 resize-y py-3" /><p className="mt-2 text-xs text-muted-copy">Decision reasoning becomes part of the permanent audit trail.</p></div></>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm font-semibold text-brand-red">{error}</p>}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Close</button>{!needsReversal && <button type="submit" disabled={busy} className={action === 'CONFIRM_CLAIM' ? 'ga-btn-primary' : 'ga-btn-secondary'}>{busy ? <LoadingLabel>Recording decision...</LoadingLabel> : content[2]}</button>}</div>
      </form>
    </dialog>
  )
}

function ClaimActions({ busy, canRelease, claim, onDispute, onReceipt, onRelease }) {
  const activeDispute = claim.disputes?.find((item) => activeDisputeStatuses.includes(item.status))
  const receiptReady = ['CLAIMED', 'VOIDED'].includes(claim.claimStatus)
  const releaseReady = canRelease && claim.claimStatus === 'VERIFIED' && !activeDispute
  return <div className="flex flex-wrap justify-end gap-2">{canRelease && <button type="button" disabled={busy || !releaseReady} title={activeDispute ? 'Resolve the active dispute before release.' : claim.claimStatus !== 'VERIFIED' ? 'Only a verified, unreleased claim can be released.' : undefined} onClick={() => onRelease(claim)} className="min-h-10 rounded-lg bg-brand-blue px-3 text-xs font-bold text-white hover:bg-brand-blue-hover disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoadingLabel>Recording...</LoadingLabel> : claim.claimStatus === 'CLAIMED' ? 'Released' : 'Mark released'}</button>}<button type="button" disabled={busy || !receiptReady} title={receiptReady ? undefined : 'Receipt becomes available after claim settlement.'} onClick={() => onReceipt(claim)} className="min-h-10 rounded-lg border border-line bg-white px-3 text-xs font-bold text-brand-blue hover:border-brand-blue hover:bg-info-soft disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoadingLabel>Loading...</LoadingLabel> : claim.receipt ? 'View receipt' : 'Issue receipt'}</button><button type="button" disabled={Boolean(activeDispute) || !['VERIFIED', 'CLAIMED', 'VOIDED'].includes(claim.claimStatus)} onClick={() => onDispute(claim)} className="min-h-10 rounded-lg border border-line bg-white px-3 text-xs font-bold text-copy hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">{activeDispute ? 'Dispute active' : 'File dispute'}</button></div>
}

function ClaimsView({ busyClaimId, canRelease, claims, onDispute, onReceipt, onRelease }) {
  if (!claims.length) return <EmptyState title="No matching claim records" copy="Try another status, search term, or distribution event." />
  return <><ul className="divide-y divide-line md:hidden">{claims.map((claim) => <li key={claim.claimId} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold text-ink">{beneficiaryName(claim.beneficiary)}</p><p className="mt-1 text-sm text-muted-copy">Queue #{claim.schedule.queueNumber} · {claim.beneficiary.barangay?.barangayName}</p></div><StatusBadge status={claim.claimStatus} /></div><dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm"><div><dt className="text-muted-copy">Amount</dt><dd className="mt-1 font-bold text-ink">{money.format(Number(claim.allocation.amount))}</dd></div><div><dt className="text-muted-copy">Verification</dt><dd className="mt-1 font-bold text-ink">{humanize(claim.verificationMethod)}</dd></div><div className="col-span-2"><dt className="text-muted-copy">Release record</dt><dd className="mt-1 text-xs font-semibold text-ink">{claim.releasedAt ? `${humanize(claim.releaseMethod)} · ${dateTime.format(new Date(claim.releasedAt))}` : 'Awaiting authorized settlement'}</dd></div><div className="col-span-2"><dt className="text-muted-copy">Receipt / dispute</dt><dd className="mt-1 text-xs font-semibold text-ink">{claim.receipt?.receiptNo ?? claim.disputes?.[0]?.referenceNo ?? 'No accountability record yet'}</dd></div></dl><div className="mt-4"><ClaimActions busy={busyClaimId === claim.claimId} canRelease={canRelease} claim={claim} onDispute={onDispute} onReceipt={onReceipt} onRelease={onRelease} /></div></li>)}</ul><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1040px] text-left text-sm"><caption className="sr-only">Claim accountability records</caption><thead><tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><th className="px-5 py-3">Beneficiary</th><th className="px-5 py-3">Claim</th><th className="px-5 py-3">Verification</th><th className="px-5 py-3">Release record</th><th className="px-5 py-3">Accountability record</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-line">{claims.map((claim) => <tr key={claim.claimId} className="align-top hover:bg-slate-50"><td className="px-5 py-4"><p className="font-bold text-ink">{beneficiaryName(claim.beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">{claim.beneficiary.sitioPurok || 'No Sitio/Purok'} · Queue #{claim.schedule.queueNumber}</p></td><td className="px-5 py-4"><StatusBadge status={claim.claimStatus} /><p className="mt-2 font-bold tabular-nums text-ink">{money.format(Number(claim.allocation.amount))}</p></td><td className="px-5 py-4"><p className="font-semibold text-ink">{humanize(claim.verificationMethod)}</p><p className="mt-1 text-xs text-muted-copy">Face {claim.biometricVerified ? 'verified' : 'not recorded'} · Signature {claim.signatureVerified ? 'verified' : 'not recorded'}</p></td><td className="px-5 py-4">{claim.releasedAt ? <><p className="font-bold text-brand-green">{humanize(claim.releaseMethod)}</p><p className="mt-1 text-xs text-muted-copy">{dateTime.format(new Date(claim.releasedAt))} · {claim.releasedBy?.fullName}</p></> : <p className="text-xs font-semibold text-brand-amber">Awaiting settlement</p>}</td><td className="px-5 py-4"><p className="max-w-64 truncate font-mono text-xs font-bold text-ink">{claim.receipt?.receiptNo ?? 'No receipt issued'}</p>{claim.disputes?.[0] && <p className="mt-2 text-xs font-semibold text-brand-amber">{claim.disputes[0].referenceNo} · {humanize(claim.disputes[0].status)}</p>}</td><td className="px-5 py-4"><ClaimActions busy={busyClaimId === claim.claimId} canRelease={canRelease} claim={claim} onDispute={onDispute} onReceipt={onReceipt} onRelease={onRelease} /></td></tr>)}</tbody></table></div></>
}

function DisputeActions({ busy, dispute, session, onDecision, onStart }) {
  const reviewer = ['SYSTEM_ADMIN', 'DSWD_STAFF'].includes(session.user.role)
  const ownCase = dispute.filedBy.userId === session.user.userId
  if (!reviewer) return <span className="text-xs text-muted-copy">DSWD/Admin review</span>
  if (dispute.status === 'OPEN') return <button type="button" disabled={busy || ownCase} title={ownCase ? 'A different staff member must review this case.' : undefined} onClick={() => onStart(dispute)} className="ga-btn-secondary min-h-10 px-3 text-xs">{busy ? <LoadingLabel>Assigning...</LoadingLabel> : ownCase ? 'Independent reviewer required' : 'Start review'}</button>
  if (dispute.status === 'RESOLVED') return <span className="text-xs font-bold text-brand-green">Decision recorded</span>
  if (dispute.assignedTo?.userId !== session.user.userId) return <span className="text-xs text-muted-copy">Assigned to {dispute.assignedTo?.fullName ?? 'reviewer'}</span>
  return <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => onDecision(dispute, 'CONFIRM_CLAIM')} className="min-h-10 rounded-lg bg-brand-blue px-3 text-xs font-bold text-white hover:bg-brand-blue-hover">Confirm record</button><button type="button" disabled={busy} onClick={() => onDecision(dispute, 'REFER_FOR_INVESTIGATION')} className="min-h-10 rounded-lg border border-line px-3 text-xs font-bold text-copy hover:bg-slate-50">Refer</button><button type="button" disabled={busy} onClick={() => onDecision(dispute, 'COMPLETE_REMEDIATION')} className="min-h-10 rounded-lg border border-emerald-200 px-3 text-xs font-bold text-brand-green hover:bg-success-soft">Remediate</button></div>
}

function DisputesView({ busyDisputeId, disputes, onDecision, onStart, session }) {
  if (!disputes.length) return <EmptyState title="No matching disputes" copy="Filed beneficiary concerns and review decisions will appear here." />
  return <><ul className="divide-y divide-line md:hidden">{disputes.map((dispute) => <li key={dispute.disputeId} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold text-ink">{beneficiaryName(dispute.claim.beneficiary)}</p><p className="mt-1 font-mono text-xs font-bold text-muted-copy">{dispute.referenceNo}</p></div><StatusBadge status={dispute.status} /></div><p className="mt-4 text-sm font-bold text-ink">{humanize(dispute.reasonCode)}</p><p className="mt-2 line-clamp-3 text-sm leading-6 text-copy">{dispute.statement}</p><p className="mt-3 text-xs text-muted-copy">Filed {dateTime.format(new Date(dispute.filedAt))} by {dispute.filedBy.fullName}</p><div className="mt-4"><DisputeActions busy={busyDisputeId === dispute.disputeId} dispute={dispute} session={session} onDecision={onDecision} onStart={onStart} /></div></li>)}</ul><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1040px] text-left text-sm"><caption className="sr-only">Claim dispute cases</caption><thead><tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><th className="px-5 py-3">Case</th><th className="px-5 py-3">Beneficiary</th><th className="px-5 py-3">Concern</th><th className="px-5 py-3">Reviewer</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Decision</th></tr></thead><tbody className="divide-y divide-line">{disputes.map((dispute) => <tr key={dispute.disputeId} className="align-top hover:bg-slate-50"><td className="px-5 py-4"><p className="font-mono text-xs font-bold text-ink">{dispute.referenceNo}</p><p className="mt-1 text-xs text-muted-copy">{dateTime.format(new Date(dispute.filedAt))}</p></td><td className="px-5 py-4"><p className="font-bold text-ink">{beneficiaryName(dispute.claim.beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">Claim: {humanize(dispute.claim.claimStatus)} · {money.format(Number(dispute.claim.allocation.amount))}</p></td><td className="max-w-80 px-5 py-4"><p className="font-bold text-ink">{humanize(dispute.reasonCode)}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-copy">{dispute.statement}</p></td><td className="px-5 py-4"><p className="font-semibold text-ink">{dispute.assignedTo?.fullName ?? 'Unassigned'}</p><p className="mt-1 text-xs text-muted-copy">Filed by {dispute.filedBy.fullName}</p></td><td className="px-5 py-4"><StatusBadge status={dispute.status} />{dispute.outcome && <p className="mt-2 text-xs font-semibold text-copy">{humanize(dispute.outcome)}</p>}</td><td className="px-5 py-4"><DisputeActions busy={busyDisputeId === dispute.disputeId} dispute={dispute} session={session} onDecision={onDecision} onStart={onStart} /></td></tr>)}</tbody></table></div></>
}

function EmptyState({ copy, title }) {
  return <div className="px-5 py-14 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-brand-blue"><Icon name="receipt" /></span><h3 className="mt-4 text-lg font-extrabold text-ink">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-copy">{copy}</p></div>
}

export default function ClaimAccountabilityPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const [initialQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return { distributionId: params.get('distribution') ?? '', claimId: params.get('claim') ?? '' }
  })
  const autoOpenedClaim = useRef('')
  const [distributions, setDistributions] = useState([])
  const [selectedId, setSelectedId] = useState(initialQuery.distributionId)
  const [view, setView] = useState('claims')
  const [draftSearch, setDraftSearch] = useState(initialQuery.claimId)
  const [draftStatus, setDraftStatus] = useState('')
  const [filters, setFilters] = useState({ search: initialQuery.claimId, status: '' })
  const [page, setPage] = useState(1)
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
    let active = true
    requestDistributionList(session.accessToken, { page: 1, pageSize: 100 })
      .then((data) => {
        if (!active) return
        setDistributions(data.distributions)
        setSelectedId((current) => data.distributions.some((item) => item.distributionId === current) ? current : data.distributions[0]?.distributionId ?? '')
        if (data.distributions.length === 0) setLoading(false)
      })
      .catch((requestError) => {
        if (!active) return
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        setError(getAuthErrorMessage(requestError))
        setLoading(false)
      })
    return () => { active = false }
  }, [onSessionExpired, session.accessToken])

  useEffect(() => {
    if (!selectedId) return undefined
    let active = true
    const request = view === 'claims' ? requestDistributionClaims : requestClaimDisputes
    request(session.accessToken, selectedId, { page, pageSize: 20, ...filters })
      .then((data) => {
        if (!active) return
        const nextRecords = view === 'claims' ? data.claims : data.disputes
        setRecords(nextRecords)
        setSummary(data.summary)
        setPagination(data.pagination)
        const claimId = initialQuery.claimId
        const directClaim = view === 'claims' && claimId && autoOpenedClaim.current !== claimId
          ? nextRecords.find((item) => item.claimId === claimId)
          : null
        if (directClaim && ['CLAIMED', 'VOIDED'].includes(directClaim.claimStatus)) {
          autoOpenedClaim.current = claimId
          openReceipt(directClaim)
        }
      })
      .catch((requestError) => {
        if (!active) return
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        setError(getAuthErrorMessage(requestError))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, initialQuery.claimId, onSessionExpired, openReceipt, page, refresh, selectedId, session.accessToken, view])

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
      setRefresh((value) => value + 1)
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) onSessionExpired()
      throw requestError
    } finally {
      setBusyClaimId('')
    }
  }

  async function startReview(dispute) {
    setBusyDisputeId(dispute.disputeId)
    try {
      await reviewClaimDispute(session.accessToken, selectedId, dispute.disputeId, { action: 'START_REVIEW' })
      toast.success('Independent review assigned to you')
      setRefresh((value) => value + 1)
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      toast.error('Unable to start review', { description: getAuthErrorMessage(requestError) })
    } finally {
      setBusyDisputeId('')
    }
  }

  async function submitDecision(payload) {
    await reviewClaimDispute(session.accessToken, selectedId, decision.dispute.disputeId, payload)
    toast.success('Review decision recorded')
    setRefresh((value) => value + 1)
  }

  const selectedDistribution = distributions.find((item) => item.distributionId === selectedId)
  const statusOptions = view === 'claims' ? claimStatuses : disputeStatuses
  const counts = summary.countsByStatus ?? {}
  const total = pagination?.total ?? 0
  const canRelease = session.user.role === 'BARANGAY_FACILITATOR' && selectedDistribution?.deliveryMode === 'PHYSICAL_GOODS'

  return (
    <DashboardShell breadcrumbs={['Operations', 'Claims', 'Accountability']} currentPath="/claim-accountability" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Claim accountability" user={session.user}>
      <header className="flex flex-col gap-5 border-b border-line pb-7 xl:flex-row xl:items-end xl:justify-between"><div><p className="ga-eyebrow">Release and accountability control</p><h1 className="ga-page-title">Settle each claim with evidence.</h1><p className="ga-page-copy">Record an authorized physical handover, issue a tamper-evident receipt, and preserve beneficiary concerns for independent review.</p></div><div className="grid shrink-0 grid-cols-3 overflow-hidden rounded-xl border border-line bg-white shadow-sm"><div className="px-4 py-3 text-center"><p className="text-xl font-black text-brand-blue">1</p><p className="text-xs font-bold text-copy">Release</p></div><div className="border-x border-line px-4 py-3 text-center"><p className="text-xl font-black text-brand-green">2</p><p className="text-xs font-bold text-copy">Receipt</p></div><div className="px-4 py-3 text-center"><p className="text-xl font-black text-brand-amber">3</p><p className="text-xs font-bold text-copy">Resolve</p></div></div></header>

      <section className="ga-card mt-6 p-4 sm:p-5" aria-label="Claim accountability filters">
        <form onSubmit={applyFilters} className="grid gap-4 lg:grid-cols-[minmax(16rem,1.2fr)_minmax(12rem,0.7fr)_minmax(12rem,0.7fr)_auto]">
          <div><label htmlFor="accountability-distribution" className="ga-label">Distribution event</label><select id="accountability-distribution" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setRecords(event.target.value ? null : []); setLoading(Boolean(event.target.value)); setError(''); setPage(1) }} className="ga-input mt-2 cursor-pointer font-semibold"><option value="">Select a distribution</option>{distributions.map((item) => <option key={item.distributionId} value={item.distributionId}>{item.title} — {dateOnly.format(new Date(item.distributionDate))}</option>)}</select></div>
          <div><label htmlFor="accountability-search" className="ga-label">Search</label><input id="accountability-search" type="search" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Name or reference" className="ga-input mt-2" /></div>
          <div><label htmlFor="accountability-status" className="ga-label">Status</label><select id="accountability-status" value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)} className="ga-input mt-2 cursor-pointer"><option value="">All statuses</option>{statusOptions.filter(Boolean).map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select></div>
          <button type="submit" disabled={!selectedId} className="ga-btn-primary self-end">Apply</button>
        </form>
        {selectedDistribution && <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-copy"><strong className="text-ink">Current scope:</strong><span>{selectedDistribution.barangay?.barangayName} · {selectedDistribution.location} · {humanize(selectedDistribution.status)}</span><span className="rounded-full border border-blue-200 bg-info-soft px-2.5 py-1 text-xs font-bold text-brand-blue">{humanize(selectedDistribution.deliveryMode)}</span></div>}
      </section>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div role="tablist" aria-label="Accountability record type" className="inline-flex w-full rounded-xl border border-line bg-white p-1 shadow-sm sm:w-auto"><button type="button" role="tab" aria-selected={view === 'claims'} onClick={() => changeView('claims')} className={`min-h-11 flex-1 rounded-lg px-5 text-sm font-bold sm:flex-none ${view === 'claims' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}>Claims & receipts</button><button type="button" role="tab" aria-selected={view === 'disputes'} onClick={() => changeView('disputes')} className={`min-h-11 flex-1 rounded-lg px-5 text-sm font-bold sm:flex-none ${view === 'disputes' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}>Dispute review</button></div>
        <p className="text-sm font-semibold text-muted-copy">{total} matching {view === 'claims' ? 'claim' : 'case'} record(s)</p>
      </div>

      {view === 'disputes' && <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Dispute status summary">{['OPEN', 'UNDER_REVIEW', 'REFERRED', 'RESOLVED'].map((status) => <div key={status} className="ga-card-flat p-4"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">{humanize(status)}</p><p className="mt-2 text-2xl font-black tabular-nums text-ink">{counts[status] ?? 0}</p></div>)}</section>}

      {loading ? <AccountabilitySkeleton /> : error ? <section className="ga-card mt-6 border-amber-200 p-6" role="alert"><p className="ga-eyebrow text-brand-amber">Records unavailable</p><h2 className="mt-2 text-xl font-extrabold">We could not load this accountability register</h2><p className="mt-2 text-sm leading-6 text-copy">{error}</p><button type="button" onClick={() => { setLoading(true); setError(''); setRefresh((value) => value + 1) }} className="ga-btn-primary mt-5">Try again</button></section> : <section className="ga-card mt-5 overflow-hidden" aria-live="polite">{view === 'claims' ? <ClaimsView busyClaimId={busyClaimId} canRelease={canRelease} claims={records ?? []} onDispute={setDisputeClaim} onReceipt={openReceipt} onRelease={setReleaseClaim} /> : <DisputesView busyDisputeId={busyDisputeId} disputes={records ?? []} onDecision={(dispute, action) => setDecision({ dispute, action })} onStart={startReview} session={session} />}</section>}

      {pagination?.totalPages > 1 && <nav aria-label={`${view} pagination`} className="mt-5 flex items-center justify-between gap-4"><button type="button" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage((value) => value - 1) }} className="ga-btn-secondary">Previous</button><p className="text-sm font-bold text-copy">Page {pagination.page} of {pagination.totalPages}</p><button type="button" disabled={page >= pagination.totalPages || loading} onClick={() => { setLoading(true); setPage((value) => value + 1) }} className="ga-btn-secondary">Next</button></nav>}

      {receipt && <ClaimReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} onDispute={() => { const claim = records?.find((item) => item.claimId === receipt.claimId); setReceipt(null); if (claim) setDisputeClaim(claim) }} onPrint={async () => { const updated = await recordClaimReceiptPrint(session.accessToken, selectedId, receipt.claimId); setReceipt(updated) }} />}
      {releaseClaim && <PhysicalReleaseDialog claim={releaseClaim} onClose={() => setReleaseClaim(null)} onSubmit={releasePhysicalAssistance} />}
      {disputeClaim && <FileDisputeDialog claim={disputeClaim} onClose={() => setDisputeClaim(null)} onSubmit={fileDispute} />}
      {decision && <ReviewDecisionDialog action={decision.action} dispute={decision.dispute} onClose={() => setDecision(null)} onNavigate={onNavigate} onSubmit={submitDecision} />}
    </DashboardShell>
  )
}
