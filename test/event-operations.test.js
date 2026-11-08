import test from 'node:test'
import assert from 'node:assert/strict'
import { eventWorkRows, reconciliationIssue } from '../src/utils/eventOperations.js'
import { requestDistributionClaim } from '../src/auth/staffAuth.js'

test('event work separates attendance, unfinished checks, release, and unresolved disputes', () => {
  const rows = eventWorkRows({ distributionId: 'event/1', deliveryMode: 'PHYSICAL_GOODS' }, { SCHEDULED: 20, CHECKED_IN: 8, MISSED: 2, CANCELLED: 3 }, { PENDING: 3, VERIFIED: 2, CLAIMED: 1, VOIDED: 1 }, { OPEN: 1, UNDER_REVIEW: 2, RESOLVED: 5 })
  assert.deepEqual(rows.slice(0, 4).map((row) => row.count), [20, 3, 2, 1])
  assert.equal(rows.find((row) => row.key === 'release').owner, 'Barangay staff')
  assert.equal(rows.find((row) => row.key === 'completed').label, 'Completed claims')
  assert.match(rows.find((row) => row.key === 'completed').detail, /excluding voids/)
  assert.match(rows[0].href, /distribution=event%2F1&status=SCHEDULED$/)
  assert.match(rows.find((row) => row.key === 'missed').href, /status=MISSED$/)
  assert.match(rows.find((row) => row.key === 'UNDER_REVIEW').href, /view=disputes&status=UNDER_REVIEW$/)
  assert.equal(rows.some((row) => row.key === 'RESOLVED'), false)
  const wallet = eventWorkRows({ distributionId: 'wallet-event', deliveryMode: 'SIMULATED_WALLET' }, {}, { VERIFIED: 1 }, {})
  assert.equal(wallet.length, 4)
  assert.equal(wallet[2].owner, 'DSWD staff')
  assert.equal(wallet[2].label, 'Awaiting simulated credit')
  assert.equal(wallet[3].count, 0)
})

test('reconciliation directs active disputes to independent review and preserves the exact event', () => {
  const issue = { code: 'VERIFIED_PHYSICAL_CLAIM_AWAITING_RELEASE', claimId: 'claim/1' }
  assert.equal(reconciliationIssue(issue, null, 'event/1').owner, 'Barangay staff')
  assert.match(reconciliationIssue(issue, null, 'event/1').href, /claim=claim%2F1&receipt=manual$/)
  const blocked = reconciliationIssue(issue, { disputes: [{ status: 'REFERRED', disputeId: 'case-1', referenceNo: 'GYA 100' }] }, 'event/1')
  assert.match(blocked.next, /blocks release or credit/)
  assert.equal(blocked.href, '/claim-accountability?distribution=event%2F1&view=disputes&search=GYA%20100')
  assert.equal(blocked.action, 'Review active dispute')
  assert.equal(reconciliationIssue(issue, { disputes: [{ status: 'RESOLVED' }] }, 'event/1').owner, 'Barangay staff')
  const wallet = reconciliationIssue({ code: 'WALLET_LEDGER_BALANCE_MISMATCH', beneficiaryId: 'person/1' }, null, 'event/1')
  assert.equal(wallet.href, '/dswd/ledger?distribution=event%2F1&workspace=wallets&beneficiary=person%2F1')
  assert.equal(reconciliationIssue({ code: 'UNKNOWN' }, null, 'event/1').action, 'Review event records')
})

test('claim lookup uses the existing authenticated read endpoint and rejects a different record', async (t) => {
  const calls = []
  let response = { claim: { claimId: 'claim/1', beneficiary: { firstName: 'Maria' } } }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options })
    return new Response(JSON.stringify({ data: response }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  assert.equal((await requestDistributionClaim('test-token', 'event/1', 'claim/1')).beneficiary.firstName, 'Maria')
  assert.match(calls[0].url, /\/distributions\/event%2F1\/claims\/claim%2F1$/)
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token')
  response = { claim: { claimId: 'someone-else', beneficiary: {} } }
  await assert.rejects(requestDistributionClaim('test-token', 'event/1', 'claim/1'), /unexpected claim record/)
})


test('closure findings direct staff to the affected visit, receipt or event ledger', () => {
  const visit = reconciliationIssue({ code: 'VISIT_OUTCOME_REQUIRED', beneficiaryId: 'person/1' }, null, 'event/1')
  assert.equal(visit.href, '/beneficiaries?beneficiary=person%2F1&progressEvent=event%2F1')
  const receipt = reconciliationIssue({ code: 'CLAIM_RECEIPT_MISSING', claimId: 'claim/1' }, null, 'event/1')
  assert.match(receipt.next, /issue its acknowledgment receipt/)
  assert.match(receipt.href, /claim=claim%2F1&receipt=manual/)
  const totals = reconciliationIssue({ code: 'EVENT_CREDIT_TOTAL_MISMATCH' }, null, 'event/1')
  assert.equal(totals.href, '/dswd/ledger?distribution=event%2F1')
})
