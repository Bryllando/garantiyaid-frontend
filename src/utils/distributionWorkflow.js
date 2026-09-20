export const DISTRIBUTION_SETUP_STAGES = Object.freeze([
  { key: 'sessions', label: 'Service sessions', shortLabel: 'Sessions', icon: 'calendar' },
  { key: 'beneficiaries', label: 'Beneficiary allocation', shortLabel: 'Allocate', icon: 'beneficiaries' },
  { key: 'queue', label: 'Queue schedule', shortLabel: 'Schedule', icon: 'queue' },
  { key: 'launch', label: 'Open event', shortLabel: 'Open', icon: 'check' },
])

export function distributionSetupState({
  status = 'DRAFT',
  slotCount = 0,
  capacity = 0,
  activeAllocations = 0,
  scheduled = 0,
} = {}) {
  const sessionsComplete = slotCount > 0
  const allocationsComplete = activeAllocations > 0
  const queueComplete = allocationsComplete && scheduled >= activeAllocations
  const lifecycleComplete = ['OPEN', 'CLOSED'].includes(status)
  const isDraft = status === 'DRAFT'
  const readyToOpen = isDraft && sessionsComplete && allocationsComplete && queueComplete
  const remainingCapacity = Math.max(0, capacity - activeAllocations)
  const unscheduled = Math.max(0, activeAllocations - scheduled)
  const occupancyPercent = capacity > 0 ? Math.min(100, Math.round(activeAllocations / capacity * 100)) : 0

  let recommendedStage = 'launch'
  let nextAction = 'Review the preserved event record.'
  if (isDraft && !sessionsComplete) {
    recommendedStage = 'sessions'
    nextAction = 'Plan service sessions and beneficiary capacity.'
  } else if (isDraft && !allocationsComplete) {
    recommendedStage = 'beneficiaries'
    nextAction = 'Allocate at least one approved beneficiary.'
  } else if (isDraft && !queueComplete) {
    recommendedStage = 'queue'
    nextAction = `Schedule ${unscheduled} remaining ${unscheduled === 1 ? 'beneficiary' : 'beneficiaries'}.`
  } else if (readyToOpen) {
    nextAction = 'Review the readiness checks and open the event.'
  } else if (status === 'OPEN') {
    nextAction = 'Issue required credentials and monitor field operations.'
  } else if (status === 'CLOSED') {
    nextAction = 'Review final records and audit evidence.'
  } else if (status === 'CANCELLED') {
    nextAction = 'This event is cancelled and remains read-only.'
  }

  const completeByStage = [sessionsComplete, allocationsComplete, queueComplete, lifecycleComplete]
  const availableByStage = isDraft
    ? [true, sessionsComplete, allocationsComplete, queueComplete]
    : [true, true, true, true]

  return {
    readyToOpen,
    remainingCapacity,
    unscheduled,
    occupancyPercent,
    recommendedStage,
    nextAction,
    stages: DISTRIBUTION_SETUP_STAGES.map((stage, index) => ({
      ...stage,
      complete: completeByStage[index],
      available: availableByStage[index],
    })),
  }
}
