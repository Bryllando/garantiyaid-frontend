import { activeDisputeStatuses } from './eventOperations.js'

export function queueNextAction(schedule, distribution, role) {
  const scope = new URLSearchParams({ distribution: distribution.distributionId })
  if (schedule.claim) {
    scope.set('claim', schedule.claim.claimId || schedule.beneficiaryId || schedule.beneficiary.beneficiaryId)
    return { label: schedule.claim.claimStatus === 'CLAIMED' ? 'View release / receipt' : 'Review claim', href: `/claim-accountability?${scope}` }
  }
  if (distribution.status !== 'OPEN' || !['SCHEDULED', 'CHECKED_IN'].includes(schedule.status)) return null
  if (['QR', 'QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC'].includes(distribution.verificationRequirement)) {
    return { label: 'Check QR', href: `${role === 'SYSTEM_ADMIN' ? '/admin/verify-claims' : role === 'DSWD_STAFF' ? '/dswd/verify-claims' : '/facilitator/qr-verification'}?${scope}` }
  }
  if (['BARANGAY_FACILITATOR', 'DSWD_STAFF'].includes(role) && ['BIOMETRIC', 'BIOMETRIC_AND_SIGNATURE'].includes(distribution.verificationRequirement)) {
    scope.set('view', 'verify')
    scope.set('beneficiary', schedule.beneficiaryId || schedule.beneficiary.beneficiaryId)
    return { label: 'Verify identity', href: `/biometrics?${scope}` }
  }
  return null
}

export function claimChecks(claim, distribution) {
  const requirement = distribution?.verificationRequirement || claim.distribution?.verificationRequirement || claim.verificationMethod || ''
  const alternative = requirement === 'QR_OR_BIOMETRIC'
  const satisfied = alternative && (claim.qrVerified || claim.biometricVerified)
  return [['QR', 'qrVerified', 'QR validation'], ['BIOMETRIC', 'biometricVerified', 'Face verification'], ['SIGNATURE', 'signatureVerified', 'Signature']].map(([key, field, label]) => ({
    label, key, required: requirement.includes(key) && (!satisfied || Boolean(claim[field])), complete: Boolean(claim[field]),
    status: requirement.includes(key) ? claim[field] ? 'Complete' : alternative ? satisfied ? 'Alternative not needed' : 'Allowed alternative' : 'Pending' : 'Not required for this event',
  }))
}

export function claimWorkflow(claim, distribution, role) {
  const event = { ...claim.distribution, ...distribution }
  const distributionId = claim.distributionId || event.distributionId || distribution?.distributionId
  const scope = new URLSearchParams({ distribution: distributionId })
  const dispute = claim.disputes?.find((item) => activeDisputeStatuses.includes(item.status))
  const physical = (claim.releaseMethod || event.deliveryMode) === 'PHYSICAL_GOODS'
  const closed = ['CLOSED', 'CANCELLED'].includes(event.status)
  const done = claim.claimStatus === 'CLAIMED'
  const receiptReady = ['CLAIMED', 'VOIDED'].includes(claim.claimStatus)
  const base = { receiptReady, canRelease: false, tone: 'pending' }
  if (dispute) return { ...base, label: 'On hold — dispute under review', owner: 'Independent Admin / DSWD reviewer', next: 'Review the active case before any further release or credit.', action: 'Open dispute', href: `/claim-accountability?${scope}&view=disputes&search=${encodeURIComponent(dispute.referenceNo || dispute.disputeId)}` }
  if (claim.claimStatus === 'VOIDED') return { ...base, label: 'Voided claim', tone: 'danger', owner: 'Admin / DSWD reviewer', next: 'Review the recorded decision and any remaining remediation. Original release evidence is preserved.', action: 'Review dispute records', href: `/claim-accountability?${scope}&view=disputes&search=${encodeURIComponent(claim.claimId)}` }
  if (done) return { ...base, label: physical ? 'Released' : 'Credited', tone: 'success', owner: 'Admin review', next: claim.receipt ? 'Review the recorded evidence and existing receipt.' : 'Review the recorded evidence. Issue a receipt when ready.' }
  if (claim.claimStatus === 'REJECTED' || claim.isDuplicateFlag) return { ...base, label: claim.isDuplicateFlag ? 'Flagged for review' : 'Claim rejected', tone: 'danger', owner: 'Admin / DSWD reviewer', next: claim.isDuplicateFlag ? 'File the beneficiary’s concern for independent review. An assigned Admin or DSWD reviewer can confirm the record and clear the hold. Verification and release remain separate steps.' : 'Inspect the verification record and recorded concern before continuing.' }
  if (closed) return { ...base, label: event.status === 'CANCELLED' ? 'Event cancelled' : 'Event closed', owner: 'Admin review', next: 'No completed release is recorded. Review the preserved event records; further release is unavailable.' }
  if (claim.claimStatus === 'VERIFIED') {
    const open = event.status === 'OPEN'
    return { ...base, label: physical ? 'Awaiting physical release' : 'Awaiting simulated credit', owner: physical ? 'Barangay staff' : 'DSWD staff',
      next: !open ? 'The event must be open before release or credit.' : physical ? 'The assigned Barangay Facilitator records the handover and its evidence.' : 'DSWD reviews the verified claim and records its simulated credit.',
      canRelease: physical && open && role === 'BARANGAY_FACILITATOR',
      ...(!physical && ['SYSTEM_ADMIN', 'DSWD_STAFF'].includes(role) ? { action: role === 'DSWD_STAFF' ? 'Open wallet credits' : 'Review transactions', href: `/dswd/ledger?${scope}` } : {}),
    }
  }
  const pending = claimChecks(claim, distribution).filter((item) => item.required && !item.complete)
  const face = pending.some((item) => item.key === 'BIOMETRIC')
  const qr = pending.some((item) => item.key === 'QR')
  const canVerifyFace = ['DSWD_STAFF', 'BARANGAY_FACILITATOR'].includes(role)
  const canVerifyQr = ['SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR'].includes(role)
  return { ...base, label: face && !qr ? 'Awaiting face verification' : 'Verification incomplete', owner: qr && !face ? 'Admin / DSWD / Barangay staff' : 'DSWD / Barangay staff', next: pending.length ? `Still required: ${pending.map((item) => item.label.toLowerCase()).join(event.verificationRequirement === 'QR_OR_BIOMETRIC' ? ' OR ' : ', ')}.` : 'Review the recorded claim; verification has not been confirmed.',
    ...(event.status === 'OPEN' && qr && canVerifyQr ? { action: 'Open QR verification', href: `${role === 'SYSTEM_ADMIN' ? '/admin/verify-claims' : role === 'DSWD_STAFF' ? '/dswd/verify-claims' : '/facilitator/qr-verification'}?${scope}` }
      : event.status === 'OPEN' && pending.length && canVerifyFace ? { action: 'Continue identity checks', href: `/biometrics?${scope}&view=verify&beneficiary=${encodeURIComponent(claim.beneficiaryId || claim.beneficiary?.beneficiaryId)}` } : {}),
  }
}

export function disputeLedgerHref(distributionId, dispute, returnTo) {
  return `/dswd/ledger?${new URLSearchParams({ distribution: distributionId, claim: dispute.claim.claimId, dispute: dispute.referenceNo, returnTo })}`
}

export function disputeReturnHref(value, distributionId) {
  if (!value?.startsWith('/claim-accountability?')) return null
  const url = new URL(value, 'https://garantiyaid.invalid')
  return url.origin === 'https://garantiyaid.invalid' && url.pathname === '/claim-accountability' && url.searchParams.get('distribution') === distributionId && url.searchParams.get('view') === 'disputes' ? `${url.pathname}${url.search}` : null
}

export function disputeReviewState(dispute, user) {
  const physical = dispute.claim.releaseMethod === 'PHYSICAL_GOODS' || dispute.claim.distribution?.deliveryMode === 'PHYSICAL_GOODS'
  const base = { canStart: false, canDecide: false, needsReversal: !physical && dispute.claim.claimStatus === 'CLAIMED' }
  if (dispute.status === 'RESOLVED') return { ...base, title: 'Review completed', next: 'The recorded outcome and notes are available below. Original claim evidence is preserved.' }
  if (!['SYSTEM_ADMIN', 'DSWD_STAFF'].includes(user.role)) return { ...base, title: 'Awaiting independent review', next: 'An authorized Admin or DSWD reviewer handles this case. You can review the recorded details here.' }
  if (dispute.filedBy?.userId === user.userId) return { ...base, title: 'Independent reviewer required', next: 'You filed this case. A different Admin or DSWD staff member must review it.' }
  if (dispute.status === 'OPEN') return { ...base, canStart: true, title: 'Ready for assignment', next: 'Read the statement and claim evidence, then start the review to assign this case to yourself.' }
  if (dispute.assignedTo?.userId !== user.userId) return { ...base, title: 'Assigned to another reviewer', next: `Assigned to ${dispute.assignedTo?.fullName || 'another staff member'}. Only the assigned reviewer can record a decision.` }
  if (['UNDER_REVIEW', 'REFERRED'].includes(dispute.status)) return { ...base, canDecide: true, title: dispute.status === 'REFERRED' ? 'Referred for investigation' : 'Assigned to you', next: dispute.status === 'REFERRED' ? 'Review the investigation findings before recording the outcome. The case remains open.' : 'Compare the beneficiary statement with the recorded evidence before choosing a decision.' }
  return { ...base, title: 'Review unavailable', next: 'Refresh the case to check its current status.' }
}
