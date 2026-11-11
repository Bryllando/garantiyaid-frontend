import { useCallback, useEffect, useRef, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { verificationLabels } from '../utils/claimVerification.js'
import {
  cancelDistributionSchedule,
  generateDistributionSchedules,
  getAuthErrorMessage,
  isSessionExpiredError,
  previewDistributionQrClaim,
  requestDistribution,
  requestDistributionQueue,
  requestAllDistributions,
  requestDistributionSlots,
  requestOpenDistributions,
  reactivateDistributionSchedule,
  rescheduleDistributionSchedule,
  verifyDistributionQrClaim,
} from '../auth/staffAuth.js'
import { connectFacilitatorQueueRealtime } from '../realtime/staffRealtime.js'
import { queueNextAction } from '../utils/claimWorkflow.js'

const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const timeFormatter = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
const queueStatuses = ['', 'SCHEDULED', 'CHECKED_IN', 'MISSED', 'CANCELLED']

const statusStyles = {
  SCHEDULED: 'border-amber-200 bg-warning-soft text-brand-amber',
  CHECKED_IN: 'border-emerald-200 bg-success-soft text-brand-green',
  MISSED: 'border-line bg-slate-100 text-copy',
  CANCELLED: 'border-line bg-slate-100 text-muted-copy',
}

function beneficiaryName(beneficiary) {
  return [beneficiary?.firstName, beneficiary?.middleName, beneficiary?.lastName].filter(Boolean).join(' ')
}

const humanize = (value = '') => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[status] ?? statusStyles.CANCELLED}`}>{humanize(status)}</span>
}

function ClaimProgress({ claim }) {
  if (!['VERIFIED', 'CLAIMED'].includes(claim?.claimStatus)) return null
  const label = claim.claimStatus === 'VERIFIED' ? 'Claim verified' : claim.releaseMethod === 'PHYSICAL_GOODS' ? 'Physical assistance released' : 'Claim settled'
  return <p className={`mt-1 text-xs font-semibold ${claim.claimStatus === 'CLAIMED' ? 'text-brand-green' : 'text-brand-blue'}`}>{label}</p>
}

function DistributionSelector({ distributions, selectedId, onChange, disabled }) {
  return (
    <div>
      <label htmlFor="distribution-event" className="block text-sm font-bold text-ink">Distribution event</label>
      <div className="relative mt-2">
        <Icon name="calendar" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-copy" />
        <select
          id="distribution-event"
          value={selectedId}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="ga-input cursor-pointer pl-11 font-semibold"
        >
          {distributions.map((distribution) => (
            <option key={distribution.distributionId} value={distribution.distributionId}>
              {distribution.title} · {humanize(distribution.status)} · {dateFormatter.format(new Date(distribution.distributionDate))}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function QueueSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading beneficiary queue" aria-busy="true">
      <span className="sr-only">Loading beneficiary queue…</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-lg border border-line p-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-48 max-w-full" /><Skeleton className="h-3 w-64 max-w-full" /></div>
          <Skeleton className="hidden h-8 w-24 sm:block" />
        </div>
      ))}
    </div>
  )
}

function AccessDenied({ session, onLogout, onNavigate }) {
  return (
    <DashboardShell breadcrumbs={['Operations', 'Staff access']} currentPath={window.location.pathname} onLogout={onLogout} onNavigate={onNavigate} pageTitle="Distribution operations" user={session.user}>
      <section className="ga-card mx-auto max-w-lg p-7 text-center">
        <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft font-black text-brand-amber">!</span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">Staff access required</h1>
        <p className="mt-3 text-sm leading-6 text-muted-copy">This work area is unavailable for your role. Open your dashboard to continue with your assigned work.</p>
        <button type="button" onClick={() => onNavigate('/dashboard')} className="ga-btn-primary mt-6">Return to dashboard</button>
      </section>
    </DashboardShell>
  )
}

function FacilitatorOperationsPage({ view, session, onLogout, onNavigate, onSessionExpired }) {
  const [distributions, setDistributions] = useState([])
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('distribution') || '')
  const linkedDistribution = useRef(selectedId)
  const [distributionError, setDistributionError] = useState('')
  const [isLoadingDistributions, setIsLoadingDistributions] = useState(true)
  const [distributionReload, setDistributionReload] = useState(0)

  const [queue, setQueue] = useState(null)
  const [queueError, setQueueError] = useState('')
  const [isLoadingQueue, setIsLoadingQueue] = useState(view === 'queue')
  const [queueReload, setQueueReload] = useState(0)
  const [scheduleNotice, setScheduleNotice] = useState('')
  const [scheduleAction, setScheduleAction] = useState(null)
  const [reschedule, setReschedule] = useState(null)
  const [isScheduleBusy, setIsScheduleBusy] = useState(false)
  const [searchInput, setSearchInput] = useState(() => new URLSearchParams(window.location.search).get('search') || '')
  const [search, setSearch] = useState(searchInput)
  const [status, setStatus] = useState(() => {
    const linkedStatus = new URLSearchParams(window.location.search).get('status')
    return queueStatuses.includes(linkedStatus) ? linkedStatus : ''
  })
  const [page, setPage] = useState(1)
  const [liveStatus, setLiveStatus] = useState('connecting')
  const [liveNotice, setLiveNotice] = useState('')

  const [qrToken, setQrToken] = useState('')
  const [qrPreview, setQrPreview] = useState(null)
  const [verificationError, setVerificationError] = useState(null)
  const [verificationResult, setVerificationResult] = useState(null)
  const [pendingAttempt, setPendingAttempt] = useState(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const qrRequestPending = useRef(false)
  const isFacilitator = session.user.role === 'BARANGAY_FACILITATOR'
  const isAdmin = session.user.role === 'SYSTEM_ADMIN'
  const isDswd = session.user.role === 'DSWD_STAFF'
  const authorized = isAdmin || isFacilitator || (isDswd && view === 'qr')
  const selectedIdRef = useRef(selectedId)
  const selectedDistribution = distributions.find((distribution) => distribution.distributionId === selectedId)
  const queuePath = isAdmin ? '/admin/schedules' : '/facilitator/queue'
  const qrPath = isAdmin ? '/admin/verify-claims' : isDswd ? '/dswd/verify-claims' : '/facilitator/qr-verification'
  const currentPath = view === 'queue' ? queuePath : qrPath
  const pageTitle = view === 'queue' ? 'Queue & schedules' : isAdmin || isDswd ? 'Verify QR claims' : 'QR claim verification'

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  useEffect(() => {
    if (!authorized || view !== 'queue') return undefined
    let active = true
    let connectedOnce = false
    let queueTimer
    let distributionTimer
    const refreshQueue = () => {
      clearTimeout(queueTimer)
      queueTimer = setTimeout(() => setQueueReload((count) => count + 1), 250)
    }
    const refreshDistributions = () => {
      clearTimeout(distributionTimer)
      distributionTimer = setTimeout(() => setDistributionReload((count) => count + 1), 250)
    }
    const disconnect = connectFacilitatorQueueRealtime(session.accessToken, {
      onReady: () => {
        if (!active) return
        setLiveStatus('connected')
        if (connectedOnce) { refreshDistributions(); refreshQueue() }
        connectedOnce = true
      },
      onUpdate: (eventName, payload) => {
        if (!active) return
        if (eventName === 'distribution.updated') refreshDistributions()
        if (payload?.distributionId !== selectedIdRef.current) return
        refreshQueue()
        setLiveNotice(eventName === 'claim.released' ? 'Physical assistance released' : eventName.startsWith('claim.') ? 'Claim updated' : eventName === 'distribution.updated' ? 'Distribution updated' : 'Schedule updated')
      },
      onError: (socketError) => {
        if (!active) return
        if (['AUTHENTICATION_REQUIRED', 'INVALID_TOKEN', 'INVALID_SESSION'].includes(socketError?.data?.code)) return onSessionExpired()
        setLiveStatus('reconnecting')
      },
      onDisconnect: () => { if (active) setLiveStatus('reconnecting') },
    })
    return () => {
      active = false
      clearTimeout(queueTimer)
      clearTimeout(distributionTimer)
      disconnect()
    }
  }, [authorized, onSessionExpired, session.accessToken, view])

  useEffect(() => {
    if (!authorized) return undefined
    let active = true
    const request = view === 'qr'
      ? requestOpenDistributions(session.accessToken)
      : Promise.all([
        requestAllDistributions(session.accessToken, { status: 'OPEN' }),
        requestAllDistributions(session.accessToken, { status: 'DRAFT' }),
      ]).then(([open, drafts]) => [...open, ...drafts])
    request
      .then(async (items) => {
        const linkedId = linkedDistribution.current
        if (linkedId && !items.some((item) => item.distributionId === linkedId)) {
          const linked = await requestDistribution(session.accessToken, linkedId)
          items = [linked, ...items]
        }
        if (!active) return
        const relevantItems = view === 'qr'
          ? items.filter((item) => item.status === 'OPEN' && ['QR', 'QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC'].includes(item.verificationRequirement))
          : items.filter((item) => ['DRAFT', 'OPEN'].includes(item.status))
        if (linkedId && !relevantItems.some((item) => item.distributionId === linkedId)) {
          throw new Error(view === 'qr' ? 'This event is not open for QR validation. Return to the event to check its status and verification method.' : 'This event is closed or cancelled. Its schedules can be viewed in the event record.')
        }
        linkedDistribution.current = ''
        setDistributionError('')
        if (!relevantItems.some((item) => item.distributionId === selectedIdRef.current)) {
          setQueue(null)
          setPage(1)
        }
        setDistributions(relevantItems)
        setSelectedId((current) => relevantItems.some((item) => item.distributionId === current) ? current : relevantItems[0]?.distributionId || '')
        if (relevantItems.length === 0) setIsLoadingQueue(false)
      })
      .catch((error) => {
        if (!active) return
        if (isSessionExpiredError(error)) return onSessionExpired()
        setDistributionError(getAuthErrorMessage(error))
      })
      .finally(() => { if (active) setIsLoadingDistributions(false) })
    return () => { active = false }
  }, [authorized, distributionReload, onSessionExpired, session.accessToken, view])

  useEffect(() => {
    if (!selectedDistribution || distributionError) return
    const url = new URL(window.location.href)
    url.searchParams.set('distribution', selectedId)
    if (view === 'queue') {
      if (status) url.searchParams.set('status', status)
      else url.searchParams.delete('status')
      if (search) url.searchParams.set('search', search)
      else url.searchParams.delete('search')
    }
    window.history.replaceState(window.history.state, '', url)
  }, [distributionError, search, selectedDistribution, selectedId, status, view])

  useEffect(() => {
    if (!authorized || view !== 'queue' || !selectedDistribution) return undefined
    let active = true
    requestDistributionQueue(session.accessToken, selectedId, { page, search, status })
      .then((data) => {
        if (!active) return
        const lastPage = Math.max(1, data.pagination.totalPages)
        if (page > lastPage) { setPage(lastPage); return }
        setQueueError('')
        setQueue({ ...data, distributionId: selectedId })
      })
      .catch((error) => {
        if (!active) return
        if (isSessionExpiredError(error)) return onSessionExpired()
        setQueueError(getAuthErrorMessage(error))
      })
      .finally(() => { if (active) setIsLoadingQueue(false) })
    return () => { active = false }
  }, [authorized, onSessionExpired, page, queueReload, search, selectedDistribution, selectedId, session.accessToken, status, view])

  function selectDistribution(distributionId) {
    selectedIdRef.current = distributionId
    setSelectedId(distributionId)
    setQueue(null)
    setQueueError('')
    setScheduleNotice('')
    setPage(1)
    setIsLoadingQueue(view === 'queue')
    setQrToken('')
    setQrPreview(null)
    setVerificationError(null)
    setVerificationResult(null)
    setPendingAttempt(null)
  }

  function filterQueue(event) {
    event.preventDefault()
    setQueueError('')
    setPage(1)
    setIsLoadingQueue(true)
    setSearch(searchInput.trim())
    setQueueReload((count) => count + 1)
  }

  function changeQueueStatus(nextStatus) {
    setStatus(nextStatus)
    setPage(1)
    setQueueError('')
    setIsLoadingQueue(true)
  }

  function clearQueueFilters() {
    setSearchInput('')
    setSearch('')
    setStatus('')
    setPage(1)
    setQueueError('')
    setIsLoadingQueue(true)
    setQueueReload(count => count + 1)
  }

  function refreshQueueRecords() {
    setIsLoadingQueue(true)
    setQueueReload((count) => count + 1)
    setDistributionReload((count) => count + 1)
  }

  async function generateSchedules() {
    setIsScheduleBusy(true)
    setQueueError('')
    setScheduleNotice('')
    try {
      await generateDistributionSchedules(session.accessToken, selectedId)
      setScheduleNotice('Remaining beneficiaries were assigned using the event capacity and service-area rules.')
      setIsLoadingQueue(true)
      setQueueReload((count) => count + 1)
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      setQueueError(getAuthErrorMessage(error))
    } finally {
      setIsScheduleBusy(false)
    }
  }

  async function confirmScheduleAction() {
    const action = scheduleAction
    if (!action) return
    try {
      if (action.kind === 'cancel') await cancelDistributionSchedule(session.accessToken, selectedId, action.schedule.scheduleId)
      else await reactivateDistributionSchedule(session.accessToken, selectedId, action.schedule.scheduleId)
      setScheduleNotice(action.kind === 'cancel' ? 'Schedule cancelled.' : 'Schedule reactivated.')
      setScheduleAction(null)
      setIsLoadingQueue(true)
      setQueueReload((count) => count + 1)
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      setQueueError(getAuthErrorMessage(error))
      throw error
    }
  }

  async function beginReschedule(schedule) {
    setIsScheduleBusy(true)
    setQueueError('')
    try {
      const data = await requestDistributionSlots(session.accessToken, selectedId)
      const area = schedule.beneficiary.sitioPurok?.trim().toLocaleLowerCase('en-PH')
      const slots = data.slots.filter((slot) => slot.slotId !== schedule.slotId && slot.slotStatus === 'AVAILABLE'
        && (!slot.serviceAreas.length || (area && slot.serviceAreas.some((name) => name.trim().toLocaleLowerCase('en-PH') === area))))
      if (slots.length === 0) {
        setQueueError(isAdmin ? 'No other available time slot covers this beneficiary’s service area. Return to the event to review capacity.' : 'No other available time slot covers this beneficiary’s service area. Ask the administrator to review capacity.')
        return
      }
      setReschedule({ schedule, slots })
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      setQueueError(getAuthErrorMessage(error))
    } finally {
      setIsScheduleBusy(false)
    }
  }

  async function confirmReschedule(slotId) {
    try {
      await rescheduleDistributionSchedule(session.accessToken, selectedId, reschedule.schedule.scheduleId, slotId)
      setReschedule(null)
      setScheduleNotice('Beneficiary moved to the selected session.')
      setIsLoadingQueue(true)
      setQueueReload((count) => count + 1)
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      setQueueError(getAuthErrorMessage(error))
      throw error
    }
  }

  async function verifyToken(token) {
    if (qrRequestPending.current) return
    const submittedToken = token.trim()
    setVerificationResult(null)

    if (!submittedToken) {
      setVerificationError({ message: 'Scan a beneficiary QR credential before continuing.', code: 'TOKEN_REQUIRED' })
      return
    }

    const reusableAttempt = pendingAttempt?.distributionId === selectedId && pendingAttempt.qrToken === submittedToken
    qrRequestPending.current = true
    const idempotencyKey = reusableAttempt ? pendingAttempt.idempotencyKey : crypto.randomUUID()
    setPendingAttempt({ distributionId: selectedId, qrToken: submittedToken, idempotencyKey })
    setVerificationError(null)
    setIsVerifying(true)

    try {
      const result = await verifyDistributionQrClaim(session.accessToken, selectedId, submittedToken, idempotencyKey)
      setVerificationResult(result)
      setQrPreview(null)
      setPendingAttempt(null)
      setQrToken('')
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      const retryable = error instanceof TypeError || ['API_UNREACHABLE', 'QR_CLAIM_CONCURRENT_CHANGE'].includes(error.code) || error.status >= 500
      setVerificationError({ message: getAuthErrorMessage(error), code: error.code, claimId: error.details?.claimId, retryable })
      if (!retryable) {
        setPendingAttempt(null)
        setQrPreview(null)
        setQrToken('')
      }
    } finally {
      qrRequestPending.current = false
      setIsVerifying(false)
    }
  }

  async function previewToken(token) {
    if (qrRequestPending.current) return
    const submittedToken = token.trim()
    setVerificationResult(null)
    setQrPreview(null)
    if (!submittedToken) {
      setVerificationError({ message: 'Scan a beneficiary QR credential before continuing.', code: 'TOKEN_REQUIRED' })
      return
    }
    setQrToken(submittedToken)
    qrRequestPending.current = true
    setVerificationError(null)
    setPendingAttempt(null)
    setIsPreviewing(true)
    try {
      const preview = await previewDistributionQrClaim(session.accessToken, selectedId, submittedToken)
      setQrPreview(preview)
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      setQrToken('')
      setVerificationError({ message: getAuthErrorMessage(error), code: error.code, claimId: error.details?.claimId })
    } finally {
      qrRequestPending.current = false
      setIsPreviewing(false)
    }
  }

  async function previewQr(event) {
    event.preventDefault()
    await previewToken(qrToken)
  }

  if (!authorized) return <AccessDenied session={session} onLogout={onLogout} onNavigate={onNavigate} />

  return (
    <DashboardShell breadcrumbs={['Operations', 'Distributions', pageTitle]} currentPath={currentPath} onLogout={onLogout} onNavigate={onNavigate} pageTitle={pageTitle} showAssistant={isAdmin && view !== 'qr'} user={session.user}>
      <header className="ga-page-header flex flex-col gap-4 border-b border-line pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1">
          <p className="ga-eyebrow">{isAdmin ? 'Distribution administration' : isDswd ? 'DSWD claim review' : 'Assigned barangay operations'}</p>
          <h1 className="ga-page-title mt-2">{pageTitle}</h1>
          <p className="ga-page-copy">
            {view === 'queue' ? 'Find the beneficiary, check their session, and continue to verification or the claim record. Schedules can only be changed while the event is a draft.' : 'Check the beneficiary and event before confirming the QR claim. Assistance is released in a separate step.'}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {view === 'queue' && <button type="button" onClick={refreshQueueRecords} disabled={isLoadingDistributions || isScheduleBusy || Boolean(scheduleAction) || Boolean(reschedule)} className="ga-btn-secondary"><Icon name="reset" className="size-4" />Refresh queue</button>}
            {(isAdmin ? Boolean(selectedDistribution) : view === 'qr') && <button type="button" onClick={() => onNavigate(isDswd ? `/claim-accountability${selectedId ? `?distribution=${encodeURIComponent(selectedId)}` : ''}` : isAdmin ? `/distributions/manage${selectedId ? `?event=${encodeURIComponent(selectedId)}` : ''}` : `${queuePath}${selectedId ? `?distribution=${encodeURIComponent(selectedId)}` : ''}`)} className="ga-btn-secondary"><Icon name="arrowLeft" className="size-4" />
              {isDswd ? 'View claims and receipts' : isAdmin ? 'Return to distribution event' : 'View beneficiary queue'}
            </button>}
            {view === 'queue' && selectedDistribution?.status === 'OPEN' && ['QR', 'QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC'].includes(selectedDistribution.verificationRequirement) && <button type="button" onClick={() => onNavigate(`${qrPath}?distribution=${encodeURIComponent(selectedId)}`)} className="ga-btn-primary"><Icon name="qr" className="size-4" />{isAdmin ? 'Verify QR claims' : 'Open QR verification'}</button>}
          </div>
          {view === 'queue' && <span role="status" className="text-xs leading-5 text-muted-copy">{liveStatus === 'connected' ? 'Live updates connected' : liveStatus === 'connecting' ? 'Connecting live updates…' : 'Live updates unavailable. Refresh to check the queue.'}</span>}
        </div>
      </header>

      {view === 'queue' && liveNotice && <p role="status" aria-live="polite" className="mt-4 text-xs font-semibold text-muted-copy">{liveNotice} · Updating the selected queue</p>}

      {isLoadingDistributions ? (
        <div className="ga-card mt-7 p-6"><Skeleton className="h-4 w-40" /><Skeleton className="mt-3 h-12 w-full" /></div>
      ) : distributionError ? (
        <section className="mt-7 rounded-xl border border-amber-200 bg-white p-6" role="alert">
          <h2 className="font-extrabold text-ink">Unable to load distribution events</h2>
          <p className="mt-2 text-sm leading-6 text-muted-copy">{distributionError}</p>
          <button type="button" onClick={() => { setDistributionError(''); setIsLoadingDistributions(true); setDistributionReload((count) => count + 1) }} className="ga-btn-primary mt-4">Try again</button>
        </section>
      ) : distributions.length === 0 ? (
        <section className="ga-card mt-7 flex items-start gap-4 p-5 sm:p-7" aria-labelledby="no-distributions-title">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-info-soft text-brand-blue"><Icon name={view === 'queue' ? 'calendar' : 'qr'} /></span>
          <div className="min-w-0">
            <h2 id="no-distributions-title" className="text-lg font-semibold text-ink">{view === 'queue' ? isAdmin ? 'No draft or open distribution events' : 'No distribution work assigned' : 'No open distribution event'}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-copy">{view === 'queue' ? isAdmin ? 'Prepare a distribution event, service sessions, and beneficiary allocations before building the queue. Draft and open events appear here.' : 'Draft and open events assigned to your barangay appear here. Ask your administrator to check the event and barangay assignment.' : isAdmin ? 'Open a distribution event configured for QR verification. Complete its sessions, allocations, and schedules before opening it.' : 'An administrator must open a QR-enabled event within your authorized area before you can check credentials.'}</p>
            {isAdmin && <button type="button" onClick={() => onNavigate('/distributions/manage')} className="ga-btn-primary mt-4"><Icon name="distributions" className="size-4" />View distribution events</button>}
          </div>
        </section>
      ) : (
        <>
          <section className="ga-card mt-7 grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)] md:items-end sm:p-6" aria-label="Selected distribution event">
            <DistributionSelector distributions={distributions} selectedId={selectedId} onChange={selectDistribution} disabled={isPreviewing || isVerifying || isScheduleBusy || Boolean(scheduleAction) || Boolean(reschedule)} />
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
              <div><dt className="text-xs font-semibold text-muted-copy">Location</dt><dd className="mt-1 font-bold text-ink">{selectedDistribution?.location}</dd></div>
              <div><dt className="text-xs font-semibold text-muted-copy">Event time</dt><dd className="mt-1 font-bold text-ink">{selectedDistribution?.startTime}–{selectedDistribution?.endTime}</dd></div>
              <div><dt className="text-xs font-semibold text-muted-copy">Assistance</dt><dd className="mt-1 font-semibold text-ink">{selectedDistribution?.deliveryMode === 'PHYSICAL_GOODS' ? 'Physical handover' : 'Simulated wallet credit'}</dd></div>
              <div><dt className="text-xs font-semibold text-muted-copy">Required checks</dt><dd className="mt-1 font-semibold text-ink">{humanize(selectedDistribution?.verificationRequirement).replace('Biometric', 'Face').replace('And', '+').replace('Qr', 'QR')}</dd></div>
            </dl>
          </section>

          {view === 'queue' ? (
            <QueueView
              queue={queue?.distributionId === selectedId ? queue : null}
              role={session.user.role}
              onNavigate={onNavigate}
              distribution={selectedDistribution}
              queueError={queueError}
              isLoading={isLoadingQueue}
              isScheduleBusy={isScheduleBusy}
              page={page}
              searchInput={searchInput}
              filtered={Boolean(search || status || searchInput)}
              setSearchInput={setSearchInput}
              status={status}
              onFilter={filterQueue}
              onClear={clearQueueFilters}
              onStatusChange={changeQueueStatus}
              onGenerate={generateSchedules}
              onReschedule={beginReschedule}
              onScheduleAction={setScheduleAction}
              onPageChange={(nextPage) => { setPage(nextPage); setIsLoadingQueue(true) }}
              onRetry={() => { setQueueError(''); setIsLoadingQueue(true); setQueueReload((count) => count + 1) }}
              scheduleNotice={scheduleNotice}
            />
          ) : (
            <QrVerificationView
              role={session.user.role}
              distribution={selectedDistribution}
              qrToken={qrToken}
              setQrToken={(value) => { setQrToken(value); setQrPreview(null); setVerificationError(null); setVerificationResult(null); if (pendingAttempt?.qrToken !== value.trim()) setPendingAttempt(null) }}
              error={verificationError}
              preview={qrPreview}
              result={verificationResult}
              isPreviewing={isPreviewing}
              isVerifying={isVerifying}
              onSubmit={previewQr}
              onCameraScan={previewToken}
              onConfirm={() => verifyToken(qrToken)}
              onReset={() => { setQrToken(''); setQrPreview(null); setVerificationError(null); setVerificationResult(null); setPendingAttempt(null) }}
              onNavigate={onNavigate}
            />
          )}
          <ConfirmationDialog
            open={Boolean(scheduleAction)}
            title={scheduleAction?.kind === 'cancel' ? 'Cancel this beneficiary schedule?' : 'Reactivate this beneficiary schedule?'}
            description={scheduleAction?.kind === 'cancel' ? 'The beneficiary will leave the active queue and the slot capacity will be released.' : 'The beneficiary will return to this session if capacity and service-area rules still allow it.'}
            actionLabel={scheduleAction?.kind === 'cancel' ? 'Cancel schedule' : 'Reactivate schedule'}
            destructive={scheduleAction?.kind === 'cancel'}
            onCancel={() => setScheduleAction(null)}
            onConfirm={confirmScheduleAction}
          />
          {reschedule && <RescheduleDialog schedule={reschedule.schedule} slots={reschedule.slots} onClose={() => setReschedule(null)} onSave={confirmReschedule} />}
        </>
      )}
    </DashboardShell>
  )
}

function RescheduleDialog({ schedule, slots, onClose, onSave }) {
  const dialogRef = useRef(null)
  const [slotId, setSlotId] = useState(slots[0]?.slotId ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const errorRef = useRef(null)

  useEffect(() => { dialogRef.current?.showModal() }, [])

  async function submit(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try { await onSave(slotId) } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
      requestAnimationFrame(() => errorRef.current?.focus())
    } finally { setIsSaving(false) }
  }

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); if (!isSaving) dialogRef.current?.close() }} onClose={onClose} aria-labelledby="reschedule-title" className="m-auto w-[min(38rem,calc(100%-2rem))] rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/60 backdrop:backdrop-blur-[3px]">
      <form onSubmit={submit} className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Change session</p><h2 id="reschedule-title" className="mt-2 text-2xl font-extrabold">Move {beneficiaryName(schedule.beneficiary)}</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Choose another available session in this distribution event. Capacity and service-area coverage are checked again before saving.</p></div><button type="button" disabled={isSaving} onClick={() => dialogRef.current?.close()} aria-label="Close reschedule dialog" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-copy hover:bg-slate-50"><Icon name="close" /></button></div>
        <label htmlFor="reschedule-slot" className="ga-label mt-6 block">Available session</label>
        <select id="reschedule-slot" required value={slotId} onChange={(event) => setSlotId(event.target.value)} className="ga-input mt-2 cursor-pointer">{slots.map((slot) => <option key={slot.slotId} value={slot.slotId}>{slot.sessionLabel} · {dateFormatter.format(new Date(slot.slotStart))} · {timeFormatter.format(new Date(slot.slotStart))}</option>)}</select>
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft p-4 text-sm text-brand-red">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={isSaving} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Keep current session</button><button type="submit" disabled={isSaving || !slotId} className="ga-btn-primary">{isSaving ? <LoadingLabel>Moving...</LoadingLabel> : 'Move beneficiary'}</button></div>
      </form>
    </dialog>
  )
}

function ScheduleActions({ schedule, busy, mobile = false, onReschedule, onScheduleAction }) {
  if (!['SCHEDULED', 'CANCELLED'].includes(schedule.status)) return null
  return (
    <div className={`flex gap-2 ${mobile ? 'mt-3' : 'justify-end'}`}>
      {schedule.status === 'SCHEDULED' && <button type="button" disabled={busy} onClick={() => onReschedule(schedule)} className={`min-h-11 rounded-lg border border-line px-3 text-sm font-bold text-brand-blue hover:bg-info-soft ${mobile ? 'flex-1' : ''}`}>Move</button>}
      <button type="button" disabled={busy} onClick={() => onScheduleAction({ kind: schedule.status === 'CANCELLED' ? 'reactivate' : 'cancel', schedule })} className={`min-h-11 rounded-lg border px-3 text-sm font-bold ${mobile ? 'flex-1' : ''} ${schedule.status === 'CANCELLED' ? 'border-blue-200 text-brand-blue hover:bg-info-soft' : 'border-red-200 text-brand-red hover:bg-danger-soft'}`}>{schedule.status === 'CANCELLED' ? 'Reactivate' : 'Cancel'}</button>
    </div>
  )
}

function QueueClaimAction({ schedule, distribution, role, onNavigate }) {
  const action = queueNextAction(schedule, distribution, role)
  if (!action) return <span className="text-xs text-muted-copy">{schedule.status === 'SCHEDULED' ? 'Awaiting authorized verification' : 'No claim action'}</span>
  return <a href={action.href} className="ga-admin-link inline-flex min-h-11 items-center" onClick={(event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate(action.href)
  }}>{action.label}</a>
}

function QueueView({ distribution, queue, role, onNavigate, queueError, isLoading, isScheduleBusy, page, searchInput, filtered, setSearchInput, status, onFilter, onClear, onGenerate, onReschedule, onScheduleAction, onStatusChange, onPageChange, onRetry, scheduleNotice }) {
  const searchRef = useRef(null)
  const counts = queue?.summary.countsByStatus ?? {}
  const isDraft = distribution?.status === 'DRAFT'

  return (
    <section className="mt-6" aria-labelledby="queue-heading">
      {isDraft && (
        <div className="ga-card mb-5 flex flex-col gap-5 border-l-4 border-l-brand-blue p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-soft text-brand-blue"><Icon name="queue" /></span>
            <div><p className="ga-eyebrow">Schedule planning</p><h2 className="mt-1 text-lg font-extrabold text-ink">Assign beneficiaries within approved capacity</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-copy">Automated assignment creates first-time appointments in the earliest available session. To return a cancelled beneficiary to the queue, choose Reactivate on their existing schedule below.</p></div>
          </div>
          {queue?.summary?.schedulableAllocationCount !== 0 && <button type="button" disabled={isScheduleBusy} onClick={onGenerate} className="ga-btn-primary shrink-0">{isScheduleBusy ? <LoadingLabel>Assigning...</LoadingLabel> : 'Assign remaining'}</button>}
        </div>
      )}

      {scheduleNotice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-success-soft p-4 text-sm font-semibold text-brand-green">{scheduleNotice}</div>}

      <dl className="ga-admin-summary grid grid-cols-2 lg:grid-cols-4" aria-label="Queue summary">
        {[
          ['Scheduled', counts.SCHEDULED ?? 0, 'pending'],
          ['Checked in', counts.CHECKED_IN ?? 0, 'success'],
          ['Missed', counts.MISSED ?? 0, 'neutral'],
          ['Cancelled', counts.CANCELLED ?? 0, 'neutral'],
        ].map(([label, value, tone]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={`text-2xl font-semibold tabular-nums ${tone === 'success' ? 'text-brand-green' : tone === 'pending' ? 'text-brand-amber' : 'text-ink'}`}>{queue && !queueError ? value : '—'}</dd>
          </div>
        ))}
      </dl>

      <div className="ga-card mt-6 overflow-hidden">
        <div className="border-b border-line p-5 sm:p-6">
          <h2 id="queue-heading" className="text-xl font-extrabold text-ink">{isDraft ? 'Beneficiary schedules' : 'Beneficiary queue'}</h2>
          <form aria-label="Find beneficiary schedules" onSubmit={onFilter} className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem] xl:grid-cols-[minmax(0,1fr)_13rem_auto]">
            <div className="min-w-0"><label htmlFor="queue-search" className="ga-label">Search beneficiary or queue number</label><div className="relative mt-2"><Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-copy" /><input ref={searchRef} id="queue-search" type="search" autoComplete="off" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength="100" placeholder="Name or queue number" className="ga-input pl-11" /></div></div>
            <div className="min-w-0"><label htmlFor="queue-status" className="ga-label">Filter by queue status</label><select id="queue-status" value={status} onChange={(event) => onStatusChange(event.target.value)} className="ga-input mt-2 cursor-pointer font-semibold">{queueStatuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-1 xl:self-end"><button type="submit" className="ga-btn-primary"><Icon name="search" className="size-4" />Search</button>{filtered && <button type="button" onClick={() => { onClear(); searchRef.current?.focus() }} className="ga-btn-secondary"><Icon name="close" className="size-4" />Clear filters</button>}</div>
          </form>
        </div>

        <div className="p-4 sm:p-6">
          {isLoading ? <QueueSkeleton /> : queueError ? (
            <div className="rounded-lg border border-amber-200 bg-warning-soft p-5" role="alert"><p className="font-bold text-ink">Unable to load schedules</p><p className="mt-2 text-sm text-muted-copy">{queueError}</p><button type="button" onClick={onRetry} className="ga-btn-primary mt-4">Try again</button></div>
          ) : !queue ? <QueueSkeleton /> : queue.schedules.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-line bg-slate-50 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-brand-blue"><Icon name={filtered ? 'search' : 'calendar'} /></span><div className="min-w-0"><h3 className="font-semibold text-ink">No schedules found</h3><p className="mt-2 text-sm leading-6 text-copy">{filtered ? 'Try another name or queue number, or clear the filters to see the full queue.' : isDraft ? 'Allocate approved beneficiaries and assign the remaining schedules before opening this event.' : 'No beneficiary schedules are available for this event. Ask your administrator to review the event records.'}</p></div></div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Beneficiary distribution schedules</caption>
                  <thead><tr className="border-b border-line text-xs uppercase tracking-[0.08em] text-muted-copy"><th scope="col" className="px-3 py-3">Queue</th><th scope="col" className="px-3 py-3">Beneficiary</th><th scope="col" className="px-3 py-3">Time slot</th><th scope="col" className="px-3 py-3">Status</th><th scope="col" className="px-3 py-3 text-right">{isDraft ? 'Schedule action' : 'Next step'}</th></tr></thead>
                  <tbody className="divide-y divide-line">{queue.schedules.map((schedule) => <tr key={schedule.scheduleId}><td className="px-3 py-4"><p className="text-lg font-black text-brand-navy">#{schedule.queueNumber}</p><p className="mt-1 text-xs text-muted-copy">{schedule.assignmentMethod === 'AUTOMATED_RULES' || schedule.assignedByAi ? 'Automated rules' : 'Staff assigned'}</p></td><td className="px-3 py-4"><p className="font-bold text-ink">{beneficiaryName(schedule.beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">{schedule.beneficiary.sitioPurok ?? schedule.beneficiary.barangay?.barangayName}</p><ClaimProgress claim={schedule.claim} /></td><td className="px-3 py-4"><p className="font-semibold text-ink">{schedule.slot.sessionLabel}</p><p className="mt-1 text-xs text-muted-copy">{dateFormatter.format(new Date(schedule.slot.slotStart))} · {timeFormatter.format(new Date(schedule.slot.slotStart))}–{timeFormatter.format(new Date(schedule.slot.slotEnd))}</p><p className="mt-1 text-xs text-muted-copy">{schedule.slot.location}</p></td><td className="px-3 py-4"><StatusBadge status={schedule.status} /></td><td className="px-3 py-4 text-right">{isDraft ? <ScheduleActions schedule={schedule} busy={isScheduleBusy} onReschedule={onReschedule} onScheduleAction={onScheduleAction} /> : <QueueClaimAction schedule={schedule} distribution={distribution} role={role} onNavigate={onNavigate} />}</td></tr>)}</tbody>
                </table>
              </div>
              <ul className="space-y-3 md:hidden">{queue.schedules.map((schedule) => <li key={schedule.scheduleId} className="rounded-lg border border-line p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black text-brand-navy">Queue #{schedule.queueNumber}</p><p className="mt-1 font-bold text-ink">{beneficiaryName(schedule.beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">{schedule.beneficiary.sitioPurok ?? schedule.beneficiary.barangay?.barangayName}</p><ClaimProgress claim={schedule.claim} /></div><StatusBadge status={schedule.status} /></div><div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-sm font-bold text-ink">{schedule.slot.sessionLabel}</p><p className="mt-1 text-xs text-muted-copy">{dateFormatter.format(new Date(schedule.slot.slotStart))} · {timeFormatter.format(new Date(schedule.slot.slotStart))}–{timeFormatter.format(new Date(schedule.slot.slotEnd))}</p><p className="mt-1 text-xs text-muted-copy">{schedule.slot.location}</p></div>{isDraft ? <ScheduleActions schedule={schedule} busy={isScheduleBusy} mobile onReschedule={onReschedule} onScheduleAction={onScheduleAction} /> : <div className="mt-3 border-t border-line pt-2"><QueueClaimAction schedule={schedule} distribution={distribution} role={role} onNavigate={onNavigate} /></div>}</li>)}</ul>
              <div className="mt-5 flex items-center justify-between border-t border-line pt-4"><p className="text-xs font-semibold text-muted-copy">Page {queue.pagination.page} of {Math.max(queue.pagination.totalPages, 1)}</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Previous</button><button type="button" disabled={page >= queue.pagination.totalPages} onClick={() => onPageChange(page + 1)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Next</button></div></div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function QrCameraDialog({ onClose, onDetected }) {
  const dialogRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const frameRef = useRef(0)
  const requestRef = useRef(0)
  const [state, setState] = useState('starting')
  const [error, setError] = useState('')

  const stopCamera = useCallback(() => {
    requestRef.current += 1
    cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const close = useCallback(() => {
    stopCamera()
    dialogRef.current?.close()
  }, [stopCamera])

  const startCamera = useCallback(async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) {
      setState('error')
      setError('QR camera scanning is unavailable in this browser. Use a USB handheld scanner or ask the System Administrator to reissue the credential.')
      return
    }

    stopCamera()
    const requestId = requestRef.current
    setState('starting')
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      if (requestId !== requestRef.current || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setState('scanning')

      const scan = async () => {
        if (requestId !== requestRef.current || !videoRef.current) return
        try {
          const detections = await detector.detect(videoRef.current)
          const value = detections.find((item) => item.rawValue?.trim())?.rawValue.trim()
          if (value) {
            stopCamera()
            dialogRef.current?.close()
            onDetected(value)
            return
          }
          frameRef.current = requestAnimationFrame(scan)
        } catch {
          stopCamera()
          setState('error')
          setError('The camera feed could not be read. Try again, improve the lighting, or use the handheld scanner.')
        }
      }
      frameRef.current = requestAnimationFrame(scan)
    } catch (cameraError) {
      if (requestId !== requestRef.current) return
      stopCamera()
      setState('error')
      setError(cameraError?.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow camera permission in the browser, then try again, or use the handheld scanner.'
        : 'The camera could not be opened. Check that another app is not using it, then try again.')
    }
  }, [onDetected, stopCamera])

  useEffect(() => {
    dialogRef.current?.showModal()
    frameRef.current = requestAnimationFrame(startCamera)
    return stopCamera
  }, [startCamera, stopCamera])

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); close() }} onClose={onClose} className="m-auto w-[min(42rem,calc(100%-2rem))] overflow-hidden rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/60">
      <div className="flex items-start justify-between gap-5 border-b border-line p-5 sm:p-6">
        <div><p className="ga-eyebrow">Live QR scanner</p><h2 className="mt-1 text-xl font-bold">Center the beneficiary QR code</h2><p className="mt-2 text-sm leading-6 text-muted-copy">One clear scan opens the beneficiary details for review. It does not check anyone in yet.</p></div>
        <button type="button" onClick={close} aria-label="Close QR camera" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-copy transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"><Icon name="close" /></button>
      </div>
      <div className="p-5 sm:p-6">
        <div className="relative aspect-[4/3] min-h-64 overflow-hidden rounded-xl bg-slate-950 shadow-inner">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview for QR scanning" className={`h-full w-full object-cover ${state === 'scanning' ? 'block' : 'hidden'}`} />
          {state !== 'scanning' && <div className="absolute inset-0 grid place-items-center px-6 text-center text-white"><div><span aria-hidden="true" className="mx-auto grid size-16 place-items-center rounded-full border border-white/20 bg-white/10"><Icon name="camera" className="size-7" /></span><p className="mt-4 font-bold">{state === 'starting' ? 'Starting camera…' : 'Camera unavailable'}</p></div></div>}
          {state === 'scanning' && <><div aria-hidden="true" className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(2,6,23,0.34)]" /><span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-slate-950/75 px-3 py-1.5 text-xs font-bold text-white backdrop-blur"><span className="ga-live-dot size-2 rounded-full bg-emerald-400" /> SCANNING</span></>}
        </div>
        <p aria-live="polite" className="mt-3 text-sm font-semibold text-brand-green">{state === 'scanning' ? 'Camera ready. Hold the QR code steady inside the guide.' : ''}</p>
        {error && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-danger-soft p-4"><p className="font-bold text-brand-red">Camera scan unavailable</p><p className="mt-1 text-sm leading-6 text-copy">{error}</p></div>}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} className="ga-btn-secondary">Use handheld scanner</button>
          {state === 'error' && <button type="button" onClick={startCamera} className="ga-btn-primary"><Icon name="camera" /> Try camera again</button>}
        </div>
      </div>
    </dialog>
  )
}

function QrVerificationView({ role, distribution, qrToken, setQrToken, error, preview, result, isPreviewing, isVerifying, onSubmit, onCameraScan, onConfirm, onReset, onNavigate }) {
  const inputRef = useRef(null)
  const confirmRef = useRef(null)
  const resultRef = useRef(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const duplicateError = ['QR_TOKEN_ALREADY_USED', 'DUPLICATE_CLAIM'].includes(error?.code)
  const errorClaimHref = error?.claimId ? `/claim-accountability?${new URLSearchParams({ distribution: distribution.distributionId, claim: error.claimId })}` : ''
  const isAdmin = role === 'SYSTEM_ADMIN'
  const isFacilitator = role === 'BARANGAY_FACILITATOR'
  const needsBiometric = result?.nextRequiredVerification === 'BIOMETRIC'
  const claim = result?.claim
  const currentStep = result ? 3 : preview ? 2 : 1
  const busy = isPreviewing || isVerifying

  useEffect(() => {
    if (cameraOpen || busy) return
    if (result) resultRef.current?.focus()
    else if (preview) confirmRef.current?.focus()
    else if (!result) inputRef.current?.focus({ preventScroll: true })
  }, [busy, cameraOpen, preview, result])

  return (
    <div className="mt-6">
      <ol aria-label="QR verification progress" className="ga-card grid grid-cols-3 overflow-hidden">
        {[isAdmin ? 'Enter credential' : 'Scan credential', 'Review identity', 'Record verification'].map((label, index) => {
          const step = index + 1
          const complete = currentStep > step
          const active = currentStep === step
          return (
            <li key={label} aria-current={active ? 'step' : undefined} className={`flex min-w-0 items-center gap-2 border-r border-line px-3 py-3 last:border-r-0 sm:gap-3 sm:px-5 ${active ? 'bg-info-soft text-brand-blue' : 'bg-white text-muted-copy'}`}>
              <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${complete ? 'bg-brand-green text-white' : active ? 'bg-brand-blue text-white' : 'border border-line bg-slate-50'}`}>{complete ? <Icon name="check" className="size-4" strokeWidth={2.5} /> : step}</span>
              <span className="text-xs font-bold sm:text-sm"><span className="sm:hidden">{[isAdmin ? 'Enter' : 'Scan', 'Review', 'Record'][index]}</span><span className="hidden sm:inline">{label}</span></span>
            </li>
          )
        })}
      </ol>

      <div className="mt-5 grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <section className="ga-card overflow-hidden" aria-labelledby="verification-form-heading">
          <header className="border-b border-line p-5 sm:p-7">
            <div>
              <h2 id="verification-form-heading" className="mt-1 text-2xl font-bold text-ink">{isAdmin ? 'Check a QR claim' : 'Review a beneficiary credential'}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-copy">Reviewing a credential shows the beneficiary details. Confirm only after matching the person and their assigned event.</p>
            </div>
          </header>

          <div className="p-5 sm:p-7">
            <dl className="grid gap-4 rounded-xl border border-line bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-semibold text-muted-copy">Allowed verification</dt><dd className="mt-1 font-bold text-ink">{verificationLabels[distribution.verificationRequirement]}</dd></div>
              <div><dt className="text-xs font-semibold text-muted-copy">Release handled by</dt><dd className="mt-1 font-bold text-ink">{distribution.deliveryMode === 'PHYSICAL_GOODS' ? 'Barangay Facilitator' : 'DSWD Staff'}</dd></div>
            </dl>

            {distribution.verificationRequirement === 'QR_OR_BIOMETRIC' && <div className="mt-4 border-l-2 border-brand-blue bg-info-soft p-4 text-sm leading-6"><p>QR or live face match is enough for this event. A printed QR works without a phone.</p>{!isAdmin && !result && <button type="button" disabled={busy} onClick={() => onNavigate(`/biometrics?view=verify&distribution=${encodeURIComponent(distribution.distributionId)}${preview?.beneficiary ? `&beneficiary=${encodeURIComponent(preview.beneficiary.beneficiaryId)}` : ''}`)} className="ga-btn-secondary mt-3"><Icon name="biometrics" className="size-4" />Use face match instead</button>}</div>}

            <form onSubmit={onSubmit} className="mt-6" aria-busy={busy}>
              {isAdmin ? <>
                <label htmlFor="admin-qr-credential" className="ga-label">QR credential</label>
                <div className="relative mt-2"><Icon name="qr" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-copy" /><input ref={inputRef} id="admin-qr-credential" type="password" autoComplete="off" spellCheck="false" maxLength="512" required placeholder="Paste the full QR credential" value={qrToken} onChange={(event) => setQrToken(event.target.value)} disabled={busy || Boolean(preview) || Boolean(result)} aria-describedby={`admin-qr-hint${error ? ' qr-token-error' : ''}`} aria-invalid={Boolean(error)} className="ga-input pl-11" /></div>
                <p id="admin-qr-hint" className="mt-2 text-sm leading-6 text-muted-copy">Paste the full backup credential printed on the beneficiary’s QR card. A claim reference or beneficiary number will not work.</p>
                {!preview && !result && <button type="submit" disabled={busy || !qrToken.trim()} className="ga-btn-primary mt-4">{isPreviewing ? <LoadingLabel>Checking credential...</LoadingLabel> : 'Review QR claim'}</button>}
              </> : <>
              <button type="button" disabled={busy || Boolean(preview) || Boolean(result)} onClick={() => setCameraOpen(true)} className="ga-btn-primary w-full py-3.5 text-base"><Icon name="camera" className="size-5" /> Scan with this device’s camera</button>

              <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.1em] text-muted-copy"><span className="h-px flex-1 bg-line" /><span>or use a USB 2D QR scanner</span><span className="h-px flex-1 bg-line" /></div>

              <label htmlFor="qr-scanner-input" className="sr-only">USB QR scanner input</label>
              <div className={`relative flex min-h-24 items-center gap-4 rounded-xl border bg-white p-4 transition-shadow focus-within:border-brand-blue focus-within:ring-4 focus-within:ring-blue-100 ${error ? 'border-amber-400' : 'border-line'} ${preview || result ? 'opacity-60' : ''}`}>
                <input ref={inputRef} id="qr-scanner-input" name="qrToken" type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck="false" maxLength="512" disabled={busy || Boolean(preview) || Boolean(result)} value={qrToken} onChange={(event) => setQrToken(event.target.value)} aria-describedby={`qr-scanner-hint${error ? ' qr-token-error' : ''}`} aria-invalid={Boolean(error)} className="absolute inset-0 z-10 size-full cursor-text opacity-0 disabled:cursor-not-allowed" />
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-lg bg-info-soft text-brand-blue"><Icon name="qr" /></span>
                <div className="min-w-0"><p className="font-bold text-ink">{isPreviewing ? 'Checking credential…' : qrToken ? 'Credential detected' : 'Use a USB 2D QR scanner'}</p><p id="qr-scanner-hint" className="mt-1 text-xs leading-5 text-muted-copy">Select this panel, then scan the beneficiary’s QR from a phone or printed credential.</p></div>
                <span className="ml-auto hidden shrink-0 rounded-full border border-emerald-200 bg-success-soft px-3 py-1 text-xs font-bold text-brand-green sm:inline-flex">No typing needed</span>
              </div>

              {qrToken && !preview && !result && <button type="submit" disabled={busy} className="ga-btn-secondary mt-3 w-full">{isPreviewing ? <LoadingLabel>Checking credential...</LoadingLabel> : 'Review detected QR'}</button>}
              </>}

              {error && <div id="qr-token-error" role="alert" className={`mt-4 rounded-lg border p-4 ${duplicateError ? 'border-red-200 bg-danger-soft' : 'border-amber-200 bg-warning-soft'}`}><p className={`font-bold ${duplicateError ? 'text-brand-red' : 'text-brand-amber'}`}>{duplicateError ? 'Possible duplicate claim' : error.retryable ? 'Verification not confirmed' : 'Credential not accepted'}</p><p className="mt-1 text-sm leading-6 text-copy">{error.message}</p><p className="mt-2 text-xs text-muted-copy">{error.retryable ? 'Retry the confirmation using the review shown here. The same confirmation will be reused.' : duplicateError ? 'Open the existing claim to check completed verification, release, and any review hold. Do not scan again to create another claim.' : 'Check the selected event and use the beneficiary’s current QR credential. Used or expired credentials cannot be accepted.'}</p>{errorClaimHref && <a href={errorClaimHref} onClick={(event) => { event.preventDefault(); onNavigate(errorClaimHref) }} className="ga-admin-link mt-3 inline-flex min-h-11 items-center">Review existing claim</a>}</div>}
            </form>

            {!isAdmin && <details className="mt-5 rounded-xl border border-line bg-slate-50 p-4 text-sm">
              <summary className="cursor-pointer font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Having trouble scanning?</summary>
              <ul className="mt-3 space-y-2 leading-6 text-muted-copy"><li>Increase screen brightness or flatten the printed QR card.</li><li>Use the camera or an authorized USB handheld scanner.</li><li>For a damaged or expired credential, ask the System Administrator to reissue it.</li></ul>
            </details>}
          </div>
        </section>

        <aside className="space-y-6" aria-label="Verification review and result">
          {result ? (
            <section ref={resultRef} tabIndex={-1} aria-label="QR validation result" className={`rounded-xl border p-6 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${result.verificationComplete ? 'border-emerald-200 bg-success-soft' : 'border-amber-200 bg-warning-soft'}`}>
              <span aria-hidden="true" className={`grid size-12 place-items-center rounded-full text-white ${result.verificationComplete ? 'bg-brand-green' : 'bg-brand-amber'}`}><Icon name={result.verificationComplete ? 'check' : 'info'} className="size-6" strokeWidth={2.5} /></span>
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.1em] text-muted-copy">Verification recorded</p>
              <h2 className="mt-1 text-xl font-bold text-ink">{result.verificationComplete ? 'Claim verification complete' : 'QR accepted — biometric required'}</h2>
              <p className="mt-2 text-sm leading-6 text-copy">{result.verificationComplete ? distribution.deliveryMode === 'PHYSICAL_GOODS' ? 'Next: the assigned Barangay Facilitator records the physical handover. This verification does not mark assistance as received.' : 'Next: DSWD records the simulated wallet credit. This verification does not credit the beneficiary’s wallet.' : 'Next: DSWD or the assigned Barangay Facilitator completes the live face check. The claim remains pending until all identity checks pass.'}</p>
              <dl className="mt-5 space-y-3 border-t border-current/10 pt-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-copy">Beneficiary</dt><dd className="text-right font-bold text-ink">{beneficiaryName(claim?.beneficiary) || 'Verified beneficiary'}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-copy">Queue number</dt><dd className="font-bold tabular-nums text-ink">{claim?.schedule?.queueNumber ? `#${claim.schedule.queueNumber}` : 'Recorded'}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-copy">Claim status</dt><dd className="font-bold text-ink">{humanize(claim?.claimStatus)}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-copy">Claim reference</dt><dd className="max-w-48 truncate font-mono text-xs font-bold text-ink" title={claim?.claimId}>{claim?.claimId}</dd></div></dl>
              {needsBiometric && !isAdmin
                ? <button type="button" onClick={() => onNavigate(`/biometrics?view=verify&distribution=${encodeURIComponent(claim.distributionId)}&beneficiary=${encodeURIComponent(claim.beneficiaryId)}`)} className="ga-btn-primary mt-5 w-full">Continue to biometric <Icon name="arrowRight" /></button>
                : <button type="button" onClick={() => onNavigate(`/claim-accountability?distribution=${encodeURIComponent(distribution.distributionId)}&claim=${encodeURIComponent(claim.claimId)}`)} className="ga-btn-primary mt-5 w-full">{isFacilitator && result.verificationComplete && distribution.deliveryMode === 'PHYSICAL_GOODS' ? 'Continue to physical handover' : 'View claim record'}<Icon name="arrowRight" /></button>}
              <button type="button" onClick={onReset} className="ga-btn-secondary mt-3 w-full">{isAdmin ? 'Check another QR claim' : 'Scan next beneficiary'}</button>
            </section>
          ) : preview ? (
            <section role="status" aria-live="polite" className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-info-soft px-3 py-1.5 text-xs font-bold text-brand-blue"><Icon name="security" className="size-4" /> Review required</span><span className="text-xs font-bold text-brand-green">Credential valid</span></div>
              <h2 className="mt-5 text-2xl font-bold text-ink">{beneficiaryName(preview.beneficiary)}</h2>
              <p className="mt-2 text-sm leading-6 text-copy">Match the person present with the name and queue number below before confirming.</p>
              <dl className="mt-5 divide-y divide-line rounded-xl border border-line bg-slate-50 px-4 text-sm">
                <div className="flex justify-between gap-4 py-3"><dt className="text-muted-copy">Queue number</dt><dd className="font-bold tabular-nums text-ink">#{preview.schedule.queueNumber}</dd></div>
                <div className="flex justify-between gap-4 py-3"><dt className="text-muted-copy">Service area</dt><dd className="text-right font-bold text-ink">{preview.beneficiary.sitioPurok || preview.beneficiary.barangay?.barangayName || 'Assigned barangay'}</dd></div>
                <div className="flex justify-between gap-4 py-3"><dt className="text-muted-copy">Session</dt><dd className="text-right font-bold text-ink">{preview.schedule.slot?.sessionLabel || 'Scheduled session'}</dd></div>
                <div className="flex justify-between gap-4 py-3"><dt className="text-muted-copy">Next requirement</dt><dd className="text-right font-bold text-ink">{preview.nextRequiredVerification ? humanize(preview.nextRequiredVerification) : 'None'}</dd></div>
              </dl>
              <p className="mt-4 flex gap-3 rounded-lg border border-emerald-200 bg-success-soft p-4 text-sm leading-6 text-copy"><Icon name="info" className="mt-0.5 size-5 shrink-0 text-brand-green" /><span>No queue or claim record has changed yet. Confirmation is required.</span></p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" disabled={isVerifying} onClick={onReset} className="ga-btn-secondary">Use a different QR</button><button ref={confirmRef} type="button" disabled={isVerifying} onClick={onConfirm} className="ga-btn-primary">{isVerifying ? <LoadingLabel>Recording verification...</LoadingLabel> : <><Icon name="check" /> {isAdmin ? 'Confirm QR validation' : preview.checksInBeneficiary ? 'Confirm check-in' : 'Confirm QR verification'}</>}</button></div>
            </section>
          ) : (
            <section className="rounded-xl border border-dashed border-line bg-white p-7 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-brand-blue"><Icon name="qr" className="size-6" /></span><h2 className="mt-4 font-bold text-ink">Beneficiary review</h2><p className="mt-2 text-sm leading-6 text-muted-copy">{isAdmin ? 'Enter a QR credential to see the beneficiary, queue number, and remaining checks here.' : 'Scan with the camera or USB scanner. Beneficiary details will appear here for review before check-in.'}</p></section>
          )}

          <section className="border-t border-line p-5"><h2 className="font-bold text-ink">Before confirming</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-copy"><li>Check the event, beneficiary name, and queue number.</li><li>Use the beneficiary’s current credential.</li><li>Complete any remaining identity check before release.</li></ul></section>
        </aside>
        {cameraOpen && <QrCameraDialog onDetected={onCameraScan} onClose={() => setCameraOpen(false)} />}
      </div>
    </div>
  )
}

export default FacilitatorOperationsPage
