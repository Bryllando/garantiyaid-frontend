import test from 'node:test'
import assert from 'node:assert/strict'
import { distributionSetupState } from '../src/utils/distributionWorkflow.js'

test('distribution setup recommends the next valid government workflow stage', () => {
  assert.equal(distributionSetupState().recommendedStage, 'sessions')
  assert.equal(distributionSetupState({ slotCount: 4, capacity: 40 }).recommendedStage, 'beneficiaries')
  assert.equal(distributionSetupState({ slotCount: 4, capacity: 40, activeAllocations: 12, scheduled: 7 }).recommendedStage, 'queue')

  const ready = distributionSetupState({ slotCount: 4, capacity: 40, activeAllocations: 12, scheduled: 12 })
  assert.equal(ready.recommendedStage, 'launch')
  assert.equal(ready.readyToOpen, true)
  assert.equal(ready.remainingCapacity, 28)
  assert.equal(ready.occupancyPercent, 30)
  assert.deepEqual(ready.stages.map(({ available }) => available), [true, true, true, true])
})

test('opened and cancelled events remain reviewable without reopening setup actions', () => {
  const opened = distributionSetupState({ status: 'OPEN', slotCount: 4, capacity: 20, activeAllocations: 18, scheduled: 18 })
  assert.equal(opened.readyToOpen, false)
  assert.equal(opened.recommendedStage, 'launch')
  assert.match(opened.nextAction, /field operations/i)
  assert.deepEqual(opened.stages.map(({ available }) => available), [true, true, true, true])

  const cancelled = distributionSetupState({ status: 'CANCELLED' })
  assert.match(cancelled.nextAction, /cancelled/i)
})
