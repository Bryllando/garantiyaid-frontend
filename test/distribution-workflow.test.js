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
  assert.equal(opened.stages.at(-1).shortLabel, 'Monitor')
  assert.equal(opened.stages.at(-1).complete, false, 'Opening does not complete the operational review')

  const cancelled = distributionSetupState({ status: 'CANCELLED' })
  assert.match(cancelled.nextAction, /cancelled/i)
})

test('readiness remains reviewable before setup and capacity cannot be bypassed', () => {
  assert.equal(distributionSetupState().stages.find((stage) => stage.key === 'launch').available, true)
  const overCapacity = distributionSetupState({ slotCount: 2, capacity: 5, activeAllocations: 6, scheduled: 6 })
  assert.equal(overCapacity.readyToOpen, false)
  assert.equal(overCapacity.capacityComplete, false)
  assert.equal(overCapacity.recommendedStage, 'sessions')
})


test('physical event readiness requires a package quantity while wallet readiness does not', () => {
  const ready = { status: 'DRAFT', slotCount: 1, capacity: 10, activeAllocations: 1, scheduled: 1 };
  const pending = distributionSetupState({ ...ready, deliveryMode: 'PHYSICAL_GOODS' });
  assert.equal(pending.readyToOpen, false);
  assert.match(pending.nextAction, /package/);
  assert.equal(distributionSetupState({ ...ready, deliveryMode: 'PHYSICAL_GOODS', packageQuantity: 2 }).readyToOpen, true);
  assert.equal(distributionSetupState({ ...ready, deliveryMode: 'SIMULATED_WALLET' }).readyToOpen, true);
});
