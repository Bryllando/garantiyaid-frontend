import { useEffect, useRef, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestStaffEmailDeliveries } from '../../auth/staffAuth.js'
import { SecurityEmailStatus } from './SecurityEmailStatus.jsx'
import { LoadingLabel } from './spinner.jsx'

const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

export function StaffEmailHistoryDialog({ user, accessToken, onClose, onSessionExpired }) {
  const dialogRef = useRef(null)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const trigger = document.activeElement
    dialogRef.current?.showModal()
    return () => trigger?.focus()
  }, [])

  useEffect(() => {
    let active = true
    requestStaffEmailDeliveries(accessToken, user.userId)
      .then((items) => { if (active) { setNotifications(items); setError('') } })
      .catch((requestError) => {
        if (!active) return
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        setError(getAuthErrorMessage(requestError))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken, onSessionExpired, reload, user.userId])

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="staff-email-history-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(38rem,calc(100%-2rem))] overflow-y-auto rounded-xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <header className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div className="min-w-0"><h2 id="staff-email-history-title" className="text-xl font-bold">Email history</h2><p className="mt-1 break-words text-sm text-copy">{user.fullName} · {user.employeeId}</p><p className="mt-2 text-xs leading-5 text-muted-copy">Latest 20 security emails. Times are in PHT. “Sent” means Gmail accepted the message, not that it reached the Inbox.</p></div>
        <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close email history" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-xl focus-visible:outline-2 focus-visible:outline-brand-blue">×</button>
      </header>
      <div className="p-5">
        <button type="button" disabled={loading} onClick={() => { setLoading(true); setReload((value) => value + 1) }} className="ga-btn-secondary">{loading ? <LoadingLabel>Checking delivery…</LoadingLabel> : 'Refresh status'}</button>
        <p role="status" className="sr-only">{loading ? 'Checking email delivery status.' : `Loaded ${notifications.length} email records.`}</p>
        {error ? <p role="alert" className="mt-4 text-sm text-brand-red">{error} Use Refresh status to try again.</p>
          : !loading && notifications.length === 0 ? <p className="mt-5 text-sm text-muted-copy">No security emails have been recorded for this account.</p>
            : <ul className="mt-4 divide-y divide-line" aria-busy={loading}>{notifications.map((notification) => {
              const delivery = notification.emailDelivery
              const finalTime = delivery?.sentAt || delivery?.failedAt
              return <li key={notification.notificationId} className="py-4 first:pt-0">
                <h3 className="text-sm font-bold">{notification.title}</h3>
                <SecurityEmailStatus delivery={delivery} compact className="mt-2" />
                <p className="mt-1 text-xs leading-5 text-muted-copy">Created <time dateTime={notification.createdAt}>{dateTime.format(new Date(notification.createdAt))} PHT</time></p>
                {finalTime && <p className="text-xs leading-5 text-muted-copy">{delivery.status === 'SENT' ? 'Sent' : 'Failed'} <time dateTime={finalTime}>{dateTime.format(new Date(finalTime))} PHT</time></p>}
                {delivery?.status === 'FAILED' && <p className="mt-2 text-xs leading-5 text-brand-red">Sending stopped. The account change was saved. Contact the staff member privately if they need help.</p>}
              </li>
            })}</ul>}
      </div>
    </dialog>
  )
}
