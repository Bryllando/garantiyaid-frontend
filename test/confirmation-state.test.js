import assert from 'node:assert/strict'
import test from 'node:test'
import { confirmationSnapshot, uncertainConfirmation, pendingConfirmation } from '../src/components/assistant/confirmation-state.js'
import { confirmAssistantDistribution, enqueueAssistantDistributionReminder } from '../src/auth/staffAuth.js'

test('confirmation uses an immutable copy of the exact preview request', () => {
  const payload = { title: 'Reviewed draft' }
  const preview = { approvalId: 'approved', approvalExpiresAt: '2099-01-01T00:15:00Z' }
  const snapshot = confirmationSnapshot(preview, payload)
  payload.title = 'Edited later'
  preview.approvalId = 'another'
  assert.equal(snapshot.request.title, 'Reviewed draft')
  assert.equal(snapshot.approvalId, 'approved')
  assert.throws(() => { snapshot.request.title = 'Changed' }, TypeError)
  assert.throws(() => confirmationSnapshot({}, payload), /new preview/)
})

test('unknown outcomes, session expiry and throttling retain the original confirmation', () => {
  for (const error of [new TypeError('Network failed'), { status: 503 }, { status: 401 }, { status: 408 }, { status: 429 }, { status: 409, code: 'ASSISTANT_CONCURRENT_CHANGE' }]) assert.equal(uncertainConfirmation(error), true)
  for (const error of [{ status: 403 }, { status: 400 }, { status: 409, code: 'NOTIFICATION_PREVIEW_CHANGED' }]) assert.equal(uncertainConfirmation(error), false)
})

test('submitted confirmation survives refresh per staff identity and clears after resolution', (t) => {
  const values = new Map()
  const previous = globalThis.window
  globalThis.window = { sessionStorage: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) } }
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous })
  const attempt = { kind: 'distribution', approvalId: 'original', request: { title: 'Reviewed' } }
  assert.deepEqual(pendingConfirmation('staff-a', attempt), attempt)
  assert.deepEqual(pendingConfirmation('staff-a'), attempt)
  assert.equal(pendingConfirmation('staff-b'), null)
  assert.equal(pendingConfirmation('staff-a', null), null)
  assert.equal(values.size, 0)
  globalThis.window.sessionStorage.getItem = () => { throw new Error('Storage blocked') }
  assert.equal(pendingConfirmation('staff-a'), null)
})

test('confirmation HTTP retries reuse the server approval in header and body', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options })
    if (calls.length === 1) throw new TypeError('Response lost')
    return { ok: true, json: async () => ({ success: true, data: { distribution: { distributionId: 'created' }, notifications: [], queuedCount: 0 } }) }
  })
  const approvalId = '11111111-1111-4111-8111-111111111111'
  const payload = { title: 'Reviewed' }
  await assert.rejects(confirmAssistantDistribution('test-token', payload, approvalId), /Response lost/)
  await confirmAssistantDistribution('test-token', payload, approvalId)
  assert.deepEqual(calls[0], calls[1])
  assert.equal(calls[1].headers['Idempotency-Key'], approvalId)
  assert.deepEqual(JSON.parse(calls[1].body), { ...payload, approvalId, confirmed: true })
  await enqueueAssistantDistributionReminder('test-token', 'event', { approvalId, confirmed: true, messageTemplate: 'Reviewed reminder' })
  assert.equal(calls[2].headers['Idempotency-Key'], approvalId)
})
