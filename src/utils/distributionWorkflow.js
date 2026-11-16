import { philippineDate } from './philippineDate.js'

export function nextDistributionDate(now = new Date()) {
  return philippineDate(new Date(now.getTime() + 86_400_000))
}

export function distributionWindowEnded(distribution, now = new Date()) {
  return new Date(`${distribution.distributionDate}T${distribution.endTime}:00+08:00`) <= now
}

export function distributionTimeSlots(startTime, endTime, slotDuration) {
  const minutes = time => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute }
  const start = minutes(startTime)
  const eventMinutes = minutes(endTime) - start
  const duration = Number(slotDuration)
  const valid = eventMinutes > 0 && Number.isInteger(duration) && duration >= 5 && duration <= 720 && duration % 5 === 0
  const remainder = valid ? eventMinutes % duration : null
  const nearestEnd = start + Math.max(1, Math.round(eventMinutes / duration)) * duration
  return {
    eventMinutes,
    remainder,
    windowCount: remainder === 0 ? eventMinutes / duration : 0,
    suggestedEndTime: remainder > 0 && nearestEnd < 1440 ? `${String(Math.floor(nearestEnd / 60)).padStart(2, '0')}:${String(nearestEnd % 60).padStart(2, '0')}` : null,
  }
}

export function qrIssuanceState({ distribution, readyCount = 0, issuedCount = 0, eligibility = {}, now = new Date() }) {
  if (readyCount > 0) return 'READY'
  if (issuedCount > 0) return 'ISSUED'
  if (eligibility.scheduledCount > 0 && eligibility.endedScheduleCount === eligibility.scheduledCount) return 'ENDED'
  if (eligibility.scheduledCount === undefined && distributionWindowEnded(distribution, now)) return 'ENDED'
  return 'UNAVAILABLE'
}

export const DISTRIBUTION_SETUP_STAGES = Object.freeze([
  { key: 'sessions', label: 'Service sessions', shortLabel: 'Sessions', icon: 'calendar' },
  { key: 'beneficiaries', label: 'Beneficiary allocation', shortLabel: 'Allocate', icon: 'beneficiaries' },
  { key: 'queue', label: 'Queue schedule', shortLabel: 'Schedule', icon: 'queue' },
  { key: 'launch', label: 'Open event', shortLabel: 'Open', icon: 'check' },
])

export function distributionSetupState({
  status = 'DRAFT',
  deliveryMode,
  packageQuantity,
  slotCount = 0,
  capacity = 0,
  activeAllocations = 0,
  scheduled = 0,
  cancelledSchedules = 0,
  schedulableAllocations,
} = {}) {
  const sessionsComplete = slotCount > 0
  const allocationsComplete = activeAllocations > 0
  const queueComplete = allocationsComplete && scheduled >= activeAllocations
  const capacityComplete = sessionsComplete && capacity >= activeAllocations
  const lifecycleComplete = ['OPEN', 'CLOSED'].includes(status)
  const isDraft = status === 'DRAFT'
  const packageComplete = deliveryMode !== 'PHYSICAL_GOODS' || (Number.isInteger(packageQuantity) && packageQuantity >= 1 && packageQuantity <= 10000)
  const readyToOpen = packageComplete && isDraft && sessionsComplete && capacityComplete && allocationsComplete && queueComplete
  const remainingCapacity = Math.max(0, capacity - activeAllocations)
  const unscheduled = Math.max(0, activeAllocations - scheduled)
  const newScheduleCount = Math.min(unscheduled, Math.max(0, schedulableAllocations ?? unscheduled - cancelledSchedules))
  const cancelledScheduleCount = Math.max(0, unscheduled - newScheduleCount)
  const occupancyPercent = capacity > 0 ? Math.min(100, Math.round(activeAllocations / capacity * 100)) : 0

  let recommendedStage = 'launch'
  let nextAction = 'Review the preserved event record.'
  if (isDraft && !sessionsComplete) {
    recommendedStage = 'sessions'
    nextAction = 'Plan service sessions and beneficiary capacity.'
  } else if (isDraft && !capacityComplete) {
    recommendedStage = 'sessions'
    nextAction = 'Increase slot capacity to cover the allocated beneficiaries.'
  } else if (isDraft && !allocationsComplete) {
    recommendedStage = 'beneficiaries'
    nextAction = 'Allocate at least one approved beneficiary.'
  } else if (isDraft && !queueComplete) {
    recommendedStage = 'queue'
    nextAction = newScheduleCount > 0
      ? `Schedule ${newScheduleCount} remaining ${newScheduleCount === 1 ? 'beneficiary' : 'beneficiaries'}.${cancelledScheduleCount ? ' Review cancelled schedules separately.' : ''}`
      : 'Review and reactivate cancelled schedules to complete the queue.'
  } else if (isDraft && !packageComplete) {
    nextAction = 'Edit the assistance package, unit and quantity before opening.'
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
    ? [true, sessionsComplete, allocationsComplete, true]
    : [true, true, true, true]

  return {
    readyToOpen,
    packageComplete,
    capacityComplete,
    remainingCapacity,
    unscheduled,
    newScheduleCount,
    cancelledScheduleCount,
    occupancyPercent,
    recommendedStage,
    nextAction,
    stages: DISTRIBUTION_SETUP_STAGES.map((stage, index) => ({
      ...stage,
      ...(!isDraft && stage.key === 'launch' ? { label: 'Event operations', shortLabel: status === 'OPEN' ? 'Monitor' : 'Review' } : {}),
      complete: !isDraft && stage.key === 'launch' ? false : completeByStage[index],
      available: availableByStage[index],
    })),
  }
}
