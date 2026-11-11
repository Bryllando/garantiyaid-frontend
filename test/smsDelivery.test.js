import assert from 'node:assert/strict'
import test from 'node:test'
import { canRetrySms, smsDeliveryNotice, smsStatusLabel } from '../src/utils/smsDelivery.js'

test('SMS wording distinguishes simulation, provider acceptance and unconfirmed submissions', () => {
  assert.match(smsDeliveryNotice(true), /No real SMS/)
  assert.match(smsDeliveryNotice(false), /does not confirm recipient delivery/)
  assert.match(smsDeliveryNotice(undefined), /unavailable/)
  assert.equal(smsStatusLabel({ status: 'SENT', simulated: true }), 'Sent (simulation)')
  assert.equal(smsStatusLabel({ status: 'SENT', simulated: false }), 'Gateway accepted')
  for (const lastErrorCode of ['SIMGATE_SEND_STARTED', 'SIMGATE_DELIVERY_UNCONFIRMED']) {
    const row = { status: 'FAILED', lastErrorCode }
    assert.equal(smsStatusLabel(row), 'Check gateway')
    assert.equal(canRetrySms(row), false)
  }
  assert.equal(canRetrySms({ status: 'FAILED', lastErrorCode: 'SIMGATE_SEND_403' }), true)
  assert.equal(canRetrySms({ status: 'SENT' }), false)
  const oldWorker = { status: 'FAILED', simulated: false, lastErrorCode: 'SMS_SIMULATED_BY_OLD_WORKER' }
  assert.equal(smsStatusLabel(oldWorker), 'Not sent (old worker)')
  assert.equal(canRetrySms(oldWorker), true)
})
