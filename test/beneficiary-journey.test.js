import test from 'node:test'
import assert from 'node:assert/strict'
import { beneficiaryJourney } from '../src/utils/beneficiaryJourney.js'
import { claimWorkflow } from '../src/utils/claimWorkflow.js'
import { requestBeneficiaryEnrollments, requestBeneficiaryEventProgress } from '../src/auth/staffAuth.js'

const person = { beneficiaryId: 'person-1', lastName: 'Santos', barangayId: 'barangay-1' }
const enrollment = { enrollmentId: 'enrollment-1', beneficiaryId: 'person-1', status: 'APPROVED' }
const event = { distributionId: 'event-1', status: 'OPEN', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR_AND_BIOMETRIC' }
const records = { allocation: { allocationStatus: 'ALLOCATED' }, schedule: { status: 'SCHEDULED', queueNumber: 3 }, claim: { claimId: 'claim-1', claimStatus: 'PENDING', qrVerified: true, biometricVerified: false } }

test('handoffs name responsible staff, open permitted checks, and keep receipts separate', () => {
  for (const role of ['SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR']) {
    const initial = beneficiaryJourney(enrollment, event, { ...records, claim: null }, role)
    assert.ok(initial.every((step) => step.owner))
    assert.match(initial[3].href, role === 'SYSTEM_ADMIN' ? /admin\/verify-claims/ : role === 'DSWD_STAFF' ? /dswd\/verify-claims/ : /facilitator\/qr-verification/)
    const pending = beneficiaryJourney(enrollment, event, records, role)
    assert.match(pending[3].href, role === 'SYSTEM_ADMIN' ? /claim=claim-1/ : /view=verify&beneficiary=person-1/)
    assert.equal(pending[5].href, undefined)
    const released = beneficiaryJourney(enrollment, event, { ...records, claim: { ...records.claim, claimStatus: 'CLAIMED' } }, role)
    assert.equal(released[4].complete, true)
    assert.equal(released[5].status, 'Ready to issue')
    assert.equal(released[5].complete, false)
    assert.match(released[5].href, /claim=claim-1&receipt=manual/)
    assert.equal(released[6].complete, false)
    const receipted = beneficiaryJourney(enrollment, event, { ...records, claim: { ...records.claim, claimStatus: 'CLAIMED', receipt: { receiptNo: 'REC-001' } } }, role)
    assert.equal(receipted[5].status, 'Issued')
    assert.equal(receipted[6].status, 'Event review required')
  }
})

test('missing, missed and cancelled appointments require recovery; closed events cannot await release', () => {
  for (const schedule of [null, { status: 'MISSED' }, { status: 'CANCELLED' }]) {
    const stages = beneficiaryJourney(enrollment, event, { ...records, schedule, claim: null }, 'BARANGAY_FACILITATOR')
    assert.match(stages[2].detail, /Admin/)
    assert.match(stages[2].href, /distribution=event-1&search=person-1/)
    assert.match(stages[3].detail, /Resolve the schedule step/)
    assert.doesNotMatch(stages[3].href, /verification|view=verify/)
  }
  const noAllocation = beneficiaryJourney(enrollment, event, { ...records, allocation: null, claim: null }, 'DSWD_STAFF')
  assert.match(noAllocation[1].detail, /Assignments are locked/)
  assert.doesNotMatch(noAllocation[3].href, /verify/)
  for (const status of ['CLOSED', 'CANCELLED']) {
    const claim = { ...records.claim, claimStatus: 'VERIFIED' }
    const stages = beneficiaryJourney(enrollment, { ...event, status }, { ...records, claim }, 'BARANGAY_FACILITATOR')
    assert.equal(stages[4].status, claimWorkflow(claim, { ...event, status }, 'BARANGAY_FACILITATOR').label)
    assert.equal(stages[5].href, undefined)
  }
  const signature = beneficiaryJourney(enrollment, { ...event, verificationRequirement: 'BIOMETRIC_AND_SIGNATURE' }, { ...records, claim: { ...records.claim, biometricVerified: true } }, 'DSWD_STAFF')
  assert.equal(signature[3].detail, 'Still required: signature.')
  assert.match(signature[3].href, /view=verify&beneficiary=person-1/)
})

test('assistance stages distinguish approval, assignment, verification and release', () => {
  assert.equal(beneficiaryJourney(enrollment, null, null, 'SYSTEM_ADMIN').length, 1)
  const stages = beneficiaryJourney(enrollment, event, records, 'SYSTEM_ADMIN')
  assert.equal(stages[1].status, 'Assigned')
  assert.match(stages[2].href, /admin\/schedules.*event-1.*search=person-1/)
  assert.match(stages[3].detail, /Still required: face verification/)
  assert.doesNotMatch(stages[3].detail, /QR validation/)
  assert.equal(stages[4].complete, false)
  assert.match(stages[4].detail, /Barangay Facilitator/)
  const verified = beneficiaryJourney(enrollment, event, { ...records, claim: { ...records.claim, claimStatus: 'VERIFIED' } }, 'SYSTEM_ADMIN')
  assert.equal(verified[3].complete, true)
  assert.equal(verified[4].status, 'Awaiting physical release')
  const credited = beneficiaryJourney(enrollment, { ...event, deliveryMode: 'SIMULATED_WALLET' }, { ...records, claim: { ...records.claim, claimStatus: 'CLAIMED' } }, 'DSWD_STAFF')
  assert.equal(credited[4].status, 'Credited')
  assert.equal(credited[2].href, '/enrollments?enrollment=enrollment-1')
  assert.match(credited[4].href, /claim=claim-1/)
})

test('cancelled, missed, flagged and voided records never imply a releasable claim', () => {
  const missing = beneficiaryJourney(enrollment, event, { allocation: null, schedule: null, claim: null }, 'SYSTEM_ADMIN')
  assert.equal(missing[1].status, 'Not assigned to this event')
  assert.equal(missing[2].complete, false)
  assert.equal(missing[4].complete, false)
  for (const claim of [{ claimStatus: 'VOIDED' }, { claimStatus: 'REJECTED' }, { claimStatus: 'VERIFIED', isDuplicateFlag: true }]) {
    const stages = beneficiaryJourney(enrollment, event, { ...records, schedule: { status: 'MISSED' }, claim }, 'SYSTEM_ADMIN')
    assert.equal(stages[2].complete, false)
    assert.equal(stages[3].complete, false)
    assert.equal(stages[4].complete, false)
    assert.doesNotMatch(stages[4].status, /Awaiting release/)
  }
  const cancelled = beneficiaryJourney(enrollment, { ...event, status: 'CANCELLED' }, { allocation: { allocationStatus: 'CANCELLED' }, schedule: null, claim: null }, 'SYSTEM_ADMIN')
  assert.match(cancelled[1].detail, /read-only/)
  assert.match(cancelled[4].detail, /No completed release/)
})

test('active disputes agree with the release screen and preserve completed handovers', () => {
  for (const deliveryMode of ['PHYSICAL_GOODS', 'SIMULATED_WALLET']) {
    for (const status of ['OPEN', 'UNDER_REVIEW', 'REFERRED']) {
      for (const claimStatus of ['PENDING', 'VERIFIED', 'CLAIMED', 'VOIDED']) {
        const distribution = { ...event, deliveryMode }
        const claim = { ...records.claim, claimStatus, isDuplicateFlag: false, disputes: [{ status, disputeId: 'case-1', referenceNo: 'DSP 001' }] }
        const steps = beneficiaryJourney(enrollment, distribution, { ...records, claim }, 'BARANGAY_FACILITATOR')
        const workflow = claimWorkflow(claim, distribution, 'BARANGAY_FACILITATOR')
        for (const step of steps.slice(3, 5)) {
          assert.equal(step.status, workflow.label)
          assert.equal(step.href, workflow.href)
          assert.equal(step.action, 'Open dispute')
          assert.match(step.detail, /Independent Admin \/ DSWD reviewer/)
        }
        assert.equal(steps[4].complete, claimStatus === 'CLAIMED')
        if (claimStatus === 'CLAIMED') assert.match(steps[4].detail, /remains recorded/)
      }
    }
  }
  const claim = { ...records.claim, claimStatus: 'VERIFIED', disputes: [{ status: 'RESOLVED' }] }
  assert.equal(beneficiaryJourney(enrollment, event, { ...records, claim }, 'BARANGAY_FACILITATOR')[4].status, 'Awaiting physical release')
});

test('enrollment lookup reads later pages and excludes a different person with the same name', async (t) => {
  const calls = []
  let fail = false
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input, 'http://localhost')
    calls.push({ url, options })
    const page = Number(url.searchParams.get('page'))
    return new Response(JSON.stringify({ data: page === 2 && fail ? {} : { enrollments: [{ ...enrollment, beneficiaryId: page === 1 ? 'someone-else' : person.beneficiaryId }], pagination: { page, totalPages: 2 } } }))
  })
  assert.deepEqual(await requestBeneficiaryEnrollments('staff-token', person), [{ ...enrollment, beneficiaryId: person.beneficiaryId }])
  assert.equal(calls[0].url.searchParams.get('search'), 'Santos')
  assert.equal(calls[0].url.searchParams.get('barangayId'), 'barangay-1')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer staff-token')
  fail = true
  await assert.rejects(requestBeneficiaryEnrollments('staff-token', person), /enrollment-list response/)
})

test('event progress uses the beneficiary identifier and does not interpret failed requests as missing records', async (t) => {
  let fail = false
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input, 'http://localhost')
    assert.equal(url.searchParams.get('search'), person.beneficiaryId)
    const key = url.pathname.split('/').at(-1)
    if (fail && key === 'claims') return new Response(JSON.stringify({ error: { message: 'Claim records unavailable.' } }), { status: 503 })
    const values = { allocations: [records.allocation], schedules: [records.schedule], claims: [records.claim] }
    return new Response(JSON.stringify({ data: { [key]: values[key].map((row) => ({ ...row, beneficiaryId: person.beneficiaryId })), summary: {}, pagination: { totalPages: 1 } } }))
  })
  assert.equal((await requestBeneficiaryEventProgress('token', 'event-1', person)).claim.claimStatus, 'PENDING')
  fail = true
  await assert.rejects(requestBeneficiaryEventProgress('token', 'event-1', person), /Claim records unavailable/)
})
