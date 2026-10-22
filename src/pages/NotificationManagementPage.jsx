import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel, Spinner } from '../components/ui/spinner.jsx'
import {
  enqueueDistributionReminder,
  enqueueScheduleNotification,
  getAuthErrorMessage,
  isSessionExpiredError,
  previewScheduleNotification,
  requestDistribution,
  requestDistributionList,
  requestDistributionSchedules,
  requestNotificationList,
  requestNotificationQueueHealth,
  requestNotificationSummary,
  retryNotification,
} from '../auth/staffAuth.js'
import { connectNotificationRealtime } from '../realtime/staffRealtime.js'

const emptyFilters = { distributionId: '', notificationType: '', status: '', dateFrom: '', dateTo: '' }
const notificationTypes = ['', 'SCHEDULE_CREATED', 'SCHEDULE_UPDATED', 'SCHEDULE_CANCELLED', 'DISTRIBUTION_OPENED', 'DISTRIBUTION_REMINDER', 'CLAIM_VERIFIED', 'BENEFIT_CREDITED_SIMULATED']
const statuses = ['', 'PENDING', 'SENT', 'FAILED', 'READ']
const dateTimeFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const humanize = (value) => value ? value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : '—'
const deliveryStatusLabel = (status) => status === 'PENDING' ? 'Queued' : humanize(status)
const formatDateTime = (value) => value ? dateTimeFormatter.format(new Date(value)) : 'Not recorded'
const deliveryTime = (notification) => notification.sentAt || notification.failedAt || notification.scheduledFor
const deliveryTimeLabel = (notification) => notification.sentAt ? 'Delivered' : notification.failedAt ? 'Failed' : 'Scheduled'

function StatusBadge({ status }) {
  const style = status === 'SENT' ? 'ga-status-success' : status === 'FAILED' ? 'ga-status-danger' : status === 'PENDING' ? 'ga-status-warning' : 'border-blue-200 bg-info-soft text-brand-blue'
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{deliveryStatusLabel(status)}</span>
}

function MetricCard({ label, value, tone = 'blue', description }) {
  const color = tone === 'success' ? 'text-brand-green' : tone === 'warning' ? 'text-brand-amber' : tone === 'danger' ? 'text-brand-red' : 'text-brand-blue'
  const border = tone === 'success' ? 'border-l-brand-green' : tone === 'warning' ? 'border-l-brand-amber' : tone === 'danger' ? 'border-l-brand-red' : 'border-l-brand-blue'
  return <article className={`ga-card-flat border-l-4 p-4 ${border}`}><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">{label}</p><p className={`mt-2 text-2xl font-black tabular-nums ${color}`}>{value}</p><p className="mt-1 text-xs text-muted-copy">{description}</p></article>
}

function LoadingHistory() {
  return <div className="space-y-4 p-5" role="status" aria-label="Loading notification history">{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-center gap-4"><Skeleton className="size-10 rounded-full" /><div className="flex-1"><Skeleton className="h-4 w-52 max-w-full" /><Skeleton className="mt-2 h-3 w-72 max-w-full" /></div><Skeleton className="hidden h-8 w-20 sm:block" /></div>)}</div>
}

function ReminderDialog({ distributions, onClose, onQueue }) {
  const dialogRef = useRef(null)
  const [distributionId, setDistributionId] = useState(distributions[0]?.distributionId ?? '')
  const [sendAt, setSendAt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const selected = distributions.find((distribution) => distribution.distributionId === distributionId)

  useEffect(() => { dialogRef.current?.showModal() }, [])

  async function submit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await onQueue(distributionId, sendAt ? new Date(sendAt).toISOString() : '')
      dialogRef.current?.close()
    } catch {
      // The parent reports the API error and keeps this dialog available for correction.
    } finally {
      setIsSubmitting(false)
    }
  }

  return <dialog ref={dialogRef} onCancel={onClose} onClose={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(38rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
    <form onSubmit={submit} className="p-5 sm:p-7">
      <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Controlled message</p><h2 className="mt-2 text-2xl font-extrabold">Queue distribution reminders</h2><p className="mt-2 text-sm leading-6 text-muted-copy">The approved reminder template will be created for every schedule in the selected distribution.</p></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close reminder form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-xl hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue">×</button></div>
      <div className="mt-6 space-y-5"><div><label htmlFor="reminder-distribution" className="ga-label">Distribution event</label><select id="reminder-distribution" required value={distributionId} onChange={(event) => setDistributionId(event.target.value)} className="ga-input mt-2"><option value="">Select a distribution</option>{distributions.map((distribution) => <option key={distribution.distributionId} value={distribution.distributionId}>{distribution.title} · {humanize(distribution.status)}</option>)}</select>{selected && <p className="mt-2 text-xs leading-5 text-muted-copy">{selected.distributionDate} · {selected.barangay?.barangayName || 'Assigned service area'}</p>}</div>
        <div><label htmlFor="reminder-send-at" className="ga-label">Delivery time <span className="font-normal text-muted-copy">(optional)</span></label><input id="reminder-send-at" type="datetime-local" value={sendAt} onChange={(event) => setSendAt(event.target.value)} aria-describedby="reminder-send-at-help" className="ga-input mt-2" /><p id="reminder-send-at-help" className="mt-2 text-xs leading-5 text-muted-copy">Leave blank to queue now. A scheduled reminder must be before the beneficiary’s assigned time.</p></div>
        <div className="rounded-xl border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">Simulation only:</strong> this demonstrates the delivery workflow. No real SMS will be sent.</div>
      </div>
      <div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={isSubmitting} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={isSubmitting || !distributionId} className="ga-btn-primary">{isSubmitting ? <LoadingLabel>Queueing...</LoadingLabel> : sendAt ? 'Schedule reminders' : 'Queue reminders now'}</button></div>
    </form>
  </dialog>
}

function ScheduleNoticeDialog({ distributions, token, onClose, onQueued, onSessionExpired }) {
  const dialogRef = useRef(null)
  const keyRef = useRef('')
  const [distributionId, setDistributionId] = useState(distributions[0]?.distributionId ?? '')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [schedules, setSchedules] = useState([])
  const [scheduleId, setScheduleId] = useState('')
  const [notificationType, setNotificationType] = useState('SCHEDULE_CREATED')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(Boolean(distributions[0]))
  const [busy, setBusy] = useState('')
  const selected = schedules.find((schedule) => schedule.scheduleId === scheduleId)
  const eligible = selected?.status === 'SCHEDULED' || selected?.status === 'CANCELLED'

  useEffect(() => { dialogRef.current?.showModal() }, [])
  useEffect(() => {
    if (!distributionId) return undefined
    let active = true
    requestDistributionSchedules(token, distributionId, { page: 1, pageSize: 50, search }).then((data) => {
      if (!active) return
      setSchedules(data.schedules)
      setScheduleId(data.schedules[0]?.scheduleId || '')
      setNotificationType(data.schedules[0]?.status === 'CANCELLED' ? 'SCHEDULE_CANCELLED' : 'SCHEDULE_CREATED')
      setError('')
    }).catch((requestError) => {
      if (!active) return
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      setError(getAuthErrorMessage(requestError))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [distributionId, onSessionExpired, search, token])

  async function previewMessage() {
    setBusy('preview'); setError(''); setPreview(null)
    try {
      const result = await previewScheduleNotification(token, scheduleId, notificationType)
      setPreview(result)
      keyRef.current = crypto.randomUUID()
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      setError(getAuthErrorMessage(requestError))
    } finally { setBusy('') }
  }

  async function queueMessage() {
    setBusy('queue'); setError('')
    try {
      const result = await enqueueScheduleNotification(token, scheduleId, notificationType, preview.previewHash, keyRef.current)
      onQueued(result)
      dialogRef.current?.close()
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      if (requestError.code === 'NOTIFICATION_PREVIEW_CHANGED') { setPreview(null); keyRef.current = '' }
      setError(getAuthErrorMessage(requestError))
    } finally { setBusy('') }
  }

  return <dialog ref={dialogRef} onCancel={onClose} onClose={onClose} aria-labelledby="schedule-notice-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
    <div className="border-b border-line p-5 sm:p-6"><p className="ga-eyebrow">Schedule communication</p><div className="mt-1 flex items-start justify-between gap-4"><div><h2 id="schedule-notice-title" className="text-2xl font-extrabold">Queue a schedule message</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Choose a schedule, review the approved wording, then confirm simulated delivery.</p></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close schedule message" className="grid size-10 shrink-0 place-items-center rounded-lg border border-line text-xl hover:bg-slate-50">×</button></div></div>
    <div className="space-y-5 p-5 sm:p-6"><div><label htmlFor="notice-distribution" className="ga-label">Distribution event</label><select id="notice-distribution" value={distributionId} onChange={(event) => { setDistributionId(event.target.value); setScheduleId(''); setSchedules([]); setSearch(''); setSearchInput(''); setPreview(null); keyRef.current = ''; setLoading(Boolean(event.target.value)) }} className="ga-input mt-2"><option value="">Select a distribution</option>{distributions.map((distribution) => <option key={distribution.distributionId} value={distribution.distributionId}>{distribution.title}</option>)}</select></div>
      <form onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setScheduleId(''); setPreview(null); keyRef.current = ''; setLoading(Boolean(distributionId)) }}><label htmlFor="notice-search" className="ga-label">Find a beneficiary or queue number</label><div className="mt-2 flex gap-2"><input id="notice-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Name or queue number" className="ga-input min-w-0 flex-1" /><button type="submit" className="ga-btn-secondary">Search</button></div></form>
      <div><label htmlFor="notice-schedule" className="ga-label">Schedule</label><select id="notice-schedule" value={scheduleId} onChange={(event) => { setScheduleId(event.target.value); setNotificationType(schedules.find((schedule) => schedule.scheduleId === event.target.value)?.status === 'CANCELLED' ? 'SCHEDULE_CANCELLED' : 'SCHEDULE_CREATED'); setPreview(null); keyRef.current = '' }} disabled={loading || schedules.length === 0} className="ga-input mt-2"><option value="">{loading ? 'Loading schedules...' : schedules.length ? 'Select a schedule' : 'No schedules found'}</option>{schedules.map((schedule) => <option key={schedule.scheduleId} value={schedule.scheduleId}>#{schedule.queueNumber} · {[schedule.beneficiary.firstName, schedule.beneficiary.lastName].filter(Boolean).join(' ')} · {humanize(schedule.status)}</option>)}</select><p className="mt-2 text-xs text-muted-copy">Showing the first 50 matches. Search by name or queue number to narrow the list.</p></div>
      {selected && <div className="rounded-lg border border-line bg-slate-50 p-4 text-sm"><p className="font-bold text-ink">{selected.slot.sessionLabel} · {formatDateTime(selected.slot.slotStart)}</p><p className="mt-1 text-muted-copy">{selected.beneficiary.barangay?.barangayName || 'Assigned barangay'} · {humanize(selected.status)}</p></div>}
      {selected && !eligible && <p role="status" className="rounded-lg border border-amber-200 bg-warning-soft p-3 text-sm text-brand-amber">Only scheduled or cancelled assignments can use these templates.</p>}
      <div><label htmlFor="notice-type" className="ga-label">Message purpose</label><select id="notice-type" value={notificationType} disabled={!eligible} onChange={(event) => { setNotificationType(event.target.value); setPreview(null); keyRef.current = '' }} className="ga-input mt-2">{selected?.status === 'CANCELLED' ? <option value="SCHEDULE_CANCELLED">Schedule cancelled</option> : <><option value="SCHEDULE_CREATED">Schedule assigned</option><option value="SCHEDULE_UPDATED">Schedule changed</option></>}</select></div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-brand-red">{error}</p>}
      {preview && <section className="rounded-xl border border-blue-200 bg-info-soft/50 p-4" aria-labelledby="notice-preview-title"><div className="flex flex-wrap items-center justify-between gap-2"><h3 id="notice-preview-title" className="font-bold text-ink">Message preview</h3><span className="text-xs font-semibold text-muted-copy">To {preview.recipientMasked || 'No valid contact'}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink">{preview.message}</p><p className="mt-3 text-xs text-muted-copy">Simulation only. No real SMS will be sent.</p>{!preview.recipientAvailable && <p className="mt-2 text-xs font-semibold text-brand-red">This beneficiary has no valid registered mobile number. Update the beneficiary record before queueing.</p>}</section>}
    </div>
    <div className="flex flex-col-reverse gap-3 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6"><button type="button" disabled={Boolean(busy)} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Cancel</button>{!preview ? <button type="button" disabled={!eligible || Boolean(busy)} onClick={previewMessage} className="ga-btn-primary">{busy === 'preview' ? <LoadingLabel>Preparing preview...</LoadingLabel> : 'Preview message'}</button> : <button type="button" disabled={!preview.recipientAvailable || Boolean(busy)} onClick={queueMessage} className="ga-btn-primary">{busy === 'queue' ? <LoadingLabel>Queueing...</LoadingLabel> : 'Confirm and queue'}</button>}</div>
  </dialog>
}

function NotificationDetailDialog({ notification, canRetry, isRetrying, onClose, onRetry }) {
  const dialogRef = useRef(null)
  useEffect(() => { dialogRef.current?.showModal() }, [])
  const rows = [
    ['Recipient', notification.recipientMasked || 'No valid contact number'],
    ['Distribution', notification.distribution?.title || notification.distributionId],
    ['Queue', notification.schedule?.queueNumber ? `#${notification.schedule.queueNumber}` : 'Not linked'],
    ['Scheduled', formatDateTime(notification.scheduledFor)],
    ['Sent', formatDateTime(notification.sentAt)],
    ['Attempts', String(notification.attemptCount ?? 0)],
    ['Provider reference', notification.providerReference || 'Not assigned'],
    ['Last error', notification.lastErrorCode ? humanize(notification.lastErrorCode) : 'None'],
  ]
  return <dialog ref={dialogRef} onCancel={onClose} onClose={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55"><div className="p-5 sm:p-7"><div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Delivery record</p><div className="mt-2 flex flex-wrap items-center gap-3"><h2 className="text-2xl font-extrabold">{humanize(notification.notificationType)}</h2><StatusBadge status={notification.status} /></div></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close notification details" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-xl hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue">×</button></div>
    <section className="mt-6 rounded-xl border border-line bg-slate-50 p-4" aria-labelledby="message-preview-heading"><h3 id="message-preview-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Approved message preview</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink">{notification.message}</p></section>
    <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="border-b border-line pb-3"><dt className="text-xs font-semibold text-muted-copy">{label}</dt><dd className="mt-1 [overflow-wrap:anywhere] text-sm font-bold text-ink">{value}</dd></div>)}</dl>
    <details className="mt-5 rounded-lg border border-line p-4"><summary className="font-bold text-brand-blue">Technical record identifiers</summary><dl className="mt-3 space-y-2 text-xs text-muted-copy"><div><dt className="inline font-semibold">Notification:</dt> <dd className="inline font-mono">{notification.notificationId}</dd></div><div><dt className="inline font-semibold">Schedule:</dt> <dd className="inline font-mono">{notification.scheduleId || 'None'}</dd></div></dl></details>
    <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Close</button>{notification.status === 'FAILED' && canRetry && <button type="button" disabled={isRetrying} onClick={() => onRetry(notification)} className="ga-btn-primary">{isRetrying ? <LoadingLabel>Queueing retry...</LoadingLabel> : 'Retry delivery'}</button>}</div>
  </div></dialog>
}

function NotificationActions({ canRetry, isRetrying, notification, onOpen, onRetry }) {
  return <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onOpen(notification)} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">View details</button>{notification.status === 'FAILED' && canRetry && <button type="button" disabled={isRetrying} onClick={() => onRetry(notification)} className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-bold text-brand-red hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-brand-red disabled:opacity-50">{isRetrying ? <LoadingLabel>Retrying...</LoadingLabel> : 'Retry'}</button>}</div>
}

function NotificationManagementPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const authorized = ['SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR'].includes(session.user.role)
  const canRetry = ['SYSTEM_ADMIN', 'DSWD_STAFF'].includes(session.user.role)
  const [draft, setDraft] = useState(() => ({ ...emptyFilters, distributionId: new URLSearchParams(window.location.search).get('distribution') || '' }))
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [history, setHistory] = useState(null)
  const [summary, setSummary] = useState(null)
  const [queueHealth, setQueueHealth] = useState(null)
  const [distributions, setDistributions] = useState([])
  const [isLoading, setIsLoading] = useState(authorized)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [composerOpen, setComposerOpen] = useState(false)
  const [scheduleComposerOpen, setScheduleComposerOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [retryingId, setRetryingId] = useState('')
  const [realtimeStatus, setRealtimeStatus] = useState('connecting')
  const linkedDistributionId = useRef(new URLSearchParams(window.location.search).get('distribution') || '')

  const reportError = useCallback((requestError) => {
    if (isSessionExpiredError(requestError)) return onSessionExpired()
    toast.error(getAuthErrorMessage(requestError))
  }, [onSessionExpired])

  useEffect(() => {
    if (!authorized) return undefined
    let active = true
    const summaryFilters = { ...filters, status: '' }
    Promise.all([
      requestNotificationList(session.accessToken, { page, pageSize: 20, ...filters }),
      requestNotificationSummary(session.accessToken, summaryFilters),
    ]).then(([nextHistory, nextSummary]) => { if (active) { setHistory(nextHistory); setSummary(nextSummary); setError('') } })
      .catch((requestError) => { if (active) { if (isSessionExpiredError(requestError)) return onSessionExpired(); setError(getAuthErrorMessage(requestError)) } })
      .finally(() => { if (active) setIsLoading(false) })
    requestNotificationQueueHealth(session.accessToken).then((health) => { if (active) setQueueHealth(health) }).catch((requestError) => { if (active) { if (isSessionExpiredError(requestError)) onSessionExpired(); else setQueueHealth({ status: 'unavailable', counts: {} }) } })
    return () => { active = false }
  }, [authorized, filters, onSessionExpired, page, reload, session.accessToken])

  useEffect(() => {
    if (!authorized) return undefined
    let active = true
    requestDistributionList(session.accessToken, { page: 1, pageSize: 100 }).then(async (result) => {
      let available = result.distributions
      const linkedId = linkedDistributionId.current
      if (linkedId && !available.some((item) => item.distributionId === linkedId)) {
        try { available = [await requestDistribution(session.accessToken, linkedId), ...available] }
        catch (requestError) { if (active) reportError(requestError) }
      }
      if (active) setDistributions(available)
    }).catch((requestError) => { if (active) reportError(requestError) })
    return () => { active = false }
  }, [authorized, reportError, session.accessToken])

  useEffect(() => {
    if (!authorized) return undefined
    let refreshTimer
    const disconnect = connectNotificationRealtime(session.accessToken, {
      onReady: () => setRealtimeStatus('connected'),
      onError: () => setRealtimeStatus('disconnected'),
      onDisconnect: () => setRealtimeStatus('disconnected'),
      onUpdate: () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => setReload((value) => value + 1), 350) },
    })
    return () => { clearTimeout(refreshTimer); disconnect() }
  }, [authorized, session.accessToken])

  const distributionOptions = useMemo(() => [{ distributionId: '', title: 'All distribution events' }, ...distributions], [distributions])
  const counts = summary?.byStatus ?? {}
  const activeFilterCount = Object.values(filters).filter(Boolean).length

  function applyFilters(event) { event.preventDefault(); setPage(1); setIsLoading(true); setFilters({ ...draft }) }
  function clearFilters() { setDraft({ ...emptyFilters }); setFilters({ ...emptyFilters }); setPage(1); setIsLoading(true); setReload((value) => value + 1) }
  function refresh() { setIsLoading(true); setReload((value) => value + 1) }

  async function queueReminders(distributionId, sendAt) {
    try {
      const result = await enqueueDistributionReminder(session.accessToken, distributionId, sendAt)
      toast.success(`${result.queuedCount} ${result.queuedCount === 1 ? 'reminder' : 'reminders'} queued.`, { description: result.deduplicatedCount ? `${result.deduplicatedCount} existing record(s) were not duplicated.` : 'Delivery status will update automatically.' })
      setComposerOpen(false); setReload((value) => value + 1)
    } catch (requestError) { reportError(requestError); throw requestError }
  }

  async function retry(record) {
    setRetryingId(record.notificationId)
    try {
      const result = await retryNotification(session.accessToken, record.notificationId)
      toast.success('Delivery retry queued.', { description: 'The delivery status will update automatically.' })
      setDetail(result.notification); setReload((value) => value + 1)
    } catch (requestError) { reportError(requestError) } finally { setRetryingId('') }
  }

  if (!authorized) return <DashboardShell breadcrumbs={['Operations', 'Notifications']} currentPath="/notifications" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Notifications" user={session.user}><section className="ga-card mx-auto max-w-md p-8 text-center" role="alert"><h1 className="text-2xl font-extrabold">Staff access required</h1><p className="mt-3 text-muted-copy">This workspace is available only to authorized GarantiyAid staff.</p></section></DashboardShell>

  return <DashboardShell breadcrumbs={['Operations', 'Notifications', 'Delivery monitoring']} currentPath="/notifications" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Notifications" user={session.user}>
    <header className="ga-page-header flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="ga-eyebrow">Beneficiary communications</p><h1 className="ga-page-title">{session.user.role === 'SYSTEM_ADMIN' ? 'SMS delivery' : 'SMS notifications and delivery monitoring'}</h1><p className="ga-page-copy">Review schedule messages before queueing them, then follow queued, sent, and failed records within your authorized service scope.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setComposerOpen(true)} disabled={distributions.length === 0} className="ga-btn-secondary">Queue reminders</button><button type="button" onClick={() => setScheduleComposerOpen(true)} disabled={distributions.length === 0} className="ga-btn-primary">Queue schedule message</button></div></header>
    {session.user.role === 'SYSTEM_ADMIN' && filters.distributionId && <a href={`/distributions/manage?event=${encodeURIComponent(filters.distributionId)}`} onClick={(event) => { event.preventDefault(); onNavigate(`/distributions/manage?event=${encodeURIComponent(filters.distributionId)}`) }} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand-blue hover:underline"><Icon name="arrowLeft" className="size-4" />Return to distribution event</a>}

    <section className="mt-6 flex flex-col gap-3 rounded-xl border border-blue-200 bg-info-soft p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Delivery channel status"><p className="text-sm leading-6 text-copy"><strong className="text-ink">Simulated SMS:</strong> Delivery records and retries demonstrate the workflow; no real messages are sent.</p><div className="flex flex-wrap gap-2 text-xs font-bold" role="status" aria-live="polite" aria-atomic="true"><span className="rounded-full border border-blue-200 bg-white px-3 py-2 text-brand-blue">{queueHealth ? `Queue ${queueHealth.status}` : <LoadingLabel>Checking queue...</LoadingLabel>}</span><span className="rounded-full border border-blue-200 bg-white px-3 py-2 text-brand-blue">{realtimeStatus !== 'connected' && <Spinner aria-hidden="true" className="mr-1 inline size-3" />}Live updates {realtimeStatus === 'connected' ? 'connected' : realtimeStatus === 'connecting' ? 'connecting' : 'reconnecting'}</span></div></section>

    <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Notification delivery summary"><MetricCard label="Total records" value={summary?.total ?? '—'} description="Within the selected scope" /><MetricCard label="Sent" value={counts.SENT ?? 0} tone="success" description="Completed simulated deliveries" /><MetricCard label="Queued" value={counts.PENDING ?? 0} tone="warning" description={`${(queueHealth?.counts?.waiting ?? 0) + (queueHealth?.counts?.delayed ?? 0)} waiting or delayed jobs`} /><MetricCard label="Failed" value={counts.FAILED ?? 0} tone="danger" description={canRetry ? 'Eligible for authorized retry' : 'Contact DSWD for retry'} /></section>

    <details className="ga-card mt-5 overflow-hidden" aria-label="Notification history filters">
      <summary className="min-h-11 cursor-pointer px-4 py-3.5 text-sm font-bold text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue sm:px-5">Filter delivery history{activeFilterCount > 0 && ` · ${activeFilterCount} active`}</summary>
    <form onSubmit={applyFilters} className="p-4 sm:p-5" aria-label="Notification history filters"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><div><label htmlFor="notification-distribution" className="ga-label">Distribution</label><select id="notification-distribution" value={draft.distributionId} onChange={(event) => setDraft((current) => ({ ...current, distributionId: event.target.value }))} className="ga-input mt-2">{distributionOptions.map((distribution) => <option key={distribution.distributionId || 'ALL'} value={distribution.distributionId}>{distribution.title}</option>)}</select></div><div><label htmlFor="notification-type" className="ga-label">Message type</label><select id="notification-type" value={draft.notificationType} onChange={(event) => setDraft((current) => ({ ...current, notificationType: event.target.value }))} className="ga-input mt-2">{notificationTypes.map((type) => <option key={type || 'ALL'} value={type}>{type ? humanize(type) : 'All message types'}</option>)}</select></div><div><label htmlFor="notification-status" className="ga-label">Delivery status</label><select id="notification-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input mt-2">{statuses.map((status) => <option key={status || 'ALL'} value={status}>{status ? deliveryStatusLabel(status) : 'All statuses'}</option>)}</select></div><div><label htmlFor="notification-from" className="ga-label">From date</label><input id="notification-from" type="date" value={draft.dateFrom} onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))} className="ga-input mt-2" /></div><div><label htmlFor="notification-to" className="ga-label">To date</label><input id="notification-to" type="date" min={draft.dateFrom || undefined} value={draft.dateTo} onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))} className="ga-input mt-2" /></div></div><div className="mt-4 flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={clearFilters} className="ga-btn-secondary">Clear filters</button><button className="ga-btn-primary">Apply filters</button></div></form>
    </details>

    <section className="ga-card mt-5 overflow-hidden" aria-labelledby="history-heading" aria-busy={isLoading}><div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 id="history-heading" className="ga-section-heading">Delivery history</h2><p className="mt-1 text-sm text-muted-copy">{history ? `${history.pagination.total} matching ${history.pagination.total === 1 ? 'record' : 'records'}` : 'Loading authorized records'}</p></div><div className="flex flex-wrap items-center gap-2">{history && <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-copy">Page {history.pagination.page}</span>}<button type="button" onClick={refresh} disabled={isLoading} className="ga-btn-secondary min-h-10 px-3 text-sm">{isLoading ? <LoadingLabel>Refreshing...</LoadingLabel> : 'Refresh history'}</button></div></div>
      {isLoading ? <LoadingHistory /> : error ? <div className="p-7" role="alert"><h3 className="font-extrabold">Notification history could not be loaded</h3><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={refresh} className="ga-btn-primary mt-4">Try again</button></div> : !history?.notifications.length ? <div className="p-10 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h3 className="mt-4 font-extrabold">No notification records found</h3><p className="mt-2 text-sm text-muted-copy">Adjust the filters or queue distribution reminders to create the first records in this scope.</p></div> : <><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[900px] text-left text-sm"><caption className="sr-only">Role-scoped simulated SMS delivery history</caption><thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><tr><th scope="col" className="px-5 py-3">Message</th><th scope="col" className="px-5 py-3">Recipient</th><th scope="col" className="px-5 py-3">Distribution and queue</th><th scope="col" className="px-5 py-3">Delivery timing</th><th scope="col" className="px-5 py-3">Status</th><th scope="col" className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-line">{history.notifications.map((notification) => <tr key={notification.notificationId} className="transition-colors hover:bg-slate-50"><td className="px-5 py-4"><p className="font-bold text-ink">{humanize(notification.notificationType)}</p><p className="mt-1 text-xs text-muted-copy">{notification.channel} · {notification.providerMode}</p></td><td className="px-5 py-4 font-mono text-xs font-bold text-copy">{notification.recipientMasked || 'No contact'}</td><td className="px-5 py-4"><p className="font-semibold text-ink">{notification.distribution?.title || 'Distribution record'}</p><p className="mt-1 text-xs text-muted-copy">{notification.schedule?.queueNumber ? `Queue #${notification.schedule.queueNumber}` : 'No queue assignment'}</p></td><td className="whitespace-nowrap px-5 py-4"><p className="text-xs font-semibold text-copy">{formatDateTime(deliveryTime(notification))}</p><p className="mt-1 text-xs text-muted-copy">{deliveryTimeLabel(notification)}</p></td><td className="px-5 py-4"><StatusBadge status={notification.status} />{notification.status === 'FAILED' && <p className="mt-2 text-xs font-semibold text-brand-red">{humanize(notification.lastErrorCode)}</p>}</td><td className="px-5 py-4"><div className="flex justify-end"><NotificationActions canRetry={canRetry} isRetrying={retryingId === notification.notificationId} notification={notification} onOpen={setDetail} onRetry={retry} /></div></td></tr>)}</tbody></table></div><div className="divide-y divide-line lg:hidden">{history.notifications.map((notification) => <article key={notification.notificationId} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-extrabold text-ink">{humanize(notification.notificationType)}</h3><p className="mt-1 font-mono text-xs font-bold text-muted-copy">{notification.recipientMasked || 'No contact number'}</p></div><StatusBadge status={notification.status} /></div><dl className="mt-4 grid gap-3 border-y border-line py-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-copy">Distribution</dt><dd className="mt-1 font-bold">{notification.distribution?.title || 'Distribution record'}</dd></div><div><dt className="text-xs text-muted-copy">{deliveryTimeLabel(notification)} time</dt><dd className="mt-1 font-semibold">{formatDateTime(deliveryTime(notification))}</dd></div></dl><div className="mt-3"><NotificationActions canRetry={canRetry} isRetrying={retryingId === notification.notificationId} notification={notification} onOpen={setDetail} onRetry={retry} /></div></article>)}</div>{history.pagination.totalPages > 1 && <div className="flex flex-col gap-3 border-t border-line px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"><span>Page {page} of {history.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => { setIsLoading(true); setPage((value) => value - 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Previous</button><button type="button" disabled={page >= history.pagination.totalPages} onClick={() => { setIsLoading(true); setPage((value) => value + 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Next</button></div></div>}</>}
    </section>
    {composerOpen && <ReminderDialog distributions={distributions} onClose={() => setComposerOpen(false)} onQueue={queueReminders} />}
    {scheduleComposerOpen && <ScheduleNoticeDialog distributions={distributions} token={session.accessToken} onSessionExpired={onSessionExpired} onClose={() => setScheduleComposerOpen(false)} onQueued={(result) => { toast.success(`${result.queuedCount} schedule message queued for simulated delivery.`); setReload((value) => value + 1) }} />}
    {detail && <NotificationDetailDialog notification={detail} canRetry={canRetry} isRetrying={retryingId === detail.notificationId} onClose={() => setDetail(null)} onRetry={retry} />}
  </DashboardShell>
}

export default NotificationManagementPage
