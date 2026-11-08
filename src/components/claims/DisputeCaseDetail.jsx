import { useEffect, useRef, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestClaimDispute, requestDistribution, requestDistributionClaim } from '../../auth/staffAuth.js'
import { claimChecks, disputeLedgerHref, disputeReviewState } from '../../utils/claimWorkflow.js'
import { LoadingLabel } from '../ui/spinner.jsx'

const humanize = (value) => value ? value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) : 'Not recorded'
const personName = (person) => [person?.firstName, person?.middleName, person?.lastName].filter(Boolean).join(' ') || 'Name not recorded'
const dateFormat = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const date = (value) => value && Number.isFinite(new Date(value).getTime()) ? `${dateFormat.format(new Date(value))} PHT` : 'Not recorded'
const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

function RecordFields({ items }) {
  return <dl className="grid gap-x-6 gap-y-4 text-sm min-[380px]:grid-cols-2">{items.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-copy">{label}</dt><dd className="mt-1 break-words font-semibold leading-6 text-ink">{value === '' || value == null ? 'Not recorded' : value}</dd></div>)}</dl>
}

export default function DisputeCaseDetail({ caseId, distributionId, refresh, session, busy, onStart, onDecision, onBack, onNavigate, onSessionExpired }) {
  const heading = useRef(null)
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [completedRequest, setCompletedRequest] = useState('')
  const requestKey = `${refresh}/${retry}`
  const loading = completedRequest !== requestKey
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    let active = true
    async function load() {
      const dispute = await requestClaimDispute(session.accessToken, distributionId, caseId)
      const [claim, distribution] = await Promise.all([
        requestDistributionClaim(session.accessToken, distributionId, dispute.claim.claimId),
        requestDistribution(session.accessToken, distributionId),
      ])
      if (claim.claimId !== dispute.claim.claimId || claim.distributionId !== distributionId || distribution.distributionId !== distributionId) throw new Error('The claim evidence does not match this case and event. Refresh before continuing.')
      if (active) {
        setSnapshot({ dispute: { ...dispute, claim }, distribution, updatedAt: new Date() })
        setError('')
      }
    }
    load().catch((issue) => {
      if (!active) return
      if (isSessionExpiredError(issue)) onSessionExpired()
      else setError(getAuthErrorMessage(issue))
    }).finally(() => { if (active) setCompletedRequest(requestKey) })
    return () => { active = false }
  }, [caseId, distributionId, onSessionExpired, requestKey, session.accessToken])

  const dispute = snapshot?.dispute
  const claim = dispute?.claim
  const distribution = snapshot?.distribution
  const state = dispute && disputeReviewState(dispute, session.user)
  const disabled = busy || loading || Boolean(error)
  const physical = claim?.releaseMethod === 'PHYSICAL_GOODS' || distribution?.deliveryMode === 'PHYSICAL_GOODS'
  const ledgerAllowed = ['DSWD_STAFF', 'SYSTEM_ADMIN'].includes(session.user.role)
  const returnTo = window.location.pathname + window.location.search
  const claimUrl = new URL(window.location.href)
  claimUrl.searchParams.delete('case')
  claimUrl.searchParams.delete('view')
  claimUrl.searchParams.delete('status')
  claimUrl.searchParams.delete('page')
  if (claim) { claimUrl.searchParams.set('claim', claim.claimId); claimUrl.searchParams.set('search', claim.claimId) }
  const claimHref = claimUrl.pathname + claimUrl.search

  return <section className="mt-5" aria-label="Case details" aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={onBack} className="ga-admin-link min-h-11">Back to cases</button>
      <button type="button" disabled={loading || busy} onClick={() => setRetry((value) => value + 1)} className="ga-btn-secondary">{loading ? <LoadingLabel>Refreshing case...</LoadingLabel> : 'Refresh case'}</button>
    </div>
    <h2 ref={heading} tabIndex={-1} className="sr-only">Case details</h2>
    {error && <div role="alert" className="mt-4 border-l-4 border-brand-amber bg-warning-soft p-4 text-sm leading-6"><p className="font-bold">Case details could not be refreshed</p><p className="mt-1">{error}</p>{snapshot && <p className="mt-2">Previously loaded details remain visible. Refresh the case before taking action.</p>}</div>}
    {!snapshot ? <p role="status" className="mt-5 border border-line bg-white p-6 text-sm">{loading ? <LoadingLabel>Loading statement and claim evidence...</LoadingLabel> : 'Case details are unavailable. Refresh the case or return to the list.'}</p> : <>
      <header className="mt-4 border border-line border-t-4 border-t-brand-navy bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="break-all text-sm font-semibold text-muted-copy">{dispute.referenceNo}</p><h3 className="mt-2 break-words text-2xl font-bold text-ink">{personName(claim.beneficiary)}</h3></div>
          <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${dispute.status === 'RESOLVED' ? 'ga-status-success' : dispute.status === 'REFERRED' ? 'border-blue-200 bg-info-soft text-brand-blue' : 'ga-status-warning'}`}>{humanize(dispute.status)}</span>
        </div>
        <p className="mt-2 break-words text-sm leading-6 text-copy">{distribution.title} · {distribution.program?.programName || 'Program not recorded'}</p>
        <div className="mt-4 border-t border-line pt-4"><RecordFields items={[
          ['Service area', distribution.barangay?.barangayName],
          ['Event date', distribution.distributionDate ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(distribution.distributionDate)) : null],
          ['Recorded value', claim.allocation?.amount != null ? money.format(Number(claim.allocation.amount)) : null],
          ['Assigned reviewer', dispute.assignedTo?.fullName || 'Unassigned'],
        ]} /></div>
        <p className="mt-4 text-xs leading-5 text-muted-copy">Last checked {date(snapshot.updatedAt)}</p>
      </header>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,1fr)]">
        <div className="min-w-0 space-y-5">
          <section className="border border-line bg-white p-5 sm:p-6" aria-labelledby="case-statement-heading">
            <h3 id="case-statement-heading" className="text-lg font-bold text-ink">Beneficiary statement</h3>
            <p className="mt-2 text-sm font-semibold text-copy">{humanize(dispute.reasonCode)}</p>
            <p className="mt-4 whitespace-pre-wrap break-words border-l-2 border-line pl-4 text-base leading-7 text-ink">{dispute.statement || 'Not recorded'}</p>
            <p className="mt-4 text-sm leading-6 text-muted-copy">Filed by {dispute.filedBy?.fullName || 'Staff member not recorded'} · {date(dispute.filedAt)}</p>
          </section>

          <section className="border border-line bg-white p-5 sm:p-6" aria-labelledby="case-evidence-heading">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="case-evidence-heading" className="text-lg font-bold text-ink">Claim evidence</h3><a href={claimHref} onClick={(event) => { event.preventDefault(); onNavigate(claimHref) }} className="ga-admin-link min-h-11">Open claim record</a></div>
            <p className="mt-1 text-sm leading-6 text-muted-copy">{physical ? 'Physical assistance · Barangay handover record' : 'Simulated wallet · DSWD credit record'}</p>
            <div className="mt-4"><RecordFields items={[
              ['Claim status', humanize(claim.claimStatus)], ['Queue number', claim.schedule?.queueNumber],
              ['Verification recorded by', claim.verifiedBy?.fullName], ['Receipt reference', claim.receipt?.receiptNo],
            ]} /></div>
            <h4 className="mt-5 border-t border-line pt-4 text-sm font-bold text-ink">Verification requirements</h4>
            <dl className="mt-3 space-y-3 text-sm">{claimChecks(claim, distribution).map((check) => <div key={check.key} className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-copy">{check.label}</dt><dd className={check.required && !check.complete ? 'font-semibold text-brand-amber' : 'font-semibold text-ink'}>{check.status}</dd></div>)}</dl>
            <div className="mt-5 border-t border-line pt-4"><RecordFields items={[
              [physical ? 'Released at' : 'Credit recorded at', date(claim.releasedAt || claim.claimedAt)],
              [physical ? 'Release recorded by' : 'Credit recorded by', claim.releasedBy?.fullName],
              ...(physical ? [['Evidence type', humanize(claim.releaseEvidenceType)], ['Evidence reference', claim.releaseEvidenceReference]] : []),
            ]} /></div>
            {physical && <div className="mt-4"><h4 className="text-sm text-muted-copy">Handover notes</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{claim.releaseNotes || 'Not recorded'}</p></div>}
            {!physical && <p className="mt-4 text-sm leading-6 text-muted-copy">No real money is transferred. Check the matching transaction in the ledger for its current credit or reversal status.</p>}
            {!physical && ledgerAllowed && <a href={disputeLedgerHref(distributionId, dispute, returnTo)} onClick={(event) => { event.preventDefault(); onNavigate(event.currentTarget.getAttribute('href')) }} className="ga-admin-link mt-2 min-h-11">Review matching ledger</a>}
            <details className="mt-4 border-t border-line pt-2 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-semibold text-copy">Claim reference</summary><p className="break-all pb-2 text-muted-copy">{claim.claimId}</p></details>
          </section>

          <section className="border border-line bg-white p-5 sm:p-6" aria-labelledby="case-outcome-heading">
            <h3 id="case-outcome-heading" className="text-lg font-bold text-ink">Recorded review</h3>
            <p className="mt-2 text-sm leading-6 text-muted-copy">Latest saved review details for this case.</p>
            <div className="mt-4"><RecordFields items={[
              ['Outcome', dispute.outcome ? humanize(dispute.outcome) : 'No decision recorded'],
              ['Decision recorded by', dispute.reviewedBy?.fullName],
              ['Last review activity', date(dispute.reviewedAt)],
              ['Resolved at', date(dispute.resolvedAt)],
            ]} /></div>
            <h4 className="mt-5 text-sm font-semibold text-ink">Review notes and evidence</h4>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-copy">{dispute.reviewNotes || 'No review notes recorded.'}</p>
          </section>
        </div>

        <aside className="min-w-0 border border-line border-t-4 border-t-brand-navy bg-white p-5 sm:p-6" aria-label="Case next action">
          <h3 className="text-lg font-bold text-ink">{state.title}</h3><p className="mt-2 text-sm leading-6 text-copy">{state.next}</p>
          {state.canStart && <button type="button" disabled={disabled} onClick={() => onStart(dispute)} className="ga-btn-primary mt-5 w-full">{busy ? <LoadingLabel>Assigning review...</LoadingLabel> : 'Start review'}</button>}
          {state.canDecide && <div className="mt-5 space-y-5">
            <div className="border-t border-line pt-4"><p className="text-sm leading-6 text-copy">Evidence supports the original claim.</p><button type="button" disabled={disabled} onClick={() => onDecision(dispute, 'CONFIRM_CLAIM')} className="ga-btn-secondary mt-2 w-full">Confirm record</button></div>
            <div className="border-t border-line pt-4"><p className="text-sm leading-6 text-copy">Further investigation is needed.</p><button type="button" disabled={disabled} onClick={() => onDecision(dispute, 'REFER_FOR_INVESTIGATION')} className="ga-btn-secondary mt-2 w-full">Refer for investigation</button></div>
            <div className="border-t border-line pt-4"><p className="text-sm leading-6 text-copy">Corrective steps have been completed for the beneficiary.</p>{state.needsReversal && <p className="mt-2 border-l-2 border-brand-amber pl-3 text-sm leading-6 text-ink">Before remediation, {session.user.role === 'DSWD_STAFF' ? 'reverse the completed credit in the ledger' : 'ask DSWD staff to reverse the completed credit'}. Return here to record the outcome.</p>}<button type="button" disabled={disabled} onClick={() => onDecision(dispute, 'COMPLETE_REMEDIATION')} className="ga-btn-secondary mt-2 w-full">Review remediation</button></div>
            <p className="text-xs leading-5 text-muted-copy">Each decision requires review notes. Choosing an action opens a confirmation form.</p>
          </div>}
          {(loading || error) && <p className="mt-4 text-sm leading-6 text-muted-copy">Review actions are unavailable until current case details are loaded.</p>}
        </aside>
      </div>
    </>}
  </section>
}
