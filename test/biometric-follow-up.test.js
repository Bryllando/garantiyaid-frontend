import test from 'node:test'
import assert from 'node:assert/strict'
import { BIOMETRIC_FOLLOW_UP_KEY, biometricActionHref, biometricAttemptGuidance, biometricHistoryHref, defaultFollowUp, followUpActions, followUpErrors, readBiometricFollowUps, writeBiometricFollowUp } from '../src/utils/biometricFollowUp.js'
import { clearStaffSession, requestBiometricAttemptReview } from '../src/auth/staffAuth.js'

const attempt = { attemptId: 'attempt-1', distributionId: 'event-1', beneficiaryId: 'person-1', result: 'NO_MATCH' }
const user = { userId: 'admin-1', role: 'SYSTEM_ADMIN', fullName: 'Admin Reviewer' }

test('a failed live attempt retries the same event and beneficiary without replacing their enrolled profile', () => {
  for (const result of ['NO_MATCH', 'LIVENESS_FAILED', 'PROCESSOR_ERROR']) {
    const action = followUpActions({ ...attempt, result }).find((item) => ['BARANGAY_RECAPTURE', 'SERVICE_RETRY'].includes(item.value))
    const url = new URL(biometricActionHref(action, attempt, 'event/1'), 'https://local.test')
    assert.equal(url.searchParams.get('view'), 'verify')
    assert.equal(url.searchParams.get('beneficiary'), 'person-1')
    assert.equal(url.searchParams.get('distribution'), 'event/1')
  }
})

test('follow-up directs duplicate claims to claims and held profiles to profile review', () => {
  const claim = { ...attempt, result: 'DUPLICATE', claimId: 'claim/1' }
  assert.equal(followUpActions(claim)[0].area, 'claim')
  assert.match(biometricAttemptGuidance(claim), /claim already exists/)
  assert.equal(biometricActionHref(followUpActions(claim)[0], claim, 'event/1'), '/claim-accountability?distribution=event%2F1&claim=claim%2F1&receipt=manual')
  const held = { ...attempt, result: 'DUPLICATE' }
  assert.equal(followUpActions(held)[0].area, 'duplicates')
  assert.match(biometricAttemptGuidance(held), /profile was held/)
  assert.match(biometricAttemptGuidance({ ...attempt, result: 'PROCESSOR_ERROR' }), /not an identity mismatch/)
  assert.equal(followUpActions({ ...attempt, result: 'LIVENESS_FAILED' })[0].owner, 'Barangay staff')
  assert.equal(followUpActions({ ...attempt, result: 'CONSENT_INVALID' }).length, 1)
})

test('resolution requires an outcome and actions must match the recorded result', () => {
  const form = { ...defaultFollowUp(attempt), notes: 'Confirm the selected record before another live capture.' }
  assert.deepEqual(followUpErrors(form, attempt), {})
  assert.ok(followUpErrors({ ...form, status: 'RESOLVED' }, attempt).outcome)
  assert.deepEqual(followUpErrors({ ...form, status: 'RESOLVED', outcome: 'Reviewed the later attempt and documented the follow-up.' }, attempt), {})
  assert.ok(followUpErrors({ ...form, notes: '   ' }, attempt).notes)
  assert.ok(followUpErrors({ ...form, action: 'APPROVE_CLAIM' }, attempt).action)
  assert.ok(followUpErrors({ ...form, notes: 'x'.repeat(1001) }, attempt).notes)
  assert.equal(biometricHistoryHref({ distributionId: 'event/1', result: 'NO_MATCH', page: 2 }), '/biometrics?view=history&distribution=event%2F1&result=NO_MATCH&page=2')
})

test('review drafts restore working notes without changing a saved outcome or another case', (t) => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  const form = { ...defaultFollowUp(attempt), notes: 'Review identity documents with the beneficiary.' }
  const saved = { ...form, reviewer: user.fullName, savedAt: '2026-10-25T04:00:00Z' }
  writeBiometricFollowUp(storage, user, attempt, 'event-1', form, saved)
  writeBiometricFollowUp(storage, user, attempt, 'event-1', { ...form, status: 'UNDER_REVIEW' })
  writeBiometricFollowUp(storage, user, { ...attempt, attemptId: 'attempt-2' }, 'event-1', defaultFollowUp(attempt))
  const cases = readBiometricFollowUps(storage, user)
  assert.equal(cases['event-1:attempt-1'].working.status, 'UNDER_REVIEW')
  assert.equal(cases['event-1:attempt-1'].saved.status, 'NEEDS_FOLLOW_UP')
  assert.equal(Object.keys(cases).length, 2)
  assert.deepEqual(readBiometricFollowUps(storage, { ...user, userId: 'another-admin' }), {})
  assert.deepEqual(readBiometricFollowUps(storage, { ...user, role: 'DSWD_STAFF' }), {})
  assert.equal(attempt.result, 'NO_MATCH')
  const original = globalThis.sessionStorage
  globalThis.sessionStorage = storage
  t.after(() => { if (original === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = original })
  clearStaffSession()
  assert.equal(storage.getItem(BIOMETRIC_FOLLOW_UP_KEY), null)
})

test('corrupt storage and unsuccessful writes never silently replace review drafts', () => {
  assert.throws(() => readBiometricFollowUps({ getItem: () => '{bad' }, user))
  assert.throws(() => readBiometricFollowUps({ getItem: () => JSON.stringify({ userId: user.userId, role: user.role, cases: { x: { working: {} } } }) }, user), /could not be read/)
  const storage = { getItem: () => null, setItem: () => { throw new Error('Storage full') } }
  assert.throws(() => writeBiometricFollowUp(storage, user, attempt, 'event-1', defaultFollowUp(attempt)), /Storage full/)
})

test('attempt review finds older records through authenticated beneficiary-scoped pages', async (t) => {
  const calls = []
  let mode = 'ok'
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const parsed = new URL(url)
    const page = Number(parsed.searchParams.get('page'))
    calls.push({ parsed, options })
    const item = page === 1 ? { ...attempt, attemptId: 'newer-attempt' } : { ...attempt }
    if (mode === 'wrong-person') item.beneficiaryId = 'another-person'
    if (mode === 'wrong-event') item.distributionId = 'another-event'
    if (mode === 'missing') item.attemptId = 'other-attempt'
    const data = { attempts: [item], privacy: {}, pagination: { page, total: mode === 'changed' && page === 2 ? 3 : 2, totalPages: 2 } }
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  const review = await requestBiometricAttemptReview('local-token', 'event-1', 'person-1', 'attempt-1')
  assert.equal(review.attempt.attemptId, 'attempt-1')
  assert.equal(review.history.attempts[0].attemptId, 'newer-attempt')
  assert.ok(calls.every(({ parsed, options }) => parsed.searchParams.get('beneficiaryId') === 'person-1' && options.method === 'GET' && options.headers.Authorization === 'Bearer local-token'))
  for (const value of ['wrong-person', 'wrong-event', 'missing', 'changed']) {
    mode = value
    await assert.rejects(requestBiometricAttemptReview('local-token', 'event-1', 'person-1', 'attempt-1'), /unrelated|not available|refresh/)
  }
})
