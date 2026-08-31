import { useCallback, useEffect, useRef, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import {
  getAuthErrorMessage,
  isSessionExpiredError,
  previewDistributionQrClaim,
  requestDistributionQueue,
  requestOpenDistributions,
  verifyDistributionQrClaim,
} from '../auth/staffAuth.js'

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
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[status] ?? statusStyles.CANCELLED}`}>{status.replace('_', ' ')}</span>
}

function DistributionSelector({ distributions, selectedId, onChange }) {
  return (
    <div>
      <label htmlFor="distribution-event" className="block text-sm font-bold text-ink">Distribution event</label>
      <select
        id="distribution-event"
        value={selectedId}
        onChange={(event) => onChange(event.target.value)}
        className="ga-input mt-2 cursor-pointer font-semibold"
      >
        {distributions.map((distribution) => (
          <option key={distribution.distributionId} value={distribution.distributionId}>
            {distribution.title} · {dateFormatter.format(new Date(distribution.distributionDate))}
          </option>
        ))}
      </select>
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
    <DashboardShell breadcrumbs={['Operations', 'Facilitator access']} currentPath={window.location.pathname} onLogout={onLogout} onNavigate={onNavigate} pageTitle="Facilitator operations" user={session.user}>
      <section className="ga-card mx-auto max-w-lg p-7 text-center">
        <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft font-black text-brand-amber">!</span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">Barangay Facilitator access required</h1>
        <p className="mt-3 text-sm leading-6 text-muted-copy">Queue operations and QR claim verification are limited to assigned Barangay Facilitators.</p>
        <button type="button" onClick={() => onNavigate('/dashboard')} className="ga-btn-primary mt-6">Return to dashboard</button>
      </section>
    </DashboardShell>
  )
}

function FacilitatorOperationsPage({ view, session, onLogout, onNavigate, onSessionExpired }) {
  const [distributions, setDistributions] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [distributionError, setDistributionError] = useState('')
  const [isLoadingDistributions, setIsLoadingDistributions] = useState(true)
  const [distributionReload, setDistributionReload] = useState(0)

  const [queue, setQueue] = useState(null)
  const [queueError, setQueueError] = useState('')
  const [isLoadingQueue, setIsLoadingQueue] = useState(view === 'queue')
  const [queueReload, setQueueReload] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const [qrToken, setQrToken] = useState('')
  const [qrPreview, setQrPreview] = useState(null)
  const [verificationError, setVerificationError] = useState(null)
  const [verificationResult, setVerificationResult] = useState(null)
  const [pendingAttempt, setPendingAttempt] = useState(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const isFacilitator = session.user.role === 'BARANGAY_FACILITATOR'
  const selectedDistribution = distributions.find((distribution) => distribution.distributionId === selectedId)
  const currentPath = view === 'queue' ? '/facilitator/queue' : '/facilitator/qr-verification'
  const pageTitle = view === 'queue' ? 'Queue & schedules' : 'QR claim verification'

  useEffect(() => {
    let active = true
    requestOpenDistributions(session.accessToken)
      .then((items) => {
        if (!active) return
        const relevantItems = view === 'qr'
          ? items.filter((item) => ['QR', 'QR_AND_BIOMETRIC'].includes(item.verificationRequirement))
          : items
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
  }, [distributionReload, onSessionExpired, session.accessToken, view])

  useEffect(() => {
    if (view !== 'queue' || !selectedId) return undefined
    let active = true
    requestDistributionQueue(session.accessToken, selectedId, { page, search, status })
      .then((data) => { if (active) setQueue(data) })
      .catch((error) => {
        if (!active) return
        if (isSessionExpiredError(error)) return onSessionExpired()
        setQueueError(getAuthErrorMessage(error))
      })
      .finally(() => { if (active) setIsLoadingQueue(false) })
    return () => { active = false }
  }, [onSessionExpired, page, queueReload, search, selectedId, session.accessToken, status, view])

  function selectDistribution(distributionId) {
    setSelectedId(distributionId)
    setQueue(null)
    setQueueError('')
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

  async function verifyToken(token) {
    const submittedToken = token.trim()
    setVerificationResult(null)

    if (!submittedToken) {
      setVerificationError({ message: 'Scan a beneficiary QR credential before continuing.', code: 'TOKEN_REQUIRED' })
      return
    }

    const reusableAttempt = pendingAttempt?.distributionId === selectedId && pendingAttempt.qrToken === submittedToken
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
      setVerificationError({ message: getAuthErrorMessage(error), code: error.code })
      if (!(error instanceof TypeError) && error.code !== 'QR_CLAIM_CONCURRENT_CHANGE') {
        setPendingAttempt(null)
        setQrPreview(null)
        setQrToken('')
      }
    } finally {
      setIsVerifying(false)
    }
  }

  async function previewToken(token) {
    const submittedToken = token.trim()
    setVerificationResult(null)
    setQrPreview(null)
    if (!submittedToken) {
      setVerificationError({ message: 'Scan a beneficiary QR credential before continuing.', code: 'TOKEN_REQUIRED' })
      return
    }
    setQrToken(submittedToken)
    setVerificationError(null)
    setPendingAttempt(null)
    setIsPreviewing(true)
    try {
      const preview = await previewDistributionQrClaim(session.accessToken, selectedId, submittedToken)
      setQrPreview(preview)
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      setQrToken('')
      setVerificationError({ message: getAuthErrorMessage(error), code: error.code })
    } finally {
      setIsPreviewing(false)
    }
  }

  async function previewQr(event) {
    event.preventDefault()
    await previewToken(qrToken)
  }

  if (!isFacilitator) return <AccessDenied session={session} onLogout={onLogout} onNavigate={onNavigate} />

  return (
    <DashboardShell breadcrumbs={['Operations', 'Barangay Facilitator', pageTitle]} currentPath={currentPath} onLogout={onLogout} onNavigate={onNavigate} pageTitle={pageTitle} user={session.user}>
      <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="ga-eyebrow">Assigned barangay operations</p>
          <h1 className="ga-page-title mt-2">{pageTitle}</h1>
          <p className="ga-page-copy">
            {view === 'queue' ? 'Track scheduled beneficiaries and current check-in status for an open distribution event.' : 'Review a beneficiary QR credential before recording check-in for the selected open event.'}
          </p>
        </div>
        <button type="button" onClick={() => onNavigate(view === 'queue' ? '/facilitator/qr-verification' : '/facilitator/queue')} className="ga-btn-primary shrink-0">
          {view === 'queue' ? 'Open QR verification' : 'View beneficiary queue'}
        </button>
      </header>

      {isLoadingDistributions ? (
        <div className="ga-card mt-7 p-6"><Skeleton className="h-4 w-40" /><Skeleton className="mt-3 h-12 w-full" /></div>
      ) : distributionError ? (
        <section className="mt-7 rounded-xl border border-amber-200 bg-white p-6" role="alert">
          <h2 className="font-extrabold text-ink">Unable to load distribution events</h2>
          <p className="mt-2 text-sm leading-6 text-muted-copy">{distributionError}</p>
          <button type="button" onClick={() => { setDistributionError(''); setIsLoadingDistributions(true); setDistributionReload((count) => count + 1) }} className="ga-btn-primary mt-4">Try again</button>
        </section>
      ) : distributions.length === 0 ? (
        <section className="mt-7 rounded-xl border border-dashed border-line bg-white p-8 text-center" aria-labelledby="no-distributions-title">
          <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span>
          <h2 id="no-distributions-title" className="mt-4 text-xl font-extrabold text-ink">No open distribution event</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-copy">Queue viewing and QR claim verification become available when an authorized distribution event for your assigned barangay is open.</p>
        </section>
      ) : (
        <>
          <section className="ga-card mt-7 grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)] md:items-end sm:p-6" aria-label="Selected distribution event">
            <DistributionSelector distributions={distributions} selectedId={selectedId} onChange={selectDistribution} />
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
              <div><dt className="text-xs font-semibold text-muted-copy">Location</dt><dd className="mt-1 font-bold text-ink">{selectedDistribution?.location}</dd></div>
              <div><dt className="text-xs font-semibold text-muted-copy">Event time</dt><dd className="mt-1 font-bold text-ink">{selectedDistribution?.startTime}–{selectedDistribution?.endTime}</dd></div>
            </dl>
          </section>

          {view === 'queue' ? (
            <QueueView
              queue={queue}
              queueError={queueError}
              isLoading={isLoadingQueue}
              page={page}
              searchInput={searchInput}
              setSearchInput={setSearchInput}
              status={status}
              onFilter={filterQueue}
              onStatusChange={changeQueueStatus}
              onPageChange={(nextPage) => { setPage(nextPage); setIsLoadingQueue(true) }}
              onRetry={() => { setQueueError(''); setIsLoadingQueue(true); setQueueReload((count) => count + 1) }}
            />
          ) : (
            <QrVerificationView
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
        </>
      )}
    </DashboardShell>
  )
}

function QueueView({ queue, queueError, isLoading, page, searchInput, setSearchInput, status, onFilter, onStatusChange, onPageChange, onRetry }) {
  const counts = queue?.summary.countsByStatus ?? {}
  return (
    <section className="mt-6" aria-labelledby="queue-heading">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Scheduled', counts.SCHEDULED ?? 0, 'pending'],
          ['Checked in', counts.CHECKED_IN ?? 0, 'success'],
          ['Missed', counts.MISSED ?? 0, 'neutral'],
          ['Cancelled', counts.CANCELLED ?? 0, 'neutral'],
        ].map(([label, value, tone]) => (
          <article key={label} className="ga-card p-4">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-copy">{label}</p>
            <p className={`mt-2 text-3xl font-black ${tone === 'success' ? 'text-brand-green' : tone === 'pending' ? 'text-brand-amber' : 'text-ink'}`}>{value}</p>
          </article>
        ))}
      </div>

      <div className="ga-card mt-6 overflow-hidden">
        <div className="border-b border-line p-5 sm:p-6">
          <h2 id="queue-heading" className="text-xl font-extrabold text-ink">Beneficiary queue</h2>
          <form onSubmit={onFilter} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_auto]">
            <div><label htmlFor="queue-search" className="sr-only">Search beneficiary or queue number</label><input id="queue-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength="100" placeholder="Search name or queue number" className="ga-input" /></div>
            <div><label htmlFor="queue-status" className="sr-only">Filter by queue status</label><select id="queue-status" value={status} onChange={(event) => onStatusChange(event.target.value)} className="ga-input cursor-pointer font-semibold">{queueStatuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? value.replace('_', ' ') : 'All statuses'}</option>)}</select></div>
            <button type="submit" className="ga-btn-primary">Search</button>
          </form>
        </div>

        <div className="p-4 sm:p-6">
          {isLoading ? <QueueSkeleton /> : queueError ? (
            <div className="rounded-lg border border-amber-200 bg-warning-soft p-5" role="alert"><p className="font-bold text-ink">Unable to load the queue</p><p className="mt-2 text-sm text-muted-copy">{queueError}</p><button type="button" onClick={onRetry} className="ga-btn-primary mt-4">Try again</button></div>
          ) : queue?.schedules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-slate-50 p-8 text-center"><p className="font-extrabold text-ink">No queue entries found</p><p className="mt-2 text-sm text-muted-copy">Try a different name, queue number, or status filter.</p></div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Beneficiary distribution queue</caption>
                  <thead><tr className="border-b border-line text-xs uppercase tracking-[0.08em] text-muted-copy"><th scope="col" className="px-3 py-3">Queue</th><th scope="col" className="px-3 py-3">Beneficiary</th><th scope="col" className="px-3 py-3">Time slot</th><th scope="col" className="px-3 py-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-line">{queue.schedules.map((schedule) => <tr key={schedule.scheduleId}><td className="px-3 py-4 text-lg font-black text-brand-navy">#{schedule.queueNumber}</td><td className="px-3 py-4"><p className="font-bold text-ink">{beneficiaryName(schedule.beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">{schedule.beneficiary.sitioPurok ?? schedule.beneficiary.barangay?.barangayName}</p></td><td className="px-3 py-4"><p className="font-semibold text-ink">{schedule.slot.sessionLabel}</p><p className="mt-1 text-xs text-muted-copy">{dateFormatter.format(new Date(schedule.slot.slotStart))} · {timeFormatter.format(new Date(schedule.slot.slotStart))}–{timeFormatter.format(new Date(schedule.slot.slotEnd))}</p><p className="mt-1 text-xs text-muted-copy">{schedule.slot.location}</p></td><td className="px-3 py-4"><StatusBadge status={schedule.status} /></td></tr>)}</tbody>
                </table>
              </div>
              <ul className="space-y-3 md:hidden">{queue.schedules.map((schedule) => <li key={schedule.scheduleId} className="rounded-lg border border-line p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black text-brand-navy">Queue #{schedule.queueNumber}</p><p className="mt-1 font-bold text-ink">{beneficiaryName(schedule.beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">{schedule.beneficiary.sitioPurok ?? schedule.beneficiary.barangay?.barangayName}</p></div><StatusBadge status={schedule.status} /></div><div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-sm font-bold text-ink">{schedule.slot.sessionLabel}</p><p className="mt-1 text-xs text-muted-copy">{dateFormatter.format(new Date(schedule.slot.slotStart))} · {timeFormatter.format(new Date(schedule.slot.slotStart))}–{timeFormatter.format(new Date(schedule.slot.slotEnd))}</p><p className="mt-1 text-xs text-muted-copy">{schedule.slot.location}</p></div></li>)}</ul>
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

function QrVerificationView({ distribution, qrToken, setQrToken, error, preview, result, isPreviewing, isVerifying, onSubmit, onCameraScan, onConfirm, onReset, onNavigate }) {
  const inputRef = useRef(null)
  const confirmRef = useRef(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const duplicateError = ['QR_TOKEN_ALREADY_USED', 'DUPLICATE_CLAIM'].includes(error?.code)
  const needsBiometric = result?.nextRequiredVerification === 'BIOMETRIC'
  const claim = result?.claim
  const currentStep = result ? 3 : preview ? 2 : 1
  const busy = isPreviewing || isVerifying

  useEffect(() => {
    if (cameraOpen || busy) return
    if (preview) confirmRef.current?.focus()
    else if (!result) inputRef.current?.focus()
  }, [busy, cameraOpen, preview, result])

  return (
    <div className="mt-6">
      <ol aria-label="QR verification progress" className="ga-card grid grid-cols-3 overflow-hidden">
        {['Scan credential', 'Review identity', 'Complete check-in'].map((label, index) => {
          const step = index + 1
          const complete = currentStep > step
          const active = currentStep === step
          return (
            <li key={label} aria-current={active ? 'step' : undefined} className={`flex min-w-0 items-center gap-2 border-r border-line px-3 py-3 last:border-r-0 sm:gap-3 sm:px-5 ${active ? 'bg-info-soft text-brand-blue' : 'bg-white text-muted-copy'}`}>
              <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${complete ? 'bg-brand-green text-white' : active ? 'bg-brand-blue text-white' : 'border border-line bg-slate-50'}`}>{complete ? <Icon name="check" className="size-4" strokeWidth={2.5} /> : step}</span>
              <span className="text-xs font-bold sm:text-sm"><span className="sm:hidden">{['Scan', 'Review', 'Complete'][index]}</span><span className="hidden sm:inline">{label}</span></span>
            </li>
          )
        })}
      </ol>

      <div className="mt-5 grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <section className="ga-card overflow-hidden" aria-labelledby="verification-form-heading">
          <header className="border-b border-line p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-info-soft text-brand-blue"><Icon name="qr" className="size-6" strokeWidth={2} /></span>
              <div>
                <p className="ga-eyebrow">Secure claim check-in</p>
                <h2 id="verification-form-heading" className="mt-1 text-2xl font-bold text-ink">Scan first. Confirm after review.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-copy">The QR credential stays hidden. Scanning only opens the beneficiary details; no claim or queue record changes until you confirm.</p>
              </div>
            </div>
          </header>

          <div className="p-5 sm:p-7">
            <dl className="grid gap-4 rounded-xl border border-line bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-semibold text-muted-copy">Selected event</dt><dd className="mt-1 font-bold text-ink">{distribution.title}</dd></div>
              <div><dt className="text-xs font-semibold text-muted-copy">Required verification</dt><dd className="mt-1 font-bold text-ink">{humanize(distribution.verificationRequirement)}</dd></div>
            </dl>

            <form onSubmit={onSubmit} className="mt-6" aria-busy={busy}>
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

              {error && <div id="qr-token-error" role="alert" className={`mt-4 rounded-lg border p-4 ${duplicateError ? 'border-red-200 bg-danger-soft' : 'border-amber-200 bg-warning-soft'}`}><p className={`font-bold ${duplicateError ? 'text-brand-red' : 'text-brand-amber'}`}>{duplicateError ? 'Possible duplicate claim' : 'Credential not accepted'}</p><p className="mt-1 text-sm leading-6 text-copy">{error.message}</p><p className="mt-2 text-xs text-muted-copy">Confirm the selected event, then scan the beneficiary’s current credential again. Ask the System Administrator to reissue damaged or expired credentials.</p></div>}
            </form>

            <details className="mt-5 rounded-xl border border-line bg-slate-50 p-4 text-sm">
              <summary className="cursor-pointer font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Having trouble scanning?</summary>
              <ul className="mt-3 space-y-2 leading-6 text-muted-copy"><li>Increase screen brightness or flatten the printed QR card.</li><li>Use the camera or an authorized USB handheld scanner.</li><li>For a damaged or expired credential, ask the System Administrator to reissue it.</li></ul>
            </details>
          </div>
        </section>

        <aside className="space-y-6" aria-label="Verification review and result">
          {result ? (
            <section role="status" aria-live="polite" className={`rounded-xl border p-6 shadow-sm ${result.verificationComplete ? 'border-emerald-200 bg-success-soft' : 'border-amber-200 bg-warning-soft'}`}>
              <span aria-hidden="true" className={`grid size-12 place-items-center rounded-full text-white ${result.verificationComplete ? 'bg-brand-green' : 'bg-brand-amber'}`}><Icon name={result.verificationComplete ? 'check' : 'info'} className="size-6" strokeWidth={2.5} /></span>
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.1em] text-muted-copy">Verification recorded</p>
              <h2 className="mt-1 text-xl font-bold text-ink">{result.verificationComplete ? 'Claim verification complete' : 'QR accepted — biometric required'}</h2>
              <p className="mt-2 text-sm leading-6 text-copy">{result.verificationComplete ? 'The QR verification and current check-in status are recorded. The claim is ready for the next authorized operation.' : 'The beneficiary is checked in. Continue to the live identity check to finalize this claim.'}</p>
              <dl className="mt-5 space-y-3 border-t border-current/10 pt-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-copy">Beneficiary</dt><dd className="text-right font-bold text-ink">{beneficiaryName(claim?.beneficiary) || 'Verified beneficiary'}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-copy">Queue number</dt><dd className="font-bold tabular-nums text-ink">{claim?.schedule?.queueNumber ? `#${claim.schedule.queueNumber}` : 'Recorded'}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-copy">Claim status</dt><dd className="font-bold text-ink">{humanize(claim?.claimStatus)}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-copy">Claim reference</dt><dd className="max-w-48 truncate font-mono text-xs font-bold text-ink" title={claim?.claimId}>{claim?.claimId}</dd></div></dl>
              {needsBiometric
                ? <button type="button" onClick={() => onNavigate(`/biometrics?view=verify&distribution=${encodeURIComponent(claim.distributionId)}&beneficiary=${encodeURIComponent(claim.beneficiaryId)}`)} className="ga-btn-primary mt-5 w-full">Continue to biometric <Icon name="arrowRight" /></button>
                : <button type="button" onClick={onReset} className="ga-btn-primary mt-5 w-full"><Icon name="qr" /> Scan next beneficiary</button>}
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
              <div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" disabled={isVerifying} onClick={onReset} className="ga-btn-secondary">Scan a different QR</button><button ref={confirmRef} type="button" disabled={isVerifying} onClick={onConfirm} className="ga-btn-primary">{isVerifying ? <LoadingLabel>Recording check-in...</LoadingLabel> : <><Icon name="check" /> {preview.checksInBeneficiary ? 'Confirm check-in' : 'Confirm QR verification'}</>}</button></div>
            </section>
          ) : (
            <section className="rounded-xl border border-dashed border-line bg-white p-7 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-brand-blue"><Icon name="qr" className="size-6" /></span><h2 className="mt-4 font-bold text-ink">Ready for a credential</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Scan with the camera or USB scanner. Beneficiary details will appear here for review before check-in.</p></section>
          )}

          <section className="ga-card p-5"><h2 className="font-bold text-ink">Field checklist</h2><ol className="mt-4 space-y-3 text-sm leading-6 text-copy"><li className="flex gap-3"><span className="font-bold text-brand-blue">01</span><span>Confirm the selected distribution event.</span></li><li className="flex gap-3"><span className="font-bold text-brand-blue">02</span><span>Scan the beneficiary’s current QR credential.</span></li><li className="flex gap-3"><span className="font-bold text-brand-blue">03</span><span>Match the displayed identity before confirming check-in.</span></li></ol></section>
        </aside>
        {cameraOpen && <QrCameraDialog onDetected={onCameraScan} onClose={() => setCameraOpen(false)} />}
      </div>
    </div>
  )
}

export default FacilitatorOperationsPage
