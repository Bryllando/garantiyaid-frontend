import { io } from 'socket.io-client'
import { API_BASE_URL } from '../config/api.js'

export const DSWD_LIVE_EVENTS = Object.freeze([
  'distribution.updated',
  'schedule.updated',
  'schedule.checked_in',
  'qr.scan.recorded',
  'claim.updated',
  'claim.released',
  'biometric.attempt.recorded',
  'wallet.transaction.completed',
  'wallet.transaction.reversed',
  'dashboard.metrics.updated',
  'anomaly.detected',
])

export const OVERVIEW_LIVE_EVENTS = Object.freeze(['dashboard.metrics.updated'])
export const FACILITATOR_QUEUE_LIVE_EVENTS = Object.freeze([
  'distribution.updated',
  'schedule.updated',
  'schedule.checked_in',
  'claim.updated',
  'claim.released',
])
export const CHATBOT_LIVE_EVENTS = Object.freeze([
  'chatbot.session.escalated',
  'chatbot.session.referred',
  'chatbot.staff_reply.created',
  'chatbot.session.resolved',
])

export const NOTIFICATION_LIVE_EVENTS = Object.freeze([
  'notification.queued',
  'notification.sent',
  'notification.failed',
])

export const STAFF_NOTIFICATION_LIVE_EVENTS = Object.freeze([
  'staff.notification.created',
])

export function realtimeServerUrl(apiUrl = API_BASE_URL) {
  const url = new URL(apiUrl, typeof window === 'undefined' ? 'http://localhost' : window.location.origin)
  return `${url.protocol}//${url.host}`
}

function connectRealtime(accessToken, events, handlers = {}, createSocket = io) {
  const socket = createSocket(realtimeServerUrl(), {
    auth: { accessToken },
    transports: ['polling', 'websocket'],
    tryAllTransports: true,
    reconnection: true,
  })

  socket.on('realtime.ready', (payload) => handlers.onReady?.(payload))
  socket.on('connect_error', (error) => handlers.onError?.(error))
  socket.on('disconnect', (reason) => handlers.onDisconnect?.(reason))
  events.forEach((eventName) => {
    socket.on(eventName, (payload) => handlers.onUpdate?.(eventName, payload))
  })

  return () => socket.disconnect()
}

export function connectStaffRealtime(accessToken, handlers = {}, createSocket = io) {
  return connectRealtime(accessToken, DSWD_LIVE_EVENTS, handlers, createSocket)
}

export function connectOverviewRealtime(accessToken, handlers = {}, createSocket = io) {
  return connectRealtime(accessToken, OVERVIEW_LIVE_EVENTS, handlers, createSocket)
}

export function connectFacilitatorQueueRealtime(accessToken, handlers = {}, createSocket = io) {
  return connectRealtime(accessToken, FACILITATOR_QUEUE_LIVE_EVENTS, handlers, createSocket)
}

export function connectChatbotRealtime(accessToken, handlers = {}, createSocket = io) {
  return connectRealtime(accessToken, CHATBOT_LIVE_EVENTS, handlers, createSocket)
}

export function connectNotificationRealtime(accessToken, handlers = {}, createSocket = io) {
  return connectRealtime(accessToken, NOTIFICATION_LIVE_EVENTS, handlers, createSocket)
}

export function connectStaffNotificationRealtime(accessToken, handlers = {}, createSocket = io) {
  return connectRealtime(accessToken, STAFF_NOTIFICATION_LIVE_EVENTS, handlers, createSocket)
}
