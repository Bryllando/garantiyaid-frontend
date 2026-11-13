import test from 'node:test'
import assert from 'node:assert/strict'
import { claimChecks, claimWorkflow, disputeLedgerHref, disputeReturnHref, disputeReviewState } from '../src/utils/claimWorkflow.js'
import { eventVerificationLabel, manualVerificationAllowed } from '../src/utils/claimVerification.js'

const event = { distributionId: 'event/1', status: 'OPEN', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR' }
const claim = { claimId: 'claim-1', beneficiaryId: 'person-1', claimStatus: 'VERIFIED', qrVerified: true }

test('manual alternatives disclose the permitted workflow and keep acknowledgment pending', () => {
  const configured = { ...event, manualVerificationBasis: 'Approved office review instructions' }
  assert.equal(manualVerificationAllowed(configured), true)
  assert.match(eventVerificationLabel(configured), /QR code OR manual staff verification/)
  assert.equal(manualVerificationAllowed({ ...configured, verificationRequirement: 'QR_AND_BIOMETRIC' }), false)
  const pending = { ...claim, verificationMethod: 'MANUAL', claimStatus: 'PENDING', manualVerification: { confirmed: true, verifiedById: 'staff', evidenceReference: 'TEST-ID-01' }, signatureVerified: false }
  assert.equal(claimChecks(pending, configured).some((check) => check.key === 'SIGNATURE' && check.required && !check.complete), true)
  assert.equal(claimWorkflow(pending, configured, 'BARANGAY_FACILITATOR').canRelease, false)
  assert.match(claimWorkflow(pending, configured, 'BARANGAY_FACILITATOR').href, /^\/manual-verification\?/)
  assert.equal(claimWorkflow({ ...pending, manualVerification: null }, configured, 'BARANGAY_FACILITATOR').href, undefined)
})

test('alternative methods never show an unused method as a remaining requirement', () => {
  const flexible = { ...event, verificationRequirement: 'QR_OR_BIOMETRIC' }
  for (const [qrVerified, biometricVerified] of [[true, false], [false, true]]) {
    const checks = claimChecks({ ...claim, qrVerified, biometricVerified }, flexible)
    assert.equal(checks.filter(check => check.required && !check.complete).length, 0)
    assert.equal(checks.filter(check => check.status === 'Alternative not needed').length, 1)
  }
  const pending = claimWorkflow({ ...claim, claimStatus: 'PENDING', qrVerified: false }, flexible, 'DSWD_STAFF')
  assert.match(pending.next, /qr validation OR face verification/)
})

test('verification describes only the controls required for this event', () => {
  assert.deepEqual(claimChecks(claim, event).map((item) => item.status), ['Complete', 'Not required for this event', 'Not required for this event'])
  const pending = { ...claim, claimStatus: 'PENDING' }
  const faceEvent = { ...event, verificationRequirement: 'QR_AND_BIOMETRIC' }
  assert.equal(claimWorkflow(pending, faceEvent, 'SYSTEM_ADMIN').label, 'Awaiting face verification')
  assert.equal(claimWorkflow(pending, faceEvent, 'SYSTEM_ADMIN').href, undefined)
  assert.match(claimWorkflow(pending, faceEvent, 'BARANGAY_FACILITATOR').href, /view=verify&beneficiary=person-1/)
  assert.match(claimWorkflow({ ...pending, signatureVerified: false }, { ...event, verificationRequirement: 'BIOMETRIC_AND_SIGNATURE' }, 'DSWD_STAFF').href, /view=verify&beneficiary=person-1/)
  assert.match(claimWorkflow({ ...pending, qrVerified: false }, event, 'DSWD_STAFF').href, /^\/dswd\/verify-claims\?/)
})

test('release and credit remain separate and respect role and event status', () => {
  assert.equal(claimWorkflow(claim, event, 'SYSTEM_ADMIN').canRelease, false)
  assert.equal(claimWorkflow(claim, event, 'DSWD_STAFF').canRelease, false)
  assert.equal(claimWorkflow(claim, event, 'BARANGAY_FACILITATOR').canRelease, true)
  assert.equal(claimWorkflow(claim, { ...event, status: 'DRAFT' }, 'BARANGAY_FACILITATOR').canRelease, false)
  const wallet = { ...event, deliveryMode: 'SIMULATED_WALLET' }
  assert.equal(claimWorkflow(claim, wallet, 'DSWD_STAFF').label, 'Awaiting simulated credit')
  assert.equal(claimWorkflow(claim, wallet, 'BARANGAY_FACILITATOR').href, undefined)
  assert.equal(claimWorkflow({ ...claim, claimStatus: 'CLAIMED' }, wallet, 'SYSTEM_ADMIN').label, 'Credited')
  assert.equal(claimWorkflow({ ...claim, claimStatus: 'CLAIMED' }, event, 'SYSTEM_ADMIN').label, 'Released')
  assert.equal(claimWorkflow({ ...claim, claimStatus: 'CLAIMED' }, event, 'SYSTEM_ADMIN').transactionLabel, 'Released — receipt pending')
  assert.equal(claimWorkflow({ ...claim, claimStatus: 'CLAIMED', receipt: { receiptNo: 'TEST-1' } }, event, 'SYSTEM_ADMIN').transactionLabel, 'Completed — released and receipted')
})

test('active concerns, rejected and voided claims, and closed events never offer release', () => {
  for (const status of ['OPEN', 'UNDER_REVIEW', 'REFERRED']) {
    const state = claimWorkflow({ ...claim, disputes: [{ status, referenceNo: 'CASE 1' }] }, event, 'BARANGAY_FACILITATOR')
    assert.equal(state.label, 'On hold — dispute under review')
    assert.equal(state.canRelease, false)
    assert.match(state.href, /search=CASE%201/)
  }
  for (const status of ['REJECTED', 'VOIDED']) assert.equal(claimWorkflow({ ...claim, claimStatus: status }, event, 'BARANGAY_FACILITATOR').canRelease, false)
  assert.equal(claimWorkflow({ ...claim, isDuplicateFlag: true }, event, 'BARANGAY_FACILITATOR').canRelease, false)
  assert.equal(claimWorkflow(claim, { ...event, status: 'CLOSED' }, 'BARANGAY_FACILITATOR').label, 'Event closed')
  assert.equal(claimWorkflow({ ...claim, distribution: event }, { ...event, status: 'CLOSED' }, 'BARANGAY_FACILITATOR').canRelease, false)
  assert.equal(claimWorkflow(claim, { ...event, status: 'CANCELLED' }, 'BARANGAY_FACILITATOR').label, 'Event cancelled')
})

test('receipt eligibility never treats verification alone as receipt-ready', () => {
  assert.equal(claimWorkflow(claim, event, 'SYSTEM_ADMIN').receiptReady, false)
  assert.equal(claimWorkflow({ ...claim, claimStatus: 'CLAIMED' }, event, 'SYSTEM_ADMIN').receiptReady, true)
  assert.equal(claimWorkflow({ ...claim, claimStatus: 'VOIDED' }, event, 'SYSTEM_ADMIN').receiptReady, true)
})

test('dispute ledger links preserve the exact event and return filters without accepting external redirects', () => {
  const returnTo = '/claim-accountability?distribution=event%2F1&view=disputes&status=REFERRED&page=2&search=Maria'
  const href = disputeLedgerHref(event.distributionId, { referenceNo: 'CASE 1', claim }, returnTo)
  const query = new URL(href, 'https://local.test').searchParams
  assert.equal(query.get('distribution'), event.distributionId)
  assert.equal(query.get('claim'), claim.claimId)
  assert.equal(disputeReturnHref(query.get('returnTo'), event.distributionId), returnTo)
  for (const value of ['https://evil.test', '//evil.test', '/account', returnTo.replace('event%2F1', 'another')]) assert.equal(disputeReturnHref(value, event.distributionId), null)
})

test('case guidance respects assignment, independent review, resolution and release method', () => {
  const user = { userId: 'reviewer', role: 'DSWD_STAFF' }
  const dispute = { status: 'OPEN', filedBy: { userId: 'filer' }, claim: { claimStatus: 'CLAIMED' } }
  assert.equal(disputeReviewState(dispute, user).canStart, true)
  assert.equal(disputeReviewState(dispute, { ...user, userId: 'filer' }).canStart, false)
  assert.equal(disputeReviewState(dispute, { ...user, role: 'BARANGAY_FACILITATOR' }).canStart, false)
  const assigned = { ...dispute, status: 'UNDER_REVIEW', assignedTo: { userId: user.userId } }
  assert.equal(disputeReviewState(assigned, user).canDecide, true)
  assert.equal(disputeReviewState(assigned, { ...user, userId: 'other' }).canDecide, false)
  assert.equal(disputeReviewState({ ...assigned, status: 'REFERRED' }, user).canDecide, true)
  assert.equal(disputeReviewState({ ...assigned, status: 'RESOLVED' }, user).canDecide, false)
  assert.equal(disputeReviewState(assigned, user).needsReversal, true)
  assert.equal(disputeReviewState({ ...assigned, claim: { claimStatus: 'VOIDED' } }, user).needsReversal, false)
  assert.equal(disputeReviewState({ ...assigned, claim: { claimStatus: 'CLAIMED', distribution: { deliveryMode: 'PHYSICAL_GOODS' } } }, user).needsReversal, false)
})
