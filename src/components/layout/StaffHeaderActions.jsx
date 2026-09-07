import { useCallback, useEffect, useRef, useState } from 'react'
import {
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
  requestServerTimestamp,
  requestStaffNotifications,
} from '../../auth/staffAuth.js'
import { connectStaffNotificationRealtime } from '../../realtime/staffRealtime.js'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'

const philippineDate = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const philippineTime = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const notificationTime = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function PhilippineClock() {
  const offsetRef = useRef(0)
  const [now, setNow] = useState(() => new Date())
  const [serverSynced, setServerSynced] = useState(false)

  const syncWithServer = useCallback(async () => {
    const requestedAt = Date.now()
    try {
      const timestamp = await requestServerTimestamp()
      const receivedAt = Date.now()
      offsetRef.current = Date.parse(timestamp) - ((requestedAt + receivedAt) / 2)
      setServerSynced(true)
      setNow(new Date(Date.now() + offsetRef.current))
    } catch {
      // The device clock remains available if the health endpoint is temporarily unreachable.
    }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- synchronize against the server when the header mounts.
    syncWithServer()
    const tick = window.setInterval(() => setNow(new Date(Date.now() + offsetRef.current)), 1_000)
    const resync = window.setInterval(syncWithServer, 5 * 60_000)
    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') syncWithServer()
    }
    document.addEventListener('visibilitychange', syncWhenVisible)
    return () => {
      window.clearInterval(tick)
      window.clearInterval(resync)
      document.removeEventListener('visibilitychange', syncWhenVisible)
    }
  }, [syncWithServer])

  return (
    <div className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-1.5 text-right text-copy sm:border sm:border-line sm:bg-slate-50 sm:px-3" title={serverSynced ? 'Synced with the GarantiyAid server' : 'Using this device clock until the server reconnects'}>
      <Icon name="clock" className="hidden size-4 text-brand-blue sm:block" strokeWidth={2} />
      <span className="leading-tight">
        <time dateTime={now.toISOString()} className="block whitespace-nowrap text-[0.7rem] font-bold tabular-nums text-ink sm:text-xs">
          {philippineTime.format(now)}
        </time>
        <span className="hidden whitespace-nowrap text-[0.65rem] font-semibold text-muted-copy xl:block">
          {philippineDate.format(now)} · PHT
        </span>
      </span>
    </div>
  )
}

export function StaffNotificationCenter({ accessToken, onNavigate }) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const [error, setError] = useState('')
  const [liveReady, setLiveReady] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')
  const mountedRef = useRef(true)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)

  const loadNotifications = useCallback(async () => {
    if (!accessToken) return
    try {
      const data = await requestStaffNotifications(accessToken)
      if (!mountedRef.current) return
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
      setError('')
    } catch {
      if (mountedRef.current) setError('Notifications are temporarily unavailable.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- load the signed-in user's persisted inbox.
    loadNotifications()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadNotifications()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible)
  }, [loadNotifications])

  useEffect(() => {
    if (!accessToken) return undefined
    return connectStaffNotificationRealtime(accessToken, {
      onReady: () => {
        setLiveReady(true)
        loadNotifications()
      },
      onUpdate: () => {
        setLiveMessage('New staff notification received.')
        loadNotifications()
      },
      onError: () => setLiveReady(false),
      onDisconnect: () => setLiveReady(false),
    })
  }, [accessToken, loadNotifications])

  useEffect(() => {
    if (!open) return undefined
    // oxlint-disable-next-line react/set-state-in-effect -- reconcile persisted state whenever the popover opens.
    loadNotifications()
    const closePopover = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      } else if (event.type === 'pointerdown' && !rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', closePopover)
    document.addEventListener('pointerdown', closePopover)
    return () => {
      document.removeEventListener('keydown', closePopover)
      document.removeEventListener('pointerdown', closePopover)
    }
  }, [loadNotifications, open])

  function goTo(path) {
    if (!path) return
    if (onNavigate) onNavigate(path)
    else window.location.assign(path)
  }

  function openNotification(notification) {
    if (!notification.readAt) {
      const readAt = new Date().toISOString()
      setNotifications((items) => items.map((item) => (
        item.notificationId === notification.notificationId ? { ...item, readAt } : item
      )))
      setUnreadCount((count) => Math.max(0, count - 1))
      markStaffNotificationRead(accessToken, notification.notificationId).catch(loadNotifications)
    }
    setOpen(false)
    goTo(notification.targetPath)
  }

  async function markAllRead() {
    setMarkingAll(true)
    try {
      await markAllStaffNotificationsRead(accessToken)
      const readAt = new Date().toISOString()
      setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? readAt })))
      setUnreadCount(0)
      setError('')
      setLiveMessage('All notifications marked as read.')
    } catch {
      setError('Unable to mark notifications as read. Please retry.')
    } finally {
      setMarkingAll(false)
    }
  }

  const badge = unreadCount > 99 ? '99+' : String(unreadCount)
  const notificationLabel = unreadCount === 0
    ? 'Open staff notifications. No unread notifications.'
    : `Open staff notifications. ${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}.`

  return (
    <div ref={rootRef} className="relative shrink-0">
      <span className="sr-only" role="status" aria-live="polite">{liveMessage}</span>
      <button
        ref={triggerRef}
        type="button"
        aria-label={notificationLabel}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="staff-notification-popover"
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-11 cursor-pointer place-items-center rounded-lg border border-line bg-white text-copy transition-colors hover:border-blue-200 hover:bg-info-soft hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
      >
        <Icon name="notifications" className="size-5" strokeWidth={2} />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-red-600 px-1 text-[0.625rem] font-extrabold leading-none text-white shadow-sm">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <section id="staff-notification-popover" aria-label="Staff notifications" className="fixed left-4 right-4 top-[4.35rem] z-50 overflow-hidden rounded-2xl border border-line bg-white shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96">
          <div className="border-b border-line bg-gradient-to-br from-slate-50 to-blue-50/70 px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-extrabold text-ink">Notifications</h2>
                <p className="mt-1 flex items-center gap-2 text-xs font-semibold text-muted-copy">
                  <span aria-hidden="true" className={`size-2 rounded-full ${liveReady ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {liveReady ? 'Live updates connected' : 'Refreshes automatically'}
                </p>
              </div>
              <button type="button" onClick={markAllRead} disabled={unreadCount === 0 || markingAll} className="min-h-11 rounded-lg px-2 text-xs font-bold text-brand-blue hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:text-slate-400">
                {markingAll ? <LoadingLabel>Marking...</LoadingLabel> : 'Mark all read'}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="m-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900">
              <span>{error}</span>
              <button type="button" onClick={loadNotifications} className="min-h-11 shrink-0 rounded-lg px-2 font-extrabold text-amber-950 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">Retry</button>
            </div>
          )}

          <div className="max-h-[min(28rem,calc(100dvh-9rem))] overflow-y-auto">
            {loading ? (
              <div className="grid min-h-40 place-items-center px-6 text-sm font-semibold text-muted-copy"><LoadingLabel>Loading notifications...</LoadingLabel></div>
            ) : notifications.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-brand-blue"><Icon name="notifications" /></span>
                <p className="mt-3 font-bold text-ink">You’re all caught up</p>
                <p className="mt-1 text-sm leading-6 text-muted-copy">Important account and operations updates will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {notifications.map((notification) => {
                  const unread = !notification.readAt
                  return (
                    <li key={notification.notificationId}>
                      <button type="button" onClick={() => openNotification(notification)} className={`group flex min-h-24 w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-blue ${unread ? 'bg-blue-50/60' : 'bg-white'}`}>
                        <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${unread ? 'bg-brand-blue ring-4 ring-blue-100' : 'bg-slate-300'}`} />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm text-ink ${unread ? 'font-extrabold' : 'font-bold'}`}>{notification.title}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-copy">{notification.message}</span>
                          <time dateTime={notification.createdAt} className="mt-1.5 block text-[0.7rem] font-semibold text-slate-500">{notificationTime.format(new Date(notification.createdAt))}</time>
                          {unread && <span className="sr-only">Unread notification.</span>}
                        </span>
                        {notification.targetPath && <Icon name="chevronRight" className="mt-1 size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
