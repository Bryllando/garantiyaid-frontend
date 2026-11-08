import test from 'node:test'
import assert from 'node:assert/strict'
import { queueNextAction } from '../src/utils/claimWorkflow.js'
import { requestAllDistributions, requestOpenDistributions } from '../src/auth/staffAuth.js'

const role = 'BARANGAY_FACILITATOR'
const event = { distributionId: 'event/1', status: 'OPEN', verificationRequirement: 'QR', deliveryMode: 'PHYSICAL_GOODS' }
const schedule = { status: 'SCHEDULED', beneficiaryId: 'person/1' }

test('queue next steps preserve the event and beneficiary and follow required checks', () => {
  const qr = new URL(queueNextAction(schedule, event, role).href, 'https://local.test')
  assert.equal(qr.pathname, '/facilitator/qr-verification')
  assert.equal(qr.searchParams.get('distribution'), event.distributionId)
  assert.match(queueNextAction(schedule, event, 'SYSTEM_ADMIN').href, /^\/admin\/verify-claims/)
  assert.match(queueNextAction(schedule, event, 'DSWD_STAFF').href, /^\/dswd\/verify-claims/)
  for (const requirement of ['BIOMETRIC', 'BIOMETRIC_AND_SIGNATURE']) {
    const face = new URL(queueNextAction(schedule, { ...event, verificationRequirement: requirement }, role).href, 'https://local.test')
    assert.equal(face.pathname, '/biometrics')
    assert.equal(face.searchParams.get('beneficiary'), schedule.beneficiaryId)
    assert.equal(face.searchParams.get('view'), 'verify')
    assert.equal(queueNextAction(schedule, { ...event, verificationRequirement: requirement }, 'SYSTEM_ADMIN'), null)
    assert.equal(queueNextAction(schedule, { ...event, verificationRequirement: requirement }, 'DSWD_STAFF').href, face.pathname + face.search)
  }
  for (const status of ['DRAFT', 'CLOSED', 'CANCELLED']) assert.equal(queueNextAction(schedule, { ...event, status }, role), null)
  for (const status of ['MISSED', 'CANCELLED']) assert.equal(queueNextAction({ ...schedule, status }, event, role), null)
})

test('existing claims lead to their record for release, remaining checks, or receipt, including blocked claims', () => {
  for (const claimStatus of ['PENDING', 'VERIFIED', 'CLAIMED', 'VOIDED', 'REJECTED']) {
    const action = queueNextAction({ ...schedule, claim: { claimId: 'claim/1', claimStatus } }, event, role)
    const url = new URL(action.href, 'https://local.test')
    assert.equal(url.pathname, '/claim-accountability')
    assert.equal(url.searchParams.get('claim'), 'claim/1')
    assert.equal(action.label, claimStatus === 'CLAIMED' ? 'View release / receipt' : 'Review claim')
  }
  // Older servers can still open the claim register through beneficiary search.
  const action = queueNextAction({ ...schedule, claim: { claimStatus: 'VERIFIED' } }, event, role)
  assert.equal(new URL(action.href, 'https://local.test').searchParams.get('claim'), schedule.beneficiaryId)
})

test('event selectors load later pages and reject partial or repeated pages', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const calls = []
  let mode = 'complete'
  globalThis.fetch = async (input) => {
    const url = new URL(input, 'https://local.test')
    calls.push(url)
    const page = Number(url.searchParams.get('page'))
    if (mode === 'failed' && page === 2) return { ok: false, status: 503, json: async () => ({ error: { message: 'Events unavailable' } }) }
    const distributions = page === 1 ? [{ distributionId: 'first' }] : mode === 'empty' ? [] : [{ distributionId: mode === 'repeat' ? 'first' : 'later' }]
    return { ok: true, json: async () => ({ data: { distributions, pagination: { page, totalPages: mode === 'empty' ? 3 : 2 } } }) }
  }
  assert.deepEqual((await requestOpenDistributions('test-token')).map((item) => item.distributionId), ['first', 'later'])
  assert.deepEqual(calls.map((url) => url.searchParams.get('status')), ['OPEN', 'OPEN'])
  for (mode of ['repeat', 'empty', 'failed']) await assert.rejects(requestAllDistributions('test-token', { status: 'DRAFT' }), /changed|incomplete|unavailable/)
})
