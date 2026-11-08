import assert from 'node:assert/strict'
import test from 'node:test'
import { creditReviewBlockers, readCreditQueueLocation } from '../src/utils/ledgerReview.js'

const event = { status: 'OPEN', deliveryMode: 'SIMULATED_WALLET', verificationRequirement: 'QR' }
const claim = { claimStatus: 'VERIFIED', qrVerified: true, allocation: { amount: '1500', allocationStatus: 'ALLOCATED' }, schedule: { status: 'CHECKED_IN' }, beneficiary: { status: 'ACTIVE' }, disputes: [] }

test('either allowed method satisfies credit checks, while no completed method blocks credit', () => {
  const flexible = { ...event, verificationRequirement: 'QR_OR_BIOMETRIC' }
  for (const [qrVerified, biometricVerified] of [[true, false], [false, true]]) {
    assert.deepEqual(creditReviewBlockers({ ...claim, qrVerified, biometricVerified }, flexible, 'DSWD_STAFF'), [])
  }
  assert.ok(creditReviewBlockers({ ...claim, qrVerified: false, biometricVerified: false }, flexible, 'DSWD_STAFF').length)
})

test('only an eligible DSWD claim can be confirmed for simulated credit', () => {
  assert.deepEqual(creditReviewBlockers(claim, event, 'DSWD_STAFF'), [])
  for (const role of ['SYSTEM_ADMIN', 'BARANGAY_FACILITATOR']) assert.ok(creditReviewBlockers(claim, event, role).length)
  for (const patch of [{ status: 'CLOSED' }, { status: 'CANCELLED' }, { deliveryMode: 'PHYSICAL_GOODS' }]) assert.ok(creditReviewBlockers(claim, { ...event, ...patch }, 'DSWD_STAFF').length)
})

test('stale, disputed, unchecked and incomplete claims have specific blockers', () => {
  for (const patch of [
    { claimStatus: 'CLAIMED' }, { claimStatus: 'VOIDED' }, { disputes: [{ status: 'UNDER_REVIEW' }] },
    { qrVerified: false }, { allocation: { amount: '0', allocationStatus: 'ALLOCATED' } },
    { allocation: { amount: 'NaN', allocationStatus: 'ALLOCATED' } }, { allocation: { amount: '1500', allocationStatus: 'CLAIMED' } },
    { schedule: { status: 'SCHEDULED' } }, { beneficiary: { status: 'INACTIVE' } },
  ]) assert.ok(creditReviewBlockers({ ...claim, ...patch }, event, 'DSWD_STAFF').length, JSON.stringify(patch))
  assert.ok(creditReviewBlockers({ ...claim, qrVerified: false, biometricVerified: true }, { ...event, verificationRequirement: 'BIOMETRIC_AND_SIGNATURE' }, 'DSWD_STAFF').some((reason) => reason.includes('Signature')))
  assert.ok(creditReviewBlockers(null, event, 'DSWD_STAFF').length)
})

test('credit queue links preserve full-name searches and pages beyond the first 100 claims', () => {
  assert.deepEqual(readCreditQueueLocation('?creditSearch=Maria%20Santos&creditPage=11'), { search: 'Maria Santos', page: 11 })
  for (const page of ['-1', '0', '2.5', 'NaN', 'Infinity']) assert.equal(readCreditQueueLocation(`?creditPage=${page}`).page, 1)
  assert.equal(readCreditQueueLocation(`?creditSearch=${'a'.repeat(200)}`).search.length, 100)
})
