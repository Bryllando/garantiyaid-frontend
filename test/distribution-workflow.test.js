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

test('cancelled appointments require review instead of generating duplicate schedules', () => {
  const event = { slotCount: 6, capacity: 12, activeAllocations: 2, scheduled: 1, cancelledSchedules: 1 }
  for (const values of [event, { ...event, schedulableAllocations: 0 }]) {
    const state = distributionSetupState(values)
    assert.equal(state.unscheduled, 1)
    assert.equal(state.newScheduleCount, 0)
    assert.equal(state.cancelledScheduleCount, 1)
    assert.equal(state.recommendedStage, 'queue')
    assert.equal(state.readyToOpen, false)
    assert.match(state.nextAction, /reactivate cancelled schedules/)
  }
  const mixed = distributionSetupState({ ...event, activeAllocations: 4, schedulableAllocations: 2 })
  assert.equal(mixed.newScheduleCount, 2)
  assert.equal(mixed.cancelledScheduleCount, 1)
  assert.match(mixed.nextAction, /Schedule 2 remaining/)
  const inactiveCancellation = distributionSetupState({ ...event, cancelledSchedules: 10, schedulableAllocations: 1 })
  assert.equal(inactiveCancellation.newScheduleCount, 1, 'The server counts only active allocations without any schedule')
  assert.equal(inactiveCancellation.cancelledScheduleCount, 0)
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
