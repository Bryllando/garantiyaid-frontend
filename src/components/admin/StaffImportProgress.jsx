import { useEffect, useRef, useState } from 'react'
import { isSessionExpiredError, requestStaffImport, requestStaffImportResults, requestStaffImports, resumeStaffImport } from '../../auth/staffAuth.js'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel, Spinner } from '../ui/spinner.jsx'

const staffApi = { list: requestStaffImports, status: requestStaffImport, results: requestStaffImportResults, resume: resumeStaffImport }

const statusLabels = { QUEUED: 'Waiting to start', PROCESSING: 'Processing', COMPLETED: 'Completed', FAILED: 'Stopped' }
const date = value => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
const savedTime = value => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'medium' })

export function ImportPagination({ page, total, onChange, label, disabled = false }) {
  const pages = Math.max(1, Math.ceil(total / 25))
  if (pages === 1) return null
  return <nav aria-label={label} className="flex flex-wrap items-center gap-3 text-sm">
    <button type="button" disabled={disabled || page === 0} onClick={() => onChange(page - 1)} className="ga-btn-secondary">Previous</button>
    <span>Page {page + 1} of {pages} · {total.toLocaleString('en-US')} records</span>
    <button type="button" disabled={disabled || page + 1 >= pages} onClick={() => onChange(page + 1)} className="ga-btn-secondary">Next</button>
  </nav>
}

export function StaffImportHistory({ accessToken, onOpen, onSessionExpired, disabled, api = staffApi, label = "staff" }) {
  const [imports, setImports] = useState([])
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    api.list(accessToken).then(items => { if (active) { setImports(items); setError('') } }).catch(error => {
      if (!active) return
      if (isSessionExpiredError(error)) onSessionExpired()
      else setError('Recent imports could not be loaded. Check them before submitting the same file again.')
    })
    return () => { active = false }
  }, [accessToken, reload, onSessionExpired, api])
  if (!imports.length && !error) return null
  return <section className="border-t border-line pt-5" aria-labelledby={`recent-${label}-imports`}>
    <h3 id={`recent-${label}-imports`} className="font-semibold">Your recent imports</h3>
    <p className="mt-1 text-sm leading-6 text-copy">Open an import to check progress or recover its results. Saved results are available for 24 hours after completion or a processing stop.</p>
    {error && <p role="alert" className="mt-3 text-sm text-brand-red">{error} <button type="button" disabled={disabled} onClick={() => setReload(value => value + 1)} className="min-h-11 underline">Retry loading imports</button></p>}
    <ul className="mt-3 divide-y divide-line">{imports.map(job => <li key={job.importId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <div><p className="font-semibold">{job.totalCount.toLocaleString('en-US')} {label} · {statusLabels[job.status]}</p><p className="mt-1 text-copy">{date(job.createdAt)} · {job.processedCount} processed</p></div>
      <button type="button" disabled={disabled} onClick={() => onOpen(job)} className="ga-btn-secondary" aria-label={`Open import ${job.importId}`}>Open import</button>
    </li>)}</ul>
  </section>
}

export default function StaffImportProgress({ accessToken, initialJob, onResult, onSessionExpired, api = staffApi, label = "staff" }) {
  const [job, setJob] = useState(initialJob)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [reload, setReload] = useState(0)
  const callbacks = useRef({ onResult, onSessionExpired })
  useEffect(() => { callbacks.current = { onResult, onSessionExpired } }, [onResult, onSessionExpired])
  useEffect(() => {
    let active = true
    let timer
    async function poll() {
      if (document.visibilityState === 'hidden') { timer = setTimeout(poll, 10_000); return }
      let delay = 10_000
      try {
        const updated = await api.status(accessToken, initialJob.importId)
        if (!active) return
        setJob(updated); setError('')
        if (updated.status === 'COMPLETED') {
          const result = await api.results(accessToken, updated.importId)
          if (active) callbacks.current.onResult(result)
          return
        }
        if (updated.status === 'FAILED') return
      } catch (error) {
        if (!active) return
        if (isSessionExpiredError(error)) { callbacks.current.onSessionExpired(); return }
        delay = error.status === 429 ? Math.max(1000, (error.retryAfterSeconds ?? 60) * 1000) : 10_000
        setError(error.status === 404 ? error.message : error.status === 429 ? `Progress updates are temporarily paused. The next check is at ${date(Date.now() + delay)}; processing continues on the server.` : 'Progress could not be refreshed. Reconnecting; your import may still be running.')
        if (error.status === 404) return
      }
      if (active) timer = setTimeout(poll, delay)
    }
    poll()
    return () => { active = false; clearTimeout(timer) }
  }, [accessToken, initialJob.importId, reload, api])

  async function action(resume) {
    if (busy) return
    setBusy(resume ? 'resume' : 'results'); setError('')
    try {
      if (resume) { setJob(await api.resume(accessToken, job.importId)); setReload(value => value + 1) }
      else callbacks.current.onResult(await api.results(accessToken, job.importId))
    } catch (error) {
      if (isSessionExpiredError(error)) callbacks.current.onSessionExpired()
      else setError(error.message)
    } finally { setBusy('') }
  }
  const processing = job.status === 'QUEUED' || job.status === 'PROCESSING'
  const loadingResults = job.status === 'COMPLETED'
  const percentage = job.totalCount ? Math.min(100, Math.floor(job.processedCount / job.totalCount * 100)) : 0
  const remaining = Math.max(0, job.totalCount - job.processedCount)
  const title = error ? 'Progress update unavailable' : job.status === 'QUEUED' ? 'Import queued'
    : job.status === 'PROCESSING' ? `Importing ${label}`
      : loadingResults ? 'Loading import results' : 'Import stopped'
  return <section className="space-y-5" aria-label={`Background ${label} import`}>
    <div className="rounded border border-line bg-slate-50 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded border border-line bg-white text-brand-blue">
            {busy || (!error && (processing || loadingResults)) ? <Spinner aria-hidden="true" className="size-5" /> : <Icon name="info" className="size-5" />}
          </span>
          <div className="min-w-0"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-copy">{job.totalCount.toLocaleString('en-US')} {label} in this import</p></div>
        </div>
        <p aria-hidden="true" className="shrink-0 text-2xl font-semibold tabular-nums">{percentage}%</p>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="mt-5 text-sm">
        {job.processedCount.toLocaleString('en-US')} of {job.totalCount.toLocaleString('en-US')} records processed · {job.createdCount.toLocaleString('en-US')} created · {job.failedCount.toLocaleString('en-US')} need correction
      </div>
      <progress aria-label={`${label} import progress`} aria-valuetext={`${percentage}% processed. ${remaining.toLocaleString('en-US')} records remaining.`} max={job.totalCount} value={job.processedCount} className="mt-3 block h-2.5 w-full appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-brand-blue [&::-moz-progress-bar]:bg-brand-blue" />
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
        <div><dt className="text-copy">Created</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{job.createdCount.toLocaleString('en-US')}</dd></div>
        <div><dt className="text-copy">Need correction</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{job.failedCount.toLocaleString('en-US')}</dd></div>
        <div><dt className="text-copy">Remaining</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{remaining.toLocaleString('en-US')}</dd></div>
      </dl>
    </div>
    {job.status === 'QUEUED' && <p className="text-sm leading-6 text-copy">Waiting for the server to start this import. Keep the GarantiyAid server running.</p>}
    {job.status === 'PROCESSING' && <p className="text-sm leading-6 text-copy">Counts update after each saved batch. The progress bar may move in steps, and small files may finish in a single update. After a server restart, recovery may take up to two minutes.</p>}
    {loadingResults && <p className="text-sm leading-6 text-copy">Processing has finished. Retrieving the saved results before opening the results screen.</p>}
    {job.updatedAt && <p className="text-xs leading-5 text-copy">Last saved update: {savedTime(job.updatedAt)} PHT. Counts come from the server.</p>}
    {error && <p role="alert" className="border-l-4 border-brand-red bg-danger-soft p-3 text-sm">{error}</p>}
    {job.status === 'FAILED' && <><p role="alert" className="border-l-4 border-brand-amber bg-warning-soft p-3 text-sm leading-6">{job.lastError}</p><div className="flex flex-wrap gap-3"><button type="button" disabled={Boolean(busy)} onClick={() => action(true)} className="ga-btn-primary">{busy === 'resume' ? <LoadingLabel>Resuming import…</LoadingLabel> : `Resume remaining ${label}`}</button>{job.processedCount > 0 && <button type="button" disabled={Boolean(busy)} onClick={() => action(false)} className="ga-btn-secondary">{busy === 'results' ? <LoadingLabel>Loading results…</LoadingLabel> : 'View saved results'}</button>}</div></>}
    <p className="text-sm leading-6 text-copy">You can close this window and return through Import {label} → Your recent imports. Closing the window does not cancel the import.</p>
  </section>
}
