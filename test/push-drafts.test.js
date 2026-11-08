import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyPushEditor, pushRecipients, pushDraftErrors, readPushWorkspace, savePushWorkspace, PUSH_DRAFTS_KEY } from '../src/utils/pushDrafts.js'
import { clearStaffSession, requestAllDistributionSchedules } from '../src/auth/staffAuth.js'

const row = (id, beneficiaryId, status = 'SCHEDULED') => ({ scheduleId: id, beneficiary: { beneficiaryId }, status })

test('push audiences exclude cancelled and unknown assignments and deduplicate people', () => {
  const schedules = [row('1', 'a'), row('2', 'b', 'CHECKED_IN'), row('3', 'c', 'CANCELLED'), row('4', 'a'), row('5', 'd', 'MISSED'), row('6', 'e', 'UNKNOWN')]
  assert.deepEqual(pushRecipients(schedules, 'SCHEDULED').map((item) => item.beneficiary.beneficiaryId), ['a'])
  assert.deepEqual(pushRecipients(schedules, 'ACTIVE').map((item) => item.beneficiary.beneficiaryId), ['a', 'b', 'd'])
  assert.deepEqual(pushRecipients(schedules, 'SELECTED', ['a', 'c', 'd', 'missing']).map((item) => item.beneficiary.beneficiaryId), ['a', 'd'])
  assert.deepEqual(pushRecipients(schedules, 'UNKNOWN'), [])
})

test('draft validation rejects missing recipients, blank wording, and oversized copy', () => {
  assert.equal(Object.keys(pushDraftErrors(emptyPushEditor(), 0)).length, 4)
  const editor = { ...emptyPushEditor('event-1'), title: 'Schedule update', message: 'Please bring your identification.' }
  assert.deepEqual(pushDraftErrors(editor, 1), {})
  assert.ok(pushDraftErrors({ ...editor, title: ' '.repeat(3) }, 1).title)
  assert.ok(pushDraftErrors({ ...editor, message: 'x'.repeat(501) }, 1).message)
  assert.ok(pushDraftErrors({ ...editor, title: 'x'.repeat(81) }, 1).title)
})

test('tab drafts restore only for their owner, remain drafts, and clear at sign-out', (t) => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  const editor = { ...emptyPushEditor('event-1'), id: 'draft-1', title: 'Notice', message: 'Bring your ID.' }
  const draft = { ...editor, status: 'DRAFT', recipientCount: 2, savedAt: '2026-10-25T04:00:00Z' }
  savePushWorkspace(storage, 'admin-1', { editor, drafts: [draft] })
  assert.equal(readPushWorkspace(storage, 'admin-1').drafts[0].status, 'DRAFT')
  assert.equal(readPushWorkspace(storage, 'admin-1', 'event-2').editor.distributionId, 'event-2')
  assert.equal(readPushWorkspace(storage, 'admin-1', 'event-2').drafts.length, 1)
  assert.deepEqual(readPushWorkspace(storage, 'admin-2').drafts, [])
  const previousStorage = globalThis.sessionStorage
  globalThis.sessionStorage = storage
  t.after(() => { if (previousStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previousStorage })
  clearStaffSession()
  assert.equal(storage.getItem(PUSH_DRAFTS_KEY), null)
})

test('invalid stored drafts and storage failures are not reported as saved', () => {
  const editor = emptyPushEditor('event-1')
  assert.throws(() => readPushWorkspace({ getItem: () => '{broken' }, 'admin-1'))
  assert.throws(() => readPushWorkspace({ getItem: () => JSON.stringify({ userId: 'admin-1', editor, drafts: [{ ...editor, status: 'SENT' }] }) }, 'admin-1'), /could not be read/)
  assert.throws(() => savePushWorkspace({ setItem: () => { throw new Error('Storage full') } }, 'admin-1', { editor, drafts: [] }), /Storage full/)
})

test('recipient loading reads every page and rejects partial or changing assignments', async (t) => {
  const calls = []
  let mode = 'complete'
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const parsed = new URL(url)
    const page = Number(parsed.searchParams.get('page'))
    calls.push({ page, options })
    const schedules = page === 1 ? [row('1', 'a')] : mode === 'partial' ? [] : mode === 'duplicate' ? [row('1', 'a')] : [row('2', 'b')]
    const pagination = { page, total: mode === 'changed' && page === 2 ? 3 : 2, totalPages: 2 }
    return new Response(JSON.stringify({ data: { schedules, summary: {}, pagination } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  assert.equal((await requestAllDistributionSchedules('local-token', 'event-1')).length, 2)
  assert.deepEqual(calls.map((call) => call.page), [1, 2])
  assert.ok(calls.every((call) => call.options.method === 'GET' && call.options.headers.Authorization === 'Bearer local-token'))
  for (const value of ['partial', 'duplicate', 'changed']) {
    mode = value
    await assert.rejects(requestAllDistributionSchedules('local-token', 'event-1'), /incomplete|changed/)
  }
})
