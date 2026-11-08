import { useEffect, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestClaimDisputes, requestDistributionClaim } from '../../auth/staffAuth.js'
import { disputeReturnHref } from '../../utils/claimWorkflow.js'

export default function DisputeLedgerContext({ session, distributionId, onNavigate, onSessionExpired }) {
  const [query] = useState(() => new URLSearchParams(window.location.search))
  const [record, setRecord] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const reference = query.get('dispute')
  const eventId = query.get('distribution')
  const returnHref = disputeReturnHref(query.get('returnTo'), eventId)

  useEffect(() => {
    if (!reference || distributionId !== eventId) return undefined
    let active = true
    Promise.all([
      requestClaimDisputes(session.accessToken, eventId, { search: reference, page: 1, pageSize: 20 }),
      requestDistributionClaim(session.accessToken, eventId, query.get('claim')),
    ]).then(([data, claim]) => {
        const dispute = data.disputes.find((item) => item.referenceNo === reference && item.claim.claimId === query.get('claim'))
        if (!dispute || claim.distributionId !== eventId) throw new Error('This dispute could not be confirmed in the selected event. Return to the dispute register.')
        if (active) { setRecord(dispute); setError('') }
      }).catch((issue) => { if (active) { if (isSessionExpiredError(issue)) onSessionExpired(); else setError(getAuthErrorMessage(issue)) } })
    return () => { active = false }
  }, [distributionId, eventId, onSessionExpired, query, reference, retry, session.accessToken])

  if (!reference) return null
  return <section className="mt-5 border-l-4 border-brand-blue bg-info-soft p-4 text-sm" aria-label="Dispute ledger context">
    {distributionId !== eventId ? <p className="font-semibold">You have selected a different event. Return to the dispute before continuing its review.</p> : error ? <div role="alert"><p>{error}</p><button type="button" className="ga-btn-secondary mt-3" onClick={() => setRetry((value) => value + 1)}>Retry case details</button></div> : !record ? <p role="status">Checking dispute details...</p> : <><p className="font-bold">Reviewing case {record.referenceNo}</p><p className="mt-1">{[record.claim.beneficiary?.firstName, record.claim.beneficiary?.lastName].filter(Boolean).join(' ')} · Claim {record.claim.claimId}</p><p className="mt-2 leading-6">Check the matching transaction before reversing a credit. Return to the dispute to record the review outcome.</p></>}
    {returnHref && <a href={returnHref} onClick={(event) => { event.preventDefault(); onNavigate(returnHref) }} className="ga-admin-link mt-2 inline-flex min-h-11 items-center">Return to dispute review</a>}
  </section>
}
