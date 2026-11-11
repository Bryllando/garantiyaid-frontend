export function smsDeliveryNotice(simulated) {
  if (simulated === true) return 'Simulation only. No real SMS will be sent.'
  if (simulated === false) return 'Real SMS via SimGate. Uses the gateway phone’s SIM and text allowance. Gateway acceptance does not confirm recipient delivery.'
  return 'SMS mode is unavailable. Refresh the delivery status before queueing a message.'
}

export function canRetrySms(notification) {
  return notification.status === 'FAILED' && !['SIMGATE_SEND_STARTED', 'SIMGATE_DELIVERY_UNCONFIRMED'].includes(notification.lastErrorCode)
}

export function smsStatusLabel(notification) {
  if (notification.status === 'FAILED' && notification.lastErrorCode === 'SMS_SIMULATED_BY_OLD_WORKER') return 'Not sent (old worker)'
  if (['SIMGATE_SEND_STARTED', 'SIMGATE_DELIVERY_UNCONFIRMED'].includes(notification.lastErrorCode)) return 'Check gateway'
  if (notification.status === 'SENT') return notification.simulated === false ? 'Gateway accepted' : 'Sent (simulation)'
  return notification.status === 'PENDING' ? 'Queued' : notification.status === 'READ' ? 'Read' : 'Failed'
}
