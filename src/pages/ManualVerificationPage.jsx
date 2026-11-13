import { useEffect, useRef, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import ClaimSignaturePad from '../components/claims/ClaimSignaturePad.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { manualVerificationAllowed } from '../utils/claimVerification.js'
import { getAuthErrorMessage, isSessionExpiredError, requestOpenDistributions, requestAllDistributionSchedules, requestDistributionClaim, requestDistributionClaims, submitClaimSignature, verifyManualClaim } from '../auth/staffAuth.js'

const fullName = (person) => [person?.firstName, person?.middleName, person?.lastName].filter(Boolean).join(' ')
const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

export default function ManualVerificationPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const [query] = useState(() => new URLSearchParams(window.location.search))
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState(query.get('distribution') || '')
  const [beneficiaryId, setBeneficiaryId] = useState(query.get('beneficiary') || '')
  const [schedules, setSchedules] = useState([])
  const [claim, setClaim] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingClaim, setLoadingClaim] = useState(false)
  const [claimUnavailable, setClaimUnavailable] = useState(false)
  const [loadedClaimKey, setLoadedClaimKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [reviewRequest, setReviewRequest] = useState(null)
  const [signatureRequest, setSignatureRequest] = useState(null)
  const [evidenceReference, setEvidenceReference] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const errorRef = useRef(null)
  const canVerify = ['DSWD_STAFF', 'BARANGAY_FACILITATOR'].includes(session.user.role)
  const event = events.find((item) => item.distributionId === eventId)
  const selected = schedules.find((item) => item.beneficiaryId === beneficiaryId)
  const ready = Boolean(event && selected && !loading && !loadingClaim && !claimUnavailable && loadedClaimKey === `${eventId}:${beneficiaryId}`)
  const claimsHref = `/claim-accountability?${new URLSearchParams({ distribution: eventId, ...(claim ? { claim: claim.claimId } : {}) })}`

  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  useEffect(() => {
    let active = true
    if (!canVerify) return
    requestOpenDistributions(session.accessToken).then((data) => {
      if (!active) return
      const allowed = data.filter(manualVerificationAllowed)
      setEvents(allowed)
      if (!query.get('distribution') && allowed[0]) setEventId((current) => current || allowed[0].distributionId)
    }).catch((err) => { if (active) { if (isSessionExpiredError(err)) onSessionExpired(); else setError(getAuthErrorMessage(err)) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session.accessToken, canVerify, reload, onSessionExpired, query])

  useEffect(() => {
    let active = true
    if (!event || !canVerify) return
    requestAllDistributionSchedules(session.accessToken, eventId).then((rows) => {
      if (active) setSchedules(rows.filter((item) => ['SCHEDULED', 'CHECKED_IN'].includes(item.status)))
    }).catch((err) => { if (active) setError(getAuthErrorMessage(err)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session.accessToken, event, eventId, canVerify, reload])

  useEffect(() => {
    let active = true
    if (!event || (!beneficiaryId && !query.get('claim'))) return
    const request = beneficiaryId
      ? requestDistributionClaims(session.accessToken, eventId, { search: beneficiaryId }).then((data) => data.claims.find((item) => item.beneficiaryId === beneficiaryId) || null)
      : requestDistributionClaim(session.accessToken, eventId, query.get('claim'))
    request.then((saved) => { if (active) { setClaim(saved); setClaimUnavailable(false); setLoadedClaimKey(`${eventId}:${beneficiaryId}`); if (saved && !beneficiaryId) setBeneficiaryId(saved.beneficiaryId) } })
      .catch((err) => { if (active) { setClaimUnavailable(true); setError(getAuthErrorMessage(err)) } }).finally(() => { if (active) setLoadingClaim(false) })
    return () => { active = false }
  }, [session.accessToken, event, eventId, beneficiaryId, query, reload])

  function resetSelection(id, person = '') {
    setEventId(id); setBeneficiaryId(person); setClaim(null); setReviewRequest(null); setSignatureRequest(null)
    setSchedules((current) => id === eventId ? current : []); setLoading(id !== eventId); setLoadingClaim(Boolean(person)); setClaimUnavailable(false)
    setEvidenceReference(''); setNotes(''); setConfirmed(false); setError('')
  }

  async function saveReview(e) {
    e.preventDefault()
    if (!ready || busy || claim) return
    const request = reviewRequest || { body: { beneficiaryId, evidenceReference: evidenceReference.trim(), notes: notes.trim(), confirmed }, key: crypto.randomUUID() }
    if (request.body.evidenceReference.length < 3 || request.body.notes.length < 20 || !request.body.confirmed) { setError('Enter an evidence reference, at least 20 characters of review notes, and confirm the identity review.'); return }
    setReviewRequest(request); setBusy(true); setError('')
    try { const data = await verifyManualClaim(session.accessToken, eventId, request.body, request.key); setClaim(data.claim); setReviewRequest(null) }
    catch (err) { if (isSessionExpiredError(err)) onSessionExpired(); else setError(getAuthErrorMessage(err)); if (err.status >= 400 && err.status < 500) setReviewRequest(null) }
    finally { setBusy(false) }
  }

  async function saveAcknowledgment(signature) {
    if (busy || !claim) return
    const request = signatureRequest || { signature, key: crypto.randomUUID() }
    setSignatureRequest(request); setBusy(true); setError('')
    try { const data = await submitClaimSignature(session.accessToken, eventId, claim.claimId, request.signature, request.key); setClaim(data.claim); setSignatureRequest(null) }
    catch (err) { if (isSessionExpiredError(err)) onSessionExpired(); else setError(getAuthErrorMessage(err)) }
    finally { setBusy(false) }
  }

  return <DashboardShell currentPath="/manual-verification" pageTitle="Manual identity review" user={session.user} accessToken={session.accessToken} onLogout={onLogout} onNavigate={onNavigate}>
    <section aria-labelledby="manual-review-heading" className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <header className="ga-page-header border-b border-line pb-6"><p className="ga-eyebrow">Distribution day</p><h1 id="manual-review-heading" className="ga-page-title">Manual identity review</h1><p className="ga-page-copy">Review the scheduled person using the office-approved basis, then collect acknowledgment. Release is recorded separately.</p></header>
      {error && <div ref={errorRef} tabIndex={-1} role="alert" className="mt-5 rounded-lg border border-red-200 bg-danger-soft p-4"><p>{error}</p><button type="button" disabled={busy} onClick={() => { setError(''); setReload((v) => v + 1) }} className="ga-btn-secondary mt-3">Reload saved status</button></div>}
      {!canVerify ? <p role="alert" className="ga-card mt-6 p-5">Manual identity verification is assigned to authorized DSWD Staff and Barangay Facilitators.</p> : <>
        <section className="ga-card mt-6 p-5 sm:p-6"><label htmlFor="manual-event" className="ga-label">Open distribution event</label><select id="manual-event" value={eventId} disabled={busy || Boolean(reviewRequest) || Boolean(signatureRequest)} onChange={(e) => resetSelection(e.target.value)} className="ga-input mt-2"><option value="">Choose an event permitting manual review</option>{events.map((item) => <option key={item.distributionId} value={item.distributionId}>{item.title} — {item.distributionDate}</option>)}</select>
          {loading && <p role="status" className="mt-3"><LoadingLabel>Loading saved records...</LoadingLabel></p>}
          {!loading && !event && <p className="mt-3 text-sm leading-6 text-copy">Manual verification is not enabled for this selection. The Admin must configure its approved basis while the event is a draft. Existing combined checks remain required.</p>}
          {event && <><div className="mt-4 border-l-2 border-brand-blue bg-info-soft p-4"><p className="ga-label">Office-approved verification basis</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{event.manualVerificationBasis}</p></div><label htmlFor="manual-beneficiary" className="ga-label mt-5 block">Scheduled beneficiary</label><select id="manual-beneficiary" value={beneficiaryId} disabled={busy || loading || Boolean(reviewRequest) || Boolean(signatureRequest)} onChange={(e) => resetSelection(eventId, e.target.value)} className="ga-input mt-2"><option value="">Choose the person present</option>{schedules.map((item) => <option key={item.scheduleId} value={item.beneficiaryId}>Queue {item.queueNumber} — {fullName(item.beneficiary)}</option>)}</select>
            {selected && <p className="mt-3 text-sm leading-6 text-copy">{fullName(selected.beneficiary)} · Queue #{selected.queueNumber} · {selected.slot.location} · {dateTime.format(new Date(selected.slot.slotStart))} PHT</p>}</>}
        </section>
        {ready && !claim && <form onSubmit={saveReview} className="ga-card mt-5 p-5 sm:p-6"><h2 className="ga-section-heading">1. Record the identity review</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Use the approved instructions above. Record an office evidence reference, not a full identification number.</p><fieldset disabled={busy || Boolean(reviewRequest)} className="mt-5 space-y-4"><div><label htmlFor="manual-evidence" className="ga-label">Identity-review evidence reference</label><input id="manual-evidence" required minLength={3} maxLength={120} value={evidenceReference} onChange={(e) => setEvidenceReference(e.target.value)} className="ga-input mt-2" /></div><div><label htmlFor="manual-notes" className="ga-label">Review notes</label><textarea id="manual-notes" required minLength={20} maxLength={1000} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className="ga-input mt-2 py-3" /></div><label className="flex items-start gap-3 rounded-lg border border-line p-4 text-sm leading-6"><input type="checkbox" required checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-blue" /><span>I reviewed the person present, their appointment and the identity evidence using this event’s approved basis. Assistance has not been recorded as received.</span></label></fieldset><button type="submit" disabled={busy || !confirmed} className="ga-btn-primary mt-5">{busy ? <LoadingLabel>Saving review...</LoadingLabel> : reviewRequest ? 'Retry the same identity review' : 'Confirm review and continue to acknowledgment'}</button></form>}
        {claim?.verificationMethod === 'MANUAL' && claim.manualVerification?.confirmed && claim.claimStatus === 'PENDING' && <><section className="ga-card mt-5 p-5"><h2 className="ga-section-heading">Identity reviewed — acknowledgment pending</h2><p className="mt-2 text-sm">Evidence: {claim.manualVerification?.evidenceReference}. No release is recorded.</p></section><ClaimSignaturePad verificationMethod="MANUAL" beneficiaryName={fullName(claim.beneficiary)} busy={busy} retrying={Boolean(signatureRequest)} onSubmit={saveAcknowledgment} /></>}
        {claim && !(claim.verificationMethod === 'MANUAL' && claim.manualVerification?.confirmed && claim.claimStatus === 'PENDING') && <section role="status" className="ga-card mt-5 p-5"><h2 className="ga-section-heading">{claim.claimStatus === 'VERIFIED' ? 'Identity verified — awaiting release' : 'A claim is already recorded'}</h2><p className="mt-2 text-sm leading-6">Open the original claim for handover, release evidence and receipt. Verification does not record assistance as received.</p><button type="button" onClick={() => onNavigate(claimsHref)} className="ga-btn-primary mt-4">Open releases &amp; receipts</button></section>}
      </>}
      <button type="button" disabled={busy} onClick={() => onNavigate(claimsHref)} className="ga-btn-secondary mt-5">Return to claims and receipts</button>
    </section>
  </DashboardShell>
}
