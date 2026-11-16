import test from 'node:test'
import assert from 'node:assert/strict'
import { distributionTimeSlots, distributionWindowEnded, nextDistributionDate, qrIssuanceState } from '../src/utils/distributionWorkflow.js'

const distribution = { distributionDate: '2026-11-16', endTime: '12:00' }
const now = new Date('2026-11-16T06:00:00Z')

test('slot planning explains the reported 31- and 61-minute windows and suggests a complete slot boundary', () => {
  assert.deepEqual(distributionTimeSlots('16:30', '17:01', '30'), {
    eventMinutes: 31, remainder: 1, windowCount: 0, suggestedEndTime: '17:00',
  })
  assert.deepEqual(distributionTimeSlots('16:00', '17:01', 30), {
    eventMinutes: 61, remainder: 1, windowCount: 0, suggestedEndTime: '17:00',
  })
  assert.deepEqual(distributionTimeSlots('16:00', '17:00', 30), {
    eventMinutes: 60, remainder: 0, windowCount: 2, suggestedEndTime: null,
  })
  assert.equal(distributionTimeSlots('16:30', '16:45', 30).suggestedEndTime, '17:00')
})

test('slot suggestions require complete inputs and stay within the selected day', () => {
  for (const [start, end, duration] of [['', '17:00', 30], ['16:00', '', 30], ['17:00', '16:00', 30], ['16:00', '17:00', 0], ['16:00', '17:00', 7]]) {
    const result = distributionTimeSlots(start, end, duration)
    assert.equal(result.suggestedEndTime, null)
    assert.equal(result.windowCount, 0)
    assert.equal(result.remainder, null)
  }
  assert.equal(distributionTimeSlots('23:00', '23:59', 30).suggestedEndTime, null)
})

test('new distributions default to tomorrow in Philippine time, including month and year boundaries', () => {
  assert.equal(nextDistributionDate(new Date('2026-11-16T15:59:59Z')), '2026-11-17')
  assert.equal(nextDistributionDate(new Date('2026-11-16T16:00:00Z')), '2026-11-18')
  assert.equal(nextDistributionDate(new Date('2026-12-31T00:00:00Z')), '2027-01-01')
})

test('service windows end at their exact Philippine cutoff', () => {
  assert.equal(distributionWindowEnded(distribution, new Date('2026-11-16T03:59:59.999Z')), false)
  assert.equal(distributionWindowEnded(distribution, new Date('2026-11-16T04:00:00Z')), true)
  assert.equal(distributionWindowEnded(distribution, now), true)
})

test('QR guidance uses actual eligibility before the event first-day date for multi-day sessions', () => {
  assert.equal(qrIssuanceState({ distribution, now, readyCount: 1 }), 'READY')
  assert.equal(qrIssuanceState({ distribution, now, issuedCount: 1 }), 'ISSUED')
  assert.equal(qrIssuanceState({ distribution, now, eligibility: { scheduledCount: 2, endedScheduleCount: 2 } }), 'ENDED')
  assert.equal(qrIssuanceState({ distribution, now, eligibility: { scheduledCount: 2, endedScheduleCount: 1 } }), 'UNAVAILABLE')
  assert.equal(qrIssuanceState({ distribution, now, eligibility: { scheduledCount: 0, endedScheduleCount: 0 } }), 'UNAVAILABLE')
  assert.equal(qrIssuanceState({ distribution, now }), 'ENDED')
})
