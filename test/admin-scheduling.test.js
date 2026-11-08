import test from 'node:test'
import assert from 'node:assert/strict'
import { requestDistributionSlots, updateDistributionSlotCapacity } from '../src/auth/staffAuth.js'

test('capacity editing uses the authenticated slot endpoint and reports conflicts', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options })
    if (JSON.parse(options.body).capacity < 3) return new Response(JSON.stringify({ error: { code: 'DISTRIBUTION_SLOT_CAPACITY_BELOW_USAGE', message: 'Three beneficiaries are already scheduled.' } }), { status: 409 })
    return new Response(JSON.stringify({ data: { slot: { slotId: 'slot-1', capacity: 5 } } }))
  })
  await assert.rejects(updateDistributionSlotCapacity('staff-token', 'event-1', 'slot-1', 2), /Three beneficiaries/)
  assert.equal((await updateDistributionSlotCapacity('staff-token', 'event-1', 'slot-1', 5)).capacity, 5)
  assert.ok(calls[0].url.endsWith('/distributions/event-1/slots/slot-1'))
  assert.equal(calls[0].method, 'PATCH')
  assert.equal(calls[0].headers.Authorization, 'Bearer staff-token')
  assert.deepEqual(JSON.parse(calls[0].body), { capacity: 2 })
})

test('session review includes later slot pages and fails visibly on incomplete responses', async (t) => {
  let fail = false
  t.mock.method(globalThis, 'fetch', async (url) => {
    const page = Number(new URL(url, 'http://localhost').searchParams.get('page'))
    return new Response(JSON.stringify({ data: page === 1
      ? { slots: [{ slotId: 'first' }], summary: { matchingCapacity: 20 }, pagination: { totalPages: 2 } }
      : fail ? {} : { slots: [{ slotId: 'last' }] } }))
  })
  const data = await requestDistributionSlots('staff-token', 'event-1')
  assert.deepEqual(data.slots.map((slot) => slot.slotId), ['first', 'last'])
  assert.equal(data.summary.matchingCapacity, 20)
  fail = true
  await assert.rejects(requestDistributionSlots('staff-token', 'event-1'), /remaining time slots/)
})
