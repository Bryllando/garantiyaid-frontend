import { io } from 'socket.io-client'

const API_BASE_URL = (import.meta.env?.VITE_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '')

export const DSWD_LIVE_EVENTS = Object.freeze([
  'distribution.updated',
  'schedule.checked_in',
  'qr.scan.recorded',
  'claim.updated',
  'biometric.attempt.recorded',
  'wallet.transaction.completed',
  'wallet.transaction.reversed',
  'dashboard.metrics.updated',
  'anomaly.detected',
])

export function realtimeServerUrl(apiUrl = API_BASE_URL) {
  const url = new URL(apiUrl, typeof window === 'undefined' ? 'http://localhost' : window.location.origin)
  return `${url.protocol}//${url.host}`
}

export function connectStaffRealtime(accessToken, handlers = {}, createSocket = io) {
  const socket = createSocket(realtimeServerUrl(), {
    auth: { accessToken },
    transports: ['websocket', 'polling'],
  })

  socket.on('realtime.ready', (payload) => handlers.onReady?.(payload))
  socket.on('connect_error', (error) => handlers.onError?.(error))
  socket.on('disconnect', (reason) => handlers.onDisconnect?.(reason))
  DSWD_LIVE_EVENTS.forEach((eventName) => {
    socket.on(eventName, (payload) => handlers.onUpdate?.(eventName, payload))
  })

  return () => socket.disconnect()
}
