import { activeDisputeStatuses } from './eventOperations.js'
import { claimChecks, claimWorkflow, queueNextAction } from './claimWorkflow.js'

export function beneficiaryJourney(enrollment, distribution, records, role) {
  if (!enrollment) return []
  const enrollmentLink = `/enrollments?enrollment=${encodeURIComponent(enrollment.enrollmentId)}`
  const enrollmentCopy = {
    PENDING: ['Awaiting review', 'An independent Admin or DSWD reviewer checks the submission.'],
    FOR_VALIDATION: ['Under validation', 'The reviewer checks eligibility and supporting documents.'],
    NEEDS_CORRECTION: ['Correction required', enrollment.reviewNotes || 'Read the reviewer feedback and correct the submission.'],
    APPROVED: ['Approved', 'Approval allows event allocation. It does not confirm a schedule or release.'],
    REJECTED: ['Not approved', enrollment.reviewNotes || 'Read the recorded decision before taking further action.'],
    SUSPENDED: ['Suspended', enrollment.reviewNotes || 'Ask the authorized reviewer to check the enrollment.'],
    WITHDRAWN: ['Withdrawn', 'This enrollment is no longer active.'],
  }
  const [status, detail] = enrollmentCopy[enrollment.status] ?? ['Review record', 'Open the enrollment for its current status.']
  const steps = [{ title: 'Enrollment', status, detail, owner: enrollment.status === 'NEEDS_CORRECTION' ? 'Barangay / Admin staff for corrections, then an independent reviewer' : 'Independent Admin / DSWD reviewer', complete: enrollment.status === 'APPROVED', href: enrollmentLink, action: 'Open enrollment' }]
  if (!distribution || !records) return steps

  const event = encodeURIComponent(distribution.distributionId)
  const { allocation, schedule, claim } = records
  const closed = ['CLOSED', 'CANCELLED'].includes(distribution.status)
  const claimed = claim?.claimStatus === 'CLAIMED'
  const voided = claim?.claimStatus === 'VOIDED'
  const rejected = claim?.claimStatus === 'REJECTED'
  const held = Boolean(claim?.isDuplicateFlag && !claimed)
  const dispute = claim?.disputes?.some((item) => activeDisputeStatuses.includes(item.status))
  const workflow = claim ? claimWorkflow({ ...claim, beneficiaryId: enrollment.beneficiaryId }, distribution, role) : null
  const disputeWorkflow = dispute ? workflow : null
  const verified = claimed || claim?.claimStatus === 'VERIFIED'
  const assigned = Boolean(allocation && ['ALLOCATED', 'CLAIMED'].includes(allocation.allocationStatus))
  const scheduled = Boolean(schedule && ['SCHEDULED', 'CHECKED_IN', 'MISSED'].includes(schedule.status))
  const queuePath = role === 'SYSTEM_ADMIN' ? '/admin/schedules' : role === 'BARANGAY_FACILITATOR' ? '/facilitator/queue' : null
  const claimsPath = `/claim-accountability?distribution=${event}${claim ? `&claim=${encodeURIComponent(claim.claimId)}` : ''}`
  const scheduleLink = queuePath ? { href: `${queuePath}?distribution=${event}&search=${encodeURIComponent(enrollment.beneficiaryId)}`, action: 'View schedule' } : { href: enrollmentLink, action: 'Review enrollment' }
  steps.push({ title: 'Event allocation', status: assigned ? 'Assigned' : allocation?.allocationStatus === 'CANCELLED' ? 'Cancelled' : allocation ? 'Pending allocation' : 'Not assigned to this event', complete: assigned, owner: 'Admin',
    detail: assigned ? 'This beneficiary is included in the selected event.' : closed ? 'This event is read-only. Review its preserved records.' : enrollment.status !== 'APPROVED' ? 'This enrollment must be approved before assignment to an event.' : distribution.status !== 'DRAFT' ? 'Assignments are locked after opening. Admin must review this enrollment and event before arranging another visit.' : 'Admin checks the approved list and service area before assigning this beneficiary.',
    ...(role === 'SYSTEM_ADMIN' ? { href: `/distributions/manage?event=${event}&stage=beneficiaries`, action: 'Review event allocation' } : {}) })
  steps.push({ title: 'Schedule', status: schedule ? schedule.status === 'MISSED' ? 'Missed appointment' : schedule.status === 'CANCELLED' ? 'Cancelled' : `Queue #${schedule.queueNumber}` : 'No appointment in this event', complete: scheduled && schedule.status !== 'MISSED', owner: distribution.status === 'DRAFT' ? 'Admin / assigned Barangay staff' : 'Admin for visit exceptions; assigned Barangay staff for attendance',
    detail: schedule?.status === 'MISSED' ? 'Give Admin this beneficiary and event reference to review the missed visit. Keep the original attendance record; it cannot be reset for a retry.' : scheduled ? [schedule.slot?.sessionLabel, schedule.slot?.location].filter(Boolean).join(' · ') : distribution.status === 'DRAFT' ? assigned ? 'Generate the queue, or reactivate a cancelled appointment while the event is a draft.' : 'Admin must allocate this approved enrollment before staff generate the queue.' : 'Appointments are locked after opening. Ask Admin to review this event and arrange an eligible visit; do not bypass the missing appointment.',
    ...scheduleLink })
  const missing = claimChecks(claim || {}, distribution).filter((check) => check.required && !check.complete).map((check) => check.label.toLowerCase())
  const startCheck = !claim && assigned && schedule ? queueNextAction({ ...schedule, beneficiaryId: enrollment.beneficiaryId }, distribution, role) : null
  steps.push({ title: 'Identity checks', status: held ? 'Flagged for review' : voided ? 'Claim voided' : verified ? 'Verified' : rejected ? 'Not verified' : closed ? distribution.status === 'CLOSED' ? 'Event closed' : 'Event cancelled' : claim ? 'Checks incomplete' : 'Not started', complete: verified && !held,
    owner: held || voided || rejected || dispute ? workflow.owner : (['QR', 'QR_OR_BIOMETRIC'].includes(distribution.verificationRequirement) ? 'Admin / DSWD / Barangay staff' : 'DSWD / Barangay staff'),
    detail: held || voided || rejected ? workflow.next : verified ? 'Identity checks passed. Release is recorded separately.' : closed ? 'Review the recorded outcome; this event is read-only.' : !claim && (!assigned || !scheduled || schedule.status === 'MISSED') ? 'An active allocation and appointment are required. Resolve the schedule step before identity checks.' : `Still required: ${missing.join(distribution.verificationRequirement === 'QR_OR_BIOMETRIC' ? ' OR ' : ', ') || 'review the claim record'}.`,
    ...(claim ? { href: workflow.href || claimsPath, action: workflow.action || 'Review claim' } : startCheck ? { href: startCheck.href, action: startCheck.label } : scheduleLink),
    ...(disputeWorkflow ? { status: disputeWorkflow.label, complete: false, detail: `${disputeWorkflow.next} Next: ${disputeWorkflow.owner}.`, href: disputeWorkflow.href, action: disputeWorkflow.action } : {}) })
  const physical = distribution.deliveryMode === 'PHYSICAL_GOODS'
  steps.push({ title: physical ? 'Assistance release' : 'Simulated wallet credit', status: workflow?.label || (closed ? distribution.status === 'CLOSED' ? 'Event closed' : 'Event cancelled' : 'Awaiting verification'), complete: claimed, owner: held || voided || rejected || dispute || (closed && !claimed) ? workflow?.owner || 'Admin review' : physical ? 'Assigned Barangay Facilitator' : 'DSWD staff',
    detail: claimed || voided ? 'Open the claim to inspect release evidence and its receipt.' : held || rejected || closed ? workflow?.next || 'No completed release is recorded for this beneficiary. Review the event records.' : physical ? 'The Barangay Facilitator records the actual handover and evidence after all identity checks pass.' : 'DSWD records the simulated credit after verification. No real funds move.',
    ...(claim ? { href: claimsPath, action: claimed ? 'View release and receipt' : 'Open claim record' } : {}),
    ...(disputeWorkflow ? { status: disputeWorkflow.label, detail: `${claimed ? 'The completed handover or credit remains recorded. ' : ''}${disputeWorkflow.next} Next: ${disputeWorkflow.owner}.`, href: disputeWorkflow.href, action: disputeWorkflow.action } : {}) })
  steps.push({ title: 'Receipt', status: claim?.receipt ? 'Issued' : claimed ? 'Ready to issue' : voided ? 'Review voided claim' : 'Available after release', complete: Boolean(claim?.receipt), owner: 'Authorized staff handling this claim',
    detail: claim?.receipt ? `Receipt ${claim.receipt.receiptNo}. Review the original evidence and any later dispute outcome in the claim record.` : claimed ? 'Issue the acknowledgment receipt from this completed claim. Verification alone is not proof of release.' : 'A receipt must refer to the recorded handover or credit. It does not replace the release record.',
    ...(claim && (claimed || voided || claim.receipt) ? { href: `${claimsPath}&receipt=manual`, action: 'Open receipt record' } : {}) })
  steps.push({ title: 'Event reconciliation and closure', status: closed ? distribution.status === 'CLOSED' ? 'Event closed' : 'Event cancelled' : 'Event review required', complete: distribution.status === 'CLOSED', owner: 'Admin',
    detail: closed ? 'Review preserved releases, receipts, and unresolved concerns. This event cannot accept further releases.' : 'Admin compares all event records, resolves reconciliation findings, and closes the event separately. This beneficiary’s release does not close the event.',
    ...(role === 'SYSTEM_ADMIN' ? { href: `/distributions/manage?event=${event}`, action: 'Review event and reconciliation' } : {}) })
  return steps
}
