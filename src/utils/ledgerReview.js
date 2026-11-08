import { claimChecks } from './claimWorkflow.js'
import { activeDisputeStatuses } from './eventOperations.js'

export function readCreditQueueLocation(search) {
  const params = new URLSearchParams(search)
  const page = Number(params.get('creditPage'))
  return { search: (params.get('creditSearch') || '').trim().slice(0, 100), page: Number.isSafeInteger(page) && page > 0 ? page : 1 }
}

export function creditReviewBlockers(claim, distribution, role) {
  const blockers = []
  if (role !== 'DSWD_STAFF') blockers.push('Only DSWD staff can record a simulated credit.')
  if (distribution?.deliveryMode !== 'SIMULATED_WALLET') blockers.push('Physical assistance is released by Barangay staff; it cannot be credited to a wallet.')
  if (distribution?.status !== 'OPEN') blockers.push('This distribution must be open before crediting.')
  if (!claim) return [...blockers, 'Load the latest claim before confirming.']
  if (claim.claimStatus !== 'VERIFIED') blockers.push(claim.claimStatus === 'CLAIMED' ? 'This claim has already been completed. Review its recorded transaction.' : 'The claim is not verified for crediting.')
  if (claim.disputes?.some((item) => activeDisputeStatuses.includes(item.status))) blockers.push('An active dispute needs review before any credit can be recorded.')
  const checks = claimChecks(claim, distribution).filter((item) => item.required && !item.complete)
  if (checks.length || (!claim.qrVerified && !claim.biometricVerified)) blockers.push(checks.length ? `Complete the required verification: ${checks.map((item) => item.label).join(', ')}.` : 'Identity verification is not confirmed.')
  if (claim.allocation?.allocationStatus !== 'ALLOCATED') blockers.push('The assistance allocation is not available for crediting.')
  if (claim.schedule?.status !== 'CHECKED_IN') blockers.push('The beneficiary has not been checked in for this schedule.')
  if (claim.beneficiary?.status !== 'ACTIVE') blockers.push('The beneficiary record must be active.')
  if (!(Number(claim.allocation?.amount) > 0) || !Number.isFinite(Number(claim.allocation?.amount))) blockers.push('The allocated amount could not be confirmed.')
  return blockers
}
