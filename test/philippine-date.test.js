import assert from 'node:assert/strict'
import test from 'node:test'
import { philippineDate } from '../src/utils/philippineDate.js'
import { nextDistributionDate } from '../src/utils/distributionWorkflow.js'

test('calendar limits use the Philippine day across midnight, 8 AM and New Year', () => {
  for (const [time, today, tomorrow] of [
    ['2026-11-16T15:59:59Z', '2026-11-16', '2026-11-17'],
    ['2026-11-16T16:00:00Z', '2026-11-17', '2026-11-18'],
    ['2026-11-16T23:59:59Z', '2026-11-17', '2026-11-18'],
    ['2026-11-17T00:00:00Z', '2026-11-17', '2026-11-18'],
    ['2026-12-31T16:00:00Z', '2027-01-01', '2027-01-02'],
  ]) {
    assert.equal(philippineDate(new Date(time)), today)
    assert.equal(nextDistributionDate(new Date(time)), tomorrow)
  }
})
