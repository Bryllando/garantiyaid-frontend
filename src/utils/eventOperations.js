export const activeDisputeStatuses = ['OPEN', 'UNDER_REVIEW', 'REFERRED']

export function eventWorkRows(distribution, scheduleCounts, claimCounts, disputeCounts, role = 'SYSTEM_ADMIN') {
  const scope = `distribution=${encodeURIComponent(distribution.distributionId)}`
  const physical = distribution.deliveryMode === 'PHYSICAL_GOODS'
  const rows = [
    { key: 'arrival', label: 'Awaiting check-in', count: scheduleCounts.SCHEDULED ?? 0, owner: 'Barangay staff', detail: 'Scheduled visits with no check-in recorded.', href: `/admin/schedules?${scope}&status=SCHEDULED` },
    { key: 'verification', label: 'Verification in progress', count: claimCounts.PENDING ?? 0, owner: ['QR', 'QR_OR_BIOMETRIC'].includes(distribution.verificationRequirement) ? 'Admin / DSWD / Barangay staff' : 'DSWD / Barangay staff', detail: 'A claim exists, but required identity checks are unfinished.', href: `/claim-accountability?${scope}&status=PENDING` },
    { key: 'release', label: physical ? 'Awaiting physical release' : 'Awaiting simulated credit', count: claimCounts.VERIFIED ?? 0, owner: physical ? 'Barangay staff' : 'DSWD staff', detail: 'Verified claims. Any active dispute must be resolved first.', href: `/claim-accountability?${scope}&status=VERIFIED` },
    { key: 'completed', label: 'Completed claims', count: claimCounts.CLAIMED ?? 0, owner: 'Admin review', detail: 'Currently completed claims, excluding voids. Review all recorded handovers or credits in reconciliation below.', href: `/claim-accountability?${scope}&status=CLAIMED` },
    { key: 'missed', label: 'Missed visits', count: scheduleCounts.MISSED ?? 0, owner: 'Barangay staff', detail: 'Review the recorded attendance before following up.', href: `/admin/schedules?${scope}&status=MISSED` },
    { key: 'rejected', label: 'Rejected claims', count: claimCounts.REJECTED ?? 0, owner: 'Authorized reviewer', detail: 'Inspect the verification record before taking further action.', href: `/claim-accountability?${scope}&status=REJECTED` },
    { key: 'voided', label: 'Voided claims', count: claimCounts.VOIDED ?? 0, owner: 'Authorized reviewer', detail: 'Review the decision and any required remediation.', href: `/claim-accountability?${scope}&status=VOIDED` },
  ]
  const disputeLabels = { OPEN: 'Unassigned disputes', UNDER_REVIEW: 'Disputes under review', REFERRED: 'Referred disputes' }
  const work = [...rows.filter((row, index) => index < 4 || row.count > 0), ...activeDisputeStatuses.filter((status) => disputeCounts[status] > 0).map((status) => ({
    key: status, label: disputeLabels[status], count: disputeCounts[status], owner: status === 'OPEN' ? 'Independent reviewer needed' : 'Assigned reviewer', detail: 'Review the beneficiary concern and supporting evidence.', href: `/claim-accountability?${scope}&view=disputes&status=${status}`,
  }))]
  if (role !== 'DSWD_STAFF') return work
  return work.map((row) => {
    if (['arrival', 'missed'].includes(row.key)) return { ...row, href: `/reports?${scope}&report=SCHEDULES&status=${row.key === 'arrival' ? 'SCHEDULED' : 'MISSED'}`, action: 'Review attendance' }
    if (row.key === 'release' && !physical && distribution.status === 'OPEN') return { ...row, href: `/dswd/ledger?${scope}`, action: 'Review credit queue' }
    return { ...row, action: activeDisputeStatuses.includes(row.key) ? 'Review disputes' : 'Review claims' }
  })
}

const issueGuidance = {
  PHYSICAL_PACKAGE_MISMATCH: { title: 'Package evidence does not match the event', owner: 'Admin / independent reviewer', next: 'Check the signed release log and recorded package details. Preserve the original evidence and resolve the discrepancy before closure.' },
  EVENT_CREDIT_TOTAL_MISMATCH: { title: 'Event credits do not match completed claims', owner: 'DSWD staff', next: 'Compare this event?s claims with its credits and reversals before closing.' },
  ACTIVE_CLAIM_DISPUTE: { title: 'Beneficiary concern remains open', owner: 'Independent Admin / DSWD reviewer', next: 'Complete the assigned dispute review before closing the event.' },
  FLAGGED_CLAIM: { title: 'Claim is held for review', owner: 'Independent Admin / DSWD reviewer', next: 'File or review the beneficiary concern and record a decision before closing.' },
  CLAIM_VERIFICATION_INCOMPLETE: { title: 'Identity checks are unfinished', owner: 'DSWD / Barangay staff', next: 'Open this claim and complete the event-required checks. Do not record release until verification passes.' },
  CLAIM_RECEIPT_MISSING: { title: 'Completed release needs a receipt', owner: 'Authorized staff', next: 'Review the recorded handover or credit and issue its acknowledgment receipt.' },
  VISIT_OUTCOME_REQUIRED: { title: 'Visit is still outstanding', owner: 'Admin / assigned Barangay staff', next: 'Review the appointment. Future time slots must end before closure; checked-in beneficiaries need a recorded claim outcome.' },
  VERIFIED_PHYSICAL_CLAIM_AWAITING_RELEASE: { title: 'Physical release not recorded', owner: 'Barangay staff', next: 'Confirm the handover and record its evidence in Claims and receipts.' },
  VERIFIED_CLAIM_AWAITING_CREDIT: { title: 'Simulated credit not recorded', owner: 'DSWD staff', next: 'Review the verified claim in the event ledger before recording a credit.' },
  CLAIMED_WITHOUT_PHYSICAL_RELEASE_EVIDENCE: { title: 'Release evidence is incomplete', owner: 'Admin / DSWD reviewer', next: 'Check the claim and release evidence with the Barangay staff who handled the handover.' },
  CLAIMED_WITHOUT_COMPLETED_CREDIT: { title: 'Completed claim has no completed credit', owner: 'DSWD staff', next: 'Compare the claim with its ledger entries before any further credit.' },
  VOIDED_WITHOUT_COMPLETE_REVERSAL: { title: 'Voided claim needs reversal review', owner: 'DSWD staff', next: 'Review the dispute decision and reversal entries before completing remediation.' },
  WALLET_LEDGER_BALANCE_MISMATCH: { title: 'Wallet balance does not match its ledger', owner: 'DSWD staff', next: 'Compare the beneficiary wallet balance with its transaction history.' },
}

export function reconciliationIssue(exception, claim, distributionId) {
  const guidance = issueGuidance[exception.code] ?? { title: 'Record needs review', owner: 'Authorized reviewer', next: 'Inspect the affected record and the reconciliation finding.' }
  const dispute = claim?.disputes?.find((item) => activeDisputeStatuses.includes(item.status))
  const scope = `distribution=${encodeURIComponent(distributionId)}`
  if (exception.code === 'EVENT_CREDIT_TOTAL_MISMATCH') return { ...guidance, action: 'Review event ledger', href: `/dswd/ledger?${scope}` }
  if (exception.code === 'VISIT_OUTCOME_REQUIRED') return { ...guidance, action: 'Review beneficiary progress', href: `/beneficiaries?beneficiary=${encodeURIComponent(exception.beneficiaryId)}&progressEvent=${encodeURIComponent(distributionId)}` }
  if (dispute) return { ...guidance, owner: 'Independent dispute reviewer', next: 'An active dispute blocks release or credit. Review that concern before continuing.', action: 'Review active dispute', href: `/claim-accountability?${scope}&view=disputes&search=${encodeURIComponent(dispute.referenceNo || dispute.disputeId)}` }
  if (exception.claimId) return { ...guidance, action: 'Review claim', href: `/claim-accountability?${scope}&claim=${encodeURIComponent(exception.claimId)}&receipt=manual` }
  if (exception.beneficiaryId) return { ...guidance, action: 'Review wallet', href: `/dswd/ledger?${scope}&workspace=wallets&beneficiary=${encodeURIComponent(exception.beneficiaryId)}` }
  return { ...guidance, action: 'Review event records', href: `/claim-accountability?${scope}` }
}
