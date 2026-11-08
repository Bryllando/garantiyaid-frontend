import { useEffect, useRef, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestStaffEmailDeliveries } from '../../auth/staffAuth.js'
import { SecurityEmailStatus } from './SecurityEmailStatus.jsx'
import { LoadingLabel } from './spinner.jsx'
import { Icon } from './icon.jsx'

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
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="staff-email-history-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100%-2rem))] overflow-y-auto rounded-lg border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <header className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div className="min-w-0"><h2 id="staff-email-history-title" className="text-xl font-semibold">Email history</h2><p className="mt-2 break-words text-base font-semibold text-ink">{user.fullName}</p><p className="mt-1 text-sm text-copy">Staff ID: {user.employeeId}</p></div>
        <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close email history" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-xl focus-visible:outline-2 focus-visible:outline-brand-blue">×</button>
      </header>
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-copy">Latest 20 emails · PHT</p><button type="button" disabled={loading} onClick={() => { setLoading(true); setError(''); setReload((value) => value + 1) }} className="ga-btn-secondary">{loading ? <LoadingLabel>Checking status…</LoadingLabel> : <><Icon name="reset" className="size-4" />Refresh status</>}</button></div>
        <p role="status" aria-atomic="true" className="sr-only">{loading ? 'Checking email delivery status.' : error ? 'Email history could not be loaded.' : `Loaded ${notifications.length} email records.`}</p>
        {error ? <div role="alert" className="mt-5 border-l-4 border-brand-red bg-danger-soft p-4 text-sm leading-6"><p className="font-semibold text-brand-red">Email history unavailable</p><p className="mt-1 text-copy">{error} Use Refresh status to try again.</p></div>
          : !loading && notifications.length === 0 ? <div className="py-8"><Icon name="email" className="size-6 text-copy" /><h3 className="mt-3 font-semibold">No emails yet</h3><p className="mt-2 text-sm leading-6 text-copy">Account and security emails will appear here when they are recorded for this staff member.</p></div>
            : <ul className="mt-5 divide-y divide-line border-y border-line" aria-busy={loading}>{notifications.map((notification) => {
              const delivery = notification.emailDelivery
              const finalTime = delivery?.status === 'SENT' ? delivery.sentAt : delivery?.status === 'FAILED' ? delivery.failedAt : null
              return <li key={notification.notificationId} className="py-5">
                <h3 className="text-base font-semibold leading-6">{notification.title}</h3>
                <SecurityEmailStatus delivery={delivery} compact className="mt-2" />
                <p className="mt-2 text-sm leading-6 text-copy">Requested <time dateTime={notification.createdAt}>{dateTime.format(new Date(notification.createdAt))}</time></p>
                {finalTime && <p className="text-sm leading-6 text-copy">{delivery.status === 'SENT' ? 'Accepted' : 'Stopped'} <time dateTime={finalTime}>{dateTime.format(new Date(finalTime))}</time></p>}
                {delivery?.status === 'PENDING' && <p className="mt-3 text-sm leading-6 text-copy">Waiting to send. Refresh to check for an update.</p>}
                {delivery?.status === 'FAILED' && <p className="mt-3 border-l-2 border-brand-red pl-3 text-sm leading-6 text-copy"><strong>Sending stopped.</strong> {notification.notificationType === 'SECURITY_PASSWORD_RESET_REQUESTED' ? 'After email sending is restored, ask the staff member to request a new reset link.' : 'Contact the staff member privately if they need help. Check the email service before sending new notices.'}</p>}
              </li>
            })}</ul>}
        <p className="mt-4 text-sm leading-6 text-copy">“Accepted” means the email service received the message. Inbox delivery is not confirmed; ask the recipient to check Inbox and Spam.</p>
      </div>
    </dialog>
  )
}
